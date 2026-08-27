/**
 * Browser driver for the demo.
 *
 * This is the ONLY thing the demo swaps out. `src/store/driver.ts` chooses
 * between Supabase and a JSON file, and both need a server; this returns an
 * in-memory implementation of the same `StoreDriver` interface instead.
 *
 * Everything above it is the real code, bundled from src/ unmodified:
 * `agent/loop.ts`, `agent/tools.ts`, `agent/llm.ts` (the mock provider it
 * already ships), `store/corpus.ts` and `store/tool-config.ts`. The demo is
 * therefore the actual agent loop and the actual retrieval scoring, not a
 * re-implementation of them.
 *
 * Writes are accepted and dropped: a run is not persisted anywhere, which is
 * what you want on a page anyone can open.
 */
import type { Run } from "../../packages/agent-backend/src/agent/types.js";
import type {
  CorpusDoc,
  CorpusInput,
  CorpusPatch,
  ToolConfig,
} from "../../packages/agent-backend/src/store/model.js";

const now = new Date().toISOString();

const doc = (
  id: string,
  title: string,
  tags: string[],
  snippet: string,
): CorpusDoc => ({ id, title, snippet, contentHtml: null, tags, enabled: true, createdAt: now });

/**
 * A small fictional corpus. Narrow on purpose: the interesting thing about a
 * grounded agent is watching it find something and watching it come up empty,
 * and both need edges a visitor can reach in two questions.
 */
const CORPUS: CorpusDoc[] = [
  doc(
    "c1",
    "Tidal Range Power — Overview",
    ["tidal", "energy", "renewable"],
    "Tidal range power generates electricity from the height difference between high and low tide. A barrage across an estuary holds water back, then releases it through turbines. Output is intermittent but highly predictable, because tides follow the lunar cycle rather than the weather.",
  ),
  doc(
    "c2",
    "Tidal Range Power — Capacity and Cost",
    ["tidal", "cost", "capacity"],
    "A typical tidal barrage runs at a capacity factor near 24 percent, against roughly 35 to 55 percent for offshore wind. Capital cost per installed megawatt is high and the civil works dominate it, but design life is long: a barrage is generally planned for 120 years, against 25 to 30 for a wind turbine.",
  ),
  doc(
    "c3",
    "Tidal Range Power — Environmental Effects",
    ["tidal", "environment", "estuary"],
    "Barrages change the intertidal zone upstream, which is the part that matters ecologically: mudflats feeding wading birds can be permanently submerged. Fish passage requires dedicated bypasses, and sediment transport shifts, sometimes silting up channels that previously scoured clean.",
  ),
  doc(
    "c4",
    "Lagoon Designs",
    ["tidal", "lagoon", "design"],
    "A tidal lagoon encloses an area of coast with a seawall rather than damming a whole estuary, which avoids blocking a river entirely. Lagoons are more expensive per megawatt than barrages but far less disruptive, and several can be operated in sequence to smooth output across the tidal cycle.",
  ),
  doc(
    "c5",
    "Grid Integration",
    ["grid", "storage", "energy"],
    "Because tidal output is predictable years ahead, it is easier to schedule around than wind or solar, and it needs less reserve capacity held against forecast error. Its drawback is phase: peak generation drifts through the day with the tide and often misses the evening demand peak entirely.",
  ),
];

/** Tool toggles. All three on, the same shape the admin panel writes. */
const TOOLS: ToolConfig[] = [
  { name: "web_search", enabled: true, description: "Search the knowledge base" },
  { name: "calculator", enabled: true, description: "Evaluate arithmetic" },
  { name: "current_time", enabled: true, description: "Current UTC time" },
];

const unsupported = (what: string) => () =>
  Promise.reject(new Error(`${what} is not available in the browser demo.`));

export function getDriver() {
  return {
    // ── runs: accepted and discarded, never persisted ──
    async runCreate(_run: Run) {},
    async runSave(_run: Run) {},
    async runGet(_id: string) { return undefined; },
    async runList() { return [] as Run[]; },
    async runDelete(_id: string) {},

    // ── corpus: read-only, in memory ──
    async corpusList() { return CORPUS; },
    corpusCreate: unsupported("Creating corpus documents") as (i: CorpusInput) => Promise<CorpusDoc>,
    corpusUpdate: unsupported("Editing corpus documents") as (id: string, p: CorpusPatch) => Promise<CorpusDoc>,
    corpusDelete: unsupported("Deleting corpus documents") as (id: string) => Promise<void>,

    // ── tools ──
    async toolList() { return TOOLS; },
    toolSet: unsupported("Changing tool configuration") as (n: string, e: boolean) => Promise<ToolConfig>,

    storeAsset: unsupported("Uploading assets") as (b: unknown, f: string, c: string) => Promise<string>,
  };
}

/** Exposed so the demo can list what the agent is searching over. */
export const DEMO_CORPUS = CORPUS;
export const DEMO_TOOLS = TOOLS;
