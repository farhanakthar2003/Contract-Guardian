import { createFoxitMcpClient } from "./mcpClient";
import "dotenv/config";

async function main() {
  const client = createFoxitMcpClient();
  const tools = await client.getTools();

  for (const tool of tools) {
    console.log(`- ${tool.name}: ${tool.description}`);
  }

  await client.close();
}

main();