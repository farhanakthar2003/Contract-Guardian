# Supabase Setup Reference — Contract Guardian

Every piece of SQL run in the Supabase SQL Editor across the whole build, in the order we ran it, with comments on what and why. Followed by the final database structure.

---

## 1. Core schema (Phase 1)

```sql
-- Contracts you're tracking.
-- One row per uploaded contract PDF, plus the structured terms we extracted from it.
create table contracts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,   -- who uploaded it (ties to Supabase Auth)
  title text not null,
  original_file_url text,          -- path to the PDF inside Supabase Storage (not a public URL)
  extracted_terms jsonb,           -- structured output from Foxit extraction + Gemini (party, fee, expiry, etc.)
  expiry_date date,
  auto_renewal boolean default false,
  status text default 'active' check (status in ('active', 'expiring_soon', 'expired', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Proposed changes to a contract.
-- One row per "request an amendment" attempt.
create table amendments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references contracts(id) not null,
  owner_id uuid references auth.users(id) not null,
  requested_change text not null,      -- the plain-language prompt the user typed
  diff_summary jsonb,                  -- structured before/after clause list, from Gemini
  drafted_file_url text,               -- Foxit document ID for the drafted amendment PDF
  status text default 'drafted' check (status in ('drafted', 'pending_approval', 'approved', 'rejected', 'sent_for_signature', 'signed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- LangGraph run tracking.
-- Maps an amendment to its LangGraph thread_id, so a paused agent run can be found and resumed.
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  amendment_id uuid references amendments(id) not null,
  thread_id text not null,
  status text default 'running' check (status in ('running', 'paused_for_approval', 'completed', 'failed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Signature request tracking.
-- Records the real Foxit eSign folder ID once a document is actually sent —
-- this is what the duplicate-send guard in routeSigners.ts checks against.
create table signature_requests (
  id uuid primary key default gen_random_uuid(),
  amendment_id uuid references amendments(id) not null,
  foxit_esign_folder_id text,
  status text default 'pending' check (status in ('pending', 'sent', 'signed', 'failed')),
  sent_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz default now()
);
```

## 2. Row Level Security — turn it on (Phase 1)

```sql
-- Enabling RLS means: by default, NOBODY can read/write these tables
-- until an explicit policy says otherwise. This is what makes "users only
-- see their own data" possible.
alter table contracts enable row level security;
alter table amendments enable row level security;
alter table agent_runs enable row level security;
alter table signature_requests enable row level security;
```

## 3. RLS policies for `contracts` and `amendments` (Phase 1)

```sql
-- A user can only see/edit/delete rows where they are the owner.
-- auth.uid() = the currently logged-in user's ID, provided automatically by Supabase Auth.
create policy "Users manage their own contracts" on contracts
  for all using (auth.uid() = owner_id);

create policy "Users manage their own amendments" on amendments
  for all using (auth.uid() = owner_id);
```

## 4. Storage bucket policies (added after the first upload 500 error)

```sql
-- contracts.storage bucket is private by default — RLS-enabled Storage
-- blocks ALL uploads until a policy explicitly allows them.
-- Files are stored at path: {user_id}/{filename}, so we check that the
-- first folder segment in the file path matches the logged-in user.

create policy "Users can upload their own contracts"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'contracts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can view their own contracts"
on storage.objects for select
to authenticated
using (
  bucket_id = 'contracts'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

## 5. RLS policies for `agent_runs` and `signature_requests` (added after the "Agent run not found" bug)

```sql
-- These two tables don't have their own owner_id column, so ownership is
-- checked indirectly: "does an amendment I own link to this row?"
-- (This was the missing piece that caused the very first resume attempt
-- to fail with "Agent run not found" — RLS was ON but had zero policies,
-- so every insert/select was silently blocked.)

create policy "Users manage their own agent runs" on agent_runs
  for all using (
    exists (
      select 1 from amendments
      where amendments.id = agent_runs.amendment_id
      and amendments.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from amendments
      where amendments.id = agent_runs.amendment_id
      and amendments.owner_id = auth.uid()
    )
  );

create policy "Users manage their own signature requests" on signature_requests
  for all using (
    exists (
      select 1 from amendments
      where amendments.id = signature_requests.amendment_id
      and amendments.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from amendments
      where amendments.id = signature_requests.amendment_id
      and amendments.owner_id = auth.uid()
    )
  );
```

## 6. Widening the `contracts` status constraint (for status-sync polish step)

```sql
-- The original check constraint only allowed 4 values. Once we started
-- syncing contract status to the amendment lifecycle, we needed two more:
-- 'amendment_pending' (agent is drafting/diffing) and 'pending_signature'
-- (sent to Foxit eSign, waiting on the real signer).

alter table contracts drop constraint contracts_status_check;
alter table contracts add constraint contracts_status_check
  check (status in ('active', 'expiring_soon', 'expired', 'archived', 'amendment_pending', 'pending_signature'));
```

## 7. `drafted_html` column on `amendments` (editable amendment + deferred PDF)

```sql
-- We moved Foxit PDF generation out of the drafting step and into the approval step
-- (routeSigners.ts). This means the PDF that ends up signed is always generated from
-- whatever HTML is currently in the database — including any edits the user made in
-- the WYSIWYG editor on the diff-review page. This column stores that raw HTML draft.
alter table amendments add column drafted_html text;
```

## 8. `contract_notifications` table (renewal-tracking / Notify page)

```sql
-- One row per contract, created on upload. Gemini extracts renewal-relevant fields
-- from the PDF (expiry, auto-renewal, renewal period, notice period) and we compute
-- two derived dates from them:
--   renewal_notice_date = expiry_date - notice_period
--   renewal_date        = expiry_date + 1 day
-- On amendment approval, Gemini is asked to return the updated post-amendment values
-- for these fields (leaving anything the amendment doesn't touch unchanged), and the
-- row is updated. This powers the /dashboard/notify page.
create table contract_notifications (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references contracts(id) on delete cascade unique not null,
  owner_id uuid references auth.users(id) not null,
  contract_title text,
  expiry_date date,
  auto_renewal boolean,
  renewal_period text,
  notice_period text,
  renewal_notice_date date,
  renewal_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table contract_notifications enable row level security;

create policy "Users manage their own contract notifications" on contract_notifications
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
```

Note: this is the only table where the FK to `contracts` uses `on delete cascade` —
deleting a contract automatically deletes its notification row. The other tables
(`amendments`, `agent_runs`, `signature_requests`) still have no cascade, so the
DELETE-contract API route in `app/api/contracts/[id]/route.ts` cleans those up
manually in the right order (signature_requests → agent_runs → amendments → storage
file → contracts row).

## Note: tables we did NOT create manually

When we swapped `MemorySaver` for `PostgresSaver`, LangGraph's `checkpointer.setup()` call **automatically creates its own tables** (`checkpoints`, `checkpoint_writes`, and related ones) the first time it runs. We never wrote SQL for these — they're managed entirely by the `@langchain/langgraph-checkpoint-postgres` package internally, and you shouldn't hand-edit them.

---

# Database Structure — Final State

### `contracts`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | auto-generated |
| `owner_id` | uuid, FK → `auth.users` | who uploaded it |
| `title` | text | e.g. "ABC Vendor Agreement" |
| `original_file_url` | text | path inside Storage bucket |
| `extracted_terms` | jsonb | party, fee, expiry, auto-renewal — from the agent |
| `expiry_date` | date | |
| `auto_renewal` | boolean | |
| `status` | text | `active` \| `expiring_soon` \| `expired` \| `archived` \| `amendment_pending` \| `pending_signature` |
| `created_at` / `updated_at` | timestamptz | |

### `amendments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `contract_id` | uuid, FK → `contracts` | |
| `owner_id` | uuid, FK → `auth.users` | |
| `requested_change` | text | the user's plain-language prompt |
| `diff_summary` | jsonb | array of `{clause, before, after}` |
| `drafted_html` | text | raw HTML draft — user-editable, source of truth for the final PDF |
| `drafted_file_url` | text | Foxit document ID for the drafted PDF (populated at approval time) |
| `status` | text | `drafted` \| `pending_approval` \| `approved` \| `rejected` \| `sent_for_signature` \| `signed` |
| `created_at` / `updated_at` | timestamptz | |

### `agent_runs`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `amendment_id` | uuid, FK → `amendments` | |
| `thread_id` | text | LangGraph's identifier for this paused/running graph |
| `status` | text | `running` \| `paused_for_approval` \| `completed` \| `failed` |
| `created_at` / `updated_at` | timestamptz | |

### `signature_requests`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `amendment_id` | uuid, FK → `amendments` | |
| `foxit_esign_folder_id` | text | real Foxit folder ID — the idempotency check key |
| `status` | text | `pending` \| `sent` \| `signed` \| `failed` |
| `sent_at` / `signed_at` | timestamptz | |
| `created_at` | timestamptz | |

### `contract_notifications`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `contract_id` | uuid, FK → `contracts` (**on delete cascade**), unique | one row per contract |
| `owner_id` | uuid, FK → `auth.users` | |
| `contract_title` | text | the title the user typed at upload time |
| `expiry_date` | date | Gemini-extracted (or null) |
| `auto_renewal` | boolean | Gemini-extracted (or null) |
| `renewal_period` | text | normalized numeric form, e.g. `"1 year"` |
| `notice_period` | text | normalized numeric form, e.g. `"30 days"` |
| `renewal_notice_date` | date | computed: `expiry_date - notice_period` |
| `renewal_date` | date | computed: `expiry_date + 1 day` |
| `created_at` / `updated_at` | timestamptz | |

### Relationships at a glance
```
contracts (1) ──< (many) amendments
contracts (1) ──< (1)   contract_notifications   [cascade on contract delete]
amendments (1) ──< (1)  agent_runs               [one active run per amendment]
amendments (1) ──< (1)  signature_requests       [one signature request per amendment]
```

### Supabase Storage
- **Bucket**: `contracts` (private)
- **Path convention**: `{user_id}/{timestamp}-{filename}.pdf`
- Access controlled entirely by the two storage policies in section 4 above — no public URLs.

### Auto-managed (not part of your schema, created by LangGraph)
- `checkpoints`, `checkpoint_writes`, and related tables — store every paused agent run's full state, keyed by `thread_id`. This is what lets an approval survive a server restart.
