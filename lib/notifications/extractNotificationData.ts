import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'
import { readFile, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { runFoxitFileOperation } from '@/lib/agent/foxitHelpers'

const NotificationFieldsSchema = z.object({
  expiryDate: z
    .string()
    .describe(
      "Contract end / expiry date in YYYY-MM-DD format. Empty string if the contract does not state one."
    ),
  autoRenewal: z
    .enum(['yes', 'no', 'unknown'])
    .describe(
      "Whether the contract auto-renews unless cancelled. Use 'unknown' if not stated."
    ),
  renewalPeriod: z
    .string()
    .describe(
      "The renewal period in NORMALIZED NUMERIC form: '{number} {unit}', where unit is one of days / weeks / months / years. Examples: '1 year', '6 months', '30 days'. If the contract writes it as 'one-year' or 'twelve (12) months' or 'thirty (30) days', return '1 year' / '12 months' / '30 days' respectively. Empty string if not stated."
    ),
  noticePeriod: z
    .string()
    .describe(
      "The notice period required to prevent renewal, in NORMALIZED NUMERIC form: '{number} {unit}', where unit is one of days / weeks / months / years. Examples: '30 days', '60 days', '3 months'. If the contract writes it as 'thirty (30) days' or 'sixty days', return '30 days' or '60 days'. Empty string if not stated."
    ),
})

export type NotificationExtraction = {
  expiryDate: string | null
  autoRenewal: boolean | null
  renewalPeriod: string | null
  noticePeriod: string | null
}

// Runs Foxit pdf_to_text on the given local PDF, then asks Gemini to pull the four
// notification fields. Returns nulls for anything the contract does not state — never
// invents values.
export async function extractNotificationData(
  filePath: string
): Promise<NotificationExtraction> {
  const { resultDocumentId, client } = await runFoxitFileOperation({
    filePath,
    operationToolName: 'pdf_to_text',
  })

  try {
    const tools = await client.getTools()
    const downloadTool = tools.find((t) => t.name === 'download_document')!

    const tempDir = await mkdtemp(path.join(tmpdir(), 'contract-guardian-notify-'))
    const outputPath = path.join(tempDir, 'extracted.txt')

    await downloadTool.invoke({ documentId: resultDocumentId, outputPath })
    const rawText = await readFile(outputPath, 'utf-8')

    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-3.6-flash',
      temperature: 0,
    }).withStructuredOutput(NotificationFieldsSchema)

    const extracted = await model.invoke(
      `Extract the following renewal-tracking fields from this vendor contract text.
Rules:
- Only report what is explicitly stated in the contract.
- If a field is not clearly stated, return empty string (or 'unknown' for autoRenewal).
- Do NOT infer or invent values. Do NOT combine unrelated clauses.
- For renewalPeriod and noticePeriod, ALWAYS return the value in normalized numeric
  form: '{number} {unit}' where unit is days / weeks / months / years. Never return
  spelled-out numbers ('one-year' -> '1 year'), and never wrap the number in
  parentheses ('thirty (30) days' -> '30 days').

Contract text:
${rawText}`
    )

    return {
      expiryDate: extracted.expiryDate?.trim() || null,
      autoRenewal:
        extracted.autoRenewal === 'yes'
          ? true
          : extracted.autoRenewal === 'no'
            ? false
            : null,
      renewalPeriod: extracted.renewalPeriod?.trim() || null,
      noticePeriod: extracted.noticePeriod?.trim() || null,
    }
  } finally {
    await client.close()
  }
}
