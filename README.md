# Agentic AI demo

A minimal but complete agentic AI prototype: a **research agent** that plans, calls
tools, reads the results, and iterates until it can answer — with two frontends on top.

```
Next.js chat  ─┐                    ┌─ LLM provider (Gemini / mock)
               ├─►  Agent backend  ─┼─ Tools (search, calculator, time)
Angular admin ─┘   (Node + TS)      └─ Run store (JSON file)
```

- **`packages/agent-backend`** — Node + TypeScript. Runs the agent loop, exposes a
  streaming (SSE) run endpoint for the chat UI and REST endpoints for the admin panel.
- **`packages/web-frontend`** — Next.js (App Router). Chat UI that streams the agent's
  reasoning and tool calls live as they happen.
- **`packages/admin-panel`** — Angular (standalone components). Lists every run and
  shows its full step-by-step trace.

### ▶ [Try the demo in your browser](https://mamta-epili.github.io/agentic-ai-research-agent/)

No key, no install. It runs **this repository's own agent loop**, compiled from
`packages/agent-backend/src`, driving the mock provider described below.

## The browser demo

`demo/` is not a re-implementation and not a recording. `demo/build.mjs` bundles
`src/agent/loop.ts`, `src/agent/tools.ts`, `src/agent/llm.ts` and
`src/store/corpus.ts` for the browser with esbuild, substituting exactly two things:

| Substitution | Why |
| --- | --- |
| `src/store/driver.ts` → `demo/shims/driver.ts` | Supabase and the JSON driver both need a server. The shim serves a read-only in-memory corpus through the same `StoreDriver` interface, so `corpus.ts` and `tool-config.ts` run unmodified above it. |
| `process.env` → an empty frozen object | Every variable the backend reads is pinned at build time (`LLM_PROVIDER=mock`), and there is no `process.env` left in the output, so the published page cannot read a credential even if a future code path asks for one. |

So the ReAct loop, the JSON contract, tool dispatch, the arithmetic evaluator and the
corpus scoring are all the real code. What is **not** real is the reasoning text: with
no key there is no model, so the deterministic `MockProvider` already in `llm.ts`
decides each step. Set `LLM_PROVIDER=gemini` locally and the same loop reasons for real.

```bash
npm install
npm run demo         # build the bundle, serve at http://localhost:4173
npm run demo:watch   # rebuild on change
```

`demo/agent.bundle.js` is generated and gitignored. CI rebuilds it from `src/` before
publishing and fails the deploy if the bundle references `process.env`, if the mock
provider is missing, or if any credential-shaped string appears anywhere in `demo/`.

## How the agent works

It uses the **ReAct** pattern. On each turn the LLM returns a single JSON object that is
either a tool call or a final answer:

```json
{ "thought": "why", "tool": "web_search", "args": { "query": "agentic ai" } }
{ "thought": "why", "final": "the answer" }
```

The backend executes the tool, feeds the observation back, and loops (up to 8 steps).
`web_search` runs against a small in-memory corpus in this demo — swap it for a real
search API in `packages/agent-backend/src/agent/tools.ts`.

## Setup

### 1. Backend

```bash
cd packages/agent-backend
npm install
cp .env.example .env        # then paste your Gemini key into .env
npm run dev                 # http://localhost:4000
```

Set `LLM_PROVIDER=mock` in `.env` to run the whole thing offline without a key.
Run `npm run smoke` to exercise the agent loop from the terminal.

### 2. Chat frontend

```bash
cd packages/web-frontend
npm install
cp .env.local.example .env.local
npm run dev                 # http://localhost:3000
```

### 3. Admin panel

```bash
cd packages/admin-panel
npm install
npm start                   # http://localhost:4700
```

## A note on your API key

The Gemini key you shared earlier is now in a chat transcript — treat it as exposed and
**rotate it in Google AI Studio**. Keys live only in `.env` (gitignored) and are read via
`process.env`; nothing is hardcoded.

## Where to take it next

- Replace the mock `web_search` with a real search API (Tavily, Serper, Bing).
- Swap the JSON run store for a real database (Postgres, SQLite).
- Add auth and per-user run history.
- Add more tools — HTTP fetch, code execution, your own internal APIs.
- Use Gemini's native function-calling instead of JSON-in-text for stricter tool schemas.
