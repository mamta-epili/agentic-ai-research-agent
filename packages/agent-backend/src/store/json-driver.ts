import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Run } from "../agent/types.js";
import type { CorpusDoc, CorpusInput, CorpusPatch, ToolConfig } from "./model.js";
import type { StoreDriver } from "./driver.js";

// Local JSON-file store — no database required. Selected with DB_DRIVER=json.
// Keeps everything in one file and seeds the corpus/tools on first run so the
// agent works offline exactly like the Supabase-backed setup.

const DB_FILE = process.env.DB_FILE ?? "./data/store.json";

interface Shape {
  runs: Run[];
  corpus: CorpusDoc[];
  tools: ToolConfig[];
}

function seedCorpus(): CorpusDoc[] {
  const now = new Date().toISOString();
  const mk = (title: string, snippet: string, tags: string[]): CorpusDoc => ({
    id: randomUUID(),
    title,
    snippet,
    contentHtml: null,
    tags,
    enabled: true,
    createdAt: now,
  });
  return [
    mk("Agentic AI, defined", "Agentic AI describes systems that pursue a goal over multiple steps: they plan, call tools, observe results, and adapt until the task is done.", ["agent", "agentic", "ai", "definition", "loop"]),
    mk("The ReAct pattern", "ReAct interleaves reasoning and acting: the model emits a thought, chooses a tool, reads the observation, and repeats. It underpins most tool-using agents.", ["react", "reasoning", "tools", "pattern", "loop"]),
    mk("Next.js App Router", "The Next.js App Router uses React Server Components and file-based routing under app/, with streaming and layouts built in.", ["nextjs", "next", "frontend", "react", "app router"]),
    mk("Angular standalone components", "Modern Angular favors standalone components that declare their own imports, removing much of the NgModule boilerplate.", ["angular", "admin", "standalone", "frontend", "components"]),
    mk("Server-Sent Events", "SSE streams text from server to client over a single long-lived HTTP response, ideal for pushing agent steps to a UI as they happen.", ["sse", "streaming", "events", "http"]),
  ];
}

function seedTools(): ToolConfig[] {
  return [
    { name: "web_search", enabled: true, description: "Search a small demo knowledge base for background information." },
    { name: "calculator", enabled: true, description: "Evaluate a basic arithmetic expression (+ - * / and parentheses)." },
    { name: "current_time", enabled: true, description: "Get the current date and time in ISO 8601 (UTC)." },
  ];
}

export class JsonDriver implements StoreDriver {
  private data: Shape = { runs: [], corpus: [], tools: [] };
  private loaded = false;

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(DB_FILE, "utf8");
      const parsed = JSON.parse(raw) as Partial<Shape>;
      this.data = {
        runs: parsed.runs ?? [],
        corpus: parsed.corpus ?? [],
        tools: parsed.tools ?? [],
      };
    } catch {
      // No file yet.
    }
    let changed = false;
    if (this.data.corpus.length === 0) {
      this.data.corpus = seedCorpus();
      changed = true;
    }
    if (this.data.tools.length === 0) {
      this.data.tools = seedTools();
      changed = true;
    }
    if (changed) await this.persist();
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(DB_FILE), { recursive: true });
    await writeFile(DB_FILE, JSON.stringify(this.data, null, 2), "utf8");
  }

  private sortedRuns(): Run[] {
    return [...this.data.runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // runs
  async runCreate(run: Run): Promise<void> {
    await this.load();
    this.data.runs.push(run);
    await this.persist();
  }

  async runSave(run: Run): Promise<void> {
    await this.load();
    const i = this.data.runs.findIndex((r) => r.id === run.id);
    if (i >= 0) this.data.runs[i] = run;
    else this.data.runs.push(run);
    await this.persist();
  }

  async runGet(id: string): Promise<Run | undefined> {
    await this.load();
    return this.data.runs.find((r) => r.id === id);
  }

  async runList(): Promise<Run[]> {
    await this.load();
    return this.sortedRuns();
  }

  async runDelete(id: string): Promise<void> {
    await this.load();
    this.data.runs = this.data.runs.filter((r) => r.id !== id);
    await this.persist();
  }

  // corpus
  async corpusList(): Promise<CorpusDoc[]> {
    await this.load();
    return [...this.data.corpus].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async corpusCreate(input: CorpusInput): Promise<CorpusDoc> {
    await this.load();
    const doc: CorpusDoc = {
      id: randomUUID(),
      title: input.title,
      snippet: input.snippet,
      contentHtml: input.contentHtml ?? null,
      tags: input.tags ?? [],
      enabled: input.enabled ?? true,
      createdAt: new Date().toISOString(),
    };
    this.data.corpus.push(doc);
    await this.persist();
    return doc;
  }

  async corpusUpdate(id: string, patch: CorpusPatch): Promise<CorpusDoc> {
    await this.load();
    const doc = this.data.corpus.find((d) => d.id === id);
    if (!doc) throw new Error("corpusUpdate failed: not found");
    Object.assign(doc, patch);
    await this.persist();
    return doc;
  }

  async corpusDelete(id: string): Promise<void> {
    await this.load();
    this.data.corpus = this.data.corpus.filter((d) => d.id !== id);
    await this.persist();
  }

  // tools
  async toolList(): Promise<ToolConfig[]> {
    await this.load();
    return [...this.data.tools].sort((a, b) => a.name.localeCompare(b.name));
  }

  async toolSet(name: string, enabled: boolean): Promise<ToolConfig> {
    await this.load();
    const tool = this.data.tools.find((t) => t.name === name);
    if (!tool) throw new Error("toolSet failed: unknown tool");
    tool.enabled = enabled;
    await this.persist();
    return tool;
  }

  // assets — write to a local uploads dir and return a URL served by express.
  async storeAsset(buffer: Buffer, filename: string, _contentType: string): Promise<string> {
    const dir = process.env.UPLOADS_DIR ?? "./data/uploads";
    await mkdir(dir, { recursive: true });
    const safe = `${randomUUID()}-${filename.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
    await writeFile(join(dir, safe), buffer);
    const base = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    return `${base}/uploads/${safe}`;
  }
}
