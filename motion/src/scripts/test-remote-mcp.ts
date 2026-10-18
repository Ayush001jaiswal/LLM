import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function run() {
  console.log("Testing Remote MCP SSE connection to Motion on Render...");
  const transport = new SSEClientTransport(
    new URL("https://motion-backend-d1d9.onrender.com/sse")
  );

  const client = new Client(
    { name: "test-remote-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Successfully connected to Motion cloud over SSE!");

  const tools = await client.listTools();
  console.log("Available cloud tools:", tools.tools.map((t) => t.name));

  console.log("\nCalling improve_bullets over cloud SSE...");
  const result = await client.callTool({
    name: "improve_bullets",
    arguments: {
      bullets: ["designed react dashboard", "speeded up backend queries"],
      targetRole: "Lead Full Stack Engineer",
    },
  });

  console.log("\nResult from Cloud MCP:");
  console.log(JSON.stringify(result, null, 2));

  await client.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Remote MCP test failed:", err);
  process.exit(1);
});
