import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import PDFDocument from "pdfkit";
import type { ResumeData } from "./types.js";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */
const dateRange = (start: string, end: string): string =>
  start && end ? `${start} – ${end}` : start || end;

const joinParts = (parts: string[], sep: string): string => parts.filter(Boolean).join(sep);

function contactLine(d: ResumeData): string {
  const c = d.contact;
  return joinParts([c.email, c.phone, c.location, ...c.links], "  |  ");
}

// Standard section titles. Parsers and recruiters both expect these exact words.
const H = {
  summary: "Summary",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  achievements: "Awards and Achievements",
  other: "Additional Information",
};

/* ------------------------------------------------------------------ */
/* DOCX                                                                */
/* ------------------------------------------------------------------ */
const FONT = "Arial";
const SIZE = 20; // half-points: 10 pt
const A4 = { width: 11906, height: 16838 };

export async function buildDocx(d: ResumeData): Promise<Buffer> {
  const children: Paragraph[] = [];

  const heading = (text: string) =>
    children.push(
      new Paragraph({
        spacing: { before: 220, after: 80 },
        keepNext: true,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "444444", space: 1 } },
        children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: FONT })],
      })
    );

  const line = (runs: TextRun[], after = 0) =>
    children.push(new Paragraph({ spacing: { after }, keepNext: false, children: runs }));

  const bullet = (text: string) =>
    children.push(
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 30 },
        children: [new TextRun({ text, size: SIZE, font: FONT })],
      })
    );

  const plain = (text: string, after = 40) =>
    children.push(new Paragraph({ spacing: { after }, children: [new TextRun({ text, size: SIZE, font: FONT })] }));

  // Name and contact (in the body, never in a Word header, because many parsers skip headers)
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: d.contact.name || "Your Name", bold: true, size: 32, font: FONT })],
    })
  );
  const cl = contactLine(d);
  if (cl) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: cl, size: SIZE, font: FONT })],
      })
    );
  }

  if (d.summary) {
    heading(H.summary);
    plain(d.summary, 60);
  }

  if (d.skills.length) {
    heading(H.skills);
    for (const g of d.skills) {
      const runs: TextRun[] = [];
      if (g.label) runs.push(new TextRun({ text: `${g.label}: `, bold: true, size: SIZE, font: FONT }));
      runs.push(new TextRun({ text: g.items.join(", "), size: SIZE, font: FONT }));
      line(runs, 40);
    }
  }

  if (d.experience.length) {
    heading(H.experience);
    for (const e of d.experience) {
      line(
        [
          new TextRun({ text: e.title, bold: true, size: SIZE, font: FONT }),
          ...(e.company ? [new TextRun({ text: `  –  ${e.company}`, size: SIZE, font: FONT })] : []),
        ],
        0
      );
      const meta = joinParts([e.location, dateRange(e.start, e.end)], "  |  ");
      if (meta) line([new TextRun({ text: meta, italics: true, size: SIZE, font: FONT })], 40);
      e.bullets.forEach(bullet);
      children.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
    }
  }

  if (d.projects.length) {
    heading(H.projects);
    for (const p of d.projects) {
      line(
        [
          new TextRun({ text: p.name, bold: true, size: SIZE, font: FONT }),
          ...(p.tech ? [new TextRun({ text: `  |  ${p.tech}`, size: SIZE, font: FONT })] : []),
        ],
        20
      );
      p.bullets.forEach(bullet);
      children.push(new Paragraph({ spacing: { after: 40 }, children: [] }));
    }
  }

  if (d.education.length) {
    heading(H.education);
    for (const e of d.education) {
      line(
        [
          new TextRun({ text: joinParts([e.degree, e.field], ", ") || e.school, bold: true, size: SIZE, font: FONT }),
          ...(e.degree && e.school ? [new TextRun({ text: `  –  ${e.school}`, size: SIZE, font: FONT })] : []),
        ],
        0
      );
      const dr = dateRange(e.start, e.end);
      if (dr) line([new TextRun({ text: dr, italics: true, size: SIZE, font: FONT })], 20);
      e.details.forEach(bullet);
      children.push(new Paragraph({ spacing: { after: 40 }, children: [] }));
    }
  }

  if (d.certifications.length) {
    heading(H.certifications);
    d.certifications.forEach(bullet);
  }
  if (d.achievements.length) {
    heading(H.achievements);
    d.achievements.forEach(bullet);
  }
  if (d.other.length) {
    heading(H.other);
    d.other.forEach((t) => plain(t));
  }

  const doc = new Document({
    creator: d.contact.name || "Resume",
    title: `${d.contact.name || "Resume"} - Resume`,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: { page: { size: A4, margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/* ------------------------------------------------------------------ */
/* PDF (text-based, standard fonts only)                               */
/* ------------------------------------------------------------------ */
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const REPLACEMENTS: Record<string, string> = {
  "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "×": "x", "✓": "", "✔": "", "●": "-", "▪": "-", "■": "-",
  "\u00A0": " ", "\u200B": "", "\u2009": " ",
};

// Standard PDF fonts cannot draw every character. Returns the clean text and how many were dropped.
export function sanitizeForPdf(s: string): { text: string; dropped: number } {
  let dropped = 0;
  let out = "";
  for (const ch of s) {
    if (REPLACEMENTS[ch] !== undefined) out += REPLACEMENTS[ch];
    else if ((ch >= " " && ch <= "~") || (ch >= "\u00A1" && ch <= "\u00FF") || WIN_ANSI_EXTRA.includes(ch)) out += ch;
    else if (ch === "\n" || ch === "\t") out += " ";
    else dropped++;
  }
  return { text: out, dropped };
}

export interface PdfResult {
  buffer: Buffer;
  droppedCharacters: number;
}

export function buildPdf(d: ResumeData): Promise<PdfResult> {
  return new Promise((resolve, reject) => {
    let dropped = 0;
    const clean = (s: string) => {
      const r = sanitizeForPdf(s);
      dropped += r.dropped;
      return r.text;
    };

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 54, right: 54 },
      info: { Title: `${clean(d.contact.name) || "Resume"} - Resume`, Author: clean(d.contact.name) },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), droppedCharacters: dropped }));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const heading = (t: string) => {
      doc.moveDown(0.7);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text(t.toUpperCase(), left, doc.y, { width });
      doc.moveTo(left, doc.y + 1).lineTo(left + width, doc.y + 1).lineWidth(0.6).strokeColor("#444444").stroke();
      doc.moveDown(0.4);
    };
    const text = (t: string, font = "Helvetica", size = 10, opts: PDFKit.Mixins.TextOptions = {}) => {
      doc.font(font).fontSize(size).fillColor("#000000").text(clean(t), left, doc.y, { width, ...opts });
    };
    const bullets = (items: string[]) => {
      if (!items.length) return;
      doc.font("Helvetica").fontSize(10).fillColor("#000000");
      doc.list(items.map(clean), left, doc.y, { width, bulletRadius: 1.6, textIndent: 12, bulletIndent: 6 });
    };

    // Name and contact
    text(d.contact.name || "Your Name", "Helvetica-Bold", 18, { align: "center" });
    const cl = contactLine(d);
    if (cl) {
      doc.moveDown(0.2);
      text(cl, "Helvetica", 10, { align: "center" });
    }

    if (d.summary) {
      heading(H.summary);
      text(d.summary);
    }

    if (d.skills.length) {
      heading(H.skills);
      for (const g of d.skills) {
        doc.font("Helvetica").fontSize(10);
        if (g.label) {
          doc.font("Helvetica-Bold").text(clean(`${g.label}: `), left, doc.y, { width, continued: true });
          doc.font("Helvetica").text(clean(g.items.join(", ")), { width });
        } else {
          text(g.items.join(", "));
        }
        doc.moveDown(0.15);
      }
    }

    if (d.experience.length) {
      heading(H.experience);
      for (const e of d.experience) {
        doc.font("Helvetica-Bold").fontSize(10).text(clean(e.title), left, doc.y, { width, continued: !!e.company });
        if (e.company) doc.font("Helvetica").text(clean(`  –  ${e.company}`), { width });
        const meta = joinParts([e.location, dateRange(e.start, e.end)], "  |  ");
        if (meta) text(meta, "Helvetica-Oblique");
        doc.moveDown(0.15);
        bullets(e.bullets);
        doc.moveDown(0.5);
      }
    }

    if (d.projects.length) {
      heading(H.projects);
      for (const p of d.projects) {
        doc.font("Helvetica-Bold").fontSize(10).text(clean(p.name), left, doc.y, { width, continued: !!p.tech });
        if (p.tech) doc.font("Helvetica").text(clean(`  |  ${p.tech}`), { width });
        doc.moveDown(0.15);
        bullets(p.bullets);
        doc.moveDown(0.4);
      }
    }

    if (d.education.length) {
      heading(H.education);
      for (const e of d.education) {
        const main = joinParts([e.degree, e.field], ", ") || e.school;
        doc.font("Helvetica-Bold").fontSize(10).text(clean(main), left, doc.y, {
          width,
          continued: !!(e.degree && e.school),
        });
        if (e.degree && e.school) doc.font("Helvetica").text(clean(`  –  ${e.school}`), { width });
        const dr = dateRange(e.start, e.end);
        if (dr) text(dr, "Helvetica-Oblique");
        bullets(e.details);
        doc.moveDown(0.4);
      }
    }

    if (d.certifications.length) {
      heading(H.certifications);
      bullets(d.certifications);
    }
    if (d.achievements.length) {
      heading(H.achievements);
      bullets(d.achievements);
    }
    if (d.other.length) {
      heading(H.other);
      d.other.forEach((t) => text(t));
    }

    doc.end();
  });
}

