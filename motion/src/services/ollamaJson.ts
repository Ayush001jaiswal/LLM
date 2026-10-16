const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.MODEL ?? "llama3.2:3b";

export interface JsonOptions {
  numCtx?: number;
  numPredict?: number;
}

// Asks the model for JSON that matches a JSON schema (Ollama "structured outputs").
// Temperature 0 so the same input gives the same output. Retries once.
export async function generateJson<T>(
  system: string,
  user: string,
  schema: object,
  opts: JsonOptions = {}
): Promise<T> {
  let lastError: Error = new Error("Model call failed");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10 * 60_000), // CPU-only machines are slow
        body: JSON.stringify({
          model: MODEL,
          stream: false,
          format: schema,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          options: {
            temperature: 0,
            num_ctx: opts.numCtx ?? 4096,
            num_predict: opts.numPredict ?? 800,
          },
        }),
      });

      if (!res.ok) throw new Error(`Ollama request failed (${res.status}). Is the model installed?`);

      const data = (await res.json()) as { message?: { content?: string }; done_reason?: string };
      if (data.done_reason === "length") throw new Error("Model output was cut off");

      return JSON.parse(data.message?.content ?? "") as T;
    } catch (err) {
      lastError = err instanceof SyntaxError ? new Error("Model returned invalid JSON") : (err as Error);
    }
  }
  throw lastError;
}
