import { ContractGuardianStateType } from "../state";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";

const DiffSchema = z.object({
  changes: z.array(
    z.object({
      clause: z.string().describe("Name of the clause that changed"),
      before: z.string().describe("The original value"),
      after: z.string().describe("The proposed new value"),
    })
  ),
});

export async function generateDiff(state: ContractGuardianStateType) {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.6-flash",
    temperature: 0,
  }).withStructuredOutput(DiffSchema);

  // draftedText is HTML — strip tags so Gemini diffs the prose, not the markup
  const plainDraft = (state.draftedText ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const result = await model.invoke(
    `Original contract terms (structured fields AND an "otherTerms" array of additional
clauses): ${JSON.stringify(state.originalTerms)}

Drafted amendment text: "${plainDraft}"

List each specific clause that changed, with its before and after value. Look across BOTH
the structured fields and the otherTerms array. Include only clauses whose value has
actually changed — omit unchanged fields. For a clause found in otherTerms, use its
title as the clause name. If the amendment changes something not present in the original
terms, use "(not previously specified)" as the before value.`
  );

  return {
    diffSummary: result.changes,
    status: "diff_ready",
  };
}