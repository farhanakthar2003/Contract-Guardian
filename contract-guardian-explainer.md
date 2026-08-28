# Contract Renewal & Amendment Guardian — Complete Explainer

---

## Part 1: The Problem Statement

### The real-world problem

Every business — from a 5-person agency to a mid-size company — signs contracts with vendors, clients, and partners. Once signed, these PDFs get filed away and mostly forgotten.

Two things go wrong over time:

1. **Silent auto-renewal.** Many contracts contain a clause like *"this agreement automatically renews unless either party gives 30 days' notice."* Nobody tracks the notice deadline. The company gets locked into another year, often at unfavorable terms, simply because no one was watching the calendar.
2. **Manual, error-prone amendments.** When a business *does* want to renegotiate (say, a lower price, a new term length), someone has to dig up the original PDF, manually figure out what needs to change, draft new legal language by hand, email it around for approval, and separately chase down a signature. This is slow, easy to get wrong, and doesn't scale past a handful of contracts.

This is a genuine, widely-felt pain point — not a problem invented for a hackathon.

### The specific challenge we're answering (Foxit's track)

Foxit's hackathon challenge is titled **"Your Agent Shouldn't Sign That."** The brief:

- Build an AI agent that goes from a **plain prompt** to a **signed document**.
- Foxit gives you an MCP server with ~35 tools for *reversible* PDF work: generate, convert, merge, compress, OCR, extract.
- Signing is **deliberately excluded** from that toolset. To send something for a real signature, the agent must call Foxit's separate **eSign API**, with its own credentials, and a real human must be the one who signs.
- The actual challenge isn't the PDF manipulation — it's **designing the handoff** between "agent finished its work" and "a human commits to something legally binding."

### Our proposed solution

**Contract Renewal & Amendment Guardian** — an AI agent that manages the *ongoing lifecycle* of a contract, not just a one-time "draft and sign" task:

1. You upload a signed contract PDF and give it a title.
2. On upload, the agent already reads the contract and extracts renewal-relevant fields (expiry date, auto-renewal, renewal period, notice period) into a dedicated tracking record so the **Notify** page can surface at-risk contracts at a glance.
3. When you want to renegotiate, you type a plain-language change request (e.g., *"Renew at $8,000 instead of $10,000"*, or a multi-part request like *"extend through end of 2027 and move to quarterly billing"*).
4. A LangGraph agent extracts the full commercial structure of the original contract — both vendor and client party names, agreement title, effective/expiry dates, fee, payment terms, renewal terms, termination terms, scope, and every other material clause (confidentiality, governing law, IP, etc.) with its original section number when present.
5. The agent drafts a **real-world commercial-style amendment as HTML** — with a title block, recitals (WHEREAS…WHEREAS…NOW, THEREFORE), one **separately numbered amendment section per requested change**, plus ratification / conflict / counterparts / signature blocks. Each section cites the exact section number and title being amended, and quotes the original value being replaced.
6. The agent shows you a structured **before/after diff** of exactly what's changing, plus a **rendered preview of the full amendment** which you can **edit in place** (Word-style, in a `contentEditable` editor) before signing.
7. Only after you click **Approve** does the agent convert the (possibly edited) HTML to a PDF via Foxit and call Foxit's separate eSign API to send the document to the real signer's email — so the signed PDF always matches the last version you saw.
8. If anything ever tries to trigger that final step twice for the same amendment, the agent **detects it and refuses to send a duplicate** — because Foxit's own docs warn that the signing endpoint is not safe to retry blindly.
9. When an approved amendment changes any of the renewal-tracking fields (expiry, auto-renewal, renewal period, notice period), the Notify record for that contract is updated automatically so the dashboard always reflects the current state.

### Why this design answers Foxit's actual question

Foxit's brief explicitly asks: *how do you decide where the human belongs, and how do you defend that boundary?* Our answer:

- **Everything reversible** (reading a contract, drafting a proposed change, generating a preview PDF) happens **without asking permission** — because none of it is binding yet, and blocking on a human for every small step would make the agent useless.
- **The one irreversible, legally-binding action** — sending a document out for a real signature — **always requires an explicit human click**, no exceptions.
- This boundary is enforced **architecturally**, not just as a suggestion: the code literally cannot reach the eSign API without passing through a pause point that only a human can release.

---

## Part 2: How the Application Works, Start to End

### The cast of "characters"

- **You (the business user)** — uploads contracts, types change requests, approves or rejects diffs.
- **The agent (LangGraph + Gemini)** — does the reading, drafting, and comparing.
- **Foxit PDF Services (via MCP)** — the toolbox for reversible document work.
- **Foxit eSign API** — the separate, human-gated system that actually sends something for signature.
- **The signer** — the real person (e.g., a vendor contact) who receives the email and signs.

### Step-by-step walkthrough

**1. Landing page / Login / Signup**
Unauthenticated visitors see a public landing page at `/` — *"It drafts. You decide. It's signed."* — with a Log in / Sign up button that takes them to the auth form (Supabase Auth handles email + password). Once signed in, every contract and amendment you create is tied to your user ID, and Row Level Security in the database guarantees you can only ever see your own data.

**2. Upload a contract**
On the dashboard, you upload a PDF and give it a title (e.g., "ABC Vendor Agreement"). The file goes into Supabase Storage; a row is created in the `contracts` table pointing at it; and Gemini extracts the renewal-relevant fields (expiry date, auto-renewal, renewal period, notice period) plus computes two derived dates (renewal-notice date and renewal date) into a new row in `contract_notifications`. If Gemini can't extract a field, it's stored as null and later shown as *Not Provided* on the Notify page — the agent never invents values.

**3. Dashboard**
Lists your contracts with a status badge. Header has a **Notify** button (renewals overview) and a **Log out** button. Click any contract to open it.

**4. Contract detail page**
Shows two primary actions:
- **Old amendments** (visible only if this contract already has amendments) — reveals a sub-panel with two tabs: *Approved / Rejected* (default) and *Pending approval*, each listing amendments newest-first. Clicking any row jumps into that amendment's diff-review screen.
- **+ New Amendment** — reveals the request form: **signer name**, **signer email**, and a **plain-language description** of the change (supports multi-part requests). Click **"Start review."**
- **Delete contract** — inline confirmation prompt ("Delete this contract and all its amendments?" → Yes, delete / Cancel). On confirm, the API route cascades deletion across signature_requests → agent_runs → amendments → storage file → contracts row, and the `contract_notifications` row goes automatically via `on delete cascade`.

**5. The agent runs (this is the real work, ~30–60 seconds)**
Behind the scenes, this kicks off a LangGraph agent with four steps in sequence:
   - **Extract terms** — the original PDF is uploaded to Foxit's PDF Services, converted to plain text (`pdf_to_text`), and Gemini pulls out a rich structured record: `agreementTitle`, `vendorName`, `clientName`, `effectiveDate`, `expiryDate`, `annualFee`, `paymentTerms`, `autoRenewal`, `renewalTerms`, `scopeOfServices`, `terminationTerms`, plus an `otherTerms` array of every additional material clause (confidentiality, governing law, IP, indemnity, etc.) — each with its original `sectionNumber` and `title` where the contract numbers its clauses.
   - **Draft amendment** — Gemini writes the formal amendment as **structured HTML sections** (`heading` + `paragraphs`), then the code renders those into a full commercial-style HTML template that includes a title block ("AMENDMENT NO. N TO [AGREEMENT TITLE]"), preamble with defined "Vendor" / "Client" terms, recitals, one **numbered amendment section per requested change**, plus effective-date, ratification, conflict, counterparts, and signature blocks. Section headings cite the exact section number and title (`"1. AMENDMENT TO SECTION 3 – TERM"`); each section chooses the right drafting form (amend-and-restate / replace-phrase / add / delete) based on what the request needs. No PDF is generated yet — the raw HTML is saved to `amendments.drafted_html`.
   - **Generate diff** — Gemini compares the extracted terms against the drafted HTML and outputs a clean, structured list of exactly what changed (clause, before value, after value).
   - **Pause for human approval** — the agent **stops itself here** — this is a deliberate, code-level pause (LangGraph's `interrupt()`), and the entire state of the run is saved to a Postgres-backed checkpointer so it can be resumed *at any point in the future*, even after a server restart.

**6. You land on the diff-review screen**
You see a clean before/after table (e.g., Annual Fee: $10,000 → $8,000). A collapsible **"View full amendment"** panel below the diff renders the full amendment inside a sandboxed iframe. Click **"Edit amendment"** to switch to a Word-style `contentEditable` editor — the amendment renders as a real formatted document you can click into and type directly, with Ctrl/Cmd+B / Ctrl/Cmd+I for basic formatting. **Save edits** persists the HTML back to `amendments.drafted_html` (blocked at the API layer if the amendment is no longer `pending_approval`). Two decision buttons: **Approve** or **Reject**.

**7. You click Approve**
This "wakes up" the exact paused agent run from step 5, right where it left off. The final node runs:
   - **Route to signers** — first, it checks the database for an existing `signature_requests` row tied to this amendment. If one exists, it stops immediately and does nothing further (this is the duplicate-prevention safeguard). If not, it reads the **current** `drafted_html` from the database (so any user edits win), writes it to a temp file, converts it to a PDF via Foxit's `pdf_from_html`, gets a public share link via `create_share_link`, and calls Foxit's `**createfolder**` eSign endpoint directly with the signer's name/email, dispatching immediately.
   - Foxit emails the signer a link to review and sign the document electronically.

**8. Statuses update everywhere**
The amendment's status flips to `sent_for_signature`, the signature request is logged in your database (including Foxit's real folder ID, so we can always check "did this already get sent?"), the contract's own status on your dashboard updates to reflect that it now has something pending signature, and — if the amendment changed any renewal-tracking fields — the `contract_notifications` row for that contract is refreshed with the new effective values (and the derived dates are recomputed).

**9. The Notify page reflects the change**
Navigate to `/dashboard/notify` and you see a card per contract in a 3-per-row grid, each showing Contract Title, Expiry Date, Auto Renewal, Renewal Period, Notice Period. Missing values display in italic *"Not Provided"*.

**10. The signer signs**
Outside of your app entirely — the signer clicks the emailed link, reviews the document in Foxit's own signing interface, and signs. This step is intentionally never automatable by the agent; it's the one place a human absolutely must act.

---

## Part 3: Codebase Explanation, File by File

### Root-level config

- **`middleware.ts`** (or `proxy.ts` in newer Next.js) — runs before every page request; checks if you're logged in via Supabase, and redirects to `/login` if not. This is what makes every page except login "protected" by default.
- **`.env.local`** — holds every secret: Supabase URL/keys, Gemini API key, Foxit Client ID/Secret, Foxit base URL, and the Postgres connection string used for agent state persistence.

### `lib/supabase/`

- **`client.ts`** — creates a Supabase client for use in the **browser** (client components like forms with `useState`).
- **`server.ts`** — creates a Supabase client for use **on the server** (API routes, server components); handles reading/writing auth cookies correctly for Next.js's App Router.

### `lib/agent/` — the LangGraph agent itself

- **`state.ts`** — defines the *shape* of data that flows through the entire agent run: contract ID, file path, requested change, signer name/email, extracted terms (rich structured record), drafted HTML text, drafted document ID (set at approval time), diff summary, approval decision, signature folder ID, and the amendment sequence number. Every node reads from and writes to this shared state.
- **`graph.ts`** — wires the actual agent together: defines the order of nodes (`extractTerms → draftAmendment → generateDiff → humanApproval → routeSigners`), the pause/resume logic at the approval step, and sets up the **Postgres-backed checkpointer** (`PostgresSaver`) — this is what lets a paused run survive a server restart, instead of vanishing if it only lived in memory.
- **`mcpClient.ts`** — creates a connection to Foxit's official MCP server (run via `npx`), giving the agent access to Foxit's PDF toolset.
- **`foxitHelpers.ts`** — a reusable helper (`runFoxitFileOperation`) that handles the repetitive "upload a file → run an operation → poll until it's done → get the result" pattern that almost every Foxit MCP tool follows, so individual nodes don't have to reimplement that logic.
- **`runAgent.ts`** — the entry point called by the API when you click "Start review." Downloads the contract from Storage, counts prior amendments on the contract to set the sequence number (so the drafted amendment can be titled "AMENDMENT NO. 3", etc.), creates the database rows (`amendments`, `agent_runs`), and kicks off the graph. Wraps `graph.invoke` in try/catch so a failure marks the agent run as `failed` instead of leaving it stuck in `running`.
- **`resumeAmendment.ts`** — the entry point called when you click Approve/Reject. Looks up the paused thread by ID and resumes the graph with your decision, updates the amendment / contract / agent run statuses, upserts a `signature_requests` row on approval, and — for approved changes — syncs the contract's `contract_notifications` row with the effective post-amendment values.

### `lib/agent/nodes/` — the individual steps of the agent

- **`extractTerms.ts`** — calls Foxit's `pdf_to_text` on the real contract, then asks Gemini to pull a rich structured record (vendor and client names, agreement title, effective/expiry dates, fee, payment terms, renewal terms, termination terms, scope of services, auto-renewal, and an `otherTerms` array of every other material clause with its `sectionNumber`, `title`, and `text`). Uses `.withStructuredOutput(schema)` so the output is always predictable JSON, never freeform prose.
- **`draftAmendment.ts`** — asks Gemini for the amendment as an array of `{heading, paragraphs}` sections (structured output, not free HTML — this is why the model can't "go rogue" and return markdown). The node then renders those sections into a full commercial-style HTML template with recitals, ratification, conflict, counterparts, and signature blocks. The template placeholders (party names, agreement title, dates, amendment number) are filled by TypeScript string interpolation so they're guaranteed correct. **No PDF is generated here** — the raw HTML is saved to state so it can be edited by the user and only converted to PDF at approval time.
- **`generateDiff.ts`** — asks Gemini to compare the original extracted terms against the drafted amendment text and output a clean, structured list of exactly what changed. Looks across both structured fields and the `otherTerms` array, cites clause titles from `otherTerms.title`, and handles the "no prior value" case with `"(not previously specified)"`.
- **`routeSigners.ts`** — the only node that touches Foxit's **eSign API** (separate from the MCP toolbox, on purpose). Before calling anything, it checks the database for an existing `signature_requests` row tied to this amendment — if one exists, it stops (duplicate-prevention). Otherwise, it reads the **current** `drafted_html` from the database (so any user edits win), converts it to a PDF via Foxit's `pdf_from_html`, generates a temporary public share link via `create_share_link`, and calls Foxit's `createfolder` endpoint directly with the signer's name/email.

*(The "pause for human approval" step itself lives inline inside `graph.ts` as a small function using LangGraph's `interrupt()` — it doesn't need its own file since it's just a few lines that halt execution and wait.)*

### `lib/notifications/` — renewal-tracking helpers

- **`extractNotificationData.ts`** — runs Foxit `pdf_to_text` + Gemini structured extraction for the four Notify fields (expiry date, auto-renewal, renewal period, notice period). Enforces normalized numeric form for periods (`"1 year"`, `"30 days"` — never `"one-year"` or `"thirty (30) days"`). Returns null for anything the contract does not state — never invents values.
- **`computeDates.ts`** — parses period strings into days (`"30 days"` → 30; `"6 weeks"` → 42; `"1 year"` → 365) and computes `renewalNoticeDate = expiry - notice` and `renewalDate = expiry + 1 day`. Returns null if inputs are missing.
- **`updateFromAmendment.ts`** — asks Gemini for the effective post-amendment values of the four Notify fields, given the current row and the drafted amendment HTML. Explicit rule: *"if the amendment does not mention a field, return the current value unchanged."*

### `app/` — the Next.js pages and API routes

- **`app/page.tsx`** — public landing page (`"It drafts. You decide. It's signed."`). Redirects authenticated users straight to the dashboard.
- **`app/login/page.tsx`** — sign up / log in form (email + password, tabs).
- **`app/dashboard/page.tsx`** — lists all your contracts with a status badge; upload form for new contracts. Header has **Notify** and **Log out** buttons.
- **`app/dashboard/LogoutButton.tsx`** — small client component that POSTs to the logout API and returns the user to the landing page. Reused across dashboard pages.
- **`app/dashboard/contracts/[id]/page.tsx`** + **`ContractDetail.tsx`** + **`RequestChangeForm.tsx`** — the contract detail screen with the two-toggle UI: **Old amendments** (with Approved/Rejected and Pending Approval sub-tabs) and **+ New Amendment** (opens the request form inline). Also hosts the **Delete contract** button with inline confirmation.
- **`app/dashboard/amendments/[id]/page.tsx`** + **`ApprovalPanel.tsx`** — the diff-review screen: structured before/after table, plus a collapsible "View full amendment" panel with a sandboxed iframe preview and a Word-style `contentEditable` editor for direct edits before Approve.
- **`app/dashboard/notify/page.tsx`** — the Notify page. Server component; renders one card per contract (3-per-row grid) showing the Notify fields; missing values render as italic *"Not Provided"*.
- **`app/api/contracts/upload/route.ts`** — handles the file upload, saving it to Storage, creating the `contracts` row, running the initial Notify extraction, and inserting the `contract_notifications` row. Notify extraction failures don't fail the upload — a row is still written with nulls so every contract has a card.
- **`app/api/contracts/[id]/route.ts`** — the DELETE endpoint. Manually cascades `signature_requests` → `agent_runs` → `amendments` → storage file → the `contracts` row itself. (The `contract_notifications` row goes automatically via `on delete cascade`.)
- **`app/api/contracts/[id]/amend/route.ts`** — the API endpoint that triggers `runAgent.ts` when you click "Start review."
- **`app/api/amendments/[id]/decision/route.ts`** — the API endpoint that triggers `resumeAmendment.ts` when you click Approve/Reject.
- **`app/api/amendments/[id]/route.ts`** — PATCH endpoint that saves user edits to the amendment's HTML. Rejects the update with a 409 if the amendment is no longer `pending_approval`.
- **`app/api/auth/logout/route.ts`** — POST endpoint that calls `supabase.auth.signOut()` to clear the session cookies.

### Supabase (the database)

Five tables work together:
- **`contracts`** — one row per uploaded contract; tracks its overall status (active, amendment pending, pending signature, etc.).
- **`amendments`** — one row per requested change; tracks the diff (`diff_summary`), the raw editable HTML draft (`drafted_html`), the Foxit document ID once the PDF is generated at approval (`drafted_file_url`), and its own lifecycle status (drafted → pending_approval → sent_for_signature / rejected).
- **`agent_runs`** — maps each amendment to its LangGraph `thread_id`, so a paused run can be found and resumed later.
- **`signature_requests`** — records the real Foxit eSign folder ID once a document is actually sent, which is exactly what the duplicate-prevention check reads from.
- **`contract_notifications`** — one row per contract with the four Notify fields plus the two computed dates. Cascades on contract delete.

Every table has **Row Level Security** policies so you only ever see data tied to your own account, and the private Storage bucket has matching policies so you can only upload/view files inside your own folder. LangGraph also auto-creates its own `checkpoints` / `checkpoint_writes` tables the first time the graph runs — those persist every paused agent run so approvals survive a server restart.

---

## The one-sentence version, for when someone asks

*"It's an AI agent that reads your signed contracts, drafts renegotiated amendments from a plain-language request, shows you exactly what's changing before anything is final, and only sends the document out for a real e-signature after you've explicitly approved it — with built-in protection against ever accidentally sending the same signature request twice."*
