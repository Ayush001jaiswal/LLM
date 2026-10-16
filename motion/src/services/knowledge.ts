import { prisma } from "../db/prisma.js";
import { embed } from "./embeddings.js";

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// RAG over the resume handbook in the `knowledge` folder.
// Returns the best matching passages for each query, joined as text (or "" if nothing is ingested).
export async function retrieveGuidelines(
  queries: string[],
  perQuery = 2,
  maxChars = 3000
): Promise<string> {
  const chunks = await prisma.knowledgeChunk.findMany({
    select: { id: true, topic: true, content: true, embedding: true },
  });
  if (chunks.length === 0) return "";

  const vectors = await embed(queries, "query");
  const picked = new Map<number, { topic: string; content: string }>();

  vectors.forEach((q) => {
    chunks
      .map((c) => ({ c, score: cosine(q, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, perQuery)
      .forEach(({ c }) => picked.set(c.id, { topic: c.topic, content: c.content }));
  });

  let out = "";
  for (const { topic, content } of picked.values()) {
    const piece = `[${topic}]\n${content}\n\n`;
    if (out.length + piece.length > maxChars) break;
    out += piece;
  }
  return out.trim();
}
