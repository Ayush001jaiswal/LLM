import { generateJson } from "../ai.js";
import type {
  Contact,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
  ResumeData,
  SkillGroup,
} from "./types.js";

/* ------------------------------------------------------------------ */
/* Small text helpers (also used by other resume files)                */
/* ------------------------------------------------------------------ */
export const asStr = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
export const asStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(asStr).filter(Boolean) : [];

const BULLET_GLYPHS = /^[\s•●▪■◦○·‣⁃➢➤➔►▶✓✔*\-–—]+\s*/;
export const stripBullet = (line: string): string => line.replace(BULLET_GLYPHS, "").trim();

export function words(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9][a-z0-9+#.\-]*/g) ?? []).map((w) => w.replace(/[.\-]+$/, "")).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */
export type SectionKey =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "achievements"
  | "ignore"
  | "other";

const ALIASES: Record<SectionKey, string[]> = {
  summary: ["summary", "professional summary", "career summary", "profile", "professional profile", "objective", "career objective", "about me", "about", "executive summary"],
  experience: ["experience", "work experience", "professional experience", "employment", "employment history", "work history", "career history", "internships", "internship experience", "relevant experience"],
  education: ["education", "academic background", "academics", "academic qualifications", "qualifications", "educational qualifications", "education and training"],
  skills: ["skills", "technical skills", "key skills", "core competencies", "core skills", "skills and tools", "technical proficiency", "technologies", "tools and technologies", "areas of expertise"],
  projects: ["projects", "academic projects", "personal projects", "key projects", "selected projects", "project experience"],
  certifications: ["certifications", "certificates", "licenses and certifications", "certifications and courses", "courses", "training"],
  achievements: ["achievements", "awards", "honors", "honours", "awards and achievements", "accomplishments", "honors and awards"],
  other: ["volunteering", "volunteer experience", "volunteer work", "publications", "languages", "language skills", "leadership", "leadership experience", "activities", "extracurricular activities", "co curricular activities", "patents", "research", "research experience", "community service", "positions of responsibility", "additional information"],
  ignore: ["declaration", "personal details", "personal information", "personal profile", "references", "hobbies", "interests", "hobbies and interests", "extra curricular activities"],
};

const IGNORE_LABEL = "Declaration / personal details / references / hobbies";

function headingKey(line: string): SectionKey | null {
  const clean = line.toLowerCase().replace(/[^a-z& ]/g, " ").replace(/&/g, "and").replace(/\s+/g, " ").trim();
  if (!clean || clean.split(" ").length > 5) return null;
  for (const [key, list] of Object.entries(ALIASES)) {
    if (list.includes(clean)) return key as SectionKey;
  }
  return null;
}

export interface Sections {
  header: string[];
  parts: Record<Exclude<SectionKey, "other">, string[]>;
  other: string[];
  ignoredPresent: boolean;
}

export function splitSections(text: string): Sections {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: Sections = {
    header: [],
    parts: { summary: [], experience: [], education: [], skills: [], projects: [], certifications: [], achievements: [], ignore: [] },
    other: [],
    ignoredPresent: false,
  };

  let current: SectionKey | null = null;
  for (const line of lines) {
    const key = headingKey(line);
    if (key) {
      current = key;
      if (key === "ignore") out.ignoredPresent = true;
      if (key === "other") out.other.push(line); // keep the heading text for context
      continue;
    }
    if (current === null) out.header.push(line);
    else if (current === "other") out.other.push(stripBullet(line));
    else out.parts[current].push(line);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Contact                                                             */
/* ------------------------------------------------------------------ */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{8,}\d)/;
const LINK_RE = /((?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|medium\.com)\/[^\s,;|]+|https?:\/\/[^\s,;|]+)/gi;

function titleCaseIfShouting(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function extractContact(header: string[]): Contact {
  const joined = header.join("\n");
  const email = joined.match(EMAIL_RE)?.[0] ?? "";
  const links = Array.from(new Set((joined.match(LINK_RE) ?? []).map((l) => l.replace(/[).]+$/, ""))));

  // Headers often put everything on one line: "email | phone | city | linkedin"
  const parts = header.flatMap((l) => l.split(/\s*[|•·●]\s*/)).map((p) => p.trim()).filter(Boolean);

  const isEmail = (p: string) => EMAIL_RE.test(p);
  const isLink = (p: string) => /https?:\/\/|linkedin\.|github\.|gitlab\.|behance\.|medium\.com|www\./i.test(p);
  const phoneDigits = (p: string) => (p.match(PHONE_RE)?.[0] ?? "").replace(/\D/g, "");
  const isPhone = (p: string) => phoneDigits(p).length >= 10 && phoneDigits(p).length <= 15;

  const phone = parts.find(isPhone)?.match(PHONE_RE)?.[0].trim() ?? "";

  const rest = parts.filter((p) => !isEmail(p) && !isLink(p) && !isPhone(p));
  const name = titleCaseIfShouting(
    rest.find((p) => !/resume|curriculum vitae|^cv$/i.test(p) && !/\d/.test(p) && p.split(" ").length <= 5) ?? ""
  );

  // Location: a short part with a comma and no digits, that is not the name
  const location = rest.find((p) => p !== name && /,/.test(p) && !/\d/.test(p) && p.split(" ").length <= 6) ?? "";

  return { name, email, phone, location: titleCaseIfShouting(location), links };
}

/* ------------------------------------------------------------------ */
/* Skills, simple lists, dates                                         */
/* ------------------------------------------------------------------ */
export function parseSkills(lines: string[]): SkillGroup[] {
  const groups: SkillGroup[] = [];
  for (const raw of lines) {
    const line = stripBullet(raw);
    if (!line) continue;
    const colon = line.indexOf(":");
    const hasLabel = colon > 0 && colon < 40;
    const label = hasLabel ? line.slice(0, colon).trim() : "";
    const rest = hasLabel ? line.slice(colon + 1) : line;
    const items = rest
      .split(/[,;|•·]/)
      .map((s) => s.trim())
      .filter((s) => s && s.length <= 40);
    if (items.length) groups.push({ label, items });
  }

  // Merge all unlabeled lines into one group, and remove duplicates
  const unlabeled = groups.filter((g) => !g.label).flatMap((g) => g.items);
  const labeled = groups.filter((g) => g.label);
  const dedupe = (a: string[]) => a.filter((x, i) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  const result = labeled.map((g) => ({ label: g.label, items: dedupe(g.items) }));
  if (unlabeled.length) result.push({ label: "Skills", items: dedupe(unlabeled) });
  return result;
}

export function parseSimpleList(lines: string[]): string[] {
  return lines.map(stripBullet).filter((l) => l.length > 1);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Makes dates consistent: "Mon YYYY", "YYYY" or "Present". Unknown formats are left alone.
export function formatDate(input: string): string {
  const s = input.trim();
  if (!s) return "";
  if (/^(present|current|currently|till date|to date|ongoing|now|date|today)$/i.test(s)) return "Present";

  let m = s.match(/^([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m) {
    const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (idx >= 0) return `${MON_LABEL[idx]} ${m[2]}`;
  }
  m = s.match(/^(\d{1,2})[\/.\-](\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${MON_LABEL[+m[1] - 1]} ${m[2]}`;
  m = s.match(/^(\d{4})$/);
  if (m) return m[1];
  return s;
}

/* ------------------------------------------------------------------ */
/* Model-based parsing of the three complex sections                   */
/* ------------------------------------------------------------------ */
const strArray = { type: "array", items: { type: "string" } };

const EXPERIENCE_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          location: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          bullets: strArray,
        },
        required: ["title", "company", "location", "start", "end", "bullets"],
      },
    },
  },
  required: ["entries"],
};

const EDUCATION_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          school: { type: "string" },
          degree: { type: "string" },
          field: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          details: strArray,
        },
        required: ["school", "degree", "field", "start", "end", "details"],
      },
    },
  },
  required: ["entries"],
};

const PROJECTS_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, tech: { type: "string" }, bullets: strArray },
        required: ["name", "tech", "bullets"],
      },
    },
  },
  required: ["entries"],
};

const EXTRACT_RULES =
  "You are a resume parser. Copy information EXACTLY as written in the text. " +
  "Never rewrite, summarize, translate or add anything. Use an empty string when a value is missing. " +
  "Put each bullet point or sentence of description into 'bullets' (or 'details'), one item per line, word for word. " +
  "Keep dates as written (for example 'Jan 2020', '03/2021', 'Present'). Output JSON only.";

// How much of a source line's words appear in the parsed value (guards against invented text)
function overlap(candidate: string, sourceWords: Set<string>): number {
  const w = words(candidate);
  if (!w.length) return 1;
  return w.filter((x) => sourceWords.has(x)).length / w.length;
}

export interface ParseNotes {
  warnings: string[];
}

function keepGrounded(items: string[], sourceWords: Set<string>, notes: ParseNotes, what: string): string[] {
  const kept = items.filter((b) => overlap(b, sourceWords) >= 0.8);
  if (kept.length < items.length) {
    notes.warnings.push(`${items.length - kept.length} ${what} line(s) did not match your original text and were dropped.`);
  }
  return kept;
}

function coverage(source: string, parsed: string): number {
  const src = Array.from(new Set(words(source).filter((w) => w.length >= 4)));
  if (!src.length) return 1;
  const got = new Set(words(parsed));
  return src.filter((w) => got.has(w)).length / src.length;
}

async function parseExperience(lines: string[], notes: ParseNotes): Promise<ExperienceEntry[]> {
  if (!lines.length) return [];
  const source = lines.join("\n");
  const data = await generateJson<{ entries?: Record<string, unknown>[] }>(
    EXTRACT_RULES,
    `Extract every job from this EXPERIENCE section. One entry per job, newest first as listed.\n\n${source}`,
    EXPERIENCE_SCHEMA,
    { numCtx: 6144, numPredict: 1800 }
  );
  const sw = new Set(words(source));
  const entries = (data.entries ?? []).map((e) => ({
    title: asStr(e.title),
    company: asStr(e.company),
    location: asStr(e.location),
    start: formatDate(asStr(e.start)),
    end: formatDate(asStr(e.end)),
    bullets: keepGrounded(asStrArr(e.bullets).map(stripBullet), sw, notes, "experience"),
  }));
  const result = entries.filter((e) => e.title || e.company);

  const parsedText = result.map((e) => [e.title, e.company, e.location, e.start, e.end, ...e.bullets].join(" ")).join(" ");
  if (coverage(source, parsedText) < 0.8) {
    notes.warnings.push("Some text in your Experience section may not have been read. Compare the original and improved versions carefully.");
  }
  return result;
}

async function parseEducation(lines: string[], notes: ParseNotes): Promise<EducationEntry[]> {
  if (!lines.length) return [];
  const source = lines.join("\n");
  const data = await generateJson<{ entries?: Record<string, unknown>[] }>(
    EXTRACT_RULES,
    `Extract every education entry (degree, school) from this EDUCATION section. Put grades, CGPA, percentages and honours in 'details'.\n\n${source}`,
    EDUCATION_SCHEMA,
    { numCtx: 4096, numPredict: 900 }
  );
  const sw = new Set(words(source));
  const entries = (data.entries ?? []).map((e) => ({
    school: asStr(e.school),
    degree: asStr(e.degree),
    field: asStr(e.field),
    start: formatDate(asStr(e.start)),
    end: formatDate(asStr(e.end)),
    details: keepGrounded(asStrArr(e.details).map(stripBullet), sw, notes, "education"),
  }));
  return entries.filter((e) => e.school || e.degree);
}

async function parseProjects(lines: string[], notes: ParseNotes): Promise<ProjectEntry[]> {
  if (!lines.length) return [];
  const source = lines.join("\n");
  const data = await generateJson<{ entries?: Record<string, unknown>[] }>(
    EXTRACT_RULES,
    `Extract every project from this PROJECTS section. Put the technologies used in 'tech' only if the text lists them.\n\n${source}`,
    PROJECTS_SCHEMA,
    { numCtx: 4096, numPredict: 1200 }
  );
  const sw = new Set(words(source));
  const entries = (data.entries ?? []).map((e) => ({
    name: asStr(e.name),
    tech: asStr(e.tech),
    bullets: keepGrounded(asStrArr(e.bullets).map(stripBullet), sw, notes, "project"),
  }));
  return entries.filter((e) => e.name);
}

export interface ParseResult {
  data: ResumeData;
  removed: string[];
  warnings: string[];
}

export async function parseResume(text: string, onStep?: (msg: string) => void): Promise<ParseResult> {
  const sections = splitSections(text);
  const notes: ParseNotes = { warnings: [] };
  const removed: string[] = [];

  if (!sections.parts.experience.length && !sections.parts.education.length) {
    throw new Error(
      "Could not find Experience or Education sections. Resumes with two columns, tables or unusual headings " +
        "are hard to read. Try a single-column version with standard headings."
    );
  }

  const contact = extractContact(sections.header);
  if (!contact.name) notes.warnings.push("Could not detect your name at the top of the resume.");
  if (!contact.email) notes.warnings.push("No email address found in the header.");
  if (!contact.phone) notes.warnings.push("No phone number found in the header.");

  onStep?.("Reading your work experience...");
  const experience = await parseExperience(sections.parts.experience, notes);
  onStep?.("Reading education and projects...");
  const education = await parseEducation(sections.parts.education, notes);
  const projects = await parseProjects(sections.parts.projects, notes);

  if (sections.ignoredPresent) removed.push(IGNORE_LABEL);
  if (sections.other.length) {
    notes.warnings.push("Sections such as Volunteering or Languages are kept under 'Additional Information' exactly as you wrote them (they are not rewritten).");
  }

  const data: ResumeData = {
    contact,
    summary: sections.parts.summary.map(stripBullet).join(" ").replace(/\s+/g, " ").trim(),
    experience,
    education,
    projects,
    skills: parseSkills(sections.parts.skills),
    certifications: parseSimpleList(sections.parts.certifications),
    achievements: parseSimpleList(sections.parts.achievements),
    other: sections.other.filter(Boolean),
  };
  return { data, removed, warnings: notes.warnings };
}
