export type ResumeFormat = "pdf" | "docx";

export interface Contact {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
}

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
  contact: Contact;
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  projects: ProjectEntry[];
  skills: SkillGroup[];
  certifications: string[];
  achievements: string[];
  other: string[]; // lines from sections we did not recognise, kept as-is
}

export interface AtsCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  weight: number;
}

export interface AtsReport {
  score: number; // 0-100, share of weighted checks that passed
  checks: AtsCheck[];
  keywordCoverage: number | null; // 0-100, or null when no job description was given
  missingKeywords: string[];
  matchedKeywords: string[];
  templateGuarantees: string[];
  quantifiedBulletsPercent: number;
  pages: number | null;
}

export interface ResumeNotes {
  warnings: string[]; // things the user should look at
  removed: string[]; // sections dropped on purpose
  suggestions: string[]; // advice, never applied automatically
  fallbacks: string[]; // entries where the model output was rejected and the original kept
}

export interface AnalysisResult {
  original: ResumeData;
  improved: ResumeData;
  report: AtsReport;
  notes: ResumeNotes;
}

export type Progress = (status: "extracting" | "improving" | "checking", message: string) => void;

export interface SpellingIssue {
  word: string;
  suggestion: string;
}

// What the user sees BEFORE anything is rewritten
export interface ReviewResult {
  original: ResumeData;
  report: AtsReport; // checks run on the uploaded resume's content
  layout: string[]; // problems found in the uploaded file's layout (DOCX only)
  layoutInspected: boolean; // false for PDFs
  warnings: string[];
  removed: string[];
  suggestions: string[]; // advice from rules and from the AI, based on role, job description and profile
  spelling: SpellingIssue[];
  buzzwords: string[];
}
