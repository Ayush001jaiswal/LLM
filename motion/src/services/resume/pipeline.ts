import { retrieveGuidelines } from "../knowledge.js";
import { extractKeywords, keywordsPresent, runAtsChecks } from "./ats.js";
import { buildDocx, buildPdf } from "./build.js";
import { countPdfPages, extractResumeText } from "./extractText.js";
import { adviseResume, improveResume, ruleBasedSuggestions } from "./improve.js";
import { auditDocxLayout } from "./layout.js";
import { parseResume } from "./parse.js";
import { buildIgnoreSet, findMisspellings } from "./spell.js";
import { findBuzzwords, flattenResume } from "./style.js";
import type { AnalysisResult, AtsCheck, Progress, ResumeData, ResumeFormat, ReviewResult } from "./types.js";

export async function renderResume(
  data: ResumeData,
  format: ResumeFormat
): Promise<{ buffer: Buffer; droppedCharacters: number }> {
  if (format === "docx") return { buffer: await buildDocx(data), droppedCharacters: 0 };
  return buildPdf(data);
}

// Looks up the resume handbook (RAG). Never throws: the app still works without it.
async function lookUpGuidelines(role: string, extraQuery: string): Promise<{ text: string; warning: string }> {
  try {
    const text = await retrieveGuidelines(
      [
        `${role} resume keywords and skills recruiters look for`,
        "how to write strong resume bullet points with action verbs",
        "ATS friendly resume formatting rules",
        extraQuery,
      ],
      2,
      3200
    );
    return text ? { text, warning: "" } : { text: "", warning: "The resume knowledge base is empty, so generic rules were used. Run the ingest script." };
  } catch {
    return { text: "", warning: "Could not search the resume knowledge base, so generic rules were used." };
  }
}

/* ------------------------------------------------------------------ */
/* Phase 1: REVIEW. Read the resume and give advice. Nothing is rewritten. */
/* ------------------------------------------------------------------ */
export interface ReviewInput {
  buffer: Buffer;
  format: ResumeFormat;
  targetRole: string;
  jobDescription?: string;
}

export async function reviewResume(input: ReviewInput, progress?: Progress): Promise<ReviewResult> {
  progress?.("extracting", "Reading your file...");
  const text = await extractResumeText(input.buffer, input.format);

  const layout = input.format === "docx" ? await auditDocxLayout(input.buffer) : [];
  const pages = input.format === "pdf" ? await countPdfPages(input.buffer).catch(() => null) : null;

  const parsed = await parseResume(text, (m) => progress?.("extracting", m));
  const original = parsed.data;
  const keywords = input.jobDescription ? extractKeywords(input.jobDescription) : [];

  progress?.("improving", `Looking up guidelines for ${input.targetRole}...`);
  const kb = await lookUpGuidelines(input.targetRole, "what large technology companies look for in a resume");

  const kw = keywords.length ? keywordsPresent(text, keywords) : { matched: [], missing: [] };

  progress?.("improving", "Preparing advice for your role and profile...");
  const modelAdvice = await adviseResume(original, input.targetRole, kb.text, keywords, kw.missing);

  progress?.("checking", "Checking your resume against ATS rules...");
  const ignore = buildIgnoreSet(original, [input.targetRole, input.jobDescription ?? ""]);

  const extraChecks: AtsCheck[] =
    input.format === "docx"
      ? [{
          id: "layout",
          label: "No tables, text boxes, images, columns or header text",
          weight: 15,
          pass: layout.length === 0,
          detail: layout.length === 0 ? "No layout problems found in the uploaded file." : `${layout.length} layout problem(s) found.`,
        }]
      : [];

  const report = runAtsChecks({
    data: original,
    roundTripText: text,
    originalText: text,
    pages,
    keywords,
    ignoreWords: ignore,
    extraChecks,
    isReview: true,
  });

  const spelling = findMisspellings(text, ignore);
  const buzzwords = findBuzzwords(text);

  const suggestions = [...modelAdvice, ...ruleBasedSuggestions(original, keywords, text)];
  if (spelling.length) {
    suggestions.push(`Possible spelling mistakes: ${spelling.slice(0, 8).map((s) => (s.suggestion ? `${s.word} (${s.suggestion}?)` : s.word)).join(", ")}.`);
  }
  if (buzzwords.length) {
    suggestions.push(`Generic phrases found: ${buzzwords.join(", ")}. Replace them with specific facts about what you did.`);
  }

  const warnings = [...parsed.warnings];
  if (kb.warning) warnings.push(kb.warning);
  if (input.format === "pdf") {
    warnings.push("Layout problems (tables, columns, images) cannot be detected inside PDFs. The improved version is rebuilt from a clean template, so this does not affect it.");
  }

  return {
    original,
    report,
    layout,
    layoutInspected: input.format === "docx",
    warnings,
    removed: parsed.removed,
    suggestions,
    spelling,
    buzzwords,
  };
}

/* ------------------------------------------------------------------ */
/* Phase 2: IMPROVE. Only runs when the user asks for it.              */
/* ------------------------------------------------------------------ */
export interface ImproveInput {
  original: ResumeData;
  format: ResumeFormat;
  targetRole: string;
  jobDescription?: string;
  instructions?: string;
}

export async function improveFromReview(input: ImproveInput, progress?: Progress): Promise<AnalysisResult> {
  const instructions = (input.instructions ?? "").trim();
  const keywords = input.jobDescription ? extractKeywords(input.jobDescription) : [];

  // The candidate's own instructions count as facts they are allowed to add
  const originalText = flattenResume(input.original);
  const sourceText = instructions ? `${originalText}\n${instructions}` : originalText;

  progress?.("improving", `Looking up guidelines for ${input.targetRole}...`);
  const kb = await lookUpGuidelines(input.targetRole, "what large technology companies look for in a resume");

  const result = await improveResume(
    input.original,
    { role: input.targetRole, guidelines: kb.text, keywords, instructions, sourceText },
    (m) => progress?.("improving", m)
  );

  progress?.("checking", "Checking ATS readiness...");
  const { buffer, droppedCharacters } = await renderResume(result.improved, input.format);
  const roundTripText = await extractResumeText(buffer, input.format);
  const pages = input.format === "pdf" ? await countPdfPages(buffer) : null;

  const ignore = buildIgnoreSet(result.improved, [input.targetRole, input.jobDescription ?? "", instructions]);
  const report = runAtsChecks({
    data: result.improved,
    roundTripText,
    originalText: sourceText,
    pages,
    keywords,
    ignoreWords: ignore,
  });

  const warnings = [...result.warnings];
  if (kb.warning) warnings.push(kb.warning);
  if (droppedCharacters > 0) {
    warnings.push(`${droppedCharacters} character(s) are not supported by the standard PDF fonts and were left out. The DOCX version keeps all characters.`);
  }

  return {
    original: input.original,
    improved: result.improved,
    report,
    notes: {
      warnings,
      removed: [],
      suggestions: ruleBasedSuggestions(result.improved, keywords, roundTripText),
      fallbacks: result.fallbacks,
    },
  };
}
