import type { ExperienceEntry, ResumeData } from "./types.js";

/* ------------------------------------------------------------------ */
/* Generic phrases and words that make a resume sound templated        */
/* ------------------------------------------------------------------ */
const BUZZ: [string, RegExp][] = [
  ["results-driven", /\bresults?[- ]driven\b/i],
  ["team player", /\bteam player\b/i],
  ["hard-working", /\bhard[- ]?working\b/i],
  ["passionate", /\bpassionate\b/i],
  ["dynamic", /\bdynamic\b/i],
  ["synergy", /\bsynerg(y|ies|ize|ise)\b/i],
  ["go-getter", /\bgo[- ]getter\b/i],
  ["self-starter", /\bself[- ]starter\b/i],
  ["detail-oriented", /\bdetail[- ]oriented\b/i],
  ["think outside the box", /\bthink(ing)? outside the box\b/i],
  ["proven track record", /\bproven track record\b/i],
  ["highly motivated", /\b(self|highly)[- ]motivated\b/i],
  ["fast-paced environment", /\bfast[- ]paced\b/i],
  ["cutting-edge", /\bcutting[- ]edge\b/i],
  ["innovative", /\binnovative\b/i],
  ["best-in-class", /\bbest[- ]in[- ]class\b/i],
  ["spearheaded", /\bspearhead\w*/i],
  ["leveraged", /\bleverag(e|ed|es|ing)\b/i],
  ["utilized", /\butili[sz](e|ed|es|ing)\b/i],
  ["robust", /\brobust\b/i],
  ["seamless", /\bseamless\w*/i],
  ["delve", /\bdelv(e|es|ed|ing)\b/i],
  ["tapestry", /\btapestry\b/i],
  ["testament", /\bis a testament\b/i],
];

export function findBuzzwords(text: string): string[] {
  return BUZZ.filter(([, re]) => re.test(text)).map(([label]) => label);
}

/* ------------------------------------------------------------------ */
/* Profile helpers                                                     */
/* ------------------------------------------------------------------ */
// Rough years of experience from the earliest start year to the latest end year
export function estimateYears(exp: ExperienceEntry[]): number | null {
  const now = new Date().getFullYear();
  const years: number[] = [];
  for (const e of exp) {
    const s = e.start.match(/\d{4}/)?.[0];
    const en = /present/i.test(e.end) ? String(now) : e.end.match(/\d{4}/)?.[0];
    if (s) years.push(+s);
    if (en) years.push(+en);
  }
  if (years.length < 2) return null;
  return Math.max(0, Math.max(...years) - Math.min(...years));
}

// Every piece of text in the resume as one string. This is the "source of truth" for the fact guard.
export function flattenResume(d: ResumeData): string {
  return [
    d.contact.name, d.contact.email, d.contact.phone, d.contact.location, ...d.contact.links,
    d.summary,
    ...d.experience.flatMap((e) => [e.title, e.company, e.location, e.start, e.end, ...e.bullets]),
    ...d.education.flatMap((e) => [e.school, e.degree, e.field, e.start, e.end, ...e.details]),
    ...d.projects.flatMap((p) => [p.name, p.tech, ...p.bullets]),
    ...d.skills.flatMap((g) => [g.label, ...g.items]),
    ...d.certifications, ...d.achievements, ...d.other,
  ].join("\n");
}

export function profileLine(d: ResumeData): string {
  const years = estimateYears(d.experience);
  const level =
    d.experience.length === 0
      ? "fresher or student (no work experience listed)"
      : years === null
      ? `${d.experience.length} job(s)`
      : `about ${years} year(s) of experience across ${d.experience.length} job(s)`;
  const titles = d.experience.map((e) => e.title).filter(Boolean).slice(0, 3).join(", ");
  const skills = d.skills.flatMap((g) => g.items).slice(0, 12).join(", ");
  return `${level}${titles ? `; recent titles: ${titles}` : ""}${skills ? `; skills: ${skills}` : ""}`;
}

export function repeatedVerbs(bullets: string[]): string[] {
  const counts = new Map<string, number>();
  for (const b of bullets) {
    const w = (b.match(/[A-Za-z]+/)?.[0] ?? "").toLowerCase();
    if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return Array.from(counts.entries()).filter(([, n]) => n >= 3).map(([w]) => w);
}
