import { useState, useEffect } from "react";
import "./Integrations.css";
import {
  listIntegrations,
  addIntegration,
  testIntegration,
  updateIntegration,
  deleteIntegration,
  type McpServerConnection,
  type McpTool,
} from "./api.integrations";

interface IntegrationsProps {
  onBack: () => void;
}

const PRESETS = [
  {
    type: "slack",
    label: "💬 Slack MCP",
    defaultName: "Slack Workspace",
    defaultUrl: "https://slack-mcp.onrender.com/sse",
    placeholderHeader: '{"Authorization": "Bearer xoxb-your-token"}',
    hint: "Connects to Slack to send messages, search channels, and manage notifications.",
  },
  {
    type: "gmail",
    label: "✉️ Gmail MCP",
    defaultName: "Google Workspace / Gmail",
    defaultUrl: "https://gmail-mcp.onrender.com/sse",
    placeholderHeader: '{"Authorization": "Bearer ya29.a0..."}',
    hint: "Connects to Gmail to search job emails, draft messages, and read correspondence.",
  },
  {
    type: "github",
    label: "🐙 GitHub MCP",
    defaultName: "GitHub Integration",
    defaultUrl: "https://github-mcp.onrender.com/sse",
    placeholderHeader: '{"Authorization": "Bearer ghp_your_token"}',
    hint: "Search repositories, inspect pull requests, and commit code via MCP.",
  },
  {
    type: "custom",
    label: "⚡ Custom MCP Server",
    defaultName: "Custom Remote MCP",
    defaultUrl: "https://my-remote-mcp.com/sse",
    placeholderHeader: '{"Authorization": "Bearer your-token"}',
    hint: "Any standard remote MCP server supporting the Server-Sent Events (SSE) transport.",
  },
];

export default function Integrations({ onBack }: IntegrationsProps) {
  const [servers, setServers] = useState<McpServerConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [selectedPreset, setSelectedPreset] = useState("slack");
  const [name, setName] = useState("Slack Workspace");
  const [url, setUrl] = useState("https://slack-mcp.onrender.com/sse");
  const [headersJson, setHeadersJson] = useState('{"Authorization": "Bearer xoxb-your-token"}');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadServers();
  }, []);

  async function loadServers() {
    setLoading(true);
    try {
      const data = await listIntegrations();
      setServers(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectPreset(preset: typeof PRESETS[0]) {
    setSelectedPreset(preset.type);
    setName(preset.defaultName);
    setUrl(preset.defaultUrl);
    setHeadersJson(preset.placeholderHeader);
    setShowForm(true);
  }

  async function handleAddServer(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;

    setError(null);
    setConnecting(true);

    let parsedHeaders: Record<string, string> | undefined;
    if (headersJson.trim()) {
      try {
        parsedHeaders = JSON.parse(headersJson);
      } catch {
        setError("Headers must be valid JSON, e.g. {\"Authorization\": \"Bearer ...\"}");
        setConnecting(false);
        return;
      }
    }

    try {
      const created = await addIntegration({
        name: name.trim(),
        serverType: selectedPreset,
        url: url.trim(),
        headers: parsedHeaders,
      });
      setServers((prev) => [created, ...prev]);
      setShowForm(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleToggle(server: McpServerConnection) {
    try {
      const updated = await updateIntegration(server.id, { enabled: !server.enabled });
      setServers((prev) => prev.map((s) => (s.id === server.id ? updated : s)));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleTest(server: McpServerConnection) {
    try {
      const updated = await testIntegration(server.id);
      setServers((prev) => prev.map((s) => (s.id === server.id ? updated : s)));
      if (updated.status === "error") {
        alert(`Connection error: ${updated.error || "Unknown error"}`);
      } else {
        alert(`Success! Discovered ${updated.tools?.length || 0} tools.`);
      }
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleDelete(server: McpServerConnection) {
    if (!confirm(`Remove "${server.name}"?`)) return;
    try {
      await deleteIntegration(server.id);
      setServers((prev) => prev.filter((s) => s.id !== server.id));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const totalActiveTools = servers
    .filter((s) => s.enabled && s.status === "connected")
    .reduce((sum, s) => sum + (s.tools?.length || 0), 0);

  return (
    <div className="mcp-page">
      <div className="mcp-top">
        <div className="mcp-top-left">
          <button className="mcp-back" onClick={onBack}>
            ← Back to Chat
          </button>
          <h1>MCP Tool Integrations</h1>
        </div>
        <div>
          <button
            className="mcp-btn-primary"
            onClick={() => setShowForm((prev) => !prev)}
          >
            {showForm ? "Cancel" : "+ Connect Remote MCP"}
          </button>
        </div>
      </div>

      <div className="mcp-banner">
        <strong>⚡ Autonomous Multi-MCP Agent Hub</strong>
        Connect external MCP servers to Motion. When enabled, Motion's AI assistant can directly call tools from these servers (e.g. read and post Slack messages, draft emails in Gmail, search GitHub) directly inside your chat workflows.
        {totalActiveTools > 0 && (
          <div style={{ marginTop: "8px", fontWeight: "600", color: "#4ade80" }}>
            🟢 {totalActiveTools} remote tool{totalActiveTools === 1 ? "" : "s"} currently active and ready in chat!
          </div>
        )}
      </div>

      {error && (
        <div className="rs-error" style={{ marginBottom: "16px" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {showForm && (
        <div className="mcp-card">
          <h2>Connect Remote MCP Server</h2>
          <div className="mcp-card-desc">
            Choose a preset or connect any remote server exposing the Model Context Protocol (SSE transport).
          </div>

          <div className="mcp-presets">
            {PRESETS.map((p) => (
              <button
                key={p.type}
                type="button"
                className={`mcp-preset-btn ${selectedPreset === p.type ? "active" : ""}`}
                onClick={() => handleSelectPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <form className="mcp-form" onSubmit={handleAddServer}>
            <div className="mcp-form-row">
              <div className="mcp-field">
                <label>Connection Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Slack Team"
                  required
                />
              </div>
              <div className="mcp-field">
                <label>Server Type</label>
                <select
                  value={selectedPreset}
                  onChange={(e) => setSelectedPreset(e.target.value)}
                >
                  <option value="slack">Slack</option>
                  <option value="gmail">Gmail</option>
                  <option value="github">GitHub</option>
                  <option value="custom">Custom MCP</option>
                </select>
              </div>
            </div>

            <div className="mcp-field">
              <label>Remote MCP Endpoint URL (SSE)</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-mcp-server.com/sse"
                required
              />
              <small>Must be an HTTPS or HTTP endpoint providing Server-Sent Events (SSE).</small>
            </div>

            <div className="mcp-field">
              <label>Authorization Headers (JSON optional)</label>
              <textarea
                rows={2}
                value={headersJson}
                onChange={(e) => setHeadersJson(e.target.value)}
                placeholder='{"Authorization": "Bearer your-token"}'
              />
              <small>Sent in both the SSE handshake and message POST requests.</small>
            </div>

            <button
              type="submit"
              className="mcp-btn-primary"
              disabled={connecting}
            >
              {connecting ? "Testing & Connecting..." : "Test & Add Server"}
            </button>
          </form>
        </div>
      )}

      <div className="mcp-card">
        <h2>Configured MCP Servers ({servers.length})</h2>
        <div className="mcp-card-desc">
          Enabled servers automatically expose their tools to the AI assistant during chat.
        </div>

        {loading ? (
          <div className="mcp-empty">Loading integrations...</div>
        ) : servers.length === 0 ? (
          <div className="mcp-empty">
            No external MCP servers connected yet. Click <strong>+ Connect Remote MCP</strong> above to link Slack, Gmail, or your custom server!
          </div>
        ) : (
          <div className="mcp-server-list">
            {servers.map((server) => {
              const tools = (server.tools as McpTool[]) || [];
              const isConnected = server.status === "connected";

              return (
                <div
                  key={server.id}
                  className={`mcp-server-item ${isConnected ? "connected" : "error"}`}
                >
                  <div className="mcp-server-header">
                    <div className="mcp-server-title">
                      <h3>
                        {server.serverType === "slack" ? "💬 " : server.serverType === "gmail" ? "✉️ " : server.serverType === "github" ? "🐙 " : "⚡ "}
                        {server.name}
                      </h3>
                      <span className={`mcp-status-pill ${isConnected ? "connected" : "error"}`}>
                        {isConnected ? "● Connected" : "▲ Offline / Error"}
                      </span>
                    </div>

                    <label className="mcp-switch">
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        onChange={() => handleToggle(server)}
                      />
                      <span>{server.enabled ? "Enabled in Chat" : "Disabled"}</span>
                    </label>
                  </div>

                  <div className="mcp-server-url">{server.url}</div>

                  {server.error && (
                    <div style={{ color: "#f87171", fontSize: "12px", marginBottom: "8px" }}>
                      Error: {server.error}
                    </div>
                  )}

                  <div className="mcp-tools-container">
                    <div className="mcp-tools-header">
                      <span>Discovered Tools ({tools.length})</span>
                    </div>
                    {tools.length === 0 ? (
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                        No tools found on this server.
                      </span>
                    ) : (
                      <div className="mcp-tool-pills">
                        {tools.map((t) => (
                          <span
                            key={t.name}
                            className="mcp-tool-pill"
                            title={t.description || "MCP Tool"}
                          >
                            🔧 {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mcp-server-actions">
                    <button
                      className="mcp-btn-secondary"
                      onClick={() => handleTest(server)}
                    >
                      🔄 Test & Refresh
                    </button>
                    <button
                      className="mcp-btn-danger"
                      onClick={() => handleDelete(server)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
