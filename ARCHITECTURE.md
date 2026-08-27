# Architecture — Agentic AI demo

## In one paragraph

This is a **research agent** you can talk to. You ask a question; instead of answering
from memory, the system reasons in steps, decides which tool it needs, runs it, reads the
result, and repeats until it can answer. Every one of those steps is streamed live to the
chat window and permanently recorded, so a second app — an admin console — can replay any
past conversation step by step, see which tools were used, edit the knowledge base the
agent searches, and turn individual tools on or off. Four pieces make that work: a **chat
frontend**, an **admin panel**, a **Supabase (Postgres) database**, and an **LLM** doing
the reasoning.

```
                                                     ┌─ LLM provider (Gemini / mock)
  Next.js chat  ──── SSE stream ────┐                │
                                    ├─►  Agent backend  ──┼─ Tools (web_search, calculator, current_time)
  Angular admin ──── REST + key ────┘   (Node + Express)  │
                                                          └─ Supabase: Postgres + Storage
                                                             (or local JSON file)
```

Four packages in one npm workspace:

| Package | Stack | Port | Role |
|---|---|---|---|
| `packages/agent-backend` | Node 20, TypeScript, Express | 4000 | Agent loop, LLM calls, tools, REST + SSE API, storage |
| `packages/web-frontend` | Next.js 14 (App Router), React 18 | 3000 | Public chat UI, streams the agent's trace |
| `packages/admin-panel` | Angular 18 standalone, CKEditor 5 | 4700 | Dashboard, run history, knowledge base, tool toggles |
| *(inside agent-backend)* | Supabase / Postgres | — | `runs`, `corpus`, `tool_config` tables + Storage bucket |

---

## 1. The LLM layer — how the agent thinks

### The pattern: ReAct

The agent uses **ReAct** (reason + act). The model is never asked to "answer the
question." It is asked to return exactly one JSON object per turn, which is either a tool
call or a final answer:

```json
{ "thought": "why I'm doing this", "tool": "web_search", "args": { "query": "agentic ai" } }
{ "thought": "why I'm done", "final": "the complete answer" }
```

The backend parses that JSON, executes the requested tool, appends the tool's output to
the conversation as an *observation*, and asks the model again. The loop runs at most
**8 iterations** (`MAX_ITERATIONS` in `src/agent/loop.ts`) before it gives up with a
"reached the step limit" answer.

Every turn produces one or more typed **steps** — `thought`, `tool_call`, `observation`,
`final`, or `error` — which are pushed onto the run object *and* emitted to the caller via
callback. That single stream of steps is what both frontends render.

### Provider abstraction

`src/agent/llm.ts` defines a one-method interface: given a system prompt and messages,
return text. Two implementations ship:

- **Gemini** — calls `generativelanguage.googleapis.com` directly (no SDK). Configured
  with `GEMINI_API_KEY` and `GEMINI_MODEL`, temperature `0.2`, and
  `responseMimeType: application/json` to push the model toward clean JSON.
- **Mock** — a deterministic fake that searches, does arithmetic if the query contains a
  math expression, then answers. Enough to exercise the full loop offline with no API key.

Switch with `LLM_PROVIDER=gemini|mock`. Swapping in OpenAI or Anthropic means adding one
class here; nothing else changes.

Because models drift off-format, the loop is defensive: `parseModelJson()` tolerates code
fences and stray prose by extracting the outermost `{...}`, and if parsing still fails it
records an `error` step, tells the model "that wasn't valid JSON," and retries within the
same iteration budget.

### Tools

Defined in `src/agent/tools.ts`. Each tool is a name, a description, an args hint (both
injected into the system prompt), and an async `run()`:

| Tool | What it does |
|---|---|
| `web_search` | Keyword-scores the query against the admin-managed corpus in Postgres and returns the top 3 snippets. This is the retrieval path — the "knowledge base," not the internet. |
| `calculator` | Arithmetic via a hand-written recursive-descent parser supporting `+ - * / ( )`. Deliberately **not** `eval()`, because the model's output is untrusted input. |
| `current_time` | Current UTC time in ISO 8601. |

Before each run the loop calls `getEnabledTools()`, which reads the `tool_config` table.
Disabled tools are omitted from the system prompt *and* rejected at execution time if the
model asks for one anyway — belt and braces. If the table is empty, all tools are allowed.

When `web_search` runs, the loop separately records the matched corpus documents on
`run.sources`, so the chat UI can display the source documents (with their images and
formatting) beside the text answer.

---

## 2. The chat frontend (`packages/web-frontend`)

A single-page Next.js App Router client component (`app/page.tsx`, ~170 lines). No auth —
it's the public face of the demo.

**How streaming works.** The browser opens an `EventSource` against
`GET /api/run?query=…`. The backend responds with `text/event-stream` and pushes named
events as the agent works:

| Event | Payload | UI effect |
|---|---|---|
| `run_started` | `{ id }` | *emitted but not consumed — no listener in `page.tsx`* |
| `step` | one `AgentStep` | appends a card to the trace (or sets the answer if `kind: "final"`) |
| `run_finished` | `{ id, status, answer, durationMs, sources }` | shows the footer metadata and source documents (the `answer` field is unused — the answer arrives via the `final` step) |
| `error` | `{ message }` | shows an error card. Note: the handler ignores the payload and always shows a hardcoded "connection failed" message, and the same handler fires for ordinary `EventSource` transport errors |

SSE rather than WebSockets: the traffic is one-directional (server → client), it's plain
HTTP so no proxy tuning is needed, and `EventSource` reconnects on its own.

Steps are styled by kind so you can watch thinking, tool calls, and observations arrive in
real time. Observations and the final answer render through `react-markdown` + `remark-gfm`,
since tool output and model answers both contain markdown. Three sample queries are
pre-wired for demos. Backend location comes from `NEXT_PUBLIC_AGENT_API`.

---

## 3. The admin panel (`packages/admin-panel`)

Angular 18 with standalone components — no `NgModule`s. Four guarded routes plus a login
screen.

| Route | Component | What's there |
|---|---|---|
| `/login` | `LoginComponent` | Enter the admin key; verified against `GET /api/admin/verify` |
| `/` | `DashboardComponent` | Totals, success rate, avg steps, avg duration, tool-usage breakdown, runs-per-day for 7 days, 5 most recent queries |
| `/runs` | `RunsListComponent` | All runs with status filter, text search, a live auto-refresh toggle, and per-row re-run / delete |
| `/runs/:id` | `RunDetailComponent` | Full step-by-step trace of one run; delete or re-run it |
| `/corpus` | `CorpusComponent` | Knowledge-base editor **and** tool on/off switches |

**Auth.** A shared-secret model, not user accounts. `AuthService` keeps the key in
`localStorage`; `adminKeyInterceptor` attaches it as an `x-admin-key` header on every
request to the backend and, on any `401`, clears the key and bounces to `/login`.
`authGuard` blocks routes when no key is stored. On the server side `requireAdmin`
gates every admin endpoint — and logs a loud warning at boot if `ADMIN_KEY` is unset,
because unset means **open**.

**The knowledge-base editor** is the most involved screen. CKEditor 5 provides rich
authoring (headings, lists, tables, links, images, paste-from-Word). Two supporting
mechanisms:

- *Ingest.* Upload a PDF, text file, or image to `POST /api/corpus/extract`; the backend
  extracts plain text (`pdf-parse` for PDFs, direct read for text, opt-in `tesseract.js`
  OCR for images) and drops it into the editor to clean up.
- *Images.* A custom CKEditor upload adapter (`image-upload-adapter.ts`) POSTs pasted or
  inserted images to `/api/uploads`, which stores them in Supabase Storage and returns a
  public URL. The URL goes into the document — not a base64 blob, which would bloat every
  row.

**The HTML/plain-text split** matters: the editor saves rich HTML to `content_html`, and
the backend derives a plain-text `snippet` from it via `stripHtml()` (which converts block
boundaries to newlines so paragraphs and list items don't run together). Search runs over
the plain text; display uses the HTML. Authors get formatting, the agent gets clean text,
and neither is compromised.

**Tool toggles** on the same page write to `PUT /api/tools/:name`, which is what the agent
loop reads on its next run. Flip `calculator` off and the next run genuinely cannot use it.

---

## 4. Supabase — storage and persistence

Selected with `DB_DRIVER=supabase`. Accessed through `@supabase/supabase-js` with the
**service-role key**, which lives server-side only and never reaches a browser.

### Tables

**`runs`** — one row per agent conversation.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | generated by the backend |
| `query` | `text` | the user's question |
| `status` | `text` | `running` / `completed` / `failed` |
| `steps` | `jsonb` | the entire trace, default `[]` |
| `answer` | `text` | final answer |
| `provider`, `model` | `text` | which LLM produced it |
| `created_at`, `finished_at` | `timestamptz` | |
| `duration_ms` | `integer` | |

Index: `runs_created_at_idx (created_at desc)` — the admin list is always newest-first.
Storing the whole trace as `jsonb` in one row is the deliberate trade: reads are one query
and the step shape can evolve without a migration; the cost is you can't easily query
*inside* steps in SQL, which is why `getStats()` aggregates in application code instead.

**`corpus`** — the `web_search` knowledge base: `id`, `title`, `snippet` (searchable plain
text), `content_html` (rich body), `tags text[]`, `enabled`, `created_at`. Seeded with five
starter documents that originally lived hardcoded in `tools.ts`.

**`tool_config`** — `name` (PK), `enabled`, `description`. Seeded with the three tools.

**Storage** — a public bucket (default `corpus-assets`) holding editor images under
`images/{uuid}-{safe-filename}`, created in the Supabase dashboard rather than SQL, since
inserting into `storage.buckets` is permission-restricted over the pooler connection.

### Row Level Security

RLS is **enabled on all three tables with no policies**. That's intentional: the
service-role key bypasses RLS entirely, so the backend works, while the public `anon` key
can read and write nothing. If you ever expose these tables to a browser client, that's
where you'd add explicit policies.

### Migrations

`supabase/migrations/*.sql`, applied by `npm run db:push` (`scripts/db-push.ts`) — a small
runner that connects with `pg` using `DATABASE_URL`, applies pending files in filename
order, and tracks what's been applied in a `schema_migrations` table. Four migrations so
far: create `runs`; add `corpus` + `tool_config` with seed data; add `content_html`; a
no-op placeholder for the storage bucket. `supabase/schema.sql` is a standalone copy of
the runs table for pasting into the dashboard SQL editor. `supabase/config.toml` supports
`supabase start` for a fully local stack.

### The escape hatch

The database sits behind a `StoreDriver` interface (`src/store/driver.ts`) with 12 methods
covering runs, corpus, tools, and asset storage. `SupabaseDriver` implements it against
Postgres; `JsonDriver` implements the same interface against a single local JSON file,
seeding the same corpus and tools on first run and writing uploads to `./data/uploads`
served over `/uploads`. Set `DB_DRIVER=json` and the entire system — including the admin
panel — runs with no database, no keys, and no network. That's the demo mode: pair it with
`LLM_PROVIDER=mock` and the whole stack works fully offline.

Everything above the driver (`runs.ts`, `corpus.ts`, `tool-config.ts`, `stats.ts`) is
storage-agnostic. Adding a third backend means one new class.

---

## 5. End-to-end: one request

1. User types a question in the Next.js chat and hits Run.
2. Browser opens an SSE connection to `GET /api/run?query=…`.
3. Backend inserts a `running` row into `runs` and emits `run_started`.
4. Loop reads `tool_config`, builds a system prompt listing only enabled tools.
5. Model returns JSON. A `thought` step is emitted and appears in the browser immediately.
6. The JSON names `web_search`. A `tool_call` step is emitted; the tool keyword-scores the
   query against enabled `corpus` rows and returns the top 3 snippets.
7. An `observation` step is emitted; matched documents are recorded as `run.sources`.
8. The observation is appended to the message history; back to step 5. Repeat up to 8 times.
9. Model returns `final`. Status becomes `completed`, duration is computed.
10. Backend upserts the complete run — steps and all — into `runs` and emits `run_finished`
    with the answer and sources.
11. Later, the admin panel `GET /api/runs/:id` and replays the whole trace.

---

## 6. API surface

Everything except `/health`, `/api/run`, and the static `/uploads/*` mount requires
`x-admin-key`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness + active LLM provider |
| `GET` | `/api/run?query=` | **SSE** — run the agent, stream steps (open, no auth) |
| `GET` | `/api/admin/verify` | Validate an admin key without exposing data |
| `GET` | `/api/runs?status=&q=&limit=` | List runs, filtered |
| `GET` | `/api/runs/:id` | One run with its full trace |
| `DELETE` | `/api/runs/:id` | Delete a run |
| `POST` | `/api/runs/:id/rerun` | Re-run a past query synchronously |
| `GET` | `/api/stats` | Dashboard aggregates |
| `GET` | `/api/corpus` | List all corpus documents |
| `POST` | `/api/corpus` | Create a document |
| `PUT` | `/api/corpus/:id` | Update a document |
| `DELETE` | `/api/corpus/:id` | Delete a document |
| `POST` | `/api/corpus/extract` | Multipart upload → extracted plain text |
| `POST` | `/api/uploads` | Multipart image upload → public URL |
| `GET` | `/api/tools` | List tools with enabled state |
| `PUT` | `/api/tools/:name` | Enable/disable a tool |

Body limit is 15 MB (corpus HTML gets large); multipart uploads are capped at 15 MB and
held in memory. CORS is currently wide open — see below.

---

## 7. Configuration

All backend config is env-driven (`packages/agent-backend/.env`, gitignored; template in
`.env.example`). No secrets are hardcoded. These are the 14 variables the code actually
reads — note that `.env.example` also lists `RUNS_FILE`, which nothing consumes.

| Variable | Purpose |
|---|---|
| `LLM_PROVIDER` | `gemini` or `mock` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini credentials and model |
| `PORT` | Backend port (default 4000) |
| `ADMIN_KEY` | Shared secret for admin endpoints. **Unset = unprotected** |
| `DB_DRIVER` | `supabase` or `json` |
| `SUPABASE_URL`, `SUPABASE_KEY` | Service-role credentials (server-side only) |
| `DATABASE_URL` | Postgres URI, used by `db:push` |
| `STORAGE_BUCKET` | Supabase Storage bucket for editor images |
| `DB_FILE`, `UPLOADS_DIR`, `PUBLIC_URL` | JSON-driver paths |
| `OCR_ENABLED` | Opt-in image OCR (`tesseract.js` is an optional dependency) |

Frontends: `NEXT_PUBLIC_AGENT_API` for the chat UI; the admin panel currently hardcodes
`API = "http://localhost:4000"` in `runs.service.ts` — worth making an environment value
before any deploy.

---

## 8. Running it

```bash
# 1. Backend
cd packages/agent-backend
npm install
cp .env.example .env          # set LLM_PROVIDER, keys, DB_DRIVER
npm run db:push               # only if DB_DRIVER=supabase
npm run dev                   # http://localhost:4000
npm run smoke                 # exercise the agent loop from the terminal

# 2. Chat UI
cd packages/web-frontend && npm install
cp .env.local.example .env.local
npm run dev                   # http://localhost:3000

# 3. Admin panel
cd packages/admin-panel && npm install
npm start                     # http://localhost:4700
```

Fully offline: `LLM_PROVIDER=mock` + `DB_DRIVER=json`. No key, no database.

---

## 9. Design decisions worth knowing

**JSON-in-text instead of native function calling.** The model returns a JSON object the
backend parses, rather than using Gemini's function-calling API. This keeps the loop
provider-agnostic — the mock provider and any future provider only need "text in, text
out." The cost is schema looseness, handled by the tolerant parser and retry nudge.

**Everything behind an interface.** Both the LLM and the store are single interfaces with
two implementations each. Every combination works, which is why offline demo mode exists at
all rather than being a separate code path.

**Admin-controlled agent behavior.** The corpus and tool toggles live in the database, so a
non-developer can change what the agent knows and what it's allowed to do without a deploy.
This is the main thing separating this from a hardcoded prototype.

**Untrusted model output.** The calculator is a hand-written parser rather than `eval()`
precisely because its input is generated by an LLM.

---

## 10. Known gaps

- **`run.sources` isn't persisted in Supabase mode.** `RunSource[]` is streamed to the chat
  UI, but `runToRow()` has no `sources` field and the `runs` table has no column for it.
  (`JsonDriver` writes the whole `Run` object, so json mode does keep them.) Either way the
  admin panel can't show them — its `Run` interface has no `sources` field and
  `run-detail.component.ts` never renders them. Fix: add a `sources jsonb` column, map it in
  the driver, *and* surface it in the admin UI.
- **CORS is `cors()` with no options** — any origin. Fine locally, not for deployment.
- **`/api/run` is unauthenticated** by design (public chat), which also means unmetered
  LLM spend from anyone who finds the URL. Needs rate limiting before exposure.
- **Admin auth is a single shared key** in `localStorage` — no users, no roles, no
  rotation, no audit trail of who changed what.
- **Corpus search is keyword term-counting**, not embeddings. Synonyms and paraphrases
  miss. Postgres `pgvector` is the natural upgrade and Supabase supports it.
- **`getStats()` loads every run into memory** to aggregate. Fine at demo scale; replace
  with SQL aggregates as the table grows.
- **Migration `20260723150000_storage_bucket.sql` is a `select 1;` no-op** — the bucket is
  created by hand in the dashboard, an undocumented manual setup step.
- **`GEMINI_MODEL` defaults differ**: `.env.example` suggests `gemini-3.6-flash`, the code
  falls back to `gemini-2.0-flash`.
- **`.env.example` has two stale entries**: `RUNS_FILE` is never read by any source file
  (superseded by `DB_FILE`), and the `STORAGE_BUCKET` comment claims the bucket is "created
  by the storage migration" — it isn't; that migration is the `select 1;` no-op above.
- **`run_started` and the SSE `error` payload are both discarded** by the chat client, and
  the error handler can't distinguish an agent failure from a dropped connection.
- **No tests** beyond `npm run smoke`, and no CI.

## Where to take it next

- Real web search (Tavily, Serper, Bing) alongside the corpus.
- `pgvector` embeddings for semantic retrieval.
- Supabase Auth for real admin users and per-user run history.
- Token and cost accounting per run — the data model has room for it.
- More tools: HTTP fetch, code execution, internal APIs.
