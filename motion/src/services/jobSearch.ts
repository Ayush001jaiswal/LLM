/**
 * jobSearch.ts — Intelligent Job Matching Service
 *
 * Pipeline:
 *   1. Gemini reads the full ResumeData → produces a rich InferredProfile
 *      (inferred domains, career trajectory, 4 smart search queries, exclusions)
 *   2. Run all 4 queries against Adzuna API in parallel → ~60 candidates
 *   3. Fast pre-filter (no LLM): drop hard mismatches, deduplicate
 *   4. Gemini evaluates each remaining job against the profile (batched)
 *   5. Sort by LLM score → return top N with reasoning
 */

import { generateJson } from "./ai.js";
import type { ResumeData } from "./resume/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobSearchParams {
  resumeData: ResumeData;
  targetRole: string;
  location?: string;       // overrides resume location
  remoteOnly?: boolean;
  limit?: number;          // default 10
}

export interface JobMatch {
  rank: number;
  score: number;           // 1–10 from LLM
  title: string;
  company: string;
  location: string;
  salary: string | null;
  postedAt: string;
  url: string;
  snippet: string;
  matchedSkills: string[];
  fitReason: string;
  gaps: string[];
}

interface InferredProfile {
  inferredDomains: string[];
  technicalDepth: string;
  careerTrajectory: string;
  cultureSignals: string[];
  seniorityBand: string;
  searchQueries: string[];
  hardExclusions: string[];
  allSkills: string[];
}

interface AdzunaJob {
  id: string;
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  salary_min?: number;
  salary_max?: number;
  created: string;
  redirect_url: string;
  description: string;
}

interface JobEvaluation {
  score: number;
  reason: string;
  strengths: string[];
  gaps: string[];
}

// ---------------------------------------------------------------------------
// Step 1 — Deep profile analysis
// ---------------------------------------------------------------------------
const PROFILE_ANALYST_SCHEMA = {
  type: "object",
  properties: {
    inferredDomains:   { type: "array", items: { type: "string" } },
    technicalDepth:    { type: "string" },
    careerTrajectory:  { type: "string" },
    cultureSignals:    { type: "array", items: { type: "string" } },
    seniorityBand:     { type: "string" },
    searchQueries:     { type: "array", items: { type: "string" } },
    hardExclusions:    { type: "array", items: { type: "string" } },
    allSkills:         { type: "array", items: { type: "string" } },
  },
  required: ["inferredDomains", "technicalDepth", "careerTrajectory", "cultureSignals",
             "seniorityBand", "searchQueries", "hardExclusions", "allSkills"],
};

async function analyzeProfile(data: ResumeData, targetRole: string): Promise<InferredProfile> {
  const compact = {
    contact:   { name: data.contact.name, location: data.contact.location },
    summary:   data.summary.slice(0, 400),
    experience: data.experience.slice(0, 5).map((e) => ({
      title:   e.title,
      company: e.company,
      start:   e.start,
      end:     e.end,
      bullets: e.bullets.slice(0, 3),
    })),
    skills:        data.skills.flatMap((g) => g.items).slice(0, 30),
    education:     data.education.slice(0, 2).map((e) => `${e.degree} ${e.field} at ${e.school}`),
    projects:      data.projects.slice(0, 3).map((p) => `${p.name}: ${p.bullets[0] ?? ""}`),
    certifications: data.certifications.slice(0, 5),
    targetRole,
  };

  return generateJson<InferredProfile>(
    `You are a senior technical recruiter and career strategist.
Analyze the candidate's resume and output a structured profile that captures
both explicit and INFERRED information. Think carefully about:
- What industries/domains their experience implies (even if not stated)
- What kind of company culture they've worked in
- What roles logically come next in their career
- What job titles to search for (be creative, not just their current title)
- What roles would be a terrible fit (hard exclusions)

seniorityBand must be one of: "intern", "junior", "mid", "senior", "lead", "principal".
searchQueries: provide exactly 4 diverse search query strings for a job API
  (e.g. "React Node.js full stack engineer", "frontend engineer fintech startup").
  Make them varied — role-focused, domain-focused, skill-focused, growth-track-focused.
hardExclusions: job title keywords that would be a clear mismatch (e.g. "data engineer", "mobile").`,
    `Candidate resume:\n${JSON.stringify(compact, null, 2)}`,
    PROFILE_ANALYST_SCHEMA,
    { tier: "smart" }
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Fetch jobs from Adzuna
// ---------------------------------------------------------------------------
const ADZUNA_APP_ID  = process.env.ADZUNA_APP_ID  ?? "";
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY ?? "";
const ADZUNA_COUNTRY = process.env.ADZUNA_COUNTRY ?? "in"; // "in" = India

async function fetchAdzunaJobs(query: string, where: string, remoteOnly: boolean): Promise<AdzunaJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  const country = process.env.ADZUNA_COUNTRY || "in";

  if (!appId || !appKey) {
    console.warn("[jobSearch] Adzuna credentials not set — returning empty results");
    return [];
  }

  // Handle remote jobs correctly for Adzuna
  let what = query.trim();
  let searchWhere = where.trim();

  const isRemote = remoteOnly || /remote/i.test(searchWhere);
  if (isRemote) {
    if (!/remote/i.test(what)) what = `${what} remote`;
    if (/remote/i.test(searchWhere)) searchWhere = "India";
  }
  if (!searchWhere) searchWhere = "India";

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "20",
    what,
    where: searchWhere,
    sort_by: "date",
  });

  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn(`[jobSearch] Adzuna returned status ${res.status} for query "${what}"`);
      return [];
    }
    const data = (await res.json()) as { results?: AdzunaJob[] };
    return data.results ?? [];
  } catch (err) {
    console.error("[jobSearch] Adzuna fetch error", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Step 3 — Pre-filter
// ---------------------------------------------------------------------------
function preFilter(jobs: AdzunaJob[], profile: InferredProfile): AdzunaJob[] {
  const exclusions = profile.hardExclusions.map((e) => e.toLowerCase().trim()).filter(Boolean);

  // Relax window to 60 days so candidates don't get 0 results on fresh aggregations
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;

  return jobs.filter((job) => {
    // Keep recently active listings
    const createdTime = new Date(job.created).getTime();
    if (!isNaN(createdTime) && createdTime < cutoff) return false;

    // Drop strict mismatches
    const titleLower = job.title.toLowerCase();
    if (exclusions.some((ex) => ex.length > 3 && titleLower.includes(ex))) return false;

    return true;
  });
}

function deduplicateJobs(jobs: AdzunaJob[]): AdzunaJob[] {
  const seen = new Set<string>();
  return jobs.filter((j) => {
    // Deduplicate by URL, then by normalized title+company
    const key = j.redirect_url || `${j.title.toLowerCase()}_${j.company.display_name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Step 4 — LLM job evaluation (batched)
// ---------------------------------------------------------------------------
const JOB_EVAL_SCHEMA = {
  type: "object",
  properties: {
    score:     { type: "number" },
    reason:    { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    gaps:      { type: "array", items: { type: "string" } },
  },
  required: ["score", "reason", "strengths", "gaps"],
};

async function evaluateJob(job: AdzunaJob, profile: InferredProfile): Promise<JobEvaluation> {
  const profileSummary =
    `Role: ${profile.careerTrajectory}. Seniority: ${profile.seniorityBand}. ` +
    `Domains: ${profile.inferredDomains.join(", ")}. ` +
    `Technical: ${profile.technicalDepth}. ` +
    `Culture: ${profile.cultureSignals.join(", ")}. ` +
    `Skills: ${profile.allSkills.slice(0, 20).join(", ")}.`;

  const jobSummary =
    `Title: ${job.title}\nCompany: ${job.company.display_name}\n` +
    `Location: ${job.location.display_name}\n` +
    `Description: ${job.description.slice(0, 800)}`;

  const EVAL_SYSTEM_PROMPT =
    `You are a senior technical recruiter. Score how well this job fits this candidate.
SCORING RUBRIC:
• 9–10: Exceptional direct match (core tech stack, exact seniority, domain alignment).
• 7–8: Strong match (shared stack foundation, minor tool gap that is easy to pick up).
• 5–6: Stretch or cross-trainable (adjacent tech, e.g. React Native dev for Flutter, or junior ready for mid).
• 1–4: Substantial mismatch (unrelated tech stack or massive seniority gap).

FEW-SHOT CALIBRATION EXAMPLES:
Example 1 (Score 9):
Candidate: React, Node.js, TypeScript, PostgreSQL, 4 years.
Job: Full Stack Engineer at Razorpay (React, Node.js, REST, 3-5 yrs)
Output: {"score": 9, "reason": "Direct stack and seniority alignment with target technologies at a premier tech company.", "strengths": ["Exact React and Node.js match", "PostgreSQL database experience", "Aligned 4-year seniority band"], "gaps": []}

Example 2 (Score 6):
Candidate: Flutter, Dart, iOS, Android, REST APIs, 3 years.
Job: React Native Mobile Engineer at HealthTech (React Native, TypeScript, 3+ yrs)
Output: {"score": 6, "reason": "Strong cross-platform mobile app fundamentals, though candidate specializes in Flutter rather than React Native.", "strengths": ["Native mobile deployment expertise", "Mobile lifecycle and app store publishing", "Matching seniority"], "gaps": ["React Native and TypeScript framework specific switch needed"]}

Example 3 (Score 3):
Candidate: Python, Django, SQL, 2 years.
Job: Senior Backend Architect at Enterprise Corp (8+ yrs, C++, Go, high-scale architecture)
Output: {"score": 3, "reason": "Large seniority gap (2 years vs 8+ required) and language stack divergence (Django vs C++/Go).", "strengths": ["Core backend and REST API fundamentals"], "gaps": ["Seniority gap of 6+ years", "No enterprise distributed systems", "Missing C++ and Go"]}

Return JSON only in the schema format:
reason: one concise sentence (max 20 words) explaining the fit.
strengths: 2–3 short phrases (the best matching points).
gaps: 1–2 short phrases (the most notable mismatches, or empty if none).`;

  return generateJson<JobEvaluation>(
    EVAL_SYSTEM_PROMPT,
    `CANDIDATE:\n${profileSummary}\n\nJOB:\n${jobSummary}`,
    JOB_EVAL_SCHEMA,
    { tier: "smart" }
  );
}

// ---------------------------------------------------------------------------
// Skill matching helper (cheap, no LLM)
// ---------------------------------------------------------------------------
function findMatchedSkills(job: AdzunaJob, profile: InferredProfile): string[] {
  const jobText = `${job.title} ${job.description}`.toLowerCase();
  return profile.allSkills.filter((skill) => jobText.includes(skill.toLowerCase())).slice(0, 6);
}

function formatSalary(job: AdzunaJob): string | null {
  if (!job.salary_min && !job.salary_max) return null;
  const fmt = (n: number) =>
    n >= 100_000 ? `${(n / 100_000).toFixed(1)}L` : `${Math.round(n / 1000)}k`;
  if (job.salary_min && job.salary_max) return `₹${fmt(job.salary_min)}–${fmt(job.salary_max)}`;
  if (job.salary_max) return `up to ₹${fmt(job.salary_max)}`;
  return `from ₹${fmt(job.salary_min!)}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function findMatchingJobs(params: JobSearchParams): Promise<{
  jobs: JobMatch[];
  profile: InferredProfile;
  warnings: string[];
}> {
  const { resumeData, targetRole, location, remoteOnly = false, limit = 10 } = params;
  const warnings: string[] = [];

  // Step 1 — Profile analysis
  const profile = await analyzeProfile(resumeData, targetRole);

  const searchLocation = location || resumeData.contact.location || "India";

  // Build targeted search queries: mix of direct role, role+skill, and AI-inferred queries
  const topSkill = profile.allSkills[0] ?? "";
  const queriesToRun = Array.from(new Set([
    targetRole,
    topSkill ? `${targetRole} ${topSkill}` : "",
    profile.searchQueries[0] ?? "",
    profile.searchQueries[1] ?? "",
  ])).filter(Boolean).slice(0, 4);

  // Step 2 — Fetch jobs in parallel
  const allResults = await Promise.all(
    queriesToRun.map((q) => fetchAdzunaJobs(q, searchLocation, remoteOnly))
  );

  let raw = deduplicateJobs(allResults.flat());

  // Fallback: if specific queries returned 0 results, do a broad role search
  if (raw.length === 0) {
    const fallback = await fetchAdzunaJobs(targetRole || "developer", searchLocation, remoteOnly);
    raw = deduplicateJobs(fallback);
  }

  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    warnings.push("Adzuna API credentials are not configured. Set ADZUNA_APP_ID and ADZUNA_APP_KEY in .env to fetch real jobs.");
  }

  // Step 3 — Pre-filter
  let candidates = preFilter(raw, profile).slice(0, 25);
  // If preFilter dropped too many, use raw jobs so the user gets results
  if (candidates.length < 5 && raw.length > 0) {
    candidates = raw.slice(0, 25);
  }

  if (candidates.length === 0) {
    return {
      jobs: [],
      profile,
      warnings: [...warnings, "No jobs currently found for this specific search. Try a broader role or unchecking 'Remote only'."],
    };
  }

  // Step 4 — LLM evaluation in parallel (capped at 15 for fast response)
  const evaluations = await Promise.all(
    candidates.slice(0, 15).map(async (job) => {
      try {
        const evaluation = await evaluateJob(job, profile);
        return { job, evaluation };
      } catch {
        // Fallback score if individual job evaluation fails
        const matched = findMatchedSkills(job, profile);
        const fallbackScore = Math.min(9, Math.max(5, Math.round((matched.length / Math.max(profile.allSkills.length, 1)) * 10) + 4));
        return {
          job,
          evaluation: {
            score: fallbackScore,
            reason: `Role aligns with your background in ${profile.seniorityBand} engineering.`,
            strengths: matched.slice(0, 3),
            gaps: [],
          },
        };
      }
    })
  );

  // Step 5 — Build final ranked list
  const scored = evaluations
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => b.evaluation.score - a.evaluation.score)
    .slice(0, limit);

  const jobs: JobMatch[] = scored.map(({ job, evaluation }, idx) => ({
    rank:          idx + 1,
    score:         evaluation.score,
    title:         job.title,
    company:       job.company.display_name,
    location:      job.location.display_name,
    salary:        formatSalary(job),
    postedAt:      job.created,
    url:           job.redirect_url,
    snippet:       job.description.slice(0, 200),
    matchedSkills: findMatchedSkills(job, profile),
    fitReason:     evaluation.reason,
    gaps:          evaluation.gaps,
  }));

  return { jobs, profile, warnings };
}
