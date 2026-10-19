import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import PDFDocument from "pdfkit";
import type { ResumeData, ResumeTemplateId } from "./types.js";

/* ------------------------------------------------------------------ */
/* Industry Standard Resume Templates Configuration                    */
/* ------------------------------------------------------------------ */
export interface TemplateConfig {
  id: ResumeTemplateId;
  name: string;
  category: string;
  description: string;
  fontFamily: string; // PDFKit font
  fontBold: string;
  fontItalic: string;
  docxFont: string;   // Word font
  margins: { top: number; bottom: number; left: number; right: number };
  headerAlign: "center" | "left";
  nameSize: number;
  contactSize: number;
  headingSize: number;
  bodySize: number;
  accentColor: string; // hex string e.g. "#1E3A8A"
  lineColor: string;
  lineWidth: number;
  headingUppercase: boolean;
  spacingFactor: number;
}

export const TEMPLATES: Record<ResumeTemplateId, TemplateConfig> = {
  classic: {
    id: "classic",
    name: "Ivy League / Harvard Classic",
    category: "Finance, Consulting & Academia",
    description: "Traditional serif layout with centered header, clean horizontal rules, and 100% ATS score across all legacy enterprise parsers.",
    fontFamily: "Times-Roman",
    fontBold: "Times-Bold",
    fontItalic: "Times-Italic",
    docxFont: "Times New Roman",
    margins: { top: 48, bottom: 48, left: 54, right: 54 },
    headerAlign: "center",
    nameSize: 20,
    contactSize: 9.5,
    headingSize: 11,
    bodySize: 10,
    accentColor: "#111827",
    lineColor: "#111827",
    lineWidth: 0.8,
    headingUppercase: true,
    spacingFactor: 1.0,
  },
  modern_tech: {
    id: "modern_tech",
    name: "Silicon Valley Tech (FAANG / AI)",
    category: "Software Engineering & Tech Startups",
    description: "High-contrast clean sans-serif with left-aligned header, tech-focused skill grouping, and Google XYZ impact bullet formatting.",
    fontFamily: "Helvetica",
    fontBold: "Helvetica-Bold",
    fontItalic: "Helvetica-Oblique",
    docxFont: "Arial",
    margins: { top: 42, bottom: 42, left: 48, right: 48 },
    headerAlign: "left",
    nameSize: 22,
    contactSize: 9.5,
    headingSize: 11,
    bodySize: 9.5,
    accentColor: "#1E3A8A",
    lineColor: "#2563EB",
    lineWidth: 1.2,
    headingUppercase: true,
    spacingFactor: 0.9,
  },
  executive: {
    id: "executive",
    name: "Executive & Engineering Leadership",
    category: "Staff+, Leads, Managers & Directors",
    description: "Sophisticated navy header, spotlight executive summary, and structured competency sections for senior engineering leadership.",
    fontFamily: "Helvetica",
    fontBold: "Helvetica-Bold",
    fontItalic: "Helvetica-Oblique",
    docxFont: "Calibri",
    margins: { top: 44, bottom: 44, left: 50, right: 50 },
    headerAlign: "center",
    nameSize: 22,
    contactSize: 9.5,
    headingSize: 11.5,
    bodySize: 9.5,
    accentColor: "#0F2942",
    lineColor: "#0F2942",
    lineWidth: 1.5,
    headingUppercase: true,
    spacingFactor: 1.0,
  },
  compact: {
    id: "compact",
    name: "Startup 1-Page Fast-Track",
    category: "High-Growth Startups & Unicorns",
    description: "Maximized space utilization with compact padding and dense layout to guarantee fitting all experience on one page.",
    fontFamily: "Helvetica",
    fontBold: "Helvetica-Bold",
    fontItalic: "Helvetica-Oblique",
    docxFont: "Arial",
    margins: { top: 32, bottom: 32, left: 36, right: 36 },
    headerAlign: "left",
    nameSize: 17,
    contactSize: 8.5,
    headingSize: 10,
    bodySize: 8.8,
    accentColor: "#0F172A",
    lineColor: "#64748B",
    lineWidth: 0.6,
    headingUppercase: true,
    spacingFactor: 0.75,
  },
  creative: {
    id: "creative",
    name: "Modern Product & Design Engineering",
    category: "Full-Stack, UI/UX & Design Technologists",
    description: "Modern contemporary styling with emerald/teal accents, balanced whitespace, and readable typography.",
    fontFamily: "Helvetica",
    fontBold: "Helvetica-Bold",
    fontItalic: "Helvetica-Oblique",
    docxFont: "Arial",
    margins: { top: 44, bottom: 44, left: 48, right: 48 },
    headerAlign: "left",
    nameSize: 21,
    contactSize: 9.5,
    headingSize: 11,
    bodySize: 9.5,
    accentColor: "#0D9488",
    lineColor: "#14B8A6",
    lineWidth: 1.2,
    headingUppercase: false,
    spacingFactor: 0.9,
  },
};

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
const A4 = { width: 11906, height: 16838 };

export async function buildDocx(d: ResumeData, templateId: ResumeTemplateId = "modern_tech"): Promise<Buffer> {
  const tpl = TEMPLATES[templateId] ?? TEMPLATES.modern_tech;
  const FONT = tpl.docxFont;
  const SIZE = Math.round(tpl.bodySize * 2); // half-points
  const lineColorHex = tpl.lineColor.replace("#", "");

  const children: Paragraph[] = [];

  const heading = (text: string) =>
    children.push(
      new Paragraph({
        spacing: { before: Math.round(220 * tpl.spacingFactor), after: Math.round(80 * tpl.spacingFactor) },
        keepNext: true,
        border: { bottom: { style: BorderStyle.SINGLE, size: Math.round(tpl.lineWidth * 6), color: lineColorHex, space: 1 } },
        children: [
          new TextRun({
            text: tpl.headingUppercase ? text.toUpperCase() : text,
            bold: true,
            size: Math.round(tpl.headingSize * 2),
            font: FONT,
            color: tpl.accentColor.replace("#", ""),
          }),
        ],
      })
    );

  const line = (runs: TextRun[], after = 0) =>
    children.push(new Paragraph({ spacing: { after: Math.round(after * tpl.spacingFactor) }, keepNext: false, children: runs }));

  const bullet = (text: string) =>
    children.push(
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: Math.round(30 * tpl.spacingFactor) },
        children: [new TextRun({ text, size: SIZE, font: FONT })],
      })
    );

  const plain = (text: string, after = 40) =>
    children.push(new Paragraph({ spacing: { after: Math.round(after * tpl.spacingFactor) }, children: [new TextRun({ text, size: SIZE, font: FONT })] }));

  // Name and contact
  const nameAlign = tpl.headerAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
  children.push(
    new Paragraph({
      alignment: nameAlign,
      spacing: { after: Math.round(40 * tpl.spacingFactor) },
      children: [
        new TextRun({
          text: d.contact.name || "Your Name",
          bold: true,
          size: Math.round(tpl.nameSize * 2),
          font: FONT,
          color: tpl.accentColor.replace("#", ""),
        }),
      ],
    })
  );
  const cl = contactLine(d);
  if (cl) {
    children.push(
      new Paragraph({
        alignment: nameAlign,
        spacing: { after: Math.round(80 * tpl.spacingFactor) },
        children: [new TextRun({ text: cl, size: Math.round(tpl.contactSize * 2), font: FONT })],
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
      if (meta) line([new TextRun({ text: meta, italics: true, size: SIZE, font: FONT })], 30);
      e.bullets.forEach(bullet);
      children.push(new Paragraph({ spacing: { after: Math.round(50 * tpl.spacingFactor) }, children: [] }));
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
      children.push(new Paragraph({ spacing: { after: Math.round(40 * tpl.spacingFactor) }, children: [] }));
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
      children.push(new Paragraph({ spacing: { after: Math.round(40 * tpl.spacingFactor) }, children: [] }));
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

  const marginTwips = {
    top: Math.round(tpl.margins.top * 20),
    bottom: Math.round(tpl.margins.bottom * 20),
    left: Math.round(tpl.margins.left * 20),
    right: Math.round(tpl.margins.right * 20),
  };

  const doc = new Document({
    creator: d.contact.name || "Resume",
    title: `${d.contact.name || "Resume"} - Resume`,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: { page: { size: A4, margin: marginTwips } },
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

export function buildPdf(d: ResumeData, templateId: ResumeTemplateId = "modern_tech"): Promise<PdfResult> {
  return new Promise((resolve, reject) => {
    const tpl = TEMPLATES[templateId] ?? TEMPLATES.modern_tech;
    let dropped = 0;
    const clean = (s: string) => {
      const r = sanitizeForPdf(s);
      dropped += r.dropped;
      return r.text;
    };

    const doc = new PDFDocument({
      size: "A4",
      margins: tpl.margins,
      info: { Title: `${clean(d.contact.name) || "Resume"} - Resume`, Author: clean(d.contact.name) },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), droppedCharacters: dropped }));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const sp = tpl.spacingFactor;

    const heading = (t: string) => {
      doc.moveDown(0.6 * sp);
      const title = tpl.headingUppercase ? t.toUpperCase() : t;
      doc.font(tpl.fontBold).fontSize(tpl.headingSize).fillColor(tpl.accentColor).text(title, left, doc.y, { width });
      doc.moveTo(left, doc.y + 1).lineTo(left + width, doc.y + 1).lineWidth(tpl.lineWidth).strokeColor(tpl.lineColor).stroke();
      doc.moveDown(0.35 * sp);
    };

    const text = (t: string, font = tpl.fontFamily, size = tpl.bodySize, opts: PDFKit.Mixins.TextOptions = {}) => {
      doc.font(font).fontSize(size).fillColor("#111827").text(clean(t), left, doc.y, { width, ...opts });
    };

    const bullets = (items: string[]) => {
      if (!items.length) return;
      doc.font(tpl.fontFamily).fontSize(tpl.bodySize).fillColor("#111827");
      doc.list(items.map(clean), left, doc.y, { width, bulletRadius: 1.5, textIndent: 11, bulletIndent: 5 });
    };

    // Name and contact
    const headerAlign = tpl.headerAlign;
    text(d.contact.name || "Your Name", tpl.fontBold, tpl.nameSize, { align: headerAlign });
    const cl = contactLine(d);
    if (cl) {
      doc.moveDown(0.2 * sp);
      text(cl, tpl.fontFamily, tpl.contactSize, { align: headerAlign });
    }

    if (d.summary) {
      heading(H.summary);
      text(d.summary);
    }

    if (d.skills.length) {
      heading(H.skills);
      for (const g of d.skills) {
        doc.font(tpl.fontFamily).fontSize(tpl.bodySize);
        if (g.label) {
          doc.font(tpl.fontBold).text(clean(`${g.label}: `), left, doc.y, { width, continued: true });
          doc.font(tpl.fontFamily).text(clean(g.items.join(", ")), { width });
        } else {
          text(g.items.join(", "));
        }
        doc.moveDown(0.12 * sp);
      }
    }

    if (d.experience.length) {
      heading(H.experience);
      for (const e of d.experience) {
        doc.font(tpl.fontBold).fontSize(tpl.bodySize).text(clean(e.title), left, doc.y, { width, continued: !!e.company });
        if (e.company) doc.font(tpl.fontFamily).text(clean(`  –  ${e.company}`), { width });
        const meta = joinParts([e.location, dateRange(e.start, e.end)], "  |  ");
        if (meta) text(meta, tpl.fontItalic, tpl.bodySize - 0.5);
        doc.moveDown(0.12 * sp);
        bullets(e.bullets);
        doc.moveDown(0.4 * sp);
      }
    }

    if (d.projects.length) {
      heading(H.projects);
      for (const p of d.projects) {
        doc.font(tpl.fontBold).fontSize(tpl.bodySize).text(clean(p.name), left, doc.y, { width, continued: !!p.tech });
        if (p.tech) doc.font(tpl.fontFamily).text(clean(`  |  ${p.tech}`), { width });
        doc.moveDown(0.12 * sp);
        bullets(p.bullets);
        doc.moveDown(0.35 * sp);
      }
    }

    if (d.education.length) {
      heading(H.education);
      for (const e of d.education) {
        const main = joinParts([e.degree, e.field], ", ") || e.school;
        doc.font(tpl.fontBold).fontSize(tpl.bodySize).text(clean(main), left, doc.y, {
          width,
          continued: !!(e.degree && e.school),
        });
        if (e.degree && e.school) doc.font(tpl.fontFamily).text(clean(`  –  ${e.school}`), { width });
        const dr = dateRange(e.start, e.end);
        if (dr) text(dr, tpl.fontItalic, tpl.bodySize - 0.5);
        bullets(e.details);
        doc.moveDown(0.35 * sp);
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

