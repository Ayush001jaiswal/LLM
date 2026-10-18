import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { prisma } from "../../db/prisma.js";
import {
  testGmailCredentials,
  sendGmail,
  searchGmail,
} from "../email/gmail.js";

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

const NATIVE_GMAIL_TOOLS: DiscoveredTool[] = [
  {
    name: "gmail_search_emails",
    description: "Searches your Gmail inbox for messages matching a subject, sender, or query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query, keyword, or sender to filter emails" },
        limit: { type: "number", description: "Maximum number of recent emails to return (default 5)" },
      },
    },
  },
  {
    name: "gmail_send_email",
    description: "Sends an email message directly from your connected Gmail account to a recipient.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Body content of the email message" },
      },
      required: ["to", "subject", "body"],
    },
  },
];

/**
 * Tests an MCP server connection and returns its available tools.
 * Supports standard remote SSE endpoints and native Gmail connections.
 */
export async function testMcpConnection(
  urlStr: string,
  headers?: Record<string, string>
): Promise<{ tools: DiscoveredTool[]; error?: string }> {
  // 1. Native Gmail Handler (Zero external server required)
  if (urlStr.startsWith("gmail://") || headers?.appPassword) {
    const email = headers?.email || urlStr.replace("gmail://", "").trim();
    const appPassword = headers?.appPassword;
    if (!email || !appPassword) {
      return {
        tools: [],
        error: "Gmail requires both your Gmail address and a 16-character Google App Password.",
      };
    }
    const test = await testGmailCredentials(email, appPassword);
    if (!test.success) {
      return { tools: [], error: test.error || "Failed to authenticate with Gmail." };
    }
    return { tools: NATIVE_GMAIL_TOOLS };
  }

  // 2. Standard Remote SSE Transport
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
 * Executes a tool on a remote MCP server or native service.
 */
export async function executeRemoteMcpTool(
  urlStr: string,
  headers: Record<string, string> | undefined,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  // 1. Native Gmail Execution
  if (urlStr.startsWith("gmail://") || headers?.appPassword || toolName.startsWith("gmail_")) {
    const email = headers?.email || urlStr.replace("gmail://", "").trim();
    const appPassword = headers?.appPassword;
    if (!email || !appPassword) {
      return { success: false, error: "Missing Gmail credentials (email or app password)." };
    }

    if (toolName === "gmail_send_email") {
      const sendRes = await sendGmail(
        email,
        appPassword,
        String(args.to || ""),
        String(args.subject || ""),
        String(args.body || "")
      );
      return sendRes.success
        ? { success: true, result: `Email sent successfully! Message ID: ${sendRes.messageId}` }
        : { success: false, error: sendRes.error };
    }

    if (toolName === "gmail_search_emails") {
      const searchRes = await searchGmail(
        email,
        appPassword,
        String(args.query || ""),
        Number(args.limit || 5)
      );
      return searchRes.success
        ? { success: true, result: searchRes.emails }
        : { success: false, error: searchRes.error };
    }
  }

  // 2. Standard Remote SSE Execution
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
