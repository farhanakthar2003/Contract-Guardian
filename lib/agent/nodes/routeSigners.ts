import { ContractGuardianStateType } from "../state";
import { createFoxitMcpClient } from "../mcpClient";
import { runFoxitFileOperation } from "../foxitHelpers";
import { createClient } from "@/lib/supabase/server";
import { writeFile, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

export async function routeSigners(state: ContractGuardianStateType) {
  const supabase = await createClient();

  // Idempotency guard — the createfolder endpoint is NOT safe to retry blindly,
  // so we check for an existing signature request before ever calling it
  const { data: existing } = await supabase
    .from("signature_requests")
    .select("*")
    .eq("amendment_id", state.amendmentId)
    .maybeSingle();

  if (existing?.foxit_esign_folder_id) {
    console.log("Signature request already exists — skipping duplicate createfolder call");
    return {
      signatureFolderId: existing.foxit_esign_folder_id,
      status: "sent_for_signature",
    };
  }

  // Read the *latest* HTML from the DB — if the user edited it after review, that
  // edited version is what gets converted to PDF and signed.
  const { data: amendment, error: amendmentError } = await supabase
    .from("amendments")
    .select("drafted_html")
    .eq("id", state.amendmentId)
    .single();

  if (amendmentError || !amendment?.drafted_html) {
    throw new Error("No drafted HTML available to send for signature");
  }

  // Step 1: convert the current HTML to a PDF via Foxit
  const tempDir = await mkdtemp(path.join(tmpdir(), "contract-guardian-sign-"));
  const draftHtmlPath = path.join(tempDir, "amendment.html");
  await writeFile(draftHtmlPath, amendment.drafted_html, "utf-8");

  const { resultDocumentId: draftedDocumentId } = await runFoxitFileOperation({
    filePath: draftHtmlPath,
    operationToolName: "pdf_from_html",
  });

  // Step 2: turn the Foxit-internal document into a public share URL
  const client = createFoxitMcpClient();
  let shareUrl: string;
  try {
    const tools = await client.getTools();
    const shareLinkTool = tools.find((t) => t.name === "create_share_link")!;
    const shareResult = await shareLinkTool.invoke({
      document_id: draftedDocumentId,
      expiration_minutes: 60,
      filename: "amendment.pdf",
    });
    shareUrl = JSON.parse(shareResult).shareUrl;
  } finally {
    await client.close();
  }

  // Step 3: call Foxit eSign directly to create the signing folder
  const [firstName, ...rest] = state.signerName.trim().split(" ");
  const lastName = rest.join(" ") || firstName;

  const response = await fetch(`${process.env.FOXIT_BASE_URL}/esign/api/v1/folders/createfolder`, {
    method: "POST",
    headers: {
      client_id: process.env.FOXIT_CLIENT_ID!,
      client_secret: process.env.FOXIT_CLIENT_SECRET!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      folderName: `Amendment - ${state.amendmentId}`,
      sendNow: true,
      inputType: "url",
      fileUrls: [shareUrl],
      fileNames: ["amendment.pdf"],
      parties: [
        {
          firstName,
          lastName,
          emailId: state.signerEmail,
          permission: "FILL_FIELDS_AND_SIGN",
          sequence: 1,
        },
      ],
      processTextTags: true,
      processAcroFields: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Foxit eSign createfolder failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  return {
    draftedDocumentId,
    signatureFolderId: result.folderId ?? result.folder?.folderId ?? JSON.stringify(result),
    status: "sent_for_signature",
  };
}