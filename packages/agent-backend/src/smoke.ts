// Offline check: runs the full agent loop with the mock provider.
// Usage: npm run smoke
import { runAgent } from "./agent/loop.js";
import type { Run } from "./agent/types.js";

process.env.LLM_PROVIDER = "mock";

const run: Run = {
  id: "smoke-1",
  query: "What is agentic AI and what is 12 * 8?",
  status: "running",
  steps: [],
  provider: "",
  model: "",
  createdAt: new Date().toISOString(),
};

const result = await runAgent(run, {
  onStep: (s) => console.log(`  [${s.index}] ${s.kind}${s.tool ? ` (${s.tool})` : ""}: ${s.content.slice(0, 80)}`),
});

console.log("\nstatus:", result.status);
console.log("provider:", result.provider, "/", result.model);
console.log("steps:", result.steps.length);
console.log("answer:", result.answer);
