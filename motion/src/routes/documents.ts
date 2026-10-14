import { Router } from "express";
import multer from "multer";
import { extractText, getDocumentProxy } from "unpdf";
import { prisma } from "../db/prisma.js";
import { embed } from "../services/embeddings.js";
import { chunkText } from "../services/rag.js";
import { uploadLimiter } from "../middleware/rateLimits.js";

const router = Router({ mergeParams: true }); // gives access to :id from the parent path

const MAX_DOCS_PER_CHAT = 5;
const MAX_CHARS = 100_000; // keeps embedding time reasonable on a CPU
const ALLOWED = [".pdf", ".txt", ".md"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB
});

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function extractFileText(file: Express.Multer.File): Promise<string> {
  let text: string;
  if (file.originalname.toLowerCase().endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
    ({ text } = await extractText(pdf, { mergePages: true }));
  } else {
    text = file.buffer.toString("utf-8");
  }
  // Postgres rejects NUL characters inside text columns
  return text.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
}

// GET /api/conversations/:id/documents
router.get("/", async (req, res) => {
  const id = parseId((req.params as { id?: string }).id);
  if (!id) return res.status(400).json({ error: "Invalid conversation id" });

  const userId = res.locals.userId as number;
  const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const documents = await prisma.document.findMany({
    where: { conversationId: id },
    orderBy: { id: "asc" },
    select: { id: true, filename: true, createdAt: true },
  });
  res.json(documents);
});

// POST /api/conversations/:id/documents  (multipart form, field name "file")
router.post("/", uploadLimiter, upload.single("file"), async (req, res) => {
  const id = parseId(req.params.id as string);
  if (!id) return res.status(400).json({ error: "Invalid conversation id" });

  const userId = res.locals.userId as number;
  const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const name = file.originalname.toLowerCase();
  if (!ALLOWED.some((ext) => name.endsWith(ext))) {
    return res.status(400).json({ error: "Only PDF, TXT and MD files are supported" });
  }

  const count = await prisma.document.count({ where: { conversationId: id } });
  if (count >= MAX_DOCS_PER_CHAT) {
    return res.status(400).json({ error: `Maximum ${MAX_DOCS_PER_CHAT} documents per chat` });
  }

  let text: string;
  try {
    text = await extractFileText(file);
  } catch {
    return res.status(422).json({ error: "Could not read this file" });
  }

  if (text.length < 20) {
    return res.status(422).json({
      error: "No readable text found (scanned PDFs are not supported yet)",
    });
  }
  if (text.length > MAX_CHARS) {
    return res.status(413).json({
      error: `Document is too long (${text.length.toLocaleString()} characters, max ${MAX_CHARS.toLocaleString()})`,
    });
  }

  const chunks = chunkText(text);

  let embeddings: number[][];
  try {
    embeddings = await embed(chunks, "document");
  } catch (err) {
    console.error(err);
    return res.status(502).json({
      error: "Could not create embeddings. Is Ollama running with nomic-embed-text installed?",
    });
  }

  const document = await prisma.document.create({
    data: {
      filename: file.originalname.slice(0, 200),
      conversationId: id,
      chunks: {
        create: chunks.map((content, position) => ({
          position,
          content,
          embedding: embeddings[position],
          conversationId: id,
        })),
      },
    },
    select: { id: true, filename: true, createdAt: true },
  });

  res.status(201).json({ ...document, chunks: chunks.length });
});

// DELETE /api/conversations/:id/documents/:docId
router.delete("/:docId", async (req, res) => {
  const params = req.params as { id?: string; docId?: string };
  const id = parseId(params.id);
  const docId = parseId(params.docId);
  if (!id || !docId) return res.status(400).json({ error: "Invalid id" });

  const userId = res.locals.userId as number;
  const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const result = await prisma.document.deleteMany({ where: { id: docId, conversationId: id } });
  if (result.count === 0) return res.status(404).json({ error: "Document not found" });

  res.status(204).end();
});

export default router;