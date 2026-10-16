import JSZip from "jszip";

// Looks inside an uploaded DOCX for things that commonly confuse ATS parsers.
// Returns plain-English findings. (Layout inside PDFs cannot be reliably inspected.)
export async function auditDocxLayout(buffer: Buffer): Promise<string[]> {
  const findings: string[] = [];
  try {
    const zip = await JSZip.loadAsync(buffer);
    const doc = (await zip.file("word/document.xml")?.async("string")) ?? "";

    const tables = (doc.match(/<w:tbl>/g) ?? []).length;
    if (tables) findings.push(`The file uses ${tables} table(s). Many ATS parsers read table cells in the wrong order or skip them.`);

    if (/<w:txbxContent/.test(doc)) findings.push("The file contains text boxes. Text inside text boxes is often ignored by ATS parsers.");

    const images = (doc.match(/<w:drawing>|<w:pict>/g) ?? []).length;
    if (images) findings.push(`The file contains ${images} image or graphic object(s) (photo, icon, shape or chart). ATS parsers cannot read them.`);

    if (/<w:cols[^>]*w:num="([2-9])"/.test(doc)) findings.push("The page uses multiple columns, which often makes text come out in the wrong order.");

    for (const name of Object.keys(zip.files)) {
      if (!/^word\/(header|footer)\d*\.xml$/.test(name)) continue;
      const xml = (await zip.file(name)?.async("string")) ?? "";
      const text = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).join("").replace(/<[^>]+>/g, "").trim();
      if (text) {
        findings.push("There is text in the page header or footer. Contact details placed there are often skipped by ATS parsers.");
        break;
      }
    }
  } catch {
    /* if the file cannot be inspected, skip the audit */
  }
  return findings;
}
