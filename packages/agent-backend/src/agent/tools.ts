import type { Tool, ToolResult } from "./types.js";
import { matchCorpus } from "../store/corpus.js";
import { enabledToolNames } from "../store/tool-config.js";

// A tiny, safe arithmetic evaluator (supports + - * / ( ) and decimals).
// Deliberately NOT eval() — the model's output is untrusted.
function safeCalc(expr: string): number {
  const tokens = expr.match(/\d+\.?\d*|[+\-*/()]/g);
  if (!tokens || tokens.join("") !== expr.replace(/\s+/g, "")) {
    throw new Error("expression contains unsupported characters");
  }
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const rhs = parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseFactor(): number {
    if (peek() === "(") {
      next();
      const value = parseExpr();
      if (next() !== ")") throw new Error("mismatched parentheses");
      return value;
    }
    const t = next();
    const n = Number(t);
    if (Number.isNaN(n)) throw new Error(`unexpected token: ${t}`);
    return n;
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("could not fully parse expression");
  return result;
}

// Score the query against the admin-managed corpus (enabled rows only).
async function corpusSearch(query: string): Promise<string> {
  const docs = await matchCorpus(query, 3);
  if (docs.length === 0) {
    return "No results found in the corpus. (Add or enable documents in the admin panel.)";
  }
  return docs
    .map((d, i) => `**${i + 1}. ${d.title}**\n\n${d.snippet}`)
    .join("\n\n---\n\n");
}

export const tools: Tool[] = [
  {
    name: "web_search",
    description:
      "Search the admin-managed knowledge base for background information. Returns a few relevant snippets.",
    argsHint: `{ "query": "keywords to search for" }`,
    async run(args): Promise<ToolResult> {
      const query = String(args.query ?? "").trim();
      if (!query) return { ok: false, output: "web_search requires a non-empty 'query'." };
      return { ok: true, output: await corpusSearch(query) };
    },
  },
  {
    name: "calculator",
    description: "Evaluate a basic arithmetic expression (+ - * / and parentheses).",
    argsHint: `{ "expression": "e.g. (2 + 3) * 4" }`,
    async run(args): Promise<ToolResult> {
      const expression = String(args.expression ?? "").trim();
      if (!expression) return { ok: false, output: "calculator requires an 'expression'." };
      try {
        return { ok: true, output: `${expression} = ${safeCalc(expression)}` };
      } catch (e) {
        return { ok: false, output: `Could not evaluate: ${(e as Error).message}` };
      }
    },
  },
  {
    name: "current_time",
    description: "Get the current date and time in ISO 8601 (UTC).",
    argsHint: `{}`,
    async run(): Promise<ToolResult> {
      return { ok: true, output: new Date().toISOString() };
    },
  },
];

export function getTool(name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}

// The tools the agent may use this run, honoring admin toggles.
// If tool_config has no rows, all tools are allowed.
export async function getEnabledTools(): Promise<Tool[]> {
  const allowed = await enabledToolNames();
  if (allowed === null) return tools;
  return tools.filter((t) => allowed.has(t.name));
}

export function toolCatalog(list: Tool[] = tools): string {
  return list
    .map((t) => `- ${t.name}: ${t.description}\n  args: ${t.argsHint}`)
    .join("\n");
}
