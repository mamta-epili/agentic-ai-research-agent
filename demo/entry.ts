/**
 * What the demo page is allowed to reach. Kept deliberately small: the real
 * loop, the real tool catalogue, and the demo corpus for display.
 */
export { runAgent } from "../packages/agent-backend/src/agent/loop.js";
export { tools, toolCatalog } from "../packages/agent-backend/src/agent/tools.js";
export { matchCorpus } from "../packages/agent-backend/src/store/corpus.js";
export { DEMO_CORPUS, DEMO_TOOLS } from "./shims/driver.js";
export type { Run, AgentStep } from "../packages/agent-backend/src/agent/types.js";
