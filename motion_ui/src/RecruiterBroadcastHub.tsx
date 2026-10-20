import { useEffect, useState } from "react";
import { fetchRecruiterDirectory, saveApplication } from "./api.resume";
import type { RecruiterLeadItem } from "./api.resume";

interface Props {
  resumeId: number;
}

export default function RecruiterBroadcastHub({ resumeId }: Props) {
  const [leads, setLeads] = useState<RecruiterLeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [noticePeriod, setNoticePeriod] = useState<string>("immediate");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadLeads = async () => {
    try {
      setLoading(true);
      const res = await fetchRecruiterDirectory(resumeId, { noticePeriod, search: search.trim() || undefined });
      setLeads(res.leads);
      // Select all by default for mass outreach readiness
      setSelectedIds(new Set(res.leads.map((l) => l.id)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, [resumeId, noticePeriod]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  };

  const getNoticeLabel = (val: string) => {
    switch (val) {
      case "immediate":
        return "Immediate Joiner (0 Days Notice / Actively Looking)";
      case "15_days":
        return "15 Days Notice Period";
      case "30_days":
        return "1 Month Notice (30 Days)";
      case "serving_notice":
        return "Currently Serving Notice (Available Soon)";
      default:
        return "Standard Notice (60-90 Days)";
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const selectedLeads = leads.filter((l) => selectedIds.has(l.id));

  // 1-Click Mass Email Launch
  const launchMassMail = () => {
    if (selectedLeads.length === 0) return;
    const bccList = selectedLeads.map((l) => l.verifiedEmail).join(",");
    const subject = encodeURIComponent(
      `Senior/Lead Frontend & Staff Engineer Application [${getNoticeLabel(noticePeriod)}] - 10+ Yrs Exp`
    );
    const body = encodeURIComponent(
      `Hi,\n\nI am reaching out regarding open Senior / Lead / Staff Frontend Engineering opportunities at your organization.\n\nKey Highlights:\n• Experience: 10+ Years architecting modern web platforms at scale (React, TypeScript, Next.js, High Performance UI, Micro-frontends)\n• Availability: ${getNoticeLabel(
        noticePeriod
      )}\n• Track record: Led frontend teams, scaled consumer web platforms, and optimized Core Web Vitals across millions of daily active users.\n\nMy resume is attached for your review. Would love to connect for a quick 10-minute introductory discussion.\n\nBest regards,\nCandidate`
    );

    // Open default mail client with all verified emails populated in BCC for high privacy and zero spam flagging
    window.location.href = `mailto:?bcc=${encodeURIComponent(bccList)}&subject=${subject}&body=${body}`;
  };

  // 1-Click Track All Selected in Application CRM
  const batchTrackInCrm = async () => {
    setBatchStatus("tracking");
    try {
      for (const lead of selectedLeads) {
        await saveApplication({
          resumeId,
          company: lead.companyOrAgency,
          role: "Lead Frontend Engineer",
          leadName: lead.name,
          leadTitle: lead.roleTitle,
          leadEmail: lead.verifiedEmail,
          status: "connected",
          nextFollowUpDays: 4,
          outreachNotes: `Reached out via mass campaign. Availability: ${noticePeriod}`,
        });
      }
      setBatchStatus("done");
      setTimeout(() => setBatchStatus(null), 3500);
    } catch {
      setBatchStatus("error");
    }
  };

  return (
    <div style={{ padding: "20px 0" }}>
      {/* Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(30, 58, 138, 0.4) 0%, rgba(88, 28, 135, 0.3) 100%)",
          border: "1px solid rgba(59, 130, 246, 0.35)",
          borderRadius: "14px",
          padding: "20px 24px",
          marginBottom: "24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "3px 10px",
                borderRadius: "12px",
                background: "rgba(236, 72, 153, 0.2)",
                color: "#f472b6",
                border: "1px solid rgba(236, 72, 153, 0.4)",
              }}
            >
              Direct Recruiter &amp; Headhunter Network
            </span>
            <h2 style={{ margin: "10px 0 6px 0", fontSize: "22px", fontWeight: 700, color: "#fff" }}>
              Mass Outreach &amp; Recruiter Broadcast Hub
            </h2>
            <p style={{ margin: 0, fontSize: "13.5px", color: "#cbd5e1", maxWidth: "700px", lineHeight: 1.5 }}>
              Find technical recruiters, engineering directors, and top search consultancies with active headcount for Lead/Staff engineers. Reach out to verified contacts in 1-click.
            </p>
          </div>

          {/* Availability Selector */}
          <div
            style={{
              background: "#0f172a",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "10px",
              padding: "12px 16px",
            }}
          >
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#93c5fd", marginBottom: "6px" }}>
              ⏱️ Your Notice Period / Availability:
            </label>
            <select
              value={noticePeriod}
              onChange={(e) => setNoticePeriod(e.target.value)}
              style={{
                background: "#1e293b",
                color: "#fff",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="immediate">🔥 Immediate Joiner (0 Days Notice / Unemployed)</option>
              <option value="serving_notice">⚡ Serving Notice Period (15–30 Days)</option>
              <option value="30_days">📅 30 Days Notice</option>
              <option value="60_days">📅 60 Days Notice</option>
              <option value="90_days">📅 90 Days Notice (Buyout Possible)</option>
            </select>
          </div>
        </div>

        {/* Global Action Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "20px",
            paddingTop: "16px",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              onClick={selectAll}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#f3f4f6",
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "12.5px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {selectedIds.size === leads.length ? "Deselect All" : `Select All (${leads.length})`}
            </button>
            <span style={{ fontSize: "13px", color: "#94a3b8" }}>
              <strong>{selectedIds.size}</strong> recruiters selected
            </span>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={launchMassMail}
              disabled={selectedIds.size === 0}
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "8px 18px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.35)",
              }}
            >
              🚀 1-Click Launch Email to ({selectedIds.size}) Recruiters
            </button>

            <button
              onClick={batchTrackInCrm}
              disabled={selectedIds.size === 0 || batchStatus === "tracking"}
              style={{
                background: batchStatus === "done" ? "#059669" : "rgba(16, 185, 129, 0.18)",
                color: "#34d399",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
              }}
            >
              {batchStatus === "done"
                ? "✓ Tracked in CRM!"
                : batchStatus === "tracking"
                ? "Tracking..."
                : "📌 Track Selected in CRM"}
            </button>
          </div>
        </div>
      </div>

      {/* Recruiter Leads Grid */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
        <h3 style={{ margin: 0, fontSize: "16px", color: "#f8fafc" }}>
          Target Decision Makers &amp; Search Firms ({leads.length} found)
        </h3>
        <input
          type="text"
          placeholder="Filter by company or recruiter name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadLeads()}
          style={{
            background: "#1e293b",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "6px",
            color: "#fff",
            padding: "6px 12px",
            fontSize: "12.5px",
            width: "260px",
          }}
        />
      </div>

      {loading && <p style={{ color: "#9ca3af", textAlign: "center", padding: "40px" }}>Filtering verified tech recruiters...</p>}

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
          {leads.map((lead) => {
            const isSelected = selectedIds.has(lead.id);

            return (
              <div
                key={lead.id}
                style={{
                  background: isSelected ? "#1e293b" : "rgba(30, 41, 59, 0.6)",
                  border: isSelected ? "1px solid #3b82f6" : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "12px",
                  position: "relative",
                  transition: "all 0.15s ease",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                    <div>
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background:
                            lead.category === "Tier-1 Unicorn"
                              ? "rgba(245, 158, 11, 0.15)"
                              : lead.category === "Top AI Startup"
                              ? "rgba(217, 70, 239, 0.15)"
                              : "rgba(59, 130, 246, 0.15)",
                          color:
                            lead.category === "Tier-1 Unicorn"
                              ? "#fbbf24"
                              : lead.category === "Top AI Startup"
                              ? "#e879f9"
                              : "#60a5fa",
                        }}
                      >
                        {lead.category}
                      </span>
                      <h4 style={{ margin: "8px 0 2px 0", fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                        {lead.name}
                      </h4>
                      <p style={{ margin: "0 0 4px 0", fontSize: "12.5px", color: "#93c5fd" }}>
                        {lead.roleTitle} @ <strong>{lead.companyOrAgency}</strong>
                      </p>
                      <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>📍 {lead.location}</span>
                    </div>

                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(lead.id)}
                      style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#2563eb" }}
                      title="Select for mass email campaign"
                    />
                  </div>

                  {/* Email & Contact Box */}
                  <div
                    style={{
                      background: "#0f172a",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: "8px",
                      padding: "8px 10px",
                      marginTop: "10px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <code style={{ fontSize: "12px", color: "#38bdf8" }}>{lead.verifiedEmail}</code>
                    <button
                      onClick={() => copyToClipboard(lead.verifiedEmail, `em_${lead.id}`)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: copiedKey === `em_${lead.id}` ? "#34d399" : "#94a3b8",
                        fontSize: "11px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {copiedKey === `em_${lead.id}` ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Multi-Channel Quick Action Buttons */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingTop: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <a
                    href={`mailto:${lead.verifiedEmail}?subject=${encodeURIComponent(
                      `Immediate Joiner: 10+ Yrs Lead Frontend Engineer (${getNoticeLabel(noticePeriod)})`
                    )}`}
                    className="nmm-btn-search"
                    style={{ flex: "1 1 auto", textAlign: "center", fontSize: "12px", padding: "6px 10px" }}
                  >
                    ✉️ Mail Direct
                  </a>

                  <a
                    href={lead.linkedinSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nmm-btn-ghost"
                    style={{ flex: "1 1 auto", textAlign: "center", fontSize: "12px", padding: "6px 10px" }}
                  >
                    🔍 LinkedIn
                  </a>

                  {lead.whatsappContact && (
                    <a
                      href={`https://wa.me/${lead.whatsappContact}?text=${encodeURIComponent(
                        `Hi ${lead.name}, I noticed your recruitment desk handles senior engineering roles at ${lead.companyOrAgency}. I am a 10+ years Lead Frontend Engineer available as an immediate joiner (${getNoticeLabel(
                          noticePeriod
                        )}). Would love to share my resume if you have active mandates.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: "rgba(34, 197, 94, 0.15)",
                        border: "1px solid rgba(34, 197, 94, 0.35)",
                        color: "#4ade80",
                        borderRadius: "8px",
                        padding: "6px 10px",
                        fontSize: "12px",
                        fontWeight: 600,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      💬 WhatsApp
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
