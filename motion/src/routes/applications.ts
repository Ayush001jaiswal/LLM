import { Router } from "express";
import { prisma } from "../db/prisma.js";

const router = Router();

// GET /api/applications: List all tracked applications for the authenticated user
router.get("/", async (_req, res) => {
  const userId = res.locals.userId as number;
  try {
    const apps = await prisma.jobApplication.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch applications: " + (err as Error).message });
  }
});

// POST /api/applications: Save or update an application
router.post("/", async (req, res) => {
  const userId = res.locals.userId as number;
  const {
    company,
    role,
    location,
    salary,
    jobUrl,
    status = "bookmarked",
    leadName,
    leadTitle,
    leadEmail,
    leadLinkedin,
    outreachNotes,
    resumeId,
    nextFollowUpDays,
  } = req.body || {};

  if (!company || !role) {
    return res.status(400).json({ error: "Company and role are required." });
  }

  try {
    let nextFollowUpAt: Date | undefined;
    if (typeof nextFollowUpDays === "number" && nextFollowUpDays > 0) {
      nextFollowUpAt = new Date(Date.now() + nextFollowUpDays * 24 * 60 * 60 * 1000);
    } else if (status === "connected" && !req.body.nextFollowUpAt) {
      // Default follow-up reminder 4 days after connecting
      nextFollowUpAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    }

    const application = await prisma.jobApplication.create({
      data: {
        userId,
        resumeId: typeof resumeId === "number" ? resumeId : undefined,
        company: String(company).trim(),
        role: String(role).trim(),
        location: location ? String(location).trim() : null,
        salary: salary ? String(salary).trim() : null,
        jobUrl: jobUrl ? String(jobUrl).trim() : null,
        status: String(status).trim(),
        leadName: leadName ? String(leadName).trim() : null,
        leadTitle: leadTitle ? String(leadTitle).trim() : null,
        leadEmail: leadEmail ? String(leadEmail).trim() : null,
        leadLinkedin: leadLinkedin ? String(leadLinkedin).trim() : null,
        outreachNotes: outreachNotes ? String(outreachNotes).trim() : null,
        appliedAt: status !== "bookmarked" ? new Date() : null,
        lastContactedAt: status === "connected" ? new Date() : null,
        nextFollowUpAt: nextFollowUpAt ?? (req.body.nextFollowUpAt ? new Date(req.body.nextFollowUpAt) : null),
      },
    });

    res.status(201).json(application);
  } catch (err) {
    res.status(500).json({ error: "Failed to create application: " + (err as Error).message });
  }
});

// PATCH /api/applications/:id: Update status or outreach notes
router.patch("/:id", async (req, res) => {
  const userId = res.locals.userId as number;
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid application id" });

  const { status, leadEmail, leadName, leadTitle, outreachNotes, nextFollowUpAt } = req.body || {};

  try {
    const existing = await prisma.jobApplication.findFirst({
      where: { id, userId },
    });
    if (!existing) return res.status(404).json({ error: "Application not found" });

    const updated = await prisma.jobApplication.update({
      where: { id },
      data: {
        status: status ? String(status) : undefined,
        leadEmail: leadEmail !== undefined ? String(leadEmail) : undefined,
        leadName: leadName !== undefined ? String(leadName) : undefined,
        leadTitle: leadTitle !== undefined ? String(leadTitle) : undefined,
        outreachNotes: outreachNotes !== undefined ? String(outreachNotes) : undefined,
        nextFollowUpAt: nextFollowUpAt !== undefined ? (nextFollowUpAt ? new Date(nextFollowUpAt) : null) : undefined,
        lastContactedAt: status === "connected" ? new Date() : undefined,
      },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update application: " + (err as Error).message });
  }
});

// DELETE /api/applications/:id
router.delete("/:id", async (req, res) => {
  const userId = res.locals.userId as number;
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid application id" });

  try {
    await prisma.jobApplication.deleteMany({
      where: { id, userId },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete application: " + (err as Error).message });
  }
});

export default router;
