import fs from "fs";

let code = fs.readFileSync("motion_ui/src/JobMatchPanel.tsx", "utf8");

// 1. Add import
code = code.replace(
  'import NetworkMatcherModal from "./NetworkMatcherModal";',
  'import NetworkMatcherModal from "./NetworkMatcherModal";\nimport ApplicationTrackerPanel from "./ApplicationTrackerPanel";'
);

// 2. Add sub-tab state (matching jobs vs tracker)
code = code.replace(
  'const [filterTopOnly, setFilterTopOnly] = useState(false);',
  'const [filterTopOnly, setFilterTopOnly] = useState(false);\n  const [panelView, setPanelView] = useState<"search" | "tracker">("search");'
);

// 3. Add view switcher tabs right under jm-subheading
const switcherTabs = `
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
`;

code = code.replace(
  `      <p className="jm-subheading">
        AI reads your full profile — skills, domains, career trajectory — and finds
        jobs that actually fit, not just ones that match keywords.
      </p>`,
  `      <p className="jm-subheading">
        AI reads your full profile — skills, domains, career trajectory — and finds
        jobs that actually fit, not just ones that match keywords.
      </p>${switcherTabs}`
);

// Close the fragment before activeNetworkTarget
code = code.replace(
  `      {activeNetworkTarget && (
        <NetworkMatcherModal`,
  `        </>
      )}

      {activeNetworkTarget && (
        <NetworkMatcherModal`
);

fs.writeFileSync("motion_ui/src/JobMatchPanel.tsx", code, "utf8");
console.log("JobMatchPanel.tsx successfully patched with Application Tracker view");
