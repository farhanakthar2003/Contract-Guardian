import { Annotation } from "@langchain/langgraph";

export const ContractGuardianState = Annotation.Root({
  // Input: which contract + what change is being requested
  contractId: Annotation<string>,
  contractFilePath: Annotation<string>,
  requestedChange: Annotation<string>,

  // Populated by extract_terms node
  originalTerms: Annotation<Record<string, any> | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Populated by draft_amendment node
  draftedText: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  draftedDocumentId: Annotation<string | null>({
  reducer: (_, update) => update,
  default: () => null,
}),

  // Populated by generate_diff node
  diffSummary: Annotation<{ clause: string; before: string; after: string }[] | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Set by the human during the interrupt
  approvalDecision: Annotation<"approved" | "rejected" | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Populated once eSign is called
  signatureFolderId: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Track status/errors as the graph progresses
  status: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "started",
  }),

  signerName: Annotation<string>,
  signerEmail: Annotation<string>,
  amendmentId: Annotation<string>,
  amendmentSequenceNumber: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 1,
  }),
});

export type ContractGuardianStateType = typeof ContractGuardianState.State;