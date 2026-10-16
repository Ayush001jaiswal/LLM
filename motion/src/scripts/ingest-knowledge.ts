// Run with:  npx tsx src/scripts/ingest-knowledge.ts
// Reads every .md file in /knowledge, splits it into passages, embeds them with Ollama,
// and stores them in Postgres. Safe to run again: it replaces the old passages.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { prisma } from "../db/prisma.js";
import { embed } from "../services/embeddings.js";

const ROOT = "knowledge";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listFiles(full);
    return name.endsWith(".md") && !name.startsWith("_") ? [full] : [];
  });
}

// Splits on "## " headings. Passages that are still very long are cut at paragraph boundaries.
function passages(markdown: string): { heading: string; content: string }[] {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
  const parts = markdown.split(/^##\s+/m).slice(1);
  const out: { heading: string; content: string }[] = [];
  for (const part of parts) {
    const [headingLine, ...rest] = part.split("\n");
    const body = rest.join("\n").trim();
    if (!body) continue;
    let current = "";
    for (const para of body.split(/\n{2,}/)) {
      if (current && current.length + para.length > 1200) {
        out.push({ heading: `${title}: ${headingLine.trim()}`, content: current.trim() });
        current = "";
      }
      current += para + "\n\n";
    }
    if (current.trim()) out.push({ heading: `${title}: ${headingLine.trim()}`, content: current.trim() });
  }
  return out;
}

const files = listFiles(ROOT);
const rows: { source: string; topic: string; content: string }[] = [];
for (const file of files) {
  for (const p of passages(readFileSync(file, "utf-8"))) {
    rows.push({ source: relative(ROOT, file), topic: p.heading, content: p.content });
  }
}
if (rows.length === 0) throw new Error("No passages found in /knowledge");

console.log(`Embedding ${rows.length} passages from ${files.length} files...`);
const vectors = await embed(rows.map((r) => `${r.topic}\n${r.content}`), "document");

await prisma.$transaction([
  prisma.knowledgeChunk.deleteMany(),
  prisma.knowledgeChunk.createMany({ data: rows.map((r, i) => ({ ...r, embedding: vectors[i] })) }),
]);
console.log("Done. Knowledge base updated.");
await prisma.$disconnect();
