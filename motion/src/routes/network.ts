import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { matchRecruiterNetworkAndConsultancies } from "../services/networkMatching.js";
import { findMatchingRecruiters, NoticePeriodOption } from "../services/recruiterDirectory.js";
import type { ResumeData } from "../services/resume/types.js";

const router = Router({ mergeParams: true });

const parseId = (v: string | string[] | undefined): number | null => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// GET /api/resumes/:id/network/directory: Fetch all matching recruiters & consultancies for candidate profile
router.get("/directory", async (req: { params: { id?: string | string[] }; query: any }, res) => {
  const resumeId = parseId(req.params.id);
  if (!resumeId) return res.status(400).json({ error: "Invalid resume id" });

  const userId = res.locals.userId as number;
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    select: { id: true, targetRole: true, original: true, improved: true },
  });

  if (!resume) return res.status(404).json({ error: "Resume not found" });

  const resumeData = (resume.improved || resume.original) as unknown as ResumeData;
  if (!resumeData) {
    return res.status(400).json({ error: "Resume data is empty." });
  }

  const allSkills = (resumeData.skills || []).flatMap((g) => g.items);
  const noticePeriod = (req.query.noticePeriod as NoticePeriodOption) || "immediate";
  const searchFilter = typeof req.query.search === "string" ? req.query.search : undefined;

  const leads = findMatchingRecruiters({
    role: resume.targetRole,
    skills: allSkills,
    seniority: "lead", // Lead / Staff
    noticePeriod,
    searchFilter,
  });

  res.json({
    candidateRole: resume.targetRole,
    noticePeriod,
    totalFound: leads.length,
    leads,
  });
});

// POST /api/resumes/:id/network: compute two-way recruiter, network and consultancy matches
router.post("/", async (req: { params: { id?: string | string[] }; body: any }, res) => {
  const resumeId = parseId(req.params.id);
  if (!resumeId) return res.status(400).json({ error: "Invalid resume id" });

  const userId = res.locals.userId as number;
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    select: { id: true, targetRole: true, original: true, improved: true },
  });

  if (!resume) return res.status(404).json({ error: "Resume not found" });

  const resumeData = (resume.improved || resume.original) as unknown as ResumeData;
  if (!resumeData) {
    return res.status(400).json({ error: "Resume data is empty. Please upload or build a resume first." });
  }

  const { targetCompany = "Razorpay", targetRole, location } = req.body || {};

  try {
    const result = await matchRecruiterNetworkAndConsultancies({
      resumeData,
      targetCompany: String(targetCompany).trim() || "Google",
      targetRole: targetRole ? String(targetRole).trim() : resume.targetRole,
      location: location ? String(location).trim() : undefined,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to match network: " + (err as Error).message });
  }
});

export default router;
