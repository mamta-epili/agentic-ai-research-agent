import { randomUUID } from "node:crypto";
import { db } from "./client.js";
import type { Run } from "../agent/types.js";
import type { CorpusDoc, CorpusInput, CorpusPatch, ToolConfig } from "./model.js";
import type { StoreDriver } from "./driver.js";

const ASSET_BUCKET = process.env.STORAGE_BUCKET ?? "corpus-assets";

function safeName(filename: string): string {
  return filename.replace(/[^\w.\-]+/g, "_").slice(-80);
}

// ---- runs mapping (camelCase <-> snake_case) -------------------------------

type RunRow = {
  id: string;
  query: string;
  status: string;
  steps: Run["steps"];
  answer: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
  finished_at: string | null;
  duration_ms: number | null;
};

function runToRow(run: Run): RunRow {
  return {
    id: run.id,
    query: run.query,
    status: run.status,
    steps: run.steps,
    answer: run.answer ?? null,
    provider: run.provider ?? null,
    model: run.model ?? null,
    created_at: run.createdAt,
    finished_at: run.finishedAt ?? null,
    duration_ms: run.durationMs ?? null,
  };
}

function runFromRow(row: RunRow): Run {
  return {
    id: row.id,
    query: row.query,
    status: row.status as Run["status"],
    steps: (row.steps ?? []) as Run["steps"],
    answer: row.answer ?? undefined,
    provider: row.provider ?? "",
    model: row.model ?? "",
    createdAt: row.created_at,
    finishedAt: row.finished_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
  };
}

type CorpusRow = {
  id: string;
  title: string;
  snippet: string;
  content_html: string | null;
  tags: string[] | null;
  enabled: boolean;
  created_at: string;
};

function corpusFromRow(r: CorpusRow): CorpusDoc {
  return {
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    contentHtml: r.content_html ?? null,
    tags: r.tags ?? [],
    enabled: r.enabled,
    createdAt: r.created_at,
  };
}

export class SupabaseDriver implements StoreDriver {
  // runs
  async runCreate(run: Run): Promise<void> {
    const { error } = await db().from("runs").insert(runToRow(run));
    if (error) throw new Error(`runCreate failed: ${error.message}`);
  }

  async runSave(run: Run): Promise<void> {
    const { error } = await db().from("runs").upsert(runToRow(run), { onConflict: "id" });
    if (error) throw new Error(`runSave failed: ${error.message}`);
  }

  async runGet(id: string): Promise<Run | undefined> {
    const { data, error } = await db().from("runs").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`runGet failed: ${error.message}`);
    return data ? runFromRow(data as RunRow) : undefined;
  }

  async runList(): Promise<Run[]> {
    const { data, error } = await db()
      .from("runs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`runList failed: ${error.message}`);
    return (data ?? []).map((r) => runFromRow(r as RunRow));
  }

  async runDelete(id: string): Promise<void> {
    const { error } = await db().from("runs").delete().eq("id", id);
    if (error) throw new Error(`runDelete failed: ${error.message}`);
  }

  // corpus
  async corpusList(): Promise<CorpusDoc[]> {
    const { data, error } = await db()
      .from("corpus")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`corpusList failed: ${error.message}`);
    return (data ?? []).map((r) => corpusFromRow(r as CorpusRow));
  }

  async corpusCreate(input: CorpusInput): Promise<CorpusDoc> {
    const { data, error } = await db()
      .from("corpus")
      .insert({
        title: input.title,
        snippet: input.snippet,
        content_html: input.contentHtml ?? null,
        tags: input.tags ?? [],
        enabled: input.enabled ?? true,
      })
      .select("*")
      .single();
    if (error) throw new Error(`corpusCreate failed: ${error.message}`);
    return corpusFromRow(data as CorpusRow);
  }

  async corpusUpdate(id: string, patch: CorpusPatch): Promise<CorpusDoc> {
    // Map camelCase contentHtml -> content_html column.
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.snippet !== undefined) row.snippet = patch.snippet;
    if (patch.contentHtml !== undefined) row.content_html = patch.contentHtml;
    if (patch.tags !== undefined) row.tags = patch.tags;
    if (patch.enabled !== undefined) row.enabled = patch.enabled;

    const { data, error } = await db()
      .from("corpus")
      .update(row)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`corpusUpdate failed: ${error.message}`);
    return corpusFromRow(data as CorpusRow);
  }

  async corpusDelete(id: string): Promise<void> {
    const { error } = await db().from("corpus").delete().eq("id", id);
    if (error) throw new Error(`corpusDelete failed: ${error.message}`);
  }

  // tools
  async toolList(): Promise<ToolConfig[]> {
    const { data, error } = await db().from("tool_config").select("*").order("name");
    if (error) throw new Error(`toolList failed: ${error.message}`);
    return (data ?? []) as ToolConfig[];
  }

  async toolSet(name: string, enabled: boolean): Promise<ToolConfig> {
    const { data, error } = await db()
      .from("tool_config")
      .update({ enabled })
      .eq("name", name)
      .select("*")
      .single();
    if (error) throw new Error(`toolSet failed: ${error.message}`);
    return data as ToolConfig;
  }

  // assets
  async storeAsset(buffer: Buffer, filename: string, contentType: string): Promise<string> {
    const path = `images/${randomUUID()}-${safeName(filename)}`;
    const { error } = await db()
      .storage.from(ASSET_BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (error) throw new Error(`storeAsset failed: ${error.message}`);
    const { data } = db().storage.from(ASSET_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
}
