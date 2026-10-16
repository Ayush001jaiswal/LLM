import { Router } from "express";
import multer from "multer";
import { prisma } from "../db/prisma.js";
import { uploadLimiter } from "../middleware/rateLimits.js";
import { detectFormat } from "../services/resume/extractText.js";
import { enqueueImproveJob, enqueueReviewJob } from "../services/resume/jobs.js";
import { renderResume } from "../services/resume/pipeline.js";
import type { ResumeData, ResumeFormat } from "../services/resume/types.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const ACTIVE = ["queued", "extracting", "improving", "checking"]; // "reviewed" waits for the user, so it is not active
const MIME: Record<ResumeFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const parseId = (v: string | string[] | undefined): number | null => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// POST /api/resumes: upload a resume (multipart: file, targetRole, jobDescription?)
router.post("/", uploadLimiter, upload.single("file"), async (req, res) => {
  const userId = res.locals.userId as number;

  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const format = detectFormat(file.originalname);
  if (!format) return res.status(400).json({ error: "Upload a PDF or DOCX file (old .doc files are not supported)" });

  const targetRole = typeof req.body?.targetRole === "string" ? req.body.targetRole.trim() : "";
  if (targetRole.length < 2 || targetRole.length > 100) {
    return res.status(400).json({ error: "Enter the job role you are applying for (2 to 100 characters)" });
  }

  const jd = typeof req.body?.jobDescription === "string" ? req.body.jobDescription.trim() : "";
  if (jd.length > 6000) return res.status(400).json({ error: "Job description is too long (max 6000 characters)" });

  const busy = await prisma.resume.count({ where: { userId, status: { in: ACTIVE } } });
  if (busy > 0) {
    return res.status(409).json({ error: "One of your resumes is still being processed. Please wait for it to finish." });
  }

  const resume = await prisma.resume.create({
    data: {
      userId,
      filename: file.originalname.slice(0, 200),
      format,
      targetRole,
      jobDescription: jd || null,
    },
    select: { id: true },
  });

  enqueueReviewJob({ id: resume.id, buffer: file.buffer, format, targetRole, jobDescription: jd || undefined });
  res.status(202).json({ id: resume.id });
});

// POST /api/resumes/:id/improve: rewrite the resume (only when the user asks). Body: { instructions? }
router.post("/:id/improve", uploadLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const userId = res.locals.userId as number;
  const resume = await prisma.resume.findFirst({ where: { id, userId } });
  if (!resume) return res.status(404).json({ error: "Resume not found" });
  if (resume.status !== "reviewed" && resume.status !== "ready") {
    return res.status(409).json({ error: "This resume is not ready to be improved yet" });
  }

  const instructions = typeof req.body?.instructions === "string" ? req.body.instructions.trim() : "";
  if (instructions.length > 800) return res.status(400).json({ error: "Instructions are too long (max 800 characters)" });

  const busy = await prisma.resume.count({ where: { userId, status: { in: ACTIVE } } });
  if (busy > 0) return res.status(409).json({ error: "Another resume is still being processed. Please wait for it to finish." });

  await prisma.resume.update({
    where: { id },
    data: { instructions: instructions || null, status: "improving", progress: "Starting...", error: null },
  });
  enqueueImproveJob(id);
  res.status(202).json({ id });
});

// GET /api/resumes: list
router.get("/", async (_req, res) => {
  const userId = res.locals.userId as number;
  const list = await prisma.resume.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    take: 30,
    select: { id: true, filename: true, targetRole: true, status: true, createdAt: true },
  });
  res.json(list);
});

// GET /api/resumes/:id: status and results
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const resume = await prisma.resume.findFirst({
    where: { id, userId: res.locals.userId as number },
    select: {
      id: true, filename: true, format: true, targetRole: true, status: true, progress: true,
      error: true, instructions: true, original: true, improved: true, review: true, report: true,
      notes: true, createdAt: true,
    },
  });
  if (!resume) return res.status(404).json({ error: "Resume not found" });
  res.json(resume);
});

// GET /api/resumes/:id/download?format=pdf|docx
router.get("/:id/download", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const resume = await prisma.resume.findFirst({
    where: { id, userId: res.locals.userId as number },
  });
  if (!resume) return res.status(404).json({ error: "Resume not found" });
  if (resume.status !== "ready" || !resume.improved) {
    return res.status(409).json({ error: "This resume is not ready yet" });
  }

  const requested = req.query.format;
  const format: ResumeFormat =
    requested === "pdf" || requested === "docx" ? requested : (resume.format as ResumeFormat);

  const { buffer } = await renderResume(resume.improved as unknown as ResumeData, format);

  const base = resume.filename.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "resume";
  res.setHeader("Content-Type", MIME[format]);
  res.setHeader("Content-Disposition", `attachment; filename="${base}_ATS.${format}"`);
  res.send(buffer);
});

// DELETE /api/resumes/:id: removes the stored resume data
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const result = await prisma.resume.deleteMany({ where: { id, userId: res.locals.userId as number } });
  if (result.count === 0) return res.status(404).json({ error: "Resume not found" });
  res.status(204).end();
});

export default router;
