# Contract Guardian

> **It drafts. You decide. It's signed.**
> An AI agent that reads your signed contracts, drafts renegotiated amendments from a plain-language request, shows you exactly what's changing before anything is final, and only sends the document out for a real e-signature after you've explicitly approved it — with built-in protection against ever accidentally sending the same signature request twice.

Built for the **Foxit "Your Agent Shouldn't Sign That"** hackathon track.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
  - [1. Clone & install](#1-clone--install)
  - [2. Environment variables](#2-environment-variables)
  - [3. Supabase setup](#3-supabase-setup)
  - [4. Run](#4-run)
- [How the app works](#how-the-app-works)
- [Project structure](#project-structure)
- [Key routes & APIs](#key-routes--apis)
- [Deployment](#deployment)
- [More docs](#more-docs)

---

## Features

- **Contract intake** — upload a PDF, and Gemini extracts renewal-relevant fields (expiry, auto-renewal, renewal period, notice period) into a dedicated **Notify** view so at-risk contracts surface immediately.
- **Plain-prompt amendments** — describe your desired change in a sentence ("Renew at $8,000 and extend through 2027, move to quarterly billing") and the agent produces a **real commercial-style amendment** — recitals, numbered sections, ratification, conflict, counterparts, signature blocks — one section per requested change.
- **Structured diff** — before/after preview of every changed clause, rendered vertically so long values don't get truncated.
- **Editable preview** — Word-style `contentEditable` editor lets you polish the amendment in place before it's ever converted to a PDF.
- **Human-gated signing** — the eSign API is only reachable through an explicit **Approve** click, and only after that click is the PDF generated fresh from the (possibly edited) HTML.
- **Idempotent handoff** — every signature request is logged; the agent refuses to fire a second one for the same amendment even if approved twice.
- **Durable state** — LangGraph's Postgres checkpointer means an amendment paused for review survives a server restart.
- **Contract lifecycle** — old amendments (approved / rejected / pending) are tracked per contract; deleting a contract cascades cleanly.
- **Auth + RLS** — Supabase Auth + Row Level Security means every user only ever sees their own data.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Server + Client Components) |
| UI | **shadcn/ui** (Base UI primitives) + Tailwind CSS v4 + Lucide icons |
| Auth / DB / Storage | **Supabase** (Postgres, Auth, Storage) with RLS |
| Agent orchestration | **LangGraph 1.x** with `PostgresSaver` checkpointer |
| LLM | **Google Gemini** via `@langchain/google-genai` |
| PDF tooling | **Foxit PDF Services** via the official MCP server (`@foxitsoftware/foxit-pdf-api-mcp-server`) |
| Signing | **Foxit eSign REST API** (called directly — never routed through the MCP toolset) |
| Forms | React Hook Form + Zod validation |
| Toasts | Sonner |

---

## Getting started

### 1. Clone & install

```bash
git clone https://github.com/YOUR-USERNAME/contract-guardian.git
cd contract-guardian
npm install
```

Node **≥ 20** is required (Node 24 is what this repo was built on).

### 2. Environment variables

```bash
cp .env.example .env.local
```

Then fill in `.env.local` with real values. See [.env.example](./.env.example) for every key, grouped by service (Supabase, Google Gemini, Foxit MCP, Foxit eSign) with a comment describing what each one is and where to get it.

### 3. Supabase setup

Create a new Supabase project, then run each SQL block in [supabase-setup-reference.md](./supabase-setup-reference.md) in the Supabase SQL Editor **in the order they appear** (tables → RLS → policies → storage bucket → later ALTERs). You also need to create a **private Storage bucket named `contracts`** in the Supabase dashboard before running the storage policies.

The first time the LangGraph agent runs, `PostgresSaver.setup()` auto-creates its own `checkpoints` / `checkpoint_writes` tables in the same database — you don't need to write SQL for those.

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000> — the landing page appears; sign up → dashboard → upload a PDF → request an amendment.

---

## How the app works

```
Landing (/)
  ↓ sign up
Dashboard (/dashboard)
  ↓ upload PDF
  contract row + Gemini extracts renewal fields  ─▶  Notify (/dashboard/notify)
  ↓ open a contract
Contract detail (/dashboard/contracts/[id])
  ↓ + New Amendment  →  LangGraph agent runs:
      1. extractTerms     Foxit pdf_to_text  +  Gemini structured extraction
      2. draftAmendment   Gemini → structured HTML sections → rendered into legal template
      3. generateDiff     Gemini → { clause, before, after }[]
      4. humanApproval    interrupt() — graph pauses, state checkpointed to Postgres
      ↓ redirect
Amendment review (/dashboard/amendments/[id])
  Diff summary + View full amendment (iframe preview / WYSIWYG editor)
  ↓ Approve
      5. routeSigners     read LATEST drafted_html → Foxit pdf_from_html → create_share_link
                          → POST /esign/api/v1/folders/createfolder → email sent
                          → signature_requests row logged (idempotency guard)
```

For a longer walkthrough with the reasoning behind each decision, see [contract-guardian-explainer.md](./contract-guardian-explainer.md).

---

## Project structure

```
app/
  page.tsx                       Landing page (public)
  login/page.tsx                 Sign up / log in
  dashboard/
    page.tsx                     Contracts list + upload
    UploadContractCard.tsx       Upload form (RHF + Zod)
    contracts/[id]/              Contract detail (Old / New amendment / Delete)
    amendments/[id]/             Diff review + approve/reject
    notify/                      Renewals overview
  api/
    contracts/upload             POST — file upload + notify extraction
    contracts/[id]               DELETE — cascade delete
    contracts/[id]/amend         POST — kicks off the agent
    amendments/[id]              PATCH — save edits to drafted_html
    amendments/[id]/decision     POST — resume graph with approve/reject
    auth/logout                  POST — Supabase sign out
components/
  app-header.tsx                 Shared header (logo, Notify, avatar dropdown)
  ui/                            shadcn primitives
lib/
  supabase/{client,server}.ts    Supabase browser / server clients
  agent/                         LangGraph state, graph, entry points
    nodes/                       extractTerms, draftAmendment, generateDiff, routeSigners
  notifications/                 Renewal-tracking helpers
proxy.ts                         Auth middleware (redirects unauth'd users to /login)
```

---

## Key routes & APIs

### Pages

| Path | Purpose |
|---|---|
| `/` | Landing (redirects authed users to `/dashboard`) |
| `/login` | Sign up / log in (`?mode=signup` deep-links the tab) |
| `/dashboard` | Contracts list + upload |
| `/dashboard/contracts/[id]` | Contract detail (old amendments, new amendment, delete) |
| `/dashboard/amendments/[id]` | Diff review + approve/reject |
| `/dashboard/notify` | Renewal-relevant fields per contract |

### API

| Method | Path | Description |
|---|---|---|
| POST | `/api/contracts/upload` | Upload PDF → Storage + contracts row + notify extraction |
| DELETE | `/api/contracts/[id]` | Cascade delete signature_requests → agent_runs → amendments → file → contracts |
| POST | `/api/contracts/[id]/amend` | Start the LangGraph run for a new amendment |
| PATCH | `/api/amendments/[id]` | Save user edits to `drafted_html` (only while `pending_approval`) |
| POST | `/api/amendments/[id]/decision` | Resume graph with `approved` or `rejected` |
| POST | `/api/auth/logout` | Supabase sign out |

---

## Deployment

Deploying to **Vercel** is the shortest path:

1. Push this repo to GitHub.
2. Import it in the Vercel dashboard.
3. Add every variable from `.env.example` to the project's **Environment Variables**.
4. Ship it.

Notes when deploying:

- The upload and amend routes carry a `maxDuration = 60` for the Foxit + Gemini round-trips. Vercel's Hobby plan enforces stricter limits — Pro or higher is safer for the ~30–60 s agent runs.
- `SUPABASE_DB_URL` must be reachable from Vercel's serverless region.
- Make sure the Foxit MCP server's `npx` entry can install on cold start; if that becomes flaky, host the agent flow behind a longer-lived runtime.

---

## More docs

- [contract-guardian-explainer.md](./contract-guardian-explainer.md) — deep dive on problem, walkthrough, and every file
- [supabase-setup-reference.md](./supabase-setup-reference.md) — every SQL statement in the order it was run + the final schema
- [.env.example](./.env.example) — every secret the app reads, with descriptions

Made for the Foxit Software hackathon — **"Your Agent Shouldn't Sign That."**
