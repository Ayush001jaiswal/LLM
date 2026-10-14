const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "nomic-embed-text";

// nomic-embed-text works best with these prefixes
const PREFIX = { document: "search_document: ", query: "search_query: " };

export async function embed(
  texts: string[],
  kind: "document" | "query",
  signal?: AbortSignal
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += 16) {
    const batch = texts.slice(i, i + 16).map((t) => PREFIX[kind] + t);

    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
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
  }

  return results;
}