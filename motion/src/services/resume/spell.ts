import nspell from "nspell";
import en from "dictionary-en";
import enGb from "dictionary-en-gb";
import type { ResumeData } from "./types.js";

// Both American and British spelling are accepted
const us = nspell(en as unknown as Parameters<typeof nspell>[0]);
const gb = nspell(enGb as unknown as Parameters<typeof nspell>[0]);

export interface Misspelling {
  word: string;
  suggestion: string;
}

const ok = (w: string): boolean =>
  us.correct(w) || gb.correct(w) || us.correct(w.toLowerCase()) || gb.correct(w.toLowerCase());

// Words that are part of the resume itself (names, companies, tools) are never reported
export function buildIgnoreSet(d: ResumeData, extraText: string[] = []): Set<string> {
  const parts: string[] = [
    d.contact.name, d.contact.location,
    ...d.experience.flatMap((e) => [e.title, e.company, e.location]),
    ...d.education.flatMap((e) => [e.school, e.degree, e.field]),
    ...d.projects.flatMap((p) => [p.name, p.tech]),
    ...d.skills.flatMap((g) => [g.label, ...g.items]),
    ...d.certifications,
    ...extraText,
  ];
  const set = new Set<string>();
  for (const p of parts) for (const w of p.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []) set.add(w.toLowerCase());
  return set;
}

export function findMisspellings(text: string, ignore: Set<string>, max = 20): Misspelling[] {
  const found = new Map<string, Misspelling>();

  // Emails, web addresses and profile handles are not words
  const body = text.replace(/\S+@\S+|\S*(?:https?:|www\.|linkedin|github|gitlab|behance|medium\.com)\S*/gi, " ");

  for (const line of body.split("\n")) {
    for (const m of line.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
      const raw = m[0];
      const before = line.slice(0, m.index ?? 0).trimEnd();
      const startsSentence = before === "" || /[.!?:;]$/.test(before);
      for (const part of raw.split("-")) {
        const w = part.replace(/['’]s$/, "");
        const lower = w.toLowerCase();
        if (w.length < 4 || ignore.has(lower) || found.has(lower)) continue;
        if (/[A-Z].*[A-Z]/.test(w)) continue; // ALL CAPS, camelCase, PostgreSQL
        if (!startsSentence && /^[A-Z]/.test(w)) continue; // probably a name or product
        if (ok(w)) continue;
        const suggestion = us.suggest(w)[0] ?? gb.suggest(w)[0] ?? "";
        found.set(lower, { word: w, suggestion });
      }
    }
    if (found.size >= max) break;
  }
  return Array.from(found.values()).slice(0, max);
}
