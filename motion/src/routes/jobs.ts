import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { uploadLimiter } from "../middleware/rateLimits.js";
import { findMatchingJobs } from "../services/jobSearch.js";
import type { ResumeData } from "../services/resume/types.js";

const router = Router({ mergeParams: true }); // inherits :id from parent

// POST /api/resumes/:id/jobs
// Body (all optional): { location?, remoteOnly?, limit? }
router.post("/", uploadLimiter, async (req, res) => {
  const userId = res.locals.userId as number;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid resume id" });
  }

  // Load the resume — prefer improved, fall back to original
  const resume = await prisma.resume.findFirst({
    where: { id, userId },
    select: { improved: true, original: true, targetRole: true, status: true },
  });

  if (!resume) return res.status(404).json({ error: "Resume not found" });
  if (!resume.original && !resume.improved) {
    return res.status(409).json({ error: "Resume has not been processed yet. Please wait for the review to finish." });
  }

  const resumeData = (resume.improved ?? resume.original) as unknown as ResumeData;

  const location   = typeof req.body?.location   === "string" ? req.body.location.trim()   : undefined;
  const remoteOnly = req.body?.remoteOnly === true;
  const page       = typeof req.body?.page       === "number" ? Math.max(1, req.body.page) : 1;
  const pageSize   = typeof req.body?.pageSize   === "number" ? Math.min(Math.max(1, req.body.pageSize), 50) : 10;
  const limit      = typeof req.body?.limit      === "number" ? Math.min(req.body.limit, 20) : undefined;

  try {
    const result = await findMatchingJobs({
      resumeData,
      targetRole: resume.targetRole,
      location,
      remoteOnly,
      page,
      pageSize,
      limit,
    });

    res.json(result);
  } catch (err) {
    console.error("[jobs route] findMatchingJobs failed", err);
    const message = (err as Error).message ?? "Something went wrong while finding jobs.";
    res.status(500).json({ error: message });
  }
});

export default router;
