import { ContractGuardianStateType } from "../state";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const AMENDMENT_TEMPLATE = `
<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 760px; margin: 0 auto; padding: 55px 50px; color: #1a1a1a; line-height: 1.65;">

  <div style="text-align: center; margin-bottom: 38px;">
    <div style="font-size: 12px; letter-spacing: 1.5px; margin-bottom: 12px;">
      AMENDMENT NO. {{AMENDMENT_NUMBER}}
    </div>
    <h1 style="font-size: 20px; letter-spacing: 1.5px; margin: 0; text-transform: uppercase;">TO</h1>
    <h2 style="font-size: 17px; margin: 8px 0 0; text-transform: uppercase;">{{ORIGINAL_AGREEMENT_TITLE}}</h2>
  </div>

  <p>This Amendment No. {{AMENDMENT_NUMBER}} (this "Amendment") is entered into as of <strong>{{AMENDMENT_DATE}}</strong> (the "Amendment Effective Date"), by and between <strong>{{PARTY_A}}</strong> ("Vendor") and <strong>{{PARTY_B}}</strong> ("Client"). Vendor and Client may each be referred to herein individually as a "Party" and collectively as the "Parties."</p>

  <p>This Amendment amends that certain <strong>{{ORIGINAL_AGREEMENT_TITLE}}</strong> dated <strong>{{ORIGINAL_DATE}}</strong> between the Parties (the "Agreement").</p>

  <h3 style="font-size: 14px; letter-spacing: 0.8px; margin-top: 30px;">RECITALS</h3>
  <p>WHEREAS, the Parties entered into the Agreement; and</p>
  <p>WHEREAS, the Parties desire to amend certain provisions of the Agreement as set forth herein;</p>
  <p>NOW, THEREFORE, in consideration of the mutual agreements and covenants contained herein, the Parties agree as follows:</p>

  <div>{{AMENDMENT_SECTIONS}}</div>

  <h3 style="font-size: 14px; letter-spacing: 0.8px; margin-top: 32px;">EFFECTIVE DATE</h3>
  <p>The amendments set forth in this Amendment shall be effective as of <strong>{{AMENDMENT_DATE}}</strong>, unless otherwise expressly stated herein.</p>

  <h3 style="font-size: 14px; letter-spacing: 0.8px; margin-top: 32px;">RATIFICATION OF AGREEMENT</h3>
  <p>Except as expressly amended by this Amendment, all terms, conditions, covenants and provisions of the Agreement shall remain unchanged and in full force and effect and are hereby ratified and confirmed by the Parties.</p>

  <h3 style="font-size: 14px; letter-spacing: 0.8px; margin-top: 32px;">CONFLICT</h3>
  <p>In the event of any conflict or inconsistency between the terms of this Amendment and the Agreement, the terms of this Amendment shall control solely with respect to the subject matter of such conflict or inconsistency.</p>

  <h3 style="font-size: 14px; letter-spacing: 0.8px; margin-top: 32px;">COUNTERPARTS AND ELECTRONIC SIGNATURES</h3>
  <p>This Amendment may be executed in counterparts, each of which shall be deemed an original and all of which together shall constitute one and the same instrument. Signatures delivered electronically shall be deemed effective as original signatures.</p>

  <p style="margin-top: 42px;">IN WITNESS WHEREOF, the Parties have executed this Amendment as of the Amendment Effective Date.</p>

  <div style="display: flex; justify-content: space-between; margin-top: 65px; gap: 50px;">
    <div style="width: 50%;">
      <p style="font-weight: bold; margin-bottom: 35px;">{{PARTY_A}}</p>
      <p style="border-top: 1px solid #333; padding-top: 7px; margin: 0;">Authorized Signature</p>
      <p style="margin: 10px 0 0;">Name: __________________________</p>
      <p style="margin: 10px 0 0;">Title: ___________________________</p>
      <p style="margin: 10px 0 0;">Date: ___________________________</p>
    </div>
    <div style="width: 50%;">
      <p style="font-weight: bold; margin-bottom: 35px;">{{PARTY_B}}</p>
      <p style="border-top: 1px solid #333; padding-top: 7px; margin: 0;">Authorized Signature</p>
      <p style="margin: 10px 0 0;">Name: __________________________</p>
      <p style="margin: 10px 0 0;">Title: ___________________________</p>
      <p style="margin: 10px 0 0;">Date: ___________________________</p>
    </div>
  </div>

</div>
`;

// "2026-08-25" -> "August 25, 2026"; passes non-ISO strings through unchanged.
function formatLegalDate(input: string): string {
  if (!input) return "";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return input;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function draftAmendment(state: ContractGuardianStateType) {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.6-flash",
    temperature: 0.3,
  });

  const amendmentDate = formatLegalDate(new Date().toISOString().split("T")[0]);
  const originalDate =
    formatLegalDate(((state.originalTerms as { effectiveDate?: string })?.effectiveDate) ?? "") ||
    "the date thereof";

  const response = await model.invoke(
    `You are an experienced commercial contracts drafting assistant. Draft a professional,
execution-ready amendment to the vendor agreement described below. The output must
resemble a real-world commercial contract amendment — not a summary, explanation, email,
or simplified template.

STRICT RULE: The amendment documents ONLY the changes the user requested. Do not invent
unrelated changes or new commercial terms.

ORIGINAL CONTRACT (originalTerms):
${JSON.stringify(state.originalTerms)}

REQUESTED CHANGE:
"${state.requestedChange}"

CONTEXT VALUES SUPPLIED BY THE APPLICATION:
- Amendment number: ${state.amendmentSequenceNumber ?? 1}
- Amendment date: ${amendmentDate}

DRAFTING REQUIREMENTS

1. Identify the original agreement using the exact party names and agreement title from
   originalTerms. Do not alter or abbreviate them.

2. For every requested change, locate the affected provision. Look across the structured
   fields AND the otherTerms array. When the clause exists in otherTerms, use its
   sectionNumber and title verbatim. If a value is missing (e.g. no section number),
   omit it rather than fabricating one.

3. Draft each requested change as its own numbered amendment section — do NOT combine
   unrelated changes into a single paragraph. Section headings should follow this form:
   "1. AMENDMENT TO SECTION [X] – [TITLE]" (omit "SECTION [X]" if the section is
   unnumbered in originalTerms).

4. Choose the appropriate formal drafting form per change:
   - Replacing an entire provision: "Section X of the Agreement is hereby amended and
     restated in its entirety as follows: '[NEW LANGUAGE]'."
   - Replacing a specific value or phrase: "Section X of the Agreement is hereby amended
     by replacing '[OLD]' with '[NEW]'."
   - Adding a new provision: state clearly that a new section is being added and quote
     its full text.
   - Deleting a provision: identify the provision being removed.

5. Do NOT invent facts. If originalTerms does not contain an exact old value / clause
   number / date, do not fabricate one — draft using only the user's stated wording and
   describe the affected subject matter without a fictitious "original value".

6. Preserve unrelated contract meaning. Do not silently change definitions, dates,
   prices, obligations, or rights that were not requested.

7. AMENDMENT PRECISION — MANDATORY.
   Whenever the original agreement offers a specific reference point (a section number,
   a section title, a specific quoted value, a specific phrase), the amendment MUST cite
   ALL of them. Do NOT describe a change generically when the original provides those
   handles.

   BAD (generic — do not do this):
     "The term of the Agreement is hereby amended such that the Agreement shall remain
     in effect through December 31, 2027."

   GOOD (precise — do this when originalTerms shows Section 3 titled 'Term' with an
   expiry of December 31, 2026):
     "Section 3 of the Agreement, entitled 'Term,' is hereby amended by replacing the
     reference to 'December 31, 2026' with 'December 31, 2027.' Accordingly, the Initial
     Term of the Agreement shall continue through December 31, 2027, unless earlier
     terminated in accordance with the terms of the Agreement."

   Every amendment section should be answerable at a glance: WHAT changed, WHERE it
   changed (section + title), and WHAT the resulting state is.

8. PRESERVE DEFINED TERMS.
   If the original contract uses defined terms (e.g., "Initial Term", "Renewal Term",
   "Vendor", "Client", "Parties", "Services", "Confidential Information"), use those
   same defined terms in the amendment. Do not introduce new synonyms.

9. DATE FORMATTING.
   All dates appearing in the amendment sections must be written in formal legal style
   such as "January 1, 2026" or "December 31, 2027". Never use ISO ("2026-01-01") or
   numeric ("1/1/2026") formats anywhere in the output.

10. Populate the fixed placeholders in the template exactly:
    - {{AMENDMENT_NUMBER}} = ${state.amendmentSequenceNumber ?? 1}
    - {{ORIGINAL_AGREEMENT_TITLE}} = originalTerms.agreementTitle (fall back to
      "Services Agreement" only if truly empty)
    - {{AMENDMENT_DATE}} = ${amendmentDate}
    - {{PARTY_A}} = originalTerms.vendorName
    - {{PARTY_B}} = originalTerms.clientName
    - {{ORIGINAL_DATE}} = ${originalDate}

11. {{AMENDMENT_SECTIONS}} is dynamic. Replace it with real HTML: for each amendment
    produce a <h3> heading matching the form in rule 3 (same inline style as the other
    <h3> headings in the template), followed by one or more <p> tags with the formal
    amendment language. Do NOT wrap this in extra containers.

12. Style rules for the whole document:
    - Formal legal terminology, complete sentences.
    - Precise references to the Agreement.
    - No conversational language, no bullet-point summaries, no "before → after"
      notation inside the legal document (that lives in the UI, not here).
    - No references to the user, AI, or the drafting process.
    - No extra legal boilerplate beyond what the template already contains.

13. Output ONLY the completed HTML. Keep every existing inline style attribute exactly
    as-is. Do not add, remove, or restructure any tags outside {{AMENDMENT_SECTIONS}}.
    Do not wrap the output in markdown code fences.

Template:
${AMENDMENT_TEMPLATE}`
  );

  // Defensively strip ```html ... ``` fences Gemini sometimes adds despite the prompt
  const draftedHtml = (response.content as string)
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  // PDF conversion is deliberately deferred to routeSigners so it always uses the
  // latest (possibly user-edited) HTML from the database, not a stale draft.
  return {
    draftedText: draftedHtml,
    status: "amendment_drafted",
  };
}
