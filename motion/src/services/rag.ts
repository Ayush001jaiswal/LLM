import { prisma } from "../db/prisma.js";
import { embed } from "./embeddings.js";

const TOP_K = 4;
export type Source = { n: number; filename: string; content: string };

// Splits text into ~800 character pieces, preferring paragraph boundaries
export function chunkText(text: string, size = 800, overlap = 120): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const p of paragraphs) {
    if (p.length > size) {
      // Very long paragraph: cut it into overlapping windows
      flush();
      for (let i = 0; i < p.length; i += size - overlap) {
        chunks.push(p.slice(i, i + size));
      }
    } else if (current.length + p.length + 1 > size) {
      flush();
      current = p;
    } else {
      current = current ? `${current}\n${p}` : p;
    }
  }
  flush();
  return chunks;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Returns the most relevant excerpts for this chat, or null if it has no documents.
// To switch to pgvector later, only this function needs to change.
// export async function retrieveContext(
//   conversationId: number,
//   question: string,
//   signal?: AbortSignal
// ): Promise<string | null> {
//   const chunks = await prisma.documentChunk.findMany({
//     where: { conversationId },
//     select: { content: true, embedding: true, document: { select: { filename: true } } },
//   });
//   if (chunks.length === 0) return null;

//   const [q] = await embed([question], "query", signal);

//   return chunks
//     .map((c) => ({ c, score: cosine(q, c.embedding) }))
//     .sort((a, b) => b.score - a.score)
//     .slice(0, TOP_K)
//     .map((t, i) => `[Excerpt ${i + 1} from ${t.c.document.filename}]\n${t.c.content}`)
//     .join("\n\n");
// }

export async function retrieveContext(
  conversationId: number,
  question: string,
  signal?: AbortSignal
): Promise<{ context: string; sources: Source[] } | null> {
  const chunks = await prisma.documentChunk.findMany({
    where: { conversationId },
    select: { content: true, embedding: true, document: { select: { filename: true } } },
  });
  if (chunks.length === 0) return null;

  const [q] = await embed([question], "query", signal);

  const top = chunks
    .map((c) => ({ c, score: cosine(q, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  const context = top
    .map((t, i) => `[Excerpt ${i + 1} from ${t.c.document.filename}]\n${t.c.content}`)
    .join("\n\n");

  // Previews are cut to 600 characters so they fit comfortably in a response header
  const sources: Source[] = top.map((t, i) => ({
    n: i + 1,
    filename: t.c.document.filename,
    content: t.c.content.slice(0, 600),
  }));

  return { context, sources };
}