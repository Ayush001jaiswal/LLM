import { useEffect, useState } from "react";
import "./NetworkMatcherModal.css";
import { matchRecruiterNetwork, saveApplication } from "./api.resume";
import type {
  AlumniNetworkBridge,
  ConsultancyMatch,
  EmailPatternGuess,
  NetworkMatchingResult,
  RecruiterTarget,
} from "./api.resume";

interface NetworkMatcherModalProps {
  resumeId: number;
  companyName: string;
  jobTitle?: string;
  onClose: () => void;
  onTracked?: () => void;
}

export default function NetworkMatcherModal({
  resumeId,
  companyName,
  jobTitle,
  onClose,
  onTracked,
}: NetworkMatcherModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<NetworkMatchingResult | null>(null);
  const [activeTab, setActiveTab] = useState<"mutual" | "network" | "consultancies" | "pitches" | "email">("mutual");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [trackedStatus, setTrackedStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    matchRecruiterNetwork(resumeId, {
      targetCompany: companyName,
      targetRole: jobTitle,
    })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resumeId, companyName, jobTitle]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const trackThisRole = async (customLeadTitle?: string, customLeadEmail?: string) => {
    try {
      setTrackedStatus("saving");
      await saveApplication({
        resumeId,
        company: companyName,
        role: jobTitle || "Software Engineer",
        status: "connected",
        leadTitle: customLeadTitle || "Engineering Lead / Recruiter",
        leadEmail: customLeadEmail || undefined,
        outreachNotes: data?.pitches.recruiterInMail,
        nextFollowUpDays: 4,
      });
      setTrackedStatus("saved");
      onTracked?.();
      setTimeout(() => setTrackedStatus(null), 3000);
    } catch {
      setTrackedStatus("error");
    }
  };

  return (
    <div className="nmm-backdrop" onClick={onClose}>
      <div className="nmm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="nmm-header">
          <div>
            <div className="nmm-badge-row">
              <span className="nmm-badge mutual">Multi-Channel Outreach Engine</span>
              <span className="nmm-badge company">{companyName}</span>
            </div>
            <h2 className="nmm-title">Connect with Recruiter & Network at {companyName}</h2>
            <p className="nmm-subtitle">
              Target role: <strong>{jobTitle || "Software Engineer"}</strong>. Direct outreach, corporate email patterns, alumni referral bridges, and follow-up sequences.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => trackThisRole()}
              style={{
                background: trackedStatus === "saved" ? "#059669" : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)",
              }}
            >
              {trackedStatus === "saved"
                ? "✓ Added to Application Tracker!"
                : trackedStatus === "saving"
                ? "Tracking..."
                : "📌 Track in Application CRM"}
            </button>
            <button className="nmm-close" onClick={onClose} aria-label="Close modal">
              ×
            </button>
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="nmm-loading">
            <div className="nmm-spinner" />
            <p>Analyzing candidate profile and identifying decision-makers & verified email patterns at {companyName}...</p>
          </div>
        )}

        {error && (
          <div className="nmm-error">
            <p>Could not fetch network matches: {error}</p>
            <button onClick={onClose}>Dismiss</button>
          </div>
        )}

        {/* Loaded Content */}
        {!loading && data && (
          <>
            {/* Tabs */}
            <div className="nmm-tabs">
              <button
                className={activeTab === "mutual" ? "active" : ""}
                onClick={() => setActiveTab("mutual")}
              >
                🔥 Mutual Exact Matches ({data.mutualMatches.length})
              </button>
              <button
                className={activeTab === "email" ? "active" : ""}
                onClick={() => setActiveTab("email")}
              >
                ✉️ Work Email & Direct Mailer
              </button>
              <button
                className={activeTab === "network" ? "active" : ""}
                onClick={() => setActiveTab("network")}
              >
                🎓 Alumni & Referrals ({data.networkBridges.length})
              </button>
              <button
                className={activeTab === "consultancies" ? "active" : ""}
                onClick={() => setActiveTab("consultancies")}
              >
                🏢 Vetted Consultancies ({data.consultancies.length})
              </button>
              <button
                className={activeTab === "pitches" ? "active" : ""}
                onClick={() => setActiveTab("pitches")}
              >
                ✍️ AI Outreach & Follow-Ups
              </button>
            </div>

            {/* Tab 1: Mutual Exact Matches */}
            {activeTab === "mutual" && (
              <div className="nmm-tab-content">
                <div className="nmm-explainer-banner">
                  <strong>Mode 1: Exact Mutual Match (Both Need Each Other)</strong>
                  <p>
                    These hiring managers and technical recruiters hold active headcount for {data.targetRole}. Reaching out directly bypasses the 500+ ATS portal queue.
                  </p>
                </div>

                <div className="nmm-cards-list">
                  {data.mutualMatches.map((recruiter: RecruiterTarget) => (
                    <div key={recruiter.id} className="nmm-card mutual-card">
                      <div className="nmm-card-top">
                        <div>
                          <span className="nmm-tag head">{recruiter.roleType}</span>
                          <span className="nmm-tag urgency">{recruiter.urgency}</span>
                          <h3 className="nmm-card-name">{recruiter.targetTitle}</h3>
                          <div className="nmm-dept">Department: {recruiter.department}</div>
                        </div>
                        <div className="nmm-card-actions">
                          <a
                            href={recruiter.linkedinSearchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="nmm-btn-search"
                          >
                            🔍 Search on LinkedIn ↗
                          </a>
                        </div>
                      </div>

                      <p className="nmm-fit-text">{recruiter.fitReason}</p>

                      <div className="nmm-action-hint">
                        💡 <strong>Recommended Action:</strong> {recruiter.suggestedAction}
                      </div>

                      <div className="nmm-quick-pitch-box">
                        <div className="nmm-qpb-header">
                          <span>300-Char Connection Note (Ready to Paste):</span>
                          <button
                            className="nmm-btn-copy"
                            onClick={() =>
                              copyToClipboard(data.pitches.recruiterConnectionNote, `cn_${recruiter.id}`)
                            }
                          >
                            {copiedKey === `cn_${recruiter.id}` ? "✓ Copied!" : "📋 Copy Note"}
                          </button>
                        </div>
                        <div className="nmm-qpb-text">{data.pitches.recruiterConnectionNote}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 2: Work Email & Direct Mailer */}
            {activeTab === "email" && (
              <div className="nmm-tab-content">
                <div className="nmm-explainer-banner">
                  <strong>Corporate Email Patterns & Direct Executive Mailer</strong>
                  <p>
                    InMail open rates are 20%, but direct corporate emails get a <strong>75%+ open rate</strong>. Use verified email patterns to reach hiring managers directly in their inbox.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                  {(data.emailPatterns || []).map((pat: EmailPatternGuess, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        background: "#1e293b",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "10px",
                        padding: "16px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#34d399",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                        }}
                      >
                        {pat.confidence}
                      </span>
                      <h4 style={{ margin: "10px 0 4px 0", fontSize: "15px", color: "#f8fafc" }}>{pat.pattern}</h4>
                      <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#94a3b8" }}>
                        Example: <code style={{ color: "#93c5fd" }}>{pat.exampleEmail}</code>
                      </p>
                      <button
                        className="nmm-btn-copy"
                        onClick={() => copyToClipboard(pat.pattern, `pat_${idx}`)}
                      >
                        {copiedKey === `pat_${idx}` ? "✓ Copied Pattern!" : "📋 Copy Pattern"}
                      </button>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    background: "rgba(30, 58, 138, 0.2)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    borderRadius: "12px",
                    padding: "20px",
                    marginTop: "10px",
                  }}
                >
                  <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", color: "#93c5fd" }}>
                    🚀 1-Click Launch Executive Pitch in Your Email Client
                  </h3>
                  <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#cbd5e1", lineHeight: 1.5 }}>
                    Click below to open your default mail app with the recipient domain, subject line, and the AI pitch pre-filled.
                  </p>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <a
                      href={`mailto:recruiting@${data.emailPatterns?.[0]?.corporateDomain || "company.com"}?subject=${encodeURIComponent(
                        `Application: ${data.targetRole} - Highly Experienced Engineering Candidate`
                      )}&body=${encodeURIComponent(data.pitches.recruiterInMail)}`}
                      className="nmm-btn-search"
                      style={{ padding: "10px 18px", fontSize: "13.5px" }}
                    >
                      ✉️ Open in Outlook / Apple Mail / Gmail ↗
                    </a>
                    <button
                      type="button"
                      className="nmm-btn-ghost"
                      onClick={() => copyToClipboard(data.pitches.recruiterInMail, "mail_body_all")}
                    >
                      {copiedKey === "mail_body_all" ? "✓ Copied Body!" : "📋 Copy Email Body"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Warm Alumni & Network Bridges */}
            {activeTab === "network" && (
              <div className="nmm-tab-content">
                <div className="nmm-explainer-banner">
                  <strong>Mode 2: Either-Or Referral Match (Opportunistic Network Bridge)</strong>
                  <p>
                    Internal engineers at {companyName} from your shared college or past companies can submit an employee referral. Internal referrals yield 4x–10x higher interview callback rates.
                  </p>
                </div>

                <div className="nmm-cards-list">
                  {data.networkBridges.map((bridge: AlumniNetworkBridge) => (
                    <div key={bridge.id} className="nmm-card network-card">
                      <div className="nmm-card-top">
                        <div>
                          <span className="nmm-tag alumni">🎓 {bridge.bridgeType}</span>
                          <span className="nmm-tag impact">{bridge.referralImpactScore}</span>
                          <h3 className="nmm-card-name">{bridge.targetTitle}</h3>
                          <div className="nmm-dept">Connection: Shared background at {bridge.sourceName}</div>
                        </div>
                        <div className="nmm-card-actions">
                          <a
                            href={bridge.linkedinSearchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="nmm-btn-search"
                          >
                            🔍 Find Alumni on LinkedIn ↗
                          </a>
                        </div>
                      </div>

                      <p className="nmm-fit-text">{bridge.fitReason}</p>

                      <div className="nmm-action-hint">
                        💡 <strong>Warm Intro Strategy:</strong> {bridge.warmIntroAngle}
                      </div>

                      <div className="nmm-quick-pitch-box">
                        <div className="nmm-qpb-header">
                          <span>Alumni Referral Request Template:</span>
                          <button
                            className="nmm-btn-copy"
                            onClick={() =>
                              copyToClipboard(data.pitches.alumniWarmReferralNote, `alumni_${bridge.id}`)
                            }
                          >
                            {copiedKey === `alumni_${bridge.id}` ? "✓ Copied!" : "📋 Copy Message"}
                          </button>
                        </div>
                        <div className="nmm-qpb-text">{data.pitches.alumniWarmReferralNote}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 4: Specialized Recruitment Consultancies */}
            {activeTab === "consultancies" && (
              <div className="nmm-tab-content">
                <div className="nmm-explainer-banner">
                  <strong>Top Search Firms & Recruitment Consultancies</strong>
                  <p>
                    These specialized agencies represent senior engineering talent directly to founders and VPs at 20+ top startups and unicorns.
                  </p>
                </div>

                <div className="nmm-cards-list">
                  {data.consultancies.map((agency: ConsultancyMatch) => (
                    <div key={agency.id} className="nmm-card consultancy-card">
                      <div className="nmm-card-top">
                        <div>
                          <span className="nmm-tag agency">{agency.tier}</span>
                          <span className="nmm-tag region">📍 {agency.regions.join(", ")}</span>
                          <h3 className="nmm-card-name">{agency.firmName}</h3>
                          <div className="nmm-dept">Specialization: {agency.specialization}</div>
                        </div>
                        <div className="nmm-card-actions">
                          <a
                            href={agency.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="nmm-btn-ghost"
                          >
                            🌐 Website ↗
                          </a>
                          <a
                            href={agency.leadSearchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="nmm-btn-search"
                          >
                            🔍 Find Practice Lead ↗
                          </a>
                        </div>
                      </div>

                      <p className="nmm-fit-text">{agency.fitReason}</p>

                      <div className="nmm-action-hint">
                        💡 <strong>Consultancy Angle:</strong> {agency.agencyPitchAngle}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 5: Multi-Touch AI Pitches & Sequences */}
            {activeTab === "pitches" && (
              <div className="nmm-tab-content">
                <div className="nmm-pitch-block">
                  <div className="nmm-pitch-header">
                    <div>
                      <h4>1. LinkedIn Connection Request Note (Recruiter / Hiring Manager)</h4>
                      <small>Concise, punchy, strictly under 300 characters.</small>
                    </div>
                    <button
                      className="nmm-btn-copy"
                      onClick={() => copyToClipboard(data.pitches.recruiterConnectionNote, "pitch_cn")}
                    >
                      {copiedKey === "pitch_cn" ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                  <pre className="nmm-pitch-body">{data.pitches.recruiterConnectionNote}</pre>
                </div>

                <div className="nmm-pitch-block">
                  <div className="nmm-pitch-header">
                    <div>
                      <h4>2. InMail / Direct Email Pitch (Engineering Manager)</h4>
                      <small>3 short paragraphs with metric impact and low-friction ask.</small>
                    </div>
                    <button
                      className="nmm-btn-copy"
                      onClick={() => copyToClipboard(data.pitches.recruiterInMail, "pitch_inmail")}
                    >
                      {copiedKey === "pitch_inmail" ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                  <pre className="nmm-pitch-body">{data.pitches.recruiterInMail}</pre>
                </div>

                <div className="nmm-pitch-block">
                  <div className="nmm-pitch-header">
                    <div>
                      <h4>3. Warm Alumni / Peer Referral Request</h4>
                      <small>Respectful message bonding over shared college or past employer background.</small>
                    </div>
                    <button
                      className="nmm-btn-copy"
                      onClick={() => copyToClipboard(data.pitches.alumniWarmReferralNote, "pitch_alumni")}
                    >
                      {copiedKey === "pitch_alumni" ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                  <pre className="nmm-pitch-body">{data.pitches.alumniWarmReferralNote}</pre>
                </div>

                {data.pitches.followUpDay4 && (
                  <div className="nmm-pitch-block">
                    <div className="nmm-pitch-header">
                      <div>
                        <h4>4. Day 4 Follow-Up Sequence (The Gentle Nudge)</h4>
                        <small>Sent 4 days after first message if no reply received. Yields 40% of responses.</small>
                      </div>
                      <button
                        className="nmm-btn-copy"
                        onClick={() => copyToClipboard(data.pitches.followUpDay4!, "pitch_d4")}
                      >
                        {copiedKey === "pitch_d4" ? "✓ Copied!" : "📋 Copy"}
                      </button>
                    </div>
                    <pre className="nmm-pitch-body">{data.pitches.followUpDay4}</pre>
                  </div>
                )}

                {data.pitches.followUpDay8 && (
                  <div className="nmm-pitch-block">
                    <div className="nmm-pitch-header">
                      <div>
                        <h4>5. Day 8 Follow-Up Sequence (Value-Add Touchpoint)</h4>
                        <small>Shares technical insight or architecture alignment to spark conversation.</small>
                      </div>
                      <button
                        className="nmm-btn-copy"
                        onClick={() => copyToClipboard(data.pitches.followUpDay8!, "pitch_d8")}
                      >
                        {copiedKey === "pitch_d8" ? "✓ Copied!" : "📋 Copy"}
                      </button>
                    </div>
                    <pre className="nmm-pitch-body">{data.pitches.followUpDay8}</pre>
                  </div>
                )}

                <div className="nmm-pitch-block">
                  <div className="nmm-pitch-header">
                    <div>
                      <h4>6. Executive Candidate Profile Brief for Consultancies</h4>
                      <small>Crisp bullet summary for headhunters to pitch you across multiple mandates.</small>
                    </div>
                    <button
                      className="nmm-btn-copy"
                      onClick={() => copyToClipboard(data.pitches.consultancyIntroBrief, "pitch_consult")}
                    >
                      {copiedKey === "pitch_consult" ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                  <pre className="nmm-pitch-body">{data.pitches.consultancyIntroBrief}</pre>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
