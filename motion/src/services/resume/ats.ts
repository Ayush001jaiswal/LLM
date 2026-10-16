import { extractContact, splitSections, stripBullet, words } from "./parse.js";
import { findMisspellings } from "./spell.js";
import { findBuzzwords } from "./style.js";
import type { AtsCheck, AtsReport, ResumeData } from "./types.js";

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */
const NUM_RE = /\d[\d,]*(?:\.\d+)?%?/g;
export const numbersIn = (s: string): string[] => (s.match(NUM_RE) ?? []).map((n) => n.replace(/,/g, ""));

const WEAK_PHRASES = ["responsible for", "duties included", "worked on", "helped with", "assisted with", "involved in"];
const WEAK_STARTS = ["responsible", "worked", "helped", "assisted", "duties", "tasked", "involved", "i"];
const DATE_OK = /^((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}|\d{4}|Present)$/;

const STOPWORDS = new Set(
  ("a an and are as at be by for from has have in is it its of on or that the their this to was were will with you your our we they them " +
    "who what when where which can must should may also etc per via into over under more most other such than then there these those " +
    "job role position company team work works working experience experienced years year strong skills skill ability able knowledge " +
    "required requirements preferred responsibilities responsibility candidate candidates looking including include includes using use used " +
    "good great excellent well plus new best across within about all any both each every one two three based related relevant good " +
    "opportunity join help helping support supporting ensure ensuring develop developing build building need needs needed want wants seeking seek " +
    "looking hire hiring apply applicant applicants responsible degree bachelor master equivalent minimum familiarity understanding proven demonstrated").split(" ")
);

const norm = (w: string): string => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

// Most frequent meaningful words in a job description (simple, no AI)
export function extractKeywords(jobDescription: string, max = 25): string[] {
  const counts = new Map<string, number>();
  const surface = new Map<string, string>(); // normalised form -> readable word
  const order: string[] = [];
  for (const w of words(jobDescription)) {
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    const k = norm(w);
    if (!counts.has(k)) {
      order.push(k);
      surface.set(k, w);
    }
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return order
    .sort((a, b) => (counts.get(b)! - counts.get(a)!) || order.indexOf(a) - order.indexOf(b))
    .slice(0, max)
    .map((k) => surface.get(k)!);
}

export function keywordsPresent(text: string, keywords: string[]) {
  const have = new Set(words(text).map(norm));
  const matched = keywords.filter((k) => have.has(norm(k)));
  return { matched, missing: keywords.filter((k) => !have.has(norm(k))) };
}

export function firstWord(bullet: string): string {
  return (stripBullet(bullet).match(/[A-Za-z]+/)?.[0] ?? "").toLowerCase();
}

/* ------------------------------------------------------------------ */
/* The checker                                                         */
/* ------------------------------------------------------------------ */
export interface AtsInput {
  data: ResumeData; // the resume that was turned into a file
  roundTripText: string; // text read back OUT of that file, the way a parser would see it
  originalText: string; // text of the file the user uploaded
  pages: number | null;
  keywords: string[];
  ignoreWords?: Set<string>; // names, companies and tools that the spell checker must not flag
  extraChecks?: AtsCheck[]; // for example the layout check on an uploaded DOCX
  isReview?: boolean; // true when scoring the uploaded resume (nothing has been rewritten yet)
}

export const TEMPLATE_GUARANTEES = [
  "Single column layout (no tables, text boxes or columns)",
  "No images, icons, charts or graphics",
  "Contact details are in the page body, not in a header or footer",
  "Standard fonts (Arial / Helvetica) and standard section headings",
  "Real selectable text, never an image of text",
  "Consistent bullet points and date format",
];

export function runAtsChecks(i: AtsInput): AtsReport {
  const checks: AtsCheck[] = [];
  const add = (id: string, label: string, weight: number, pass: boolean, detail: string) =>
    checks.push({ id, label, weight, pass, detail });

  const text = i.roundTripText;
  const sections = splitSections(text);
  const d = i.data;

  add("text", "Text can be extracted from the file", 10, text.length >= 300,
    text.length >= 300 ? "A parser can read the whole file." : "Very little text could be read from the file.");

  const expected: [string, boolean][] = [
    ["experience", d.experience.length > 0],
    ["education", d.education.length > 0],
    ["skills", d.skills.length > 0],
    ["projects", d.projects.length > 0],
    ["certifications", d.certifications.length > 0],
  ];
  const missingSections = expected
    .filter(([key, needed]) => needed && sections.parts[key as keyof typeof sections.parts].length === 0)
    .map(([key]) => key);
  add("sections", "Standard section headings are detected", 15, missingSections.length === 0,
    missingSections.length === 0 ? "All sections were recognised in the right order." : `Not detected: ${missingSections.join(", ")}.`);

  const contact = extractContact(sections.header);
  const missingContact = [!contact.email && "email", !contact.phone && "phone number"].filter(Boolean) as string[];
  add("contact", "Email and phone are found at the top", 10, missingContact.length === 0,
    missingContact.length === 0 ? "Email and phone were read from the header area." : `Missing: ${missingContact.join(", ")}.`);

  const nameOnTop = !!d.contact.name && (sections.header[0] ?? "").trim().toLowerCase() === d.contact.name.toLowerCase();
  add("name", "Name is the first line", 5, nameOnTop,
    nameOnTop ? "Your name is at the very top." : d.contact.name ? "Your name is not the first line of the file." : "No name was found.");

  const badDates = d.experience.filter((e) => !e.start || !e.end || !DATE_OK.test(e.start) || !DATE_OK.test(e.end));
  add("dates", "Every job has a start and end date in one format", 10, badDates.length === 0,
    badDates.length === 0
      ? d.experience.length ? "Dates use the same format (Mon YYYY) throughout." : "No jobs listed."
      : `Check dates for: ${badDates.map((e) => e.company || e.title).join(", ")}.`);

  const thin = d.experience.filter((e) => e.bullets.length < 2);
  add("bullets", "Each job has at least 2 bullet points", 10, thin.length === 0,
    thin.length === 0 ? "Every job has enough detail." : `Add detail to: ${thin.map((e) => e.company || e.title).join(", ")}.`);

  const allBullets = [...d.experience.flatMap((e) => e.bullets), ...d.projects.flatMap((p) => p.bullets)];
  const good = allBullets.filter((b) => {
    const n = b.split(/\s+/).length;
    return n >= 5 && n <= 30 && !WEAK_STARTS.includes(firstWord(b));
  });
  const goodPct = allBullets.length ? Math.round((good.length / allBullets.length) * 100) : 100;
  add("quality", "Bullets are concise and start with an action verb", 10, goodPct >= 90,
    `${goodPct}% of bullets are 5-30 words and avoid weak openings like "Responsible for".`);

  const words_ = words(text).length;
  const lengthOk = i.pages !== null ? i.pages <= 2 : words_ <= 1000;
  add("length", "Length is 2 pages or less", 5, lengthOk,
    i.pages !== null ? `${i.pages} page(s).` : `About ${words_} words.`);

  if (!i.isReview) {
    const original = new Set(numbersIn(i.originalText));
    const invented = Array.from(new Set(numbersIn(text))).filter((n) => !original.has(n));
    add("facts", "No new numbers were introduced", 15, invented.length === 0,
      invented.length === 0 ? "Every number in the new resume comes from your original or your instructions." : `New numbers not in your original: ${invented.join(", ")}.`);
  }

  const lower = text.toLowerCase();
  const weakFound = WEAK_PHRASES.filter((p) => lower.includes(p));
  add("weak", "No weak phrases", 5, weakFound.length === 0,
    weakFound.length === 0 ? "No filler phrases found." : `Found: ${weakFound.join(", ")}.`);

  const spelling = findMisspellings(text, i.ignoreWords ?? new Set());
  add("spelling", "No spelling mistakes detected", 5, spelling.length === 0,
    spelling.length === 0
      ? "The dictionary found no misspelled words."
      : `Check: ${spelling.slice(0, 6).map((m) => m.word).join(", ")}.`);

  const buzz = findBuzzwords(text);
  add("buzz", "No generic buzzwords or cliches", 5, buzz.length === 0,
    buzz.length === 0 ? "The wording is specific rather than generic." : `Replace: ${buzz.join(", ")}.`);

  checks.push(...(i.extraChecks ?? []));

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.filter((c) => c.pass).reduce((s, c) => s + c.weight, 0);

  const kw = i.keywords.length ? keywordsPresent(text, i.keywords) : null;
  const expBullets = d.experience.flatMap((e) => e.bullets);

  return {
    score: Math.round((earned / total) * 100),
    checks,
    keywordCoverage: kw ? Math.round((kw.matched.length / i.keywords.length) * 100) : null,
    matchedKeywords: kw?.matched ?? [],
    missingKeywords: kw?.missing ?? [],
    templateGuarantees: TEMPLATE_GUARANTEES,
    quantifiedBulletsPercent: expBullets.length
      ? Math.round((expBullets.filter((b) => /\d/.test(b)).length / expBullets.length) * 100)
      : 0,
    pages: i.pages,
  };
}
