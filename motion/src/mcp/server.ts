#!/usr/bin/env node
/**
 * Motion MCP Server (Stdio Transport for Cursor, Claude Desktop, Antigravity)
 */

import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./createMcpServer.js";

export const server = createMcpServer();

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Motion MCP Server running on stdio");
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
