import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'
import type { NotificationExtraction } from './extractNotificationData'

const UpdatedFieldsSchema = z.object({
  expiryDate: z
    .string()
    .describe(
      "Effective expiry date after the amendment, YYYY-MM-DD. Empty string if still unstated."
    ),
  autoRenewal: z
    .enum(['yes', 'no', 'unknown'])
    .describe("Effective auto-renewal after the amendment. 'unknown' if still unstated."),
  renewalPeriod: z
    .string()
    .describe(
      "Effective renewal period after the amendment, in NORMALIZED NUMERIC form: '{number} {unit}' where unit is days / weeks / months / years (e.g. '1 year', '6 months'). Empty if unstated."
    ),
  noticePeriod: z
    .string()
    .describe(
      "Effective notice period after the amendment, in NORMALIZED NUMERIC form: '{number} {unit}' where unit is days / weeks / months / years (e.g. '30 days', '3 months'). Empty if unstated."
    ),
})

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Ask Gemini for the effective post-amendment values of the four notification fields.
// If the amendment does not touch a field, the model must return the current value
// unchanged.
export async function computeUpdatedNotificationValues({
  current,
  amendmentHtml,
}: {
  current: NotificationExtraction
  amendmentHtml: string
}): Promise<NotificationExtraction> {
  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-3.6-flash',
    temperature: 0,
  }).withStructuredOutput(UpdatedFieldsSchema)

  const currentForPrompt = {
    expiryDate: current.expiryDate ?? '',
    autoRenewal:
      current.autoRenewal === true ? 'yes' : current.autoRenewal === false ? 'no' : 'unknown',
    renewalPeriod: current.renewalPeriod ?? '',
    noticePeriod: current.noticePeriod ?? '',
  }

  const result = await model.invoke(
    `You are updating the tracked renewal fields for a contract based on an amendment.

CURRENT VALUES (JSON):
${JSON.stringify(currentForPrompt)}

AMENDMENT (plain text):
${stripHtml(amendmentHtml)}

Return the effective value of each field AFTER this amendment applies. Rules:
- If the amendment changes a field, use the new value.
- If the amendment does NOT mention a field, return the current value unchanged.
- Never invent values that are not in either the current record or the amendment.
- Use YYYY-MM-DD for dates. Use 'yes' / 'no' / 'unknown' for autoRenewal.
- For renewalPeriod and noticePeriod, ALWAYS return the value in normalized numeric
  form: '{number} {unit}' where unit is days / weeks / months / years. Never return
  spelled-out numbers ('one-year' -> '1 year'), and never wrap the number in
  parentheses ('thirty (30) days' -> '30 days').`
  )

  return {
    expiryDate: result.expiryDate?.trim() || null,
    autoRenewal:
      result.autoRenewal === 'yes'
        ? true
        : result.autoRenewal === 'no'
          ? false
          : null,
    renewalPeriod: result.renewalPeriod?.trim() || null,
    noticePeriod: result.noticePeriod?.trim() || null,
  }
}
