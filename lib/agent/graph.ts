import { StateGraph, START, END, interrupt } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ContractGuardianState, ContractGuardianStateType } from "./state";
import { extractTerms } from "./nodes/extractTerms";
import { draftAmendment } from "./nodes/draftAmendment";
import { generateDiff } from "./nodes/generateDiff";
import { routeSigners } from "./nodes/routeSigners";

// This node pauses the graph and waits for a human decision
async function humanApproval(state: ContractGuardianStateType) {
  const decision = interrupt({
    message: "Review the diff and approve or reject",
    diffSummary: state.diffSummary,
  });

  return { approvalDecision: decision as "approved" | "rejected" };
}

// Routing function: only proceed to signing if approved
function routeAfterApproval(state: ContractGuardianStateType) {
  return state.approvalDecision === "approved" ? "routeSigners" : END;
}

const graph = new StateGraph(ContractGuardianState)
  .addNode("extractTerms", extractTerms)
  .addNode("draftAmendment", draftAmendment)
  .addNode("generateDiff", generateDiff)
  .addNode("humanApproval", humanApproval)
  .addNode("routeSigners", routeSigners)
  .addEdge(START, "extractTerms")
  .addEdge("extractTerms", "draftAmendment")
  .addEdge("draftAmendment", "generateDiff")
  .addEdge("generateDiff", "humanApproval")
  .addConditionalEdges("humanApproval", routeAfterApproval, {
    routeSigners: "routeSigners",
    [END]: END,
  })
  .addEdge("routeSigners", END);

// MemorySaver = in-memory checkpointing for now (Phase 3 testing only)
// We'll swap this for a Supabase-backed checkpointer in a later step
const checkpointer = PostgresSaver.fromConnString(process.env.SUPABASE_DB_URL!);
let setupDone = false;

export async function getContractGuardianGraph() {
  if (!setupDone) {
    await checkpointer.setup();
    setupDone = true;
  }
  return graph.compile({ checkpointer });
}