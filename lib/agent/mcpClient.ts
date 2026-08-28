import { MultiServerMCPClient } from "@langchain/mcp-adapters";

export function createFoxitMcpClient() {
  return new MultiServerMCPClient({
    foxit: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@foxitsoftware/foxit-pdf-api-mcp-server"],
      env: {
        FOXIT_CLOUD_API_HOST: process.env.FOXIT_CLOUD_API_HOST!,
        FOXIT_CLOUD_API_CLIENT_ID: process.env.FOXIT_CLOUD_API_CLIENT_ID!,
        FOXIT_CLOUD_API_CLIENT_SECRET: process.env.FOXIT_CLOUD_API_CLIENT_SECRET!,
      },
    },
  });
}