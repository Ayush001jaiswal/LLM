import { useState } from "react";
import { findJobs } from "./api.resume";
import type { JobMatch, JobSearchResult, InferredProfile } from "./api.resume";
import NetworkMatcherModal from "./NetworkMatcherModal";
import ApplicationTrackerPanel from "./ApplicationTrackerPanel";

interface Props {
  resumeId: number;
  /** "reviewed" or "ready" — must have parsed data */
  resumeStatus: string;
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100);
  const cls = pct >= 80 ? "jm-score-great" : pct >= 60 ? "jm-score-good" : "jm-score-ok";
  return <span className={`jm-score ${cls}`}>{pct}% match</span>;
}

function ProfileInsight({ profile }: { profile: InferredProfile }) {
  return (
    <details className="jm-profile">
      <summary>🧠 What the AI understands about your profile</summary>
      <div className="jm-profile-body">
        <p><strong>Career path:</strong> {profile.careerTrajectory}</p>
        <p><strong>Technical depth:</strong> {profile.technicalDepth}</p>
        <p><strong>Inferred domains:</strong> {profile.inferredDomains.join(", ")}</p>
        <p><strong>Culture signals:</strong> {profile.cultureSignals.join(", ")}</p>
        <p><strong>Seniority band:</strong> {profile.seniorityBand}</p>
        <p><strong>Searched for:</strong></p>
        <ul>{profile.searchQueries.map((q, i) => <li key={i}>"{q}"</li>)}</ul>
      </div>
    </details>
  );
}

function JobCard({
  job,
  onConnectNetwork,
}: {
  job: JobMatch;
  onConnectNetwork?: (company: string, role: string) => void;
}) {
  return (
    <div className="jm-card">
      <div className="jm-card-header">
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <ScoreBadge score={job.score} />
          {job.tierBadge && (
            <span
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "12px",
                background: job.tierBadge.includes("AI") ? "rgba(217, 70, 239, 0.15)" : "rgba(245, 158, 11, 0.15)",
                color: job.tierBadge.includes("AI") ? "#e879f9" : "#fbbf24",
                border: job.tierBadge.includes("AI") ? "1px solid rgba(217, 70, 239, 0.35)" : "1px solid rgba(245, 158, 11, 0.35)",
                fontWeight: 600,
              }}
            >
              {job.tierBadge}
            </span>
          )}
          {job.source && (
            <span
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "12px",
                background: "rgba(96, 165, 250, 0.12)",
                color: "#60a5fa",
                border: "1px solid rgba(96, 165, 250, 0.3)",
                fontWeight: 500,
              }}
            >
              🌐 {job.source}
            </span>
          )}
        </div>
        <span className="jm-posted">{timeSince(job.postedAt)}</span>
      </div>

      <h3 className="jm-title">{job.title}</h3>
      <p className="jm-meta">
        <span>{job.company}</span>
        <span className="jm-dot">·</span>
        <span>{job.location}</span>
        {job.salary && <><span className="jm-dot">·</span><span className="jm-salary">{job.salary}</span></>}
      </p>

      <p className="jm-reason">"{job.fitReason}"</p>

      {job.matchedSkills.length > 0 && (
        <div className="jm-skills">
          {job.matchedSkills.map((s) => <span key={s} className="jm-skill">{s}</span>)}
        </div>
      )}

      {job.gaps.length > 0 && (
        <p className="jm-gaps">⚠ Gaps: {job.gaps.join(", ")}</p>
      )}

      <div style={{ display: "flex", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="jm-apply"
          style={{ margin: 0, flex: "1 1 140px", textAlign: "center" }}
        >
          View &amp; Apply →
        </a>
        <button
          type="button"
          onClick={() => onConnectNetwork?.(job.company, job.title)}
          style={{
            flex: "1 1 180px",
            background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
            color: "#ffffff",
            border: "1px solid rgba(96, 165, 250, 0.4)",
            borderRadius: "8px",
            padding: "8px 14px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)",
            transition: "all 0.15s ease",
          }}
          title="Direct two-way matching: Connect with active recruiters, alumni referral bridges, and domain search firms"
        >
          🤝 Recruiter &amp; Network Match
        </button>
      </div>
    </div>
  );
}

export default function JobMatchPanel({ resumeId, resumeStatus }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<JobSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [filterTopOnly, setFilterTopOnly] = useState(false);
  const [panelView, setPanelView] = useState<"search" | "tracker">("search");
  const [activeNetworkTarget, setActiveNetworkTarget] = useState<{ company: string; role: string } | null>(null);

  const ready = resumeStatus === "reviewed" || resumeStatus === "ready";

  async function handleSearch(targetPage = 1) {
    setState("loading");
    setError(null);
    try {
      const data = await findJobs(resumeId, {
        location: location.trim() || undefined,
        remoteOnly,
        page: targetPage,
        pageSize: 10,
      });
      setResult(data);
      setState("done");
    } catch (err) {
      setError((err as Error).message ?? "Something went wrong.");
      setState("error");
    }
  }

  if (!ready) {
    return (
      <div className="jm-panel jm-disabled">
        <p>Job matching is available once your resume has been reviewed.</p>
      </div>
    );
  }

  return (
    <div className="jm-panel">
      <h2 className="jm-heading">🎯 Matching Jobs For You</h2>
      <p className="jm-subheading">
        AI reads your full profile — skills, domains, career trajectory — and finds
        jobs that actually fit, not just ones that match keywords.
      </p>
      {/* View Switcher: Matching Jobs vs Application CRM */}
      <div style={{ display: "flex", gap: "10px", margin: "16px 0", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", paddingBottom: "12px" }}>
        <button
          type="button"
          onClick={() => setPanelView("search")}
          style={{
            background: panelView === "search" ? "#2563eb" : "transparent",
            color: panelView === "search" ? "#fff" : "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "13.5px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          🎯 Job Matching Engine
        </button>
        <button
          type="button"
          onClick={() => setPanelView("tracker")}
          style={{
            background: panelView === "tracker" ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "transparent",
            color: panelView === "tracker" ? "#fff" : "#34d399",
            border: panelView === "tracker" ? "none" : "1px solid rgba(16, 185, 129, 0.4)",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "13.5px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          📊 Application Tracker &amp; Outreach CRM
        </button>
      </div>

      {panelView === "tracker" && <ApplicationTrackerPanel />}

      {panelView === "search" && (
        <>


      {/* Filters */}
      <div className="jm-filters">
        <input
          className="jm-input"
          type="text"
          placeholder="Location (leave blank to use resume location)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          disabled={state === "loading"}
        />
        <label className="jm-checkbox">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
            disabled={state === "loading"}
          />
          Remote jobs only
        </label>
        <button
          className="jm-btn"
          onClick={() => handleSearch(1)}
          disabled={state === "loading"}
        >
          {state === "loading" ? "Analyzing your profile…" : "Find Matching Jobs"}
        </button>
      </div>

      {state === "loading" && (
        <div className="jm-loading">
          <div className="jm-spinner" />
          <p>Gemini is analyzing your profile and evaluating jobs…<br />
          <small>This takes 15–30 seconds. Your profile is being deeply understood, not just keyword-matched.</small></p>
        </div>
      )}

      {state === "error" && (
        <div className="jm-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {state === "done" && result && (
        <>
          {result.warnings.length > 0 && (
            <div className="jm-warnings">
              {result.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
            </div>
          )}

          <ProfileInsight profile={result.profile} />

          {result.jobs.length === 0 ? (
            <p className="jm-empty">No strong matches found. Try a different location or check back later.</p>
          ) : (
            <>
              {(() => {
                const topCount = result.jobs.filter((j) => Boolean(j.tierBadge)).length;
                const displayedJobs = filterTopOnly
                  ? result.jobs.filter((j) => Boolean(j.tierBadge))
                  : result.jobs;

                return (
                  <>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", margin: "14px 0" }}>
                      <button
                        type="button"
                        onClick={() => setFilterTopOnly(false)}
                        style={{
                          background: !filterTopOnly ? "#2563eb" : "transparent",
                          color: !filterTopOnly ? "#fff" : "var(--text)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          padding: "6px 14px",
                          fontSize: "13px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        All Market Jobs ({result.jobs.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterTopOnly(true)}
                        style={{
                          background: filterTopOnly ? "linear-gradient(135deg, #d946ef, #8b5cf6)" : "transparent",
                          color: filterTopOnly ? "#fff" : "#fbbf24",
                          border: filterTopOnly ? "none" : "1px solid rgba(245, 158, 11, 0.4)",
                          borderRadius: "8px",
                          padding: "6px 14px",
                          fontSize: "13px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ⭐ Top Tech &amp; AI Startups ({topCount})
                      </button>
                    </div>

                    <p className="jm-count">
                      Showing page {result.page} of {result.totalPages} ({result.totalJobs} total relevant jobs matched)
                    </p>

                    {displayedJobs.length === 0 ? (
                      <p className="jm-empty">
                        No direct Top Tech openings matched this specific search. Click "All Market Jobs" to view full market listings.
                      </p>
                    ) : (
                      <>
                        <div className="jm-cards">
                          {displayedJobs.map((job) => (
                            <JobCard
                              key={job.url}
                              job={job}
                              onConnectNetwork={(company, role) => setActiveNetworkTarget({ company, role })}
                            />
                          ))}
                        </div>

                        {/* Pagination Navigation */}
                        {result.totalPages > 1 && (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              gap: "8px",
                              marginTop: "24px",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              disabled={result.page <= 1}
                              onClick={() => handleSearch(1)}
                              style={{
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                color: result.page <= 1 ? "#6b7280" : "#f3f4f6",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                cursor: result.page <= 1 ? "not-allowed" : "pointer",
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            >
                              « First
                            </button>
                            <button
                              type="button"
                              disabled={result.page <= 1}
                              onClick={() => handleSearch(result.page - 1)}
                              style={{
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                color: result.page <= 1 ? "#6b7280" : "#f3f4f6",
                                padding: "6px 14px",
                                borderRadius: "6px",
                                cursor: result.page <= 1 ? "not-allowed" : "pointer",
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            >
                              ‹ Prev
                            </button>

                            <span
                              style={{
                                fontSize: "13px",
                                color: "#9ca3af",
                                padding: "0 8px",
                                fontWeight: 600,
                              }}
                            >
                              Page {result.page} of {result.totalPages}
                            </span>

                            <button
                              type="button"
                              disabled={result.page >= result.totalPages}
                              onClick={() => handleSearch(result.page + 1)}
                              style={{
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                color: result.page >= result.totalPages ? "#6b7280" : "#f3f4f6",
                                padding: "6px 14px",
                                borderRadius: "6px",
                                cursor: result.page >= result.totalPages ? "not-allowed" : "pointer",
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            >
                              Next ›
                            </button>
                            <button
                              type="button"
                              disabled={result.page >= result.totalPages}
                              onClick={() => handleSearch(result.totalPages)}
                              style={{
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                color: result.page >= result.totalPages ? "#6b7280" : "#f3f4f6",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                cursor: result.page >= result.totalPages ? "not-allowed" : "pointer",
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            >
                              Last »
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </>
      )}

        </>
      )}

      {activeNetworkTarget && (
        <NetworkMatcherModal
          resumeId={resumeId}
          companyName={activeNetworkTarget.company}
          jobTitle={activeNetworkTarget.role}
          onClose={() => setActiveNetworkTarget(null)}
        />
      )}
    </div>
  );
}
