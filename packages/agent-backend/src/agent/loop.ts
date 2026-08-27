import { makeProvider, type ChatMessage } from "./llm.js";
import { getEnabledTools, getTool, toolCatalog } from "./tools.js";
import { matchCorpus } from "../store/corpus.js";
import type { AgentStep, Run, Tool } from "./types.js";

const MAX_ITERATIONS = 8;

function systemPrompt(enabledTools: Tool[]): string {
  return [
    "You are a research assistant agent. You answer the user's question by",
    "reasoning step by step and using tools when they help.",
    "",
    "Available tools:",
    toolCatalog(enabledTools),
    "",
    "On every turn respond with a SINGLE JSON object and nothing else.",
    "To use a tool:",
    `  {"thought": "why", "tool": "tool_name", "args": { ... }}`,
    "To give your final answer:",
    `  {"thought": "why", "final": "your complete answer to the user"}`,
    "",
    "Rules: use a tool only when it adds information. Do not repeat an identical",
    "tool call. When you have enough to answer, return the final form.",
  ].join("\n");
}

// Pull a JSON object out of the model's text, tolerating code fences / stray prose.
function parseModelJson(raw: string): any {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}

export interface RunCallbacks {
  onStep?: (step: AgentStep) => void;
}

export async function runAgent(
  run: Run,
  emit: RunCallbacks = {},
): Promise<Run> {
  const provider = makeProvider();
  run.provider = provider.name;
  run.model = provider.model;

  const enabledTools = await getEnabledTools();
  const enabledNames = new Set(enabledTools.map((t) => t.name));

  const messages: ChatMessage[] = [{ role: "user", text: `User query: ${run.query}` }];
  let stepIndex = 0;

  const pushStep = (s: Omit<AgentStep, "index" | "createdAt">) => {
    const step: AgentStep = { index: stepIndex++, createdAt: new Date().toISOString(), ...s };
    run.steps.push(step);
    emit.onStep?.(step);
    return step;
  };

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const raw = await provider.complete(systemPrompt(enabledTools), messages);
      messages.push({ role: "model", text: raw });

      let parsed: any;
      try {
        parsed = parseModelJson(raw);
      } catch (e) {
        pushStep({ kind: "error", content: `Failed to parse model output: ${(e as Error).message}` });
        // Nudge the model back on track and retry.
        messages.push({
          role: "user",
          text: "Your last message was not valid JSON. Respond with a single JSON object.",
        });
        continue;
      }

      if (parsed.thought) {
        pushStep({ kind: "thought", content: String(parsed.thought) });
      }

      if (parsed.final !== undefined) {
        const answer = String(parsed.final);
        pushStep({ kind: "final", content: answer });
        run.answer = answer;
        run.status = "completed";
        return finalize(run);
      }

      if (parsed.tool) {
        const name = String(parsed.tool);
        const args = (parsed.args ?? {}) as Record<string, unknown>;
        pushStep({ kind: "tool_call", content: JSON.stringify(args), tool: name, args });

        const tool = getTool(name);
        const result = !tool
          ? { ok: false, output: `Unknown tool: ${name}` }
          : !enabledNames.has(name)
            ? { ok: false, output: `Tool "${name}" is disabled by the administrator.` }
            : await tool.run(args);

        pushStep({ kind: "observation", content: result.output, tool: name });

        // Record the corpus documents behind a web_search so the UI can show
        // them as sources (with images) alongside the text answer.
        if (name === "web_search" && enabledNames.has(name)) {
          try {
            const matched = await matchCorpus(String(args.query ?? ""), 3);
            run.sources = run.sources ?? [];
            for (const d of matched) {
              if (!run.sources.some((s) => s.id === d.id)) {
                run.sources.push({
                  id: d.id,
                  title: d.title,
                  contentHtml: d.contentHtml,
                  snippet: d.snippet,
                });
              }
            }
          } catch {
            // sources are best-effort; ignore failures
          }
        }

        messages.push({
          role: "user",
          text: `Observation from ${name}:\n${result.output}`,
        });
        continue;
      }

      // Model produced JSON but neither a tool nor a final answer.
      pushStep({ kind: "error", content: "Model output had no tool or final answer." });
      messages.push({
        role: "user",
        text: "Choose a tool or give your final answer.",
      });
    }

    // Ran out of iterations.
    const fallback = "Reached the step limit without a final answer.";
    pushStep({ kind: "final", content: fallback });
    run.answer = fallback;
    run.status = "completed";
    return finalize(run);
  } catch (e) {
    pushStep({ kind: "error", content: (e as Error).message });
    run.status = "failed";
    run.answer = `Agent failed: ${(e as Error).message}`;
    return finalize(run);
  }
}

function finalize(run: Run): Run {
  run.finishedAt = new Date().toISOString();
  run.durationMs = new Date(run.finishedAt).getTime() - new Date(run.createdAt).getTime();
  return run;
}
