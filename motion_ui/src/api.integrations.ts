import { API, authHeaders } from "./api";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpServerConnection {
  id: number;
  name: string;
  serverType: "slack" | "gmail" | "github" | "custom";
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
  tools?: McpTool[];
  lastTestedAt?: string;
  status: "connected" | "error" | "pending";
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listIntegrations(): Promise<McpServerConnection[]> {
  const res = await fetch(`${API}/integrations`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch integrations");
  }
  return res.json();
}

export async function addIntegration(data: {
  name: string;
  serverType: string;
  url: string;
  headers?: Record<string, string>;
}): Promise<McpServerConnection> {
  const res = await fetch(`${API}/integrations`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to connect to MCP server");
  }
  return res.json();
}

export async function testIntegration(id: number): Promise<McpServerConnection> {
  const res = await fetch(`${API}/integrations/${id}/test`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to test MCP server");
  }
  return res.json();
}

export async function updateIntegration(
  id: number,
  data: {
    name?: string;
    url?: string;
    enabled?: boolean;
    headers?: Record<string, string>;
  }
): Promise<McpServerConnection> {
  const res = await fetch(`${API}/integrations/${id}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update MCP server");
  }
  return res.json();
}

export async function deleteIntegration(id: number): Promise<void> {
  const res = await fetch(`${API}/integrations/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to remove MCP server");
  }
}
