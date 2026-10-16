import { geminiEmbed } from "./gemini.js";

const OLLAMA_URL = process.env.OLLAMA_URL;
const EMBED_MODEL = process.env.EMBED_MODEL ?? "nomic-embed-text";

// nomic-embed-text works best with these prefixes
const PREFIX = { document: "search_document: ", query: "search_query: " };

export async function embed(
  texts: string[],
  kind: "document" | "query",
  signal?: AbortSignal
): Promise<number[][]> {
  const useGemini =
    process.env.EMBED_PROVIDER === "gemini" ||
    process.env.NODE_ENV === "production" ||
    !OLLAMA_URL;

  if (useGemini && process.env.GEMINI_API_KEY) {
    return geminiEmbed(texts);
  }

  const results: number[][] = [];
  const endpoint = OLLAMA_URL ?? "http://localhost:11434";

  for (let i = 0; i < texts.length; i += 16) {
    const batch = texts.slice(i, i + 16).map((t) => PREFIX[kind] + t);

    try {
      const res = await fetch(`${endpoint}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
      });

      if (!res.ok) {
        throw new Error(`Embedding failed (${res.status}). Did you run: ollama pull ${EMBED_MODEL}?`);
      }
      const data = (await res.json()) as { embeddings: number[][] };
      results.push(...data.embeddings);
    } catch (err) {
      // If Ollama is offline but Gemini is available, fall back to Gemini
      if (process.env.GEMINI_API_KEY) {
        console.warn("Ollama embedding failed or unreachable, falling back to Gemini embeddings.");
        return geminiEmbed(texts);
      }
      throw err;
    }
  }

  return results;
}