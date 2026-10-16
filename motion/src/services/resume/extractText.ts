import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { ResumeFormat } from "./types.js";

export function detectFormat(filename: string): ResumeFormat | null {
  const name = filename.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return null;
}

// Returns plain text with one line per visual line, or throws a user-friendly Error
export async function extractResumeText(buffer: Buffer, format: ResumeFormat): Promise<string> {
  let raw = "";
  try {
    if (format === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      ({ text: raw } = await extractText(pdf, { mergePages: true }));
    } else {
      raw = (await mammoth.extractRawText({ buffer })).value;
    }
  } catch {
    throw new Error(
      "Could not read this file. It may be corrupted or password-protected. " +
        "Old .doc files are not supported: save as .docx or PDF first."
    );
  }

  const text = raw
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (text.length < 150) {
    throw new Error(
      "No readable text found. Scanned or image-only resumes are not supported yet: " +
        "upload a PDF or DOCX that contains selectable text."
    );
  }
  return text;
}

export async function countPdfPages(buffer: Buffer): Promise<number> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  return pdf.numPages;
}
