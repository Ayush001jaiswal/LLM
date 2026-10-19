import { Router } from "express";
import multer from "multer";
import { prisma } from "../db/prisma.js";
import { uploadLimiter } from "../middleware/rateLimits.js";
import { detectFormat } from "../services/resume/extractText.js";
import { enqueueImproveJob, enqueueReviewJob } from "../services/resume/jobs.js";
import { renderResume } from "../services/resume/pipeline.js";
import { TEMPLATES } from "../services/resume/build.js";
import { runAtsChecks, extractKeywords } from "../services/resume/ats.js";
import { buildIgnoreSet } from "../services/resume/spell.js";
import { flattenResume } from "../services/resume/style.js";
import { generateJson } from "../services/ai.js";
import type { AtsReport, ResumeData, ResumeFormat, ResumeTemplateId } from "../services/resume/types.js";

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

function evaluateResumeData(data: ResumeData, jobDescription?: string): AtsReport {
  const flatText = flattenResume(data);
  const keywords = jobDescription ? extractKeywords(jobDescription) : [];
  const ignore = buildIgnoreSet(data, []);
  return runAtsChecks({
    data,
    roundTripText: flatText,
    originalText: flatText,
    pages: 1,
    keywords,
    ignoreWords: ignore,
    isReview: false,
  });
}

// GET /api/resumes/templates: list all industry standard templates
router.get("/templates", (_req, res) => {
  res.json(Object.values(TEMPLATES));
});

// POST /api/resumes/render: on-the-fly render of arbitrary resume data with chosen template
router.post("/render", async (req, res) => {
  const { data, format = "pdf", templateId = "modern_tech" } = req.body || {};
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "Missing resume data" });
  }

  const requestedFormat: ResumeFormat = format === "docx" ? "docx" : "pdf";
  const requestedTemplate: ResumeTemplateId = TEMPLATES[templateId as ResumeTemplateId]
    ? (templateId as ResumeTemplateId)
    : "modern_tech";

  const { buffer } = await renderResume(data as ResumeData, requestedFormat, requestedTemplate);
  const base = (data.contact?.name || "Resume").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 50) || "Resume";

  res.setHeader("Content-Type", MIME[requestedFormat]);
  res.setHeader("Content-Disposition", `attachment; filename="${base}_${requestedTemplate}.${requestedFormat}"`);
  res.send(buffer);
});

// POST /api/resumes/ai/bullet: enhance a bullet point into Google XYZ / STAR format
router.post("/ai/bullet", async (req, res) => {
  const { bullet, targetRole = "Software Engineer", context = "" } = req.body || {};
  if (!bullet || typeof bullet !== "string") {
    return res.status(400).json({ error: "Missing bullet text" });
  }

  try {
    const prompt = `You are a Principal Technical Recruiter and Career Strategist at top Silicon Valley firms (Google, Meta, Apple).
Rewrite this raw draft bullet point into the proven Google XYZ impact formula: "Accomplished [X] as measured by [Y] by doing [Z]".
Guidelines:
- Start with a powerful, specific action verb (e.g. Engineered, Architected, Accelerated, Reduced, Spearheaded).
- Include realistic scale, latency, throughput, or business metrics that match the role and context.
- Keep it concise (1-2 sentences max, under 30 words).
- Avoid generic buzzwords and fluff.
- Tailored for role: "${targetRole}".`;

    const schema = {
      type: "object",
      properties: {
        enhanced: { type: "string" },
        actionVerb: { type: "string" },
        metricHighlight: { type: "string" },
        explanation: { type: "string" },
      },
      required: ["enhanced", "actionVerb", "explanation"],
    };

    const result = await generateJson<{
      enhanced: string;
      actionVerb: string;
      metricHighlight?: string;
      explanation: string;
    }>(
      prompt,
      `Draft Bullet: "${bullet}"\nContext: "${context}"`,
      schema,
      { tier: "smart" }
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to enhance bullet: " + (err as Error).message });
  }
});

// POST /api/resumes/ai/summary: generate high-impact executive summary
router.post("/ai/summary", async (req, res) => {
  const { targetRole = "Software Engineer", experience = [], skills = [] } = req.body || {};

  try {
    const prompt = `You are an elite executive resume coach. Write an impactful, professional 2-3 sentence resume summary for a candidate targeting the role of "${targetRole}".
- Sentence 1: Professional identity, core specializations, and primary domains.
- Sentence 2: Major achievements, architectures built, or business outcomes delivered at scale.
- Sentence 3: Technical leadership, high-impact toolchains, and collaborative strength.
Strictly avoid first-person pronouns ("I", "my", "me"). Keep it active, authoritative, and under 75 words.`;

    const schema = {
      type: "object",
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    };

    const result = await generateJson<{ summary: string }>(
      prompt,
      `Target Role: ${targetRole}\nRecent Experience: ${JSON.stringify(experience.slice(0, 3))}\nKey Skills: ${JSON.stringify(skills)}`,
      schema,
      { tier: "smart" }
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate summary: " + (err as Error).message });
  }
});

// POST /api/resumes/builder: create a resume directly from structured builder data
router.post("/builder", async (req, res) => {
  const userId = res.locals.userId as number;
  const { filename = "My_Resume", targetRole = "Software Engineer", jobDescription = "", templateId = "modern_tech", data } = req.body || {};

  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "Missing resume data" });
  }

  const roleStr = String(targetRole).trim().slice(0, 100) || "Software Engineer";
  const fn = String(filename).trim().slice(0, 200) || "Resume";
  const jd = String(jobDescription || "").trim().slice(0, 6000);

  const report = evaluateResumeData(data, jd);

  const resume = await prisma.resume.create({
    data: {
      userId,
      filename: fn.endsWith(".pdf") ? fn : `${fn}.pdf`,
      format: "pdf",
      targetRole: roleStr,
      jobDescription: jd || null,
      status: "ready",
      progress: "Ready",
      original: data,
      improved: data,
      report: report as any,
      review: {
        original: data,
        report,
        layout: [],
        layoutInspected: true,
        warnings: [],
        removed: [],
        suggestions: ["Resume built with " + (TEMPLATES[templateId as ResumeTemplateId]?.name || "Industry Standard") + " template."],
      } as any,
    },
    select: { id: true, filename: true, targetRole: true, status: true, report: true, createdAt: true },
  });

  res.status(201).json(resume);
});

// PUT /api/resumes/:id/builder: update an existing resume with builder data
router.put("/:id/builder", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const userId = res.locals.userId as number;
  const resume = await prisma.resume.findFirst({ where: { id, userId } });
  if (!resume) return res.status(404).json({ error: "Resume not found" });

  const { data, targetRole, jobDescription } = req.body || {};
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "Missing resume data" });
  }

  const roleStr = targetRole ? String(targetRole).trim().slice(0, 100) : resume.targetRole;
  const jd = jobDescription !== undefined ? String(jobDescription).trim().slice(0, 6000) : (resume.jobDescription || "");

  const report = evaluateResumeData(data, jd);

  await prisma.resume.update({
    where: { id },
    data: {
      targetRole: roleStr,
      jobDescription: jd || null,
      improved: data,
      report: report as any,
      status: "ready",
      progress: "Ready",
    },
  });

  res.json({ id, targetRole: roleStr, report });
});

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

// GET /api/resumes/:id/download?format=pdf|docx&template=...
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

  const requestedTemplate: ResumeTemplateId =
    typeof req.query.template === "string" && TEMPLATES[req.query.template as ResumeTemplateId]
      ? (req.query.template as ResumeTemplateId)
      : "modern_tech";

  const { buffer } = await renderResume(resume.improved as unknown as ResumeData, format, requestedTemplate);

  const base = resume.filename.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "resume";
  res.setHeader("Content-Type", MIME[format]);
  res.setHeader("Content-Disposition", `attachment; filename="${base}_${requestedTemplate}.${format}"`);
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
