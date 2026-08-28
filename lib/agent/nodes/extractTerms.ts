import { ContractGuardianStateType } from "../state";
import { runFoxitFileOperation } from "../foxitHelpers";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { readFile, writeFile, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const OtherTermSchema = z.object({
  sectionNumber: z
    .string()
    .describe(
      "The section / clause number as it appears in the contract (e.g. '4', '4.2', 'Article V'). Empty string if the contract does not number this clause."
    ),
  title: z
    .string()
    .describe(
      "Short label for the clause (e.g. 'Confidentiality', 'Governing Law', 'Indemnification')"
    ),
  text: z.string().describe("A 1–3 sentence summary of the clause"),
});

const ExtractedTermsSchema = z.object({
  agreementTitle: z
    .string()
    .describe(
      "The full title of the agreement as stated in the document (e.g. 'Vendor Services Agreement', 'Master Software License Agreement'). Fall back to 'Services Agreement' only if truly nothing else fits."
    ),
  vendorName: z
    .string()
    .describe(
      "Vendor / service provider / counterparty name (the party providing the service or product)"
    ),
  clientName: z
    .string()
    .describe(
      "Customer / client company name (the party receiving the service or product)"
    ),
  effectiveDate: z
    .string()
    .describe("Contract start / effective date, format YYYY-MM-DD (empty string if unstated)"),
  expiryDate: z
    .string()
    .describe("Contract end / expiry date, format YYYY-MM-DD (empty string if unstated)"),
  annualFee: z
    .number()
    .describe(
      "Primary annual fee as a bare number, no currency symbols. Use 0 if not applicable."
    ),
  paymentTerms: z
    .string()
    .describe(
      "Payment timing / frequency and any conditions (e.g. 'Net 30, invoiced quarterly')"
    ),
  autoRenewal: z
    .boolean()
    .describe("Whether the contract auto-renews unless cancelled"),
  renewalTerms: z
    .string()
    .describe(
      "Renewal period plus notice period required to prevent renewal (e.g. '1-year renewals with 60 days notice')"
    ),
  scopeOfServices: z
    .string()
    .describe("Concise 1–2 sentence summary of what the vendor is providing"),
  terminationTerms: z
    .string()
    .describe("How and under what conditions either party may terminate the agreement"),
  otherTerms: z
    .array(OtherTermSchema)
    .describe(
      "Every other material clause present in the contract but not captured by the structured fields above (confidentiality, governing law, IP ownership, warranties, indemnification, limitation of liability, dispute resolution, notices, assignment, entire agreement, etc.). Include the sectionNumber as it appears in the contract when available. Empty array only if genuinely no other clauses of substance exist."
    ),
});

export async function extractTerms(state: ContractGuardianStateType) {
  // Step 1: run Foxit's pdf_to_text on the real uploaded contract
  const { resultDocumentId, client } = await runFoxitFileOperation({
    filePath: state.contractFilePath,
    operationToolName: "pdf_to_text",
  });

  try {
    // Step 2: download the resulting text file locally
    const tools = await client.getTools();
    const downloadTool = tools.find((t) => t.name === "download_document")!;

    const tempDir = await mkdtemp(path.join(tmpdir(), "contract-guardian-"));
    const outputPath = path.join(tempDir, "extracted.txt");

    await downloadTool.invoke({
      documentId: resultDocumentId,
      outputPath,
    });

    const rawText = await readFile(outputPath, "utf-8");

    // Step 3: Gemini does the semantic extraction on top of the raw text
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-3.6-flash",
      temperature: 0,
    }).withStructuredOutput(ExtractedTermsSchema);

    const originalTerms = await model.invoke(
      `Extract the following fields from this vendor contract text.

Guidance:
- Identify BOTH signing parties: the vendor (party providing the service/product) and
  the client (party receiving it). If the roles are ambiguous, use context clues from
  payment direction and obligations.
- Capture the exact agreement title as it appears in the document header/title block.
- Fill each structured field with the best information present in the contract. If a
  field is not stated, use a sensible default (empty string for text, 0 for numbers,
  false for booleans) rather than guessing.
- The structured fields cover common amendment targets, but they are NOT exhaustive.
  Put EVERY other material clause into "otherTerms" as { sectionNumber, title, text }
  entries — confidentiality, governing law, IP ownership, warranties, indemnification,
  limitation of liability, dispute resolution, notices, assignment, entire agreement,
  and anything else with legal weight. Preserve the original section number when the
  contract numbers its clauses (e.g. '4', '4.2', 'Article V'); use an empty string only
  when the clause is genuinely unnumbered.

Contract text:
${rawText}`
    );

    return {
      originalTerms,
      status: "terms_extracted",
    };
  } finally {
    await client.close();
  }
}