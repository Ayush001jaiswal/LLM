import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function run() {
  console.log("Testing MCP connection to Motion...");
  const transport = new StdioClientTransport({
    command: "node",
    args: ["c:/Users/91932/Documents/LLM/motion/node_modules/tsx/dist/cli.mjs", "src/mcp/server.ts"],
    cwd: "c:/Users/91932/Documents/LLM/motion",
  });

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Connected successfully to Motion MCP server!");

  const tools = await client.listTools();
  console.log("Available tools:", tools.tools.map((t) => t.name));

  console.log("\nCalling improve_bullets tool with sample weak bullet...");
  const result = await client.callTool({
    name: "improve_bullets",
    arguments: {
      bullets: ["worked on react frontend", "helped team with bugs"],
      targetRole: "Senior Frontend Engineer",
    },
  });

  console.log("\nResult from improve_bullets:");
  console.log(JSON.stringify(result, null, 2));

  await client.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
