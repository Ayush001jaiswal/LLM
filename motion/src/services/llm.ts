export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.MODEL ?? "llama3.2:3b";

const SYSTEM: ChatMessage = {
  role: "system",
  content: "You are a helpful, concise assistant.",
};

interface OllamaChunk {
  message?: { content?: string };
  done?: boolean;
}

// Yields text pieces as the model generates them
export async function* streamChat(
  messages: ChatMessage[],
  signal: AbortSignal
): AsyncGenerator<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: MODEL,
      messages: [SYSTEM, ...messages.slice(-8)], // last 8 messages only
      stream: true,
      options: { num_ctx: 2048, num_predict: 400 },
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama request failed with status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const json = JSON.parse(line) as OllamaChunk;
      if (json.message?.content) yield json.message.content;
    }
  }
}