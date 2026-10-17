import { Router } from "express";
import type { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "../mcp/createMcpServer.js";

const router = Router();
const transports: Record<string, SSEServerTransport> = {};

// Handle incoming SSE stream connection from Claude, Cursor, or remote agents
export async function handleSseConnect(req: Request, res: Response, messagePath = "/messages") {
  try {
    const transport = new SSEServerTransport(messagePath, res);
    const sessionId = transport.sessionId;
    transports[sessionId] = transport;

    transport.onclose = () => {
      delete transports[sessionId];
    };

    const server = createMcpServer();
    await server.connect(transport);
  } catch (error) {
    console.error("Error establishing SSE connection:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to establish SSE connection" });
    }
  }
}

// Handle client POST messages (JSON-RPC requests)
export async function handlePostMessage(req: Request, res: Response) {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).send("Missing sessionId parameter");
    return;
  }

  const transport = transports[sessionId];
  if (!transport) {
    res.status(404).send("Session not found");
    return;
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP message:", error);
    if (!res.headersSent) {
      res.status(500).send("Error handling message");
    }
  }
}

// Mounted routes
router.get("/sse", (req, res) => handleSseConnect(req, res, "/api/mcp/messages"));
router.post("/messages", handlePostMessage);

export default router;
