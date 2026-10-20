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
import { fetchTopTierAtsJobs, getTierBadge } from "./topCompanies.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobSearchParams {
  resumeData: ResumeData;
  targetRole: string;
  location?: string;       // overrides resume location
  remoteOnly?: boolean;
  page?: number;           // default 1
  pageSize?: number;       // default 10
  limit?: number;          // optional legacy override
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
  source?: string;
  tierBadge?: string;
}

export interface InferredProfile {
  inferredDomains: string[];
  technicalDepth: string;
  careerTrajectory: string;
  cultureSignals: string[];
  seniorityBand: string;
  searchQueries: string[];
  hardExclusions: string[];
  allSkills: string[];
}

export interface JobSearchResult {
  jobs: JobMatch[];
  totalJobs: number;
  page: number;
  pageSize: number;
  totalPages: number;
  profile: InferredProfile;
  warnings: string[];
}

export interface MarketJob {
  id: string;
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  salary_min?: number;
  salary_max?: number;
  created: string;
  redirect_url: string;
  description: string;
  source: string;
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
// Step 2 — Fetch jobs from Multi-Board Market Aggregators
// (Adzuna, Remotive, Jobicy, Arbeitnow, and JSearch / RapidAPI)
// ---------------------------------------------------------------------------
const ADZUNA_APP_ID  = process.env.ADZUNA_APP_ID  ?? "";
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY ?? "";
const ADZUNA_COUNTRY = process.env.ADZUNA_COUNTRY ?? "in"; // "in" = India

async function fetchAdzunaJobs(query: string, where: string, remoteOnly: boolean): Promise<MarketJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  const country = process.env.ADZUNA_COUNTRY || "in";

  if (!appId || !appKey) return [];

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
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: any[] };
    return (data.results ?? []).map((j) => ({
      id: `adzuna_${j.id}`,
      title: j.title || "Job Opportunity",
      company: { display_name: j.company?.display_name || "Company" },
      location: { display_name: j.location?.display_name || searchWhere },
      salary_min: j.salary_min,
      salary_max: j.salary_max,
      created: j.created || new Date().toISOString(),
      redirect_url: j.redirect_url,
      description: (j.description || "").slice(0, 1000),
      source: "Adzuna",
    }));
  } catch {
    return [];
  }
}

async function fetchRemotiveJobs(query: string): Promise<MarketJob[]> {
  const clean = query.replace(/[^\w\s]/g, " ").trim();
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(clean)}&limit=25`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { jobs?: any[] };
    return (data.jobs ?? []).map((j) => ({
      id: `remotive_${j.id}`,
      title: j.title,
      company: { display_name: j.company_name || "Tech Company" },
      location: { display_name: j.candidate_required_location || "Remote" },
      created: j.publication_date || new Date().toISOString(),
      redirect_url: j.url,
      description: (j.description || "").replace(/<[^>]+>/g, " ").slice(0, 1000),
      source: "Remotive",
    }));
  } catch {
    return [];
  }
}

async function fetchJobicyJobs(query: string): Promise<MarketJob[]> {
  const tag = /dev|engineer|frontend|backend|fullstack|data|ai|cloud/i.test(query)
    ? "developer"
    : encodeURIComponent(query.split(" ")[0]);
  const url = `https://jobicy.com/api/v2/remote-jobs?count=25&tag=${tag}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { jobs?: any[] };
    return (data.jobs ?? []).map((j) => ({
      id: `jobicy_${j.id}`,
      title: j.jobTitle,
      company: { display_name: j.companyName || "Company" },
      location: { display_name: j.jobGeo || "Remote / Global" },
      salary_min: j.annualSalaryMin ? Number(j.annualSalaryMin) : undefined,
      salary_max: j.annualSalaryMax ? Number(j.annualSalaryMax) : undefined,
      created: j.pubDate || new Date().toISOString(),
      redirect_url: j.url,
      description: (j.jobDescription || "").replace(/<[^>]+>/g, " ").slice(0, 1000),
      source: "Jobicy",
    }));
  } catch {
    return [];
  }
}

async function fetchArbeitnowJobs(query: string): Promise<MarketJob[]> {
  const url = `https://www.arbeitnow.com/api/job-board-api`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: any[] };
    const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const matches = (data.data ?? []).filter((j) => {
      const fullText = `${j.title} ${j.tags?.join(" ") || ""} ${j.description}`.toLowerCase();
      return keywords.some((k) => fullText.includes(k));
    });
    return matches.slice(0, 20).map((j) => ({
      id: `arbeitnow_${j.slug}`,
      title: j.title,
      company: { display_name: j.company_name || "Company" },
      location: { display_name: j.location || (j.remote ? "Remote" : "Worldwide") },
      created: j.created_at ? new Date(j.created_at * 1000).toISOString() : new Date().toISOString(),
      redirect_url: j.url,
      description: (j.description || "").replace(/<[^>]+>/g, " ").slice(0, 1000),
      source: "Arbeitnow",
    }));
  } catch {
    return [];
  }
}

async function fetchJSearchJobs(query: string, location: string): Promise<MarketJob[]> {
  const apiKey = process.env.RAPIDAPI_KEY || process.env.JSEARCH_KEY;
  if (!apiKey) return [];

  const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(`${query} in ${location}`)}&page=1&num_pages=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: any[] };
    return (data.data ?? []).map((j) => ({
      id: `jsearch_${j.job_id}`,
      title: j.job_title,
      company: { display_name: j.employer_name || "Company" },
      location: { display_name: [j.job_city, j.job_country].filter(Boolean).join(", ") || location },
      salary_min: j.job_min_salary,
      salary_max: j.job_max_salary,
      created: j.job_posted_at_datetime_utc || new Date().toISOString(),
      redirect_url: j.job_apply_link || j.job_google_link,
      description: (j.job_description || "").slice(0, 1000),
      source: "LinkedIn / Indeed",
    }));
  } catch {
    return [];
  }
}

async function fetchRemoteOKJobs(query: string): Promise<MarketJob[]> {
  const clean = query.replace(/[^\w\s]/g, " ").trim().split(" ")[0].toLowerCase();
  const url = `https://remoteok.com/api?tag=${encodeURIComponent(clean || "dev")}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) return [];
    return data.slice(1, 25).map((j) => ({
      id: `remoteok_${j.id || Math.random()}`,
      title: j.position || "Developer",
      company: { display_name: j.company || "Tech Company" },
      location: { display_name: j.location || "Remote" },
      salary_min: j.salary_min ? Number(j.salary_min) : undefined,
      salary_max: j.salary_max ? Number(j.salary_max) : undefined,
      created: j.date || new Date().toISOString(),
      redirect_url: j.url || `https://remoteok.com`,
      description: (j.description || "").replace(/<[^>]+>/g, " ").slice(0, 1000),
      source: "RemoteOK",
    }));
  } catch {
    return [];
  }
}

/**
 * Ensures diverse representation across all active job boards (Adzuna, Remotive, RemoteOK, Jobicy, Arbeitnow, LinkedIn/Indeed)
 * by interleaving results round-robin instead of letting one board dominate the top results.
 */
function balanceSources(jobs: MarketJob[], maxTotal = 30): MarketJob[] {
  const bySource: Record<string, MarketJob[]> = {};
  for (const j of jobs) {
    const src = j.source || "Market";
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(j);
  }

  const sources = Object.keys(bySource);
  if (sources.length <= 1) return jobs.slice(0, maxTotal);

  const balanced: MarketJob[] = [];
  let added = true;
  let idx = 0;

  while (added && balanced.length < maxTotal) {
    added = false;
    for (const src of sources) {
      if (idx < bySource[src].length && balanced.length < maxTotal) {
        balanced.push(bySource[src][idx]);
        added = true;
      }
    }
    idx++;
  }
  return balanced;
}

// ---------------------------------------------------------------------------
// Step 3 — Relevance & Tier-Based Heuristic Scorer for Large Corpus Ranking
// ---------------------------------------------------------------------------
interface ScoredMarketJob {
  job: MarketJob;
  relevanceScore: number;
  matchedSkills: string[];
}

function calculateJobRelevance(job: MarketJob, profile: InferredProfile, targetRole: string): ScoredMarketJob {
  let score = 0;
  const titleLower = job.title.toLowerCase();
  const descLower = (job.description || "").toLowerCase();
  const fullText = `${titleLower} ${descLower}`;

  // 1. Target Role & Title Alignment (0 - 35 points)
  const roleTokens = targetRole.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  let titleMatches = 0;
  for (const token of roleTokens) {
    if (titleLower.includes(token)) titleMatches++;
  }
  if (roleTokens.length > 0) {
    score += Math.round((titleMatches / roleTokens.length) * 35);
  }

  // 2. Primary Skills Match (0 - 35 points)
  const matchedSkills: string[] = [];
  for (const skill of profile.allSkills) {
    const sLower = skill.toLowerCase();
    if (fullText.includes(sLower)) {
      matchedSkills.push(skill);
    }
  }
  const skillRatio = Math.min(1, matchedSkills.length / Math.max(4, Math.min(profile.allSkills.length, 10)));
  score += Math.round(skillRatio * 35);

  // 3. Seniority Band Alignment (0 - 15 points)
  const seniority = profile.seniorityBand.toLowerCase();
  if (seniority === "senior" || seniority === "lead" || seniority === "principal") {
    if (/senior|sr\.|lead|principal|staff|architect/i.test(titleLower)) score += 15;
    else if (/intern|junior|entry/i.test(titleLower)) score -= 20; // penalize mismatch
    else score += 8;
  } else if (seniority === "junior" || seniority === "intern") {
    if (/junior|intern|graduate|entry|associate/i.test(titleLower)) score += 15;
    else if (/senior|staff|principal|lead|director/i.test(titleLower)) score -= 25;
    else score += 10;
  } else {
    // mid-level
    if (!/intern|director|vp|head of/i.test(titleLower)) score += 12;
  }

  // 4. Company Prestige / Tier Boost (0 - 25 points)
  const tierBadge = getTierBadge(job.company.display_name);
  if (tierBadge) {
    score += tierBadge.includes("AI") ? 25 : 20;
  }

  return {
    job,
    relevanceScore: Math.max(0, score),
    matchedSkills: matchedSkills.slice(0, 6),
  };
}

// ---------------------------------------------------------------------------
// Step 3 — Pre-filter
// ---------------------------------------------------------------------------
function preFilter(jobs: MarketJob[], profile: InferredProfile): MarketJob[] {
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

function deduplicateJobs(jobs: MarketJob[]): MarketJob[] {
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

async function evaluateJob(job: MarketJob, profile: InferredProfile): Promise<JobEvaluation> {
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
function findMatchedSkills(job: MarketJob, profile: InferredProfile): string[] {
  const jobText = `${job.title} ${job.description}`.toLowerCase();
  return profile.allSkills.filter((skill) => jobText.includes(skill.toLowerCase())).slice(0, 6);
}

function formatSalary(job: MarketJob): string | null {
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
export async function findMatchingJobs(params: JobSearchParams): Promise<JobSearchResult> {
  const { resumeData, targetRole, location, remoteOnly = false, page = 1, pageSize = 10, limit } = params;
  const warnings: string[] = [];
  const effectivePageSize = limit ? Math.min(limit, 100) : Math.min(Math.max(pageSize, 1), 100);
  const effectivePage = Math.max(page, 1);

  // Step 1 — Profile analysis via LLM
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

  // Step 2 — Fetch jobs across multiple market boards concurrently
  const fetchTasks: Promise<MarketJob[]>[] = [
    // 1. Adzuna network queries
    ...queriesToRun.map((q) => fetchAdzunaJobs(q, searchLocation, remoteOnly)),
    // 2. Targeted tier-1 queries on Adzuna (Google, Meta, Microsoft, Amazon, Flipkart, Uber, Intel, Groww, Swiggy, Zomato)
    fetchAdzunaJobs(`Google ${targetRole}`, searchLocation, remoteOnly),
    fetchAdzunaJobs(`Meta ${targetRole}`, searchLocation, remoteOnly),
    fetchAdzunaJobs(`Microsoft ${targetRole}`, searchLocation, remoteOnly),
    fetchAdzunaJobs(`Amazon ${targetRole}`, searchLocation, remoteOnly),
    fetchAdzunaJobs(`Flipkart ${targetRole}`, searchLocation, remoteOnly),
    fetchAdzunaJobs(`Uber ${targetRole}`, searchLocation, remoteOnly),
    fetchAdzunaJobs(`Intel ${targetRole}`, searchLocation, remoteOnly),
    fetchAdzunaJobs(`Groww ${targetRole}`, searchLocation, remoteOnly),
    fetchAdzunaJobs(`Swiggy ${targetRole}`, searchLocation, remoteOnly),
    fetchAdzunaJobs(`Zomato ${targetRole}`, searchLocation, remoteOnly),
    // 3. Direct ATS feeds for top-funded AI startups & unicorns (Anthropic, Perplexity, Scale AI, Databricks, Stripe, CRED, etc.)
    fetchTopTierAtsJobs(targetRole),
    // 4. Remotive live global tech jobs
    fetchRemotiveJobs(targetRole),
    ...(topSkill ? [fetchRemotiveJobs(`${targetRole} ${topSkill}`)] : []),
    // 5. RemoteOK live engineering board
    fetchRemoteOKJobs(targetRole),
    // 6. Jobicy live engineering opportunities
    fetchJobicyJobs(targetRole),
    // 7. Arbeitnow tech board
    fetchArbeitnowJobs(targetRole),
    // 8. LinkedIn & Indeed (via JSearch / RapidAPI if configured)
    fetchJSearchJobs(targetRole, searchLocation),
  ];

  const settled = await Promise.allSettled(fetchTasks);
  const fetchedJobs: MarketJob[] = settled
    .filter((r): r is PromiseFulfilledResult<MarketJob[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  let raw = deduplicateJobs(fetchedJobs);

  // Fallback: if specific queries returned 0 results, do a broad multi-board fallback
  if (raw.length === 0) {
    const fallbackSettled = await Promise.allSettled([
      fetchTopTierAtsJobs("engineer"),
      fetchAdzunaJobs(targetRole || "developer", searchLocation, remoteOnly),
      fetchRemotiveJobs("software developer"),
      fetchRemoteOKJobs("developer"),
      fetchJobicyJobs("developer"),
      fetchArbeitnowJobs("developer"),
    ]);
    const fallbackJobs = fallbackSettled
      .filter((r): r is PromiseFulfilledResult<MarketJob[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
    raw = deduplicateJobs(fallbackJobs);
  }

  // Step 3 — Strict Relevance Filtering against Resume Title, Skills, Experience, and Location
  let filtered = preFilter(raw, profile);

  // If user has not specified a foreign location, ensure jobs are relevant/accessible to Indian candidates
  // (India jobs, or Remote/Worldwide/Global remote jobs)
  const isIndiaDefault = !location || /india/i.test(location);
  if (isIndiaDefault) {
    filtered = filtered.filter((job) => {
      const loc = (job.location?.display_name || "").toLowerCase();
      // Match Indian cities, states, "India", or remote/global positions open worldwide
      return (
        /india|remote|anywhere|worldwide|global|bengaluru|bangalore|hyderabad|pune|delhi|noida|gurugram|gurgaon|mumbai|chennai|kolkata|ahmedabad|kerala/i.test(
          loc
        ) ||
        job.source?.includes("Careers") // Direct ATS feeds often hire globally/remote for top tier
      );
    });
  }

  // Score all retrieved jobs using comprehensive relevance heuristics
  const allScoredCandidates: ScoredMarketJob[] = filtered
    .map((job) => calculateJobRelevance(job, profile, targetRole))
    // Filter strictly for relevant jobs: must have title alignment or primary skill match (relevance score >= 20)
    .filter((scored) => scored.relevanceScore >= 20);

  // Sort globally by relevance score descending (Top tier companies + strong skill/experience alignment float to top)
  allScoredCandidates.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const totalJobs = allScoredCandidates.length;
  const totalPages = Math.max(1, Math.ceil(totalJobs / effectivePageSize));

  if (totalJobs === 0) {
    return {
      jobs: [],
      totalJobs: 0,
      page: effectivePage,
      pageSize: effectivePageSize,
      totalPages: 1,
      profile,
      warnings: [...warnings, "No relevant job listings matched your skills and target role. Try broadening the role title or location."],
    };
  }

  // Step 4 — Paginate: select the exact slice for the requested page
  const startIndex = (effectivePage - 1) * effectivePageSize;
  const pageSlice = allScoredCandidates.slice(startIndex, startIndex + effectivePageSize);

  // Step 5 — Deep LLM Evaluation on the active page slice
  const evaluations = await Promise.all(
    pageSlice.map(async ({ job, matchedSkills }, idx) => {
      // Evaluate top 15 items with Gemini for deep narrative, and calibrate remainder with smart heuristics to ensure instant page delivery
      if (idx < 15) {
        try {
          const evaluation = await evaluateJob(job, profile);
          return { job, evaluation, matchedSkills };
        } catch {
          // Fall through to calibrated fallback
        }
      }

      // Robust calibrated calculation from multi-factor relevance score
      const relScore = calculateJobRelevance(job, profile, targetRole).relevanceScore;
      const normalized = Math.min(10, Math.max(6, Math.round(relScore / 10)));
      return {
        job,
        evaluation: {
          score: normalized,
          reason: `Role aligns with your background in ${profile.seniorityBand} engineering and ${matchedSkills.slice(0, 2).join(", ") || "core tech"}.`,
          strengths: matchedSkills.slice(0, 3),
          gaps: [],
        },
        matchedSkills,
      };
    })
  );

  const jobs: JobMatch[] = evaluations.map(({ job, evaluation, matchedSkills }, idx) => ({
    rank:          startIndex + idx + 1,
    score:         evaluation.score,
    title:         job.title,
    company:       job.company.display_name,
    location:      job.location.display_name,
    salary:        formatSalary(job),
    postedAt:      job.created,
    url:           job.redirect_url,
    snippet:       job.description.slice(0, 200),
    matchedSkills: matchedSkills.length > 0 ? matchedSkills : findMatchedSkills(job, profile),
    fitReason:     evaluation.reason,
    gaps:          evaluation.gaps,
    source:        job.source || "Market",
    tierBadge:     getTierBadge(job.company.display_name),
  }));

  return {
    jobs,
    totalJobs,
    page: effectivePage,
    pageSize: effectivePageSize,
    totalPages,
    profile,
    warnings,
  };
}
