import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import "./Resume.css";
import {
  deleteResume,
  downloadResume,
  getResume,
  improveResume,
  isActive,
  listResumes,
  uploadResume,
} from "./api.resume";
import type { AtsReport, ResumeDetail, ResumeFormat, ResumeListItem } from "./api.resume";

const STATUS_LABEL: Record<string, string> = {
  queued: "Waiting",
  extracting: "Reading",
  reviewed: "Review ready",
  improving: "Improving",
  checking: "Checking",
  ready: "Improved",
  failed: "Failed",
};

const QUICK_REQUESTS = [
  "Keep it to one page",
  "Focus on leadership and ownership",
  "Emphasize measurable results",
  "Use simpler, plainer wording",
];

const scoreClass = (n: number): string => (n >= 90 ? "good" : n >= 70 ? "ok" : "bad");

function Scores({ report, label }: { report: AtsReport; label: string }) {
  return (
    <div className="rs-scores">
      <div className={`rs-score ${scoreClass(report.score)}`}>
        <strong>{report.score}</strong>
        <span>{label}</span>
      </div>
      {report.keywordCoverage !== null && (
        <div className={`rs-score ${scoreClass(report.keywordCoverage)}`}>
          <strong>{report.keywordCoverage}%</strong>
          <span>Job keywords found</span>
        </div>
      )}
      <div className="rs-score plain">
        <strong>{report.quantifiedBulletsPercent}%</strong>
        <span>Bullets with numbers</span>
      </div>
    </div>
  );
}

function Checks({ report }: { report: AtsReport }) {
  return (
    <ul className="rs-checks">
      {report.checks.map((c) => (
        <li key={c.id} className={c.pass ? "pass" : "fail"}>
          <span className="rs-mark">{c.pass ? "✓" : "✗"}</span>
          <div>
            <strong>{c.label}</strong>
            <div className="rs-detail">{c.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Resume({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState("");
  const [jd, setJd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [items, setItems] = useState<ResumeListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ResumeDetail | null>(null);
  const [instr, setInstr] = useState("");
  const [starting, setStarting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const fileInput = useRef<HTMLInputElement | null>(null);

  const refreshList = useCallback(async () => {
    try {
      setItems(await listResumes());
    } catch {
      /* the list is not critical */
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  // Load the selected resume and keep checking every few seconds while it is processing
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    async function load() {
      try {
        const d = await getResume(selectedId as number);
        if (cancelled) return;
        setDetail(d);
        if (isActive(d.status)) timer = window.setTimeout(load, 4000);
        else refreshList();
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    load();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedId, refreshList]);

  // Pre-fill the instructions box with what was used last time
  const loadedId = detail?.id;
  const savedInstr = detail?.instructions;
  useEffect(() => {
    setInstr(savedInstr ?? "");
  }, [loadedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setError("");
  }

  async function submit() {
    setError("");
    if (!file) return setError("Choose a PDF or DOCX resume first.");
    if (role.trim().length < 2) return setError("Enter the role you are applying for.");
    setSubmitting(true);
    try {
      const { id } = await uploadResume(file, role.trim(), jd);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setSelectedId(id);
      refreshList();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function startImprove() {
    if (!detail) return;
    setError("");
    setStarting(true);
    try {
      await improveResume(detail.id, instr.trim());
      // Re-select to restart the status polling
      const id = detail.id;
      setSelectedId(null);
      setTimeout(() => setSelectedId(id), 0);
      refreshList();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this resume and its results?")) return;
    try {
      await deleteResume(id);
      if (id === selectedId) setSelectedId(null);
      refreshList();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function download(format: ResumeFormat) {
    if (!detail) return;
    setDownloading(true);
    try {
      await downloadResume(detail.id, format, detail.filename);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  const busy = items.some((i) => isActive(i.status));
  const review = detail?.review ?? null;
  const canImprove = !!detail && (detail.status === "reviewed" || detail.status === "ready") && !!review;
  const other: ResumeFormat | null = detail ? (detail.format === "pdf" ? "docx" : "pdf") : null;

  return (
    <div className="rs-page">
      <header className="rs-top">
        <button className="rs-back" onClick={onBack}>
          ← Back to chat
        </button>
        <h1>Resume optimizer</h1>
      </header>

      {error && (
        <div className="rs-error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {/* ---------- 1. Upload ---------- */}
      <section className="rs-card">
        <h2>1. Upload your resume</h2>
        <div className="rs-row">
          <input ref={fileInput} type="file" accept=".pdf,.docx" onChange={pickFile} />
        </div>
        <label className="rs-label">
          Role you are applying for
          <input value={role} maxLength={100} placeholder="e.g. Backend Developer" onChange={(e) => setRole(e.target.value)} />
        </label>
        <label className="rs-label">
          Job description (optional, improves the advice and keyword matching)
          <textarea rows={4} value={jd} maxLength={6000} placeholder="Paste the job posting here" onChange={(e) => setJd(e.target.value)} />
        </label>
        <button className="rs-primary" onClick={submit} disabled={submitting || busy}>
          {submitting ? "Uploading..." : busy ? "Another resume is processing..." : "Review my resume"}
        </button>
        <p className="rs-hint">
          First you get a review and advice. Nothing is rewritten until you ask. Works on PDF and DOCX files with selectable text, and
          can take a few minutes on a small computer.
        </p>
      </section>

      {/* ---------- History ---------- */}
      {items.length > 0 && (
        <section className="rs-card">
          <h2>Your resumes</h2>
          <ul className="rs-list">
            {items.map((i) => (
              <li key={i.id} className={i.id === selectedId ? "active" : ""}>
                <button className="rs-item" onClick={() => setSelectedId(i.id)}>
                  <span className="rs-item-name">{i.filename}</span>
                  <span className="rs-item-role">{i.targetRole}</span>
                  <span className={`rs-chip ${i.status}`}>{STATUS_LABEL[i.status] ?? i.status}</span>
                </button>
                <button className="rs-del" onClick={() => remove(i.id)} aria-label="Delete resume">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Working / failed ---------- */}
      {detail && isActive(detail.status) && (
        <section className="rs-card">
          <h2>Working on {detail.filename}</h2>
          <p className="rs-progress">{detail.progress || "Starting..."}</p>
          <p className="rs-hint">You can leave this page and come back. It keeps processing.</p>
        </section>
      )}

      {detail?.status === "failed" && (
        <section className="rs-card">
          <h2>Could not process {detail.filename}</h2>
          <p className="rs-fail">{detail.error}</p>
        </section>
      )}

      {detail && (detail.status === "reviewed" || detail.status === "ready") && detail.error && (
        <div className="rs-error" role="alert">
          {detail.error}
        </div>
      )}

      {/* ---------- 2. Review ---------- */}
      {review && canImprove && (
        <>
          <section className="rs-card">
            <h2>2. Review of your uploaded resume for {detail.targetRole}</h2>
            <Scores report={review.report} label="ATS readiness / 100" />
            <p className="rs-hint">
              This score comes from our own checker, applied to the file you uploaded. Real ATS products differ, and no tool can
              guarantee that a resume is shortlisted.
            </p>

            {review.layout.length > 0 && (
              <div className="rs-block">
                <h3>Layout problems in your file</h3>
                <ul className="rs-notes">
                  {review.layout.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            )}

            {review.spelling.length > 0 && (
              <div className="rs-block">
                <h3>Possible spelling mistakes</h3>
                <p className="rs-kw">
                  {review.spelling.map((s) => (
                    <em key={s.word} className="missing">
                      {s.word}
                      {s.suggestion ? ` → ${s.suggestion}` : ""}
                    </em>
                  ))}
                </p>
              </div>
            )}

            {review.buzzwords.length > 0 && (
              <div className="rs-block">
                <h3>Generic phrases</h3>
                <p className="rs-kw">
                  {review.buzzwords.map((b) => (
                    <em key={b} className="missing">
                      {b}
                    </em>
                  ))}
                </p>
              </div>
            )}
          </section>

          {review.suggestions.length > 0 && (
            <section className="rs-card">
              <h2>Advice for this role and your profile</h2>
              <ol className="rs-suggest">
                {review.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {review.report.missingKeywords.length > 0 && (
                <p className="rs-kw">
                  <span>Job keywords not found:</span>
                  {review.report.missingKeywords.map((k) => (
                    <em key={k} className="missing">
                      {k}
                    </em>
                  ))}
                </p>
              )}
              <p className="rs-hint">
                Advice is never applied automatically. Add a keyword only where it truly describes your experience.
              </p>
            </section>
          )}

          {(review.warnings.length > 0 || review.removed.length > 0) && (
            <section className="rs-card">
              <h2>Please note</h2>
              <ul className="rs-notes">
                {review.warnings.map((w, i) => (
                  <li key={`w${i}`}>{w}</li>
                ))}
                {review.removed.map((w, i) => (
                  <li key={`r${i}`}>Will be removed: {w}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rs-card">
            <h2>{detail.status === "ready" ? "Want changes? Improve it again" : "3. Improve my resume"}</h2>
            <p className="rs-hint" style={{ marginTop: 0 }}>
              Tell the assistant what to change. You can ask for a style ("one page", "focus on leadership") and you can type{" "}
              <strong>true facts</strong> to add, such as "At Acme I cut API latency from 800ms to 300ms". It may only use facts from your
              resume and from what you type here.
            </p>
            <div className="rs-chips">
              {QUICK_REQUESTS.map((q) => (
                <button key={q} onClick={() => setInstr((t) => (t ? `${t.trim()} ${q}.` : `${q}.`))}>
                  + {q}
                </button>
              ))}
            </div>
            <textarea
              className="rs-instr"
              rows={4}
              maxLength={800}
              value={instr}
              placeholder="Optional. Leave empty to improve wording, grammar and format only."
              onChange={(e) => setInstr(e.target.value)}
            />
            <button className="rs-primary" onClick={startImprove} disabled={starting || busy}>
              {starting ? "Starting..." : detail.status === "ready" ? "Improve again" : "Improve my resume"}
            </button>
          </section>
        </>
      )}

      {/* ---------- 4. Result ---------- */}
      {detail?.status === "ready" && detail.report && detail.improved && detail.original && detail.notes && (
        <>
          <section className="rs-card">
            <h2>Your improved resume</h2>
            <Scores report={detail.report} label={`ATS readiness / 100${review ? ` (was ${review.report.score})` : ""}`} />
            <div className="rs-downloads">
              <button className="rs-primary" disabled={downloading} onClick={() => download(detail.format)}>
                Download {detail.format.toUpperCase()} (same as uploaded)
              </button>
              {other && (
                <button className="rs-secondary" disabled={downloading} onClick={() => download(other)}>
                  Download {other.toUpperCase()}
                </button>
              )}
            </div>
            <p className="rs-hint">
              Read every line before you send it. You are responsible for each claim, and some employers have rules about using AI
              tools in applications.
            </p>
          </section>

          {(detail.notes.warnings.length > 0 || detail.notes.fallbacks.length > 0) && (
            <section className="rs-card">
              <h2>Please review</h2>
              <ul className="rs-notes">
                {detail.notes.warnings.map((w, i) => (
                  <li key={`w${i}`}>{w}</li>
                ))}
                {detail.notes.fallbacks.map((w, i) => (
                  <li key={`f${i}`}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rs-card">
            <h2>ATS checks on the improved file</h2>
            <Checks report={detail.report} />
            <details className="rs-more">
              <summary>Built into the template</summary>
              <ul>
                {detail.report.templateGuarantees.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </details>
          </section>

          {detail.notes.suggestions.length > 0 && (
            <section className="rs-card">
              <h2>Still worth doing</h2>
              <ol className="rs-suggest">
                {detail.notes.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          )}

          <section className="rs-card">
            <h2>Before and after</h2>
            {detail.improved.summary !== detail.original.summary && (
              <div className="rs-compare">
                <div>
                  <h4>Summary, original</h4>
                  <p>{detail.original.summary || "(none)"}</p>
                </div>
                <div>
                  <h4>Summary, improved</h4>
                  <p>{detail.improved.summary}</p>
                </div>
              </div>
            )}
            {detail.improved.experience.map((e, i) => (
              <div key={i} className="rs-job">
                <h3>
                  {e.title}
                  {e.company ? `, ${e.company}` : ""}
                  <small>{[e.start, e.end].filter(Boolean).join(" – ")}</small>
                </h3>
                <div className="rs-compare">
                  <div>
                    <h4>Original</h4>
                    <ul>
                      {(detail.original?.experience[i]?.bullets ?? []).map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Improved</h4>
                    <ul>
                      {e.bullets.map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
