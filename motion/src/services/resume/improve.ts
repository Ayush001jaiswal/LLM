import { generateJson } from "../ai.js";
import { numbersIn, firstWord, keywordsPresent } from "./ats.js";
import { asStr, asStrArr, stripBullet } from "./parse.js";
import { findBuzzwords, profileLine, repeatedVerbs } from "./style.js";
import type { ExperienceEntry, ProjectEntry, ResumeData } from "./types.js";

const strArray = { type: "array", items: { type: "string" } };
const REWRITE_SCHEMA = { type: "object", properties: { bullets: strArray }, required: ["bullets"] };
const SUMMARY_SCHEMA = { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] };
const SUGGEST_SCHEMA = { type: "object", properties: { suggestions: strArray }, required: ["suggestions"] };

/* ------------------------------------------------------------------ */
/* Fact guard: the AI may reword, but never add facts                  */
/* ------------------------------------------------------------------ */
export function unsupportedTerms(candidate: string, sourceLower: string): string[] {
  const tokens = candidate.match(/[A-Za-z][A-Za-z0-9+#.\-/]*/g) ?? [];
  const bad: string[] = [];
  tokens.forEach((raw, idx) => {
    const t = raw.replace(/[.\-/]+$/, "");
    if (t.length < 2) return;
    const technical = /[A-Z].*[A-Z]|[a-z][A-Z]|[0-9+#]|[a-z]\.[a-z]/.test(t);
    const capitalisedMidSentence = idx > 0 && /^[A-Z][a-z]/.test(t);
    if (!technical && !capitalisedMidSentence) return;
    const lower = t.toLowerCase();
    const probe = lower.length >= 6 ? lower.slice(0, 5) : lower;
    if (!sourceLower.includes(probe)) bad.push(t);
  });
  return Array.from(new Set(bad));
}

export function checkRewrite(
  rewritten: string[],
  original: string[],
  sourceText: string,
  opts: { allowBuzz?: boolean } = {}
): { ok: true } | { ok: false; reason: string } {
  if (rewritten.length === 0) return { ok: false, reason: "empty result" };
  if (rewritten.length > original.length || rewritten.length < Math.max(1, original.length - 2)) {
    return { ok: false, reason: "different number of bullets" };
  }
  const sourceNums = new Set(numbersIn(sourceText));
  const sourceLower = sourceText.toLowerCase();
  for (const b of rewritten) {
    if (b.split(/\s+/).length > 35) return { ok: false, reason: "bullet too long" };
    const newNums = numbersIn(b).filter((n) => !sourceNums.has(n));
    if (newNums.length) return { ok: false, reason: `new number ${newNums[0]}` };
    const terms = unsupportedTerms(b, sourceLower);
    if (terms.length) return { ok: false, reason: `new term "${terms[0]}"` };
    if (!opts.allowBuzz) {
      const buzz = findBuzzwords(b);
      if (buzz.length) return { ok: false, reason: `generic phrase "${buzz[0]}"` };
    }
  }
  return { ok: true };
}

// Safe, code-only cleanup used when every AI attempt is rejected
export function cleanBullet(b: string): string {
  const s = stripBullet(b).replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/* ------------------------------------------------------------------ */
/* Rewriting                                                           */
/* ------------------------------------------------------------------ */
export interface ImproveContext {
  role: string;
  guidelines: string;
  keywords: string[];
  instructions: string; // what the candidate asked for; may contain true facts they want added
  sourceText: string; // the original resume text plus the candidate's instructions (facts allowed)
}

const STYLE_RULES =
  "Write in plain, specific, natural language, the way a careful professional would write their own resume. " +
  "Never use clichés or buzzwords such as 'results-driven', 'passionate', 'dynamic', 'spearheaded', 'leveraged', 'utilized', 'robust' or 'seamless'. " +
  "Vary the opening verbs: do not start more than two bullets in the same job with the same word. " +
  "Spelling, grammar and punctuation must be correct.";

const REWRITE_EXAMPLES =
  "\n\nFEW-SHOT EXAMPLES:\n" +
  "Example 1:\n" +
  "Input bullets:\n" +
  "1. Responsible for working on the payment gateway APIs using Node.js and Express.\n" +
  "2. Helped improve the database queries in PostgreSQL.\n" +
  "Output: {\"bullets\": [\"Architected and maintained payment gateway REST APIs using Node.js and Express, ensuring secure transaction processing.\", \"Optimized complex PostgreSQL queries and indexing strategies to significantly reduce API response latency.\"]}\n\n" +
  "Example 2:\n" +
  "Input bullets:\n" +
  "1. Worked on user interface of our e-commerce web app using React.\n" +
  "2. Made sure the website was responsive on mobile phones.\n" +
  "Output: {\"bullets\": [\"Engineered customer-facing e-commerce web interfaces using React and modern CSS, delivering seamless browsing experiences.\", \"Refactored layouts with responsive mobile-first design principles, ensuring cross-browser and multi-device compatibility.\"]}";

const REWRITE_RULES =
  "You improve resume bullet points.\n" +
  "1. Use ONLY facts that are in the original bullets or in the candidate's instructions. NEVER add numbers, percentages, tools, technologies, employers, team sizes or results that are not there.\n" +
  "2. Start every bullet with a strong action verb. Use past tense, or present tense if the job is current.\n" +
  "3. One line per bullet, 8 to 25 words. Remove filler such as 'responsible for' and 'worked on'.\n" +
  "4. Keep the same meaning and the same number of bullets. If a bullet is already strong, only fix its grammar.\n" +
  `5. ${STYLE_RULES}\n` +
  REWRITE_EXAMPLES +
  '\n\nReturn JSON only: {"bullets": ["..."]}';

const GRAMMAR_RULES =
  "You are a proofreader. Fix ONLY spelling, grammar, punctuation and capitalisation in each bullet. " +
  "Do not change the meaning, the facts, the order or the number of bullets, and do not add or remove any information. " +
  "Keep the wording as close to the original as possible.\n" +
  'Return JSON only: {"bullets": ["..."]}';

async function attempt(
  system: string,
  user: string,
  cleaned: string[],
  ctx: ImproveContext,
  allowBuzz: boolean
): Promise<{ bullets: string[] } | { reason: string }> {
  try {
    const out = await generateJson<{ bullets?: unknown }>(system, user, REWRITE_SCHEMA, { numCtx: 4096, numPredict: 500 });
    const rewritten = asStrArr(out.bullets).map(cleanBullet).filter(Boolean);
    const verdict = checkRewrite(rewritten, cleaned, ctx.sourceText, { allowBuzz });
    return verdict.ok ? { bullets: rewritten } : { reason: verdict.reason };
  } catch (err) {
    return { reason: (err as Error).message };
  }
}

async function rewriteBullets(
  heading: string,
  current: boolean,
  bullets: string[],
  ctx: ImproveContext
): Promise<{ bullets: string[]; note: string | null }> {
  const cleaned = bullets.map(cleanBullet).filter(Boolean);
  if (cleaned.length === 0) return { bullets: [], note: null };

  const list = cleaned.map((b, i) => `${i + 1}. ${b}`).join("\n");

  // Attempt 1: improve the wording
  const system = REWRITE_RULES + (ctx.guidelines ? `\n\nResume guidelines (follow the style, never copy facts from them):\n${ctx.guidelines}` : "");
  const user =
    `Target role: ${ctx.role}\nEntry: ${heading}${current ? " (current job)" : ""}\n` +
    (ctx.keywords.length
      ? `Job description keywords (use one ONLY if the original bullet already says the same thing): ${ctx.keywords.slice(0, 12).join(", ")}\n`
      : "") +
    (ctx.instructions ? `Candidate's instructions (may include true facts): ${ctx.instructions}\n` : "") +
    `\nOriginal bullets:\n${list}`;
  const first = await attempt(system, user, cleaned, ctx, false);
  if ("bullets" in first) return { bullets: first.bullets, note: null };

  // Attempt 2: grammar and spelling only, so the wording stays the candidate's own
  const second = await attempt(GRAMMAR_RULES, `Bullets:\n${list}`, cleaned, ctx, true);
  if ("bullets" in second) {
    return { bullets: second.bullets, note: `${heading}: kept your wording and fixed grammar only (the full rewrite was rejected: ${first.reason}).` };
  }

  // Attempt 3: code-only cleanup
  return { bullets: cleaned, note: `${heading}: kept your original wording (AI rewrite rejected: ${first.reason}).` };
}

/* ------------------------------------------------------------------ */
/* Whole resume                                                        */
/* ------------------------------------------------------------------ */
export interface ImproveResult {
  improved: ResumeData;
  fallbacks: string[];
  warnings: string[];
}

export async function improveResume(
  original: ResumeData,
  ctx: ImproveContext,
  onStep?: (msg: string) => void
): Promise<ImproveResult> {
  const improved: ResumeData = JSON.parse(JSON.stringify(original));
  const fallbacks: string[] = [];
  const warnings: string[] = [];

  const jobs: { entry: ExperienceEntry | ProjectEntry; label: string; current: boolean }[] = [
    ...improved.experience.map((e) => ({
      entry: e,
      label: `${e.title} at ${e.company}`.trim(),
      current: /present/i.test(e.end),
    })),
    ...improved.projects.map((p) => ({ entry: p, label: `Project: ${p.name}`, current: false })),
  ];

  for (let i = 0; i < jobs.length; i++) {
    const { entry, label, current } = jobs[i];
    onStep?.(`Improving ${i + 1} of ${jobs.length}: ${label || "entry"}...`);
    const r = await rewriteBullets(label, current, entry.bullets, ctx);
    entry.bullets = r.bullets;
    if (r.note) fallbacks.push(r.note);
  }

  onStep?.("Writing the summary...");
  const hadSummary = original.summary.length > 0;
  if (improved.experience.length || improved.education.length) {
    const facts = {
      profile: profileLine(improved),
      education: improved.education.map((e) => [e.degree, e.field].filter(Boolean).join(" ")).filter(Boolean).slice(0, 2),
    };
    try {
      const out = await generateJson<{ summary?: unknown }>(
        "You write resume summaries. Use ONLY the facts given. Do NOT mention numbers, employers, tools or achievements that are not listed. " +
          "Write 2 sentences, at most 45 words, no first-person pronouns. " + STYLE_RULES +
          ' Return JSON only: {"summary": "..."}',
        `Target role: ${ctx.role}\n` +
          (ctx.instructions ? `Candidate's instructions: ${ctx.instructions}\n` : "") +
          (hadSummary ? `Current summary to improve: ${original.summary}\n` : "") +
          `Facts: ${JSON.stringify(facts)}`,
        SUMMARY_SCHEMA,
        { numCtx: 3072, numPredict: 150 }
      );
      const s = asStr(out.summary);
      const known = new Set(numbersIn(ctx.sourceText));
      const newNums = numbersIn(s).filter((n) => !known.has(n));
      const terms = s ? unsupportedTerms(s, ctx.sourceText.toLowerCase()) : [];
      const buzz = findBuzzwords(s);
      if (s && !newNums.length && !terms.length && !buzz.length && s.split(/\s+/).length <= 60) {
        improved.summary = s;
        if (!hadSummary) warnings.push("A summary was written from the details in your resume. Please read it and edit it if needed.");
      } else if (s) {
        fallbacks.push("Summary: the AI draft added details or generic phrases, so it was not used.");
      }
    } catch {
      fallbacks.push("Summary: could not be generated this time, so your original was kept.");
    }
  }

  return { improved, fallbacks, warnings };
}

/* ------------------------------------------------------------------ */
/* Advice (nothing is changed)                                         */
/* ------------------------------------------------------------------ */
export async function adviseResume(
  original: ResumeData,
  role: string,
  guidelines: string,
  keywords: string[],
  missingKeywords: string[]
): Promise<string[]> {
  try {
    const compact =
      original.experience
        .slice(0, 4)
        .map((e) => `${e.title} at ${e.company}: ${e.bullets.slice(0, 2).join(" / ")}`)
        .join("\n") || "(no work experience listed)";
    const out = await generateJson<{ suggestions?: unknown }>(
      "You are a senior recruiter reviewing a resume for the target role. Give 5 short, specific, practical suggestions to make it stronger for that role and for this candidate's level. " +
        "Base them on the candidate profile, the target role" + (keywords.length ? " and the job description keywords" : "") + ". " +
        "Give advice only. Never claim the candidate has skills or results that are not shown. One sentence each." +
        (guidelines ? `\n\nGuidelines:\n${guidelines}` : "") +
        '\nReturn JSON only: {"suggestions": ["..."]}',
      `Target role: ${role}\nCandidate profile: ${profileLine(original)}\n` +
        (missingKeywords.length ? `Job description keywords missing from the resume: ${missingKeywords.slice(0, 10).join(", ")}\n` : "") +
        `\nResume:\n${compact}`,
      SUGGEST_SCHEMA,
      { numCtx: 4096, numPredict: 450 }
    );
    return asStrArr(out.suggestions).slice(0, 5);
  } catch {
    return [];
  }
}

export function ruleBasedSuggestions(original: ResumeData, keywords: string[], resumeText: string): string[] {
  const out: string[] = [];
  const bullets = original.experience.flatMap((e) => e.bullets);

  const withNumbers = bullets.filter((b) => /\d/.test(b)).length;
  if (bullets.length && withNumbers / bullets.length < 0.3) {
    out.push(
      `Only ${withNumbers} of ${bullets.length} experience bullets contain a number. Where you truly have them, add results such as percentages, time saved, users, revenue, scale or team size. You can type these facts in the instructions box.`
    );
  }
  const weak = bullets.filter((b) => ["responsible", "worked", "helped", "assisted", "duties"].includes(firstWord(b)));
  if (weak.length) out.push(`${weak.length} bullet(s) start with weak phrases like "Responsible for" or "Worked on". Start with what you did, for example "Built", "Led" or "Reduced".`);

  const repeated = repeatedVerbs(bullets);
  if (repeated.length) out.push(`Too many bullets start with the same word (${repeated.join(", ")}). Vary your opening verbs.`);

  original.experience.filter((e) => e.bullets.length < 3).forEach((e) =>
    out.push(`Add more detail to "${e.title}${e.company ? " at " + e.company : ""}" (3 to 5 bullets is typical).`)
  );
  if (!original.skills.length) out.push("Add a Skills section listing the tools and technologies you use.");
  if (!original.contact.links.some((l) => /linkedin/i.test(l))) out.push("Add your LinkedIn profile URL to the header.");
  if (!original.experience.length && !original.projects.length) out.push("Add projects or internships to show practical work.");

  if (keywords.length) {
    const { missing } = keywordsPresent(resumeText, keywords);
    if (missing.length) {
      out.push(`Keywords from the job description that your resume does not mention: ${missing.slice(0, 12).join(", ")}. Add them only where they truly describe your experience.`);
    }
  }
  return out;
}
