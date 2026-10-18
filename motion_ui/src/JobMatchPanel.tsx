import { useState } from "react";
import { findJobs } from "./api.resume";
import type { JobMatch, JobSearchResult, InferredProfile } from "./api.resume";

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

function JobCard({ job }: { job: JobMatch }) {
  return (
    <div className="jm-card">
      <div className="jm-card-header">
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <ScoreBadge score={job.score} />
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

      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        className="jm-apply"
      >
        View &amp; Apply →
      </a>
    </div>
  );
}

export default function JobMatchPanel({ resumeId, resumeStatus }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<JobSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);

  const ready = resumeStatus === "reviewed" || resumeStatus === "ready";

  async function handleSearch() {
    setState("loading");
    setError(null);
    try {
      const data = await findJobs(resumeId, {
        location: location.trim() || undefined,
        remoteOnly,
        limit: 10,
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
          onClick={handleSearch}
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
              <p className="jm-count">{result.jobs.length} jobs ranked for your profile</p>
              <div className="jm-cards">
                {result.jobs.map((job) => <JobCard key={job.url} job={job} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
