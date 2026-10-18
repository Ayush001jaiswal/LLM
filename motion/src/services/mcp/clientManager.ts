import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../../db/prisma.js";

export interface DiscoveredTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface ActiveToolInfo {
  serverId: number;
  serverName: string;
  serverUrl: string;
  headers?: Record<string, string>;
  tool: DiscoveredTool;
}

/**
 * Tests an SSE MCP server connection and returns its available tools.
 */
export async function testMcpConnection(
  urlStr: string,
  headers?: Record<string, string>
): Promise<{ tools: DiscoveredTool[]; error?: string }> {
  let client: Client | null = null;
  try {
    const url = new URL(urlStr);
    const transport = new SSEClientTransport(url, {
      requestInit: {
        headers: headers ?? {},
      },
      eventSourceInit: {
        headers: headers ?? {},
      } as any,
    });

    client = new Client(
      { name: "motion-host-client", version: "1.0.0" },
      { capabilities: {} }
    );

    // 10s connection timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Connection timed out after 10 seconds")), 10000)
    );
    await Promise.race([connectPromise, timeoutPromise]);

    const result = await client.listTools();
    const tools: DiscoveredTool[] = (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: (t.inputSchema as DiscoveredTool["inputSchema"]) ?? { type: "object" },
    }));

    return { tools };
  } catch (err) {
    const msg = (err as Error).message || "Failed to connect to MCP server";
    return { tools: [], error: msg };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // ignore close error
      }
    }
  }
}

/**
 * Executes a tool on a remote MCP server via SSE transport.
 */
export async function executeRemoteMcpTool(
  urlStr: string,
  headers: Record<string, string> | undefined,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  let client: Client | null = null;
  try {
    const url = new URL(urlStr);
    const transport = new SSEClientTransport(url, {
      requestInit: { headers: headers ?? {} },
      eventSourceInit: { headers: headers ?? {} } as any,
    });

    client = new Client(
      { name: "motion-host-client", version: "1.0.0" },
      { capabilities: {} }
    );

    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Connection timed out")), 10000)
    );
    await Promise.race([connectPromise, timeoutPromise]);

    const toolResult = await client.callTool({
      name: toolName,
      arguments: args,
    });

    return { success: true, result: toolResult };
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message || "Failed to execute tool on remote MCP server",
    };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // ignore close error
      }
    }
  }
}

/**
 * Retrieves all active MCP tools for a specific user across all enabled servers.
 */
export async function getUserMcpTools(userId: number): Promise<ActiveToolInfo[]> {
  const servers = await prisma.mcpServerConnection.findMany({
    where: { userId, enabled: true },
  });

  const allTools: ActiveToolInfo[] = [];

  for (const s of servers) {
    const tools = (s.tools as unknown as DiscoveredTool[]) ?? [];
    const headers = (s.headers as Record<string, string> | null) ?? undefined;
    for (const t of tools) {
      allTools.push({
        serverId: s.id,
        serverName: s.name,
        serverUrl: s.url,
        headers,
        tool: t,
      });
    }
  }

  return allTools;
}
