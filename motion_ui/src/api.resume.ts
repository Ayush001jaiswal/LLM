import { API, authHeaders, ensureOk } from "./api";

/* ---------- Types (they mirror the backend) ---------- */
export type ResumeFormat = "pdf" | "docx";
export type ResumeTemplateId = "classic" | "modern_tech" | "executive" | "compact" | "creative";

export interface TemplateConfig {
  id: ResumeTemplateId;
  name: string;
  category: string;
  description: string;
  accentColor: string;
  fontFamily: string;
  headerAlign: "center" | "left";
}

export type ResumeStatus =
  | "queued" | "extracting" | "reviewed" | "improving" | "checking" | "ready" | "failed";

export const isActive = (s: ResumeStatus): boolean =>
  s === "queued" || s === "extracting" || s === "improving" || s === "checking";

export interface ExperienceEntry {
  title: string;
  company: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
}
export interface EducationEntry {
  school: string;
  degree: string;
  field: string;
  start: string;
  end: string;
  details: string[];
}
export interface ProjectEntry {
  name: string;
  tech: string;
  bullets: string[];
}
export interface SkillGroup {
  label: string;
  items: string[];
}
export interface ResumeData {
  contact: { name: string; email: string; phone: string; location: string; links: string[] };
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  projects: ProjectEntry[];
  skills: SkillGroup[];
  certifications: string[];
  achievements: string[];
  other: string[];
}
export interface AtsCheck { id: string; label: string; pass: boolean; detail: string; weight: number }
export interface AtsReport {
  score: number;
  checks: AtsCheck[];
  keywordCoverage: number | null;
  matchedKeywords: string[];
  missingKeywords: string[];
  templateGuarantees: string[];
  quantifiedBulletsPercent: number;
  pages: number | null;
}
export interface Review {
  report: AtsReport;
  layout: string[];
  layoutInspected: boolean;
  warnings: string[];
  removed: string[];
  suggestions: string[];
  spelling: { word: string; suggestion: string }[];
  buzzwords: string[];
}
export interface ResumeNotes { warnings: string[]; removed: string[]; suggestions: string[]; fallbacks: string[] }

export interface ResumeListItem {
  id: number; filename: string; targetRole: string; status: ResumeStatus; createdAt: string;
}
export interface ResumeDetail extends ResumeListItem {
  format: ResumeFormat;
  progress: string;
  error: string | null;
  instructions: string | null;
  original: ResumeData | null;
  improved: ResumeData | null;
  review: Review | null;
  report: AtsReport | null;
  notes: ResumeNotes | null;
}

/* ---------- Calls ---------- */
export async function uploadResume(file: File, targetRole: string, jobDescription: string): Promise<{ id: number }> {
  const form = new FormData();
  form.append("file", file);
  form.append("targetRole", targetRole);
  if (jobDescription.trim()) form.append("jobDescription", jobDescription);
  const res = await fetch(`${API}/resumes`, { method: "POST", headers: authHeaders(), body: form });
  await ensureOk(res);
  return res.json();
}

// Rewrites the resume. `instructions` can contain style requests and true facts the person wants added.
export async function improveResume(id: number, instructions: string): Promise<void> {
  const res = await fetch(`${API}/resumes/${id}/improve`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ instructions }),
  });
  await ensureOk(res);
}

export async function listResumes(): Promise<ResumeListItem[]> {
  const res = await fetch(`${API}/resumes`, { headers: authHeaders() });
  await ensureOk(res);
  return res.json();
}

export async function getResume(id: number): Promise<ResumeDetail> {
  const res = await fetch(`${API}/resumes/${id}`, { headers: authHeaders() });
  await ensureOk(res);
  return res.json();
}

export async function deleteResume(id: number): Promise<void> {
  const res = await fetch(`${API}/resumes/${id}`, { method: "DELETE", headers: authHeaders() });
  await ensureOk(res);
}

export async function listTemplates(): Promise<TemplateConfig[]> {
  const res = await fetch(`${API}/resumes/templates`, { headers: authHeaders() });
  await ensureOk(res);
  return res.json();
}

export async function createResumeFromBuilder(params: {
  filename: string;
  targetRole: string;
  jobDescription?: string;
  templateId?: ResumeTemplateId;
  data: ResumeData;
}): Promise<ResumeDetail> {
  const res = await fetch(`${API}/resumes/builder`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(params),
  });
  await ensureOk(res);
  return res.json();
}

export async function updateResumeFromBuilder(
  id: number,
  params: {
    data: ResumeData;
    targetRole?: string;
    jobDescription?: string;
  }
): Promise<{ id: number; targetRole: string; report: AtsReport }> {
  const res = await fetch(`${API}/resumes/${id}/builder`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(params),
  });
  await ensureOk(res);
  return res.json();
}

export async function aiEnhanceBullet(
  bullet: string,
  targetRole: string,
  context?: string
): Promise<{ enhanced: string; actionVerb: string; metricHighlight?: string; explanation: string }> {
  const res = await fetch(`${API}/resumes/ai/bullet`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ bullet, targetRole, context }),
  });
  await ensureOk(res);
  return res.json();
}

export async function aiGenerateSummary(
  targetRole: string,
  experience: ExperienceEntry[],
  skills: SkillGroup[]
): Promise<{ summary: string }> {
  const res = await fetch(`${API}/resumes/ai/summary`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ targetRole, experience, skills }),
  });
  await ensureOk(res);
  return res.json();
}

// A plain link cannot send the login token, so the file is fetched and saved from memory
export async function downloadResume(
  id: number,
  format: ResumeFormat,
  sourceName: string,
  templateId?: ResumeTemplateId
): Promise<void> {
  const query = templateId ? `format=${format}&template=${templateId}` : `format=${format}`;
  const res = await fetch(`${API}/resumes/${id}/download?${query}`, { headers: authHeaders() });
  await ensureOk(res);
  const blob = await res.blob();
  const base = sourceName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_") || "resume";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = templateId ? `${base}_${templateId}.${format}` : `${base}_ATS.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function renderResumeDirect(
  data: ResumeData,
  format: ResumeFormat,
  templateId: ResumeTemplateId
): Promise<void> {
  const res = await fetch(`${API}/resumes/render`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ data, format, templateId }),
  });
  await ensureOk(res);
  const blob = await res.blob();
  const base = (data.contact.name || "Resume").replace(/[^A-Za-z0-9_-]+/g, "_") || "Resume";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}_${templateId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
/* ---------- Job Matching Types ---------- */
export interface JobMatch {
  rank: number;
  score: number;
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
  profile: InferredProfile;
  warnings: string[];
}

export interface JobSearchParams {
  location?: string;
  remoteOnly?: boolean;
  limit?: number;
}

/* ---------- API Call ---------- */
export async function findJobs(
  resumeId: number,
  params: JobSearchParams = {}
): Promise<JobSearchResult> {
  const { API, authHeaders, ensureOk } = await import("./api");
  const res = await fetch(`${API}/resumes/${resumeId}/jobs`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(params),
  });
  await ensureOk(res);
  return res.json();
}
