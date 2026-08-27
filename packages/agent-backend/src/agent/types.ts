// Shared types for the agent backend.

export type StepKind = "thought" | "tool_call" | "observation" | "final" | "error";

export interface AgentStep {
  index: number;
  kind: StepKind;
  // For "thought" / "final" / "error": the text content.
  // For "tool_call": the tool name + args.
  // For "observation": the tool result.
  content: string;
  tool?: string;
  args?: Record<string, unknown>;
  createdAt: string;
}

export type RunStatus = "running" | "completed" | "failed";

export interface RunSource {
  id: string;
  title: string;
  contentHtml: string | null;
  snippet: string;
}

export interface Run {
  id: string;
  query: string;
  status: RunStatus;
  steps: AgentStep[];
  answer?: string;
  provider: string;
  model: string;
  createdAt: string;
  finishedAt?: string;
  durationMs?: number;
  // Corpus documents the agent retrieved via web_search during this run.
  sources?: RunSource[];
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface Tool {
  name: string;
  description: string;
  // Human-readable description of expected args, shown to the model.
  argsHint: string;
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
}
