// Test the resume pipeline from the command line, without the web app.
//
// Step 1, REVIEW (advice only, nothing is rewritten):
//   npx tsx src/scripts/try-resume.ts resume.docx "Backend Developer" [job-description.txt]
// Step 2, IMPROVE (add --improve, and optionally what you want changed or true facts to add):
//   npx tsx src/scripts/try-resume.ts resume.docx "Backend Developer" jd.txt --improve "Add that I cut API latency from 800ms to 300ms. Keep it to one page."
//
// Improved files are written to ./out/
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../db/prisma.js";
import { detectFormat } from "../services/resume/extractText.js";
import { improveFromReview, renderResume, reviewResume } from "../services/resume/pipeline.js";

const args = process.argv.slice(2);
const improveAt = args.indexOf("--improve");
const instructions = improveAt >= 0 ? args[improveAt + 1] ?? "" : "";
const positional = (improveAt >= 0 ? args.slice(0, improveAt) : args).filter(Boolean);
const [file, role, jdFile] = positional;

if (!file || !role) {
  console.log('Usage: npx tsx src/scripts/try-resume.ts <resume.pdf|docx> "<target role>" [job-description.txt] [--improve "instructions"]');
  process.exit(1);
}
const format = detectFormat(file);
if (!format) throw new Error("File must be .pdf or .docx");
const jobDescription = jdFile ? readFileSync(jdFile, "utf-8") : undefined;

const started = Date.now();
const log = (_s: string, m: string) => console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${m}`);

const review = await reviewResume({ buffer: readFileSync(file), format, targetRole: role, jobDescription }, log);

console.log(`\n=== REVIEW of your uploaded resume: ${review.report.score}/100 ===`);
for (const c of review.report.checks) console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.label}: ${c.detail}`);
if (review.layout.length) console.log("Layout problems:", review.layout);
if (review.report.keywordCoverage !== null) console.log(`Keyword coverage: ${review.report.keywordCoverage}% (missing: ${review.report.missingKeywords.join(", ")})`);
console.log("\nAdvice:");
review.suggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
console.log("\nWarnings:", review.warnings);

if (improveAt >= 0) {
  const result = await improveFromReview(
    { original: review.original, format, targetRole: role, jobDescription, instructions },
    log
  );
  mkdirSync("out", { recursive: true });
  writeFileSync("out/improved.docx", (await renderResume(result.improved, "docx")).buffer);
  writeFileSync("out/improved.pdf", (await renderResume(result.improved, "pdf")).buffer);
  writeFileSync("out/report.json", JSON.stringify({ review, result }, null, 2));

  console.log(`\n=== AFTER improvement: ${result.report.score}/100 (before: ${review.report.score}) ===`);
  for (const c of result.report.checks) console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.label}: ${c.detail}`);
  console.log("AI rewrites rejected or limited:", result.notes.fallbacks);
  console.log("Warnings:", result.notes.warnings);
  console.log("\nSaved: out/improved.docx, out/improved.pdf, out/report.json");
} else {
  console.log("\nNothing was rewritten. Add  --improve \"your instructions\"  to rewrite it.");
}
await prisma.$disconnect();
