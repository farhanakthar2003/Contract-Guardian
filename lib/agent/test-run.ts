import path from "path";
import { getContractGuardianGraph } from "./graph";
import { Command } from "@langchain/langgraph";

// tsx doesn't load .env.local automatically the way `next dev` does
process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));

async function main() {
  const config = { configurable: { thread_id: "test-thread-1" } };
    const contractGuardianGraph = await getContractGuardianGraph(); 
  const result = await contractGuardianGraph.invoke(
    {
      contractId: "test-contract-1",
      contractFilePath: path.resolve(process.cwd(), "test-assets/sample-contract.pdf"),
      requestedChange: "Renew at $8000 instead of $10000",
    },
    config
  );

  console.log("Paused with interrupt:", JSON.stringify((result as any).__interrupt__, null, 2));

  // Simulate the human clicking "Approve" — resume with the SAME thread_id
  const resumed = await contractGuardianGraph.invoke(
    new Command({ resume: "approved" }),
    config
  );

  console.log("After resume:", JSON.stringify(resumed, null, 2));
}

main();