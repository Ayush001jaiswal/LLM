import { prisma } from "../../db/prisma.js";
import { improveFromReview, reviewResume } from "./pipeline.js";
import type { ResumeData, ResumeFormat } from "./types.js";

// Ollama runs one request at a time on a small machine, so jobs run one after another
let queue: Promise<void> = Promise.resolve();
const toJson = (v: unknown) => JSON.parse(JSON.stringify(v));

function enqueue(fn: () => Promise<void>): void {
  queue = queue.then(fn).catch((err) => console.error("Resume queue error", err));
}

async function setState(id: number, data: { status?: string; progress?: string; error?: string | null }) {
  await prisma.resume.update({ where: { id }, data });
}

/* ---------- Phase 1: review ---------- */
export function enqueueReviewJob(job: {
  id: number;
  buffer: Buffer;
  format: ResumeFormat;
  targetRole: string;
  jobDescription?: string;
}): void {
  enqueue(async () => {
    try {
      await setState(job.id, { status: "extracting", progress: "Starting..." });
      const review = await reviewResume(job, (status, message) => {
        setState(job.id, { status, progress: message }).catch(() => {});
      });
      await prisma.resume.update({
        where: { id: job.id },
        data: {
          status: "reviewed",
          progress: "Review ready",
          error: null,
          original: toJson(review.original),
          review: toJson(review),
        },
      });
    } catch (err) {
      console.error("Resume review failed", err);
      await setState(job.id, {
        status: "failed",
        progress: "",
        error: (err as Error).message || "Something went wrong while reading this resume.",
      }).catch(() => {});
    }
  });
}

/* ---------- Phase 2: improve (only when the user asks) ---------- */
export function enqueueImproveJob(id: number): void {
  enqueue(async () => {
    const row = await prisma.resume.findUnique({ where: { id } });
    if (!row || !row.original) return;
    const hadResult = row.improved !== null;

    try {
      const result = await improveFromReview(
        {
          original: row.original as unknown as ResumeData,
          format: row.format as ResumeFormat,
          targetRole: row.targetRole,
          jobDescription: row.jobDescription ?? undefined,
          instructions: row.instructions ?? undefined,
        },
        (status, message) => {
          setState(id, { status, progress: message }).catch(() => {});
        }
      );
      await prisma.resume.update({
        where: { id },
        data: {
          status: "ready",
          progress: "Done",
          error: null,
          improved: toJson(result.improved),
          report: toJson(result.report),
          notes: toJson(result.notes),
        },
      });
    } catch (err) {
      console.error("Resume improve failed", err);
      // Go back to the last good state so the user can try again
      await setState(id, {
        status: hadResult ? "ready" : "reviewed",
        progress: "",
        error: (err as Error).message || "Something went wrong while improving this resume.",
      }).catch(() => {});
    }
  });
}

// Call once at startup: a job that was running when the server stopped can never finish
export async function failStaleResumeJobs(): Promise<void> {
  const stale = await prisma.resume.findMany({
    where: { status: { in: ["queued", "extracting", "improving", "checking"] } },
    select: { id: true, original: true, improved: true },
  });
  for (const r of stale) {
    const status = r.improved ? "ready" : r.original ? "reviewed" : "failed";
    await prisma.resume.update({
      where: { id: r.id },
      data: {
        status,
        progress: "",
        error: "The server restarted while this resume was processing. Please try again.",
      },
    });
  }
}
