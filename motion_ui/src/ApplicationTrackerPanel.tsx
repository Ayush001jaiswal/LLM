import { useEffect, useState } from "react";
import { fetchApplications, updateApplication, deleteApplication } from "./api.resume";
import type { JobApplicationItem } from "./api.resume";

export default function ApplicationTrackerPanel() {
  const [apps, setApps] = useState<JobApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState<string>("");

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await fetchApplications();
      setApps(data);
    } catch (err) {
      console.error("Failed to load applications", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (id: number, newStatus: JobApplicationItem["status"]) => {
    try {
      await updateApplication(id, { status: newStatus });
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this application from your tracker?")) return;
    try {
      await deleteApplication(id);
      setApps((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveNotes = async (id: number) => {
    try {
      await updateApplication(id, { outreachNotes: editNotes });
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, outreachNotes: editNotes } : a)));
      setEditingId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = filterStatus === "all" ? apps : apps.filter((a) => a.status === filterStatus);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "bookmarked":
        return { label: "📌 Bookmarked", bg: "rgba(156, 163, 175, 0.15)", color: "#9ca3af" };
      case "connected":
        return { label: "🤝 Outreach Sent", bg: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" };
      case "follow_up_due":
        return { label: "⏰ Follow-Up Due", bg: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" };
      case "interview":
        return { label: "🎉 Interviewing", bg: "rgba(168, 85, 247, 0.15)", color: "#c084fc" };
      case "offer":
        return { label: "🏆 Offer Received", bg: "rgba(16, 185, 129, 0.15)", color: "#34d399" };
      case "rejected":
        return { label: "Archive", bg: "rgba(239, 68, 68, 0.15)", color: "#f87171" };
      default:
        return { label: status, bg: "rgba(255, 255, 255, 0.1)", color: "#fff" };
    }
  };

  const isFollowUpDue = (app: JobApplicationItem) => {
    if (!app.nextFollowUpAt) return false;
    return new Date(app.nextFollowUpAt).getTime() <= Date.now() && app.status !== "interview" && app.status !== "offer";
  };

  return (
    <div style={{ padding: "24px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ margin: "0 0 6px 0", fontSize: "20px", fontWeight: 700, color: "#fff" }}>
            📊 Application Tracker &amp; Outreach CRM
          </h2>
          <p style={{ margin: 0, fontSize: "13.5px", color: "#9ca3af" }}>
            Never lose an interview opportunity. Manage outreach touches, track corporate emails, and execute 4-day follow-ups.
          </p>
        </div>

        <button
          onClick={loadData}
          style={{
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            color: "#f3f4f6",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          🔄 Refresh CRM
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", marginBottom: "20px" }}>
        {[
          { key: "all", label: `All Tracked (${apps.length})` },
          { key: "connected", label: `Outreach Sent (${apps.filter((a) => a.status === "connected").length})` },
          { key: "follow_up_due", label: `Follow-Ups Due (${apps.filter((a) => isFollowUpDue(a) || a.status === "follow_up_due").length})` },
          { key: "interview", label: `Interviews (${apps.filter((a) => a.status === "interview").length})` },
          { key: "offer", label: `Offers (${apps.filter((a) => a.status === "offer").length})` },
          { key: "bookmarked", label: `Bookmarked (${apps.filter((a) => a.status === "bookmarked").length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterStatus(tab.key)}
            style={{
              background: filterStatus === tab.key ? "rgba(59, 130, 246, 0.2)" : "transparent",
              color: filterStatus === tab.key ? "#60a5fa" : "#9ca3af",
              border: filterStatus === tab.key ? "1px solid rgba(59, 130, 246, 0.4)" : "none",
              borderRadius: "6px",
              padding: "6px 12px",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "#9ca3af", textAlign: "center", padding: "40px" }}>Loading tracked applications...</p>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "12px", border: "1px dashed rgba(255, 255, 255, 0.1)" }}>
          <p style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: 600, color: "#e5e7eb" }}>No applications in this view yet</p>
          <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af" }}>
            Click <strong>"📌 Track in Application CRM"</strong> on any job card or inside the <strong>"Recruiter &amp; Network Match"</strong> modal to begin tracking.
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filtered.map((item) => {
            const badge = getStatusBadge(item.status);
            const due = isFollowUpDue(item);

            return (
              <div
                key={item.id}
                style={{
                  background: "#1e293b",
                  border: due ? "1px solid #f59e0b" : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: badge.bg,
                          color: badge.color,
                        }}
                      >
                        {badge.label}
                      </span>
                      {due && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "6px",
                            background: "rgba(245, 158, 11, 0.2)",
                            color: "#fbbf24",
                            border: "1px solid rgba(245, 158, 11, 0.4)",
                          }}
                        >
                          ⚠️ Follow-Up Due Today
                        </span>
                      )}
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                        Added {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#fff" }}>
                      {item.role} <span style={{ color: "#60a5fa" }}>@ {item.company}</span>
                    </h3>

                    {item.leadTitle && (
                      <p style={{ margin: "4px 0 0 0", fontSize: "12.5px", color: "#cbd5e1" }}>
                        Target Contact: <strong>{item.leadName || item.leadTitle}</strong> {item.leadEmail ? `(${item.leadEmail})` : ""}
                      </p>
                    )}
                  </div>

                  {/* Stage Dropdown & Delete */}
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value as any)}
                      style={{
                        background: "#0f172a",
                        color: "#f3f4f6",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        borderRadius: "6px",
                        padding: "6px 10px",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <option value="bookmarked">📌 Bookmarked</option>
                      <option value="connected">🤝 Outreach Sent</option>
                      <option value="follow_up_due">⏰ Follow-Up Due</option>
                      <option value="interview">🎉 Interviewing</option>
                      <option value="offer">🏆 Offer Received</option>
                      <option value="rejected">Archive</option>
                    </select>

                    <button
                      onClick={() => handleDelete(item.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#94a3b8",
                        cursor: "pointer",
                        fontSize: "14px",
                        padding: "4px 8px",
                      }}
                      title="Remove from tracker"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Notes & Sequences */}
                {editingId === item.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" }}>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Add notes, pitch details, or meeting links..."
                      style={{
                        background: "#0f172a",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "8px",
                        color: "#fff",
                        padding: "8px 12px",
                        fontSize: "12.5px",
                        minHeight: "70px",
                        fontFamily: "inherit",
                      }}
                    />
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => handleSaveNotes(item.id)}
                        style={{
                          background: "#2563eb",
                          color: "#fff",
                          border: "none",
                          borderRadius: "6px",
                          padding: "5px 12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Save Notes
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{
                          background: "transparent",
                          color: "#94a3b8",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: "6px",
                          padding: "5px 12px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                    <span style={{ fontSize: "12px", color: "#94a3b8", fontStyle: item.outreachNotes ? "normal" : "italic" }}>
                      {item.outreachNotes ? `📝 ${item.outreachNotes.slice(0, 110)}...` : "No outreach notes yet."}
                    </span>
                    <button
                      onClick={() => {
                        setEditingId(item.id);
                        setEditNotes(item.outreachNotes || "");
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#60a5fa",
                        fontSize: "11.5px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {item.outreachNotes ? "Edit Notes" : "+ Add Note"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
