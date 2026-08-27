import type { Run } from "../agent/types.js";
import type { CorpusDoc, CorpusInput, CorpusPatch, ToolConfig } from "./model.js";
import { SupabaseDriver } from "./supabase-driver.js";
import { JsonDriver } from "./json-driver.js";

// Storage abstraction. Two implementations ship: Supabase (Postgres) and a
// local JSON file. Select with DB_DRIVER=supabase|json in .env.
// Both classes are side-effect-free at construction (clients/files load lazily),
// so importing both here is safe regardless of which one is active.

export interface StoreDriver {
  // runs
  runCreate(run: Run): Promise<void>;
  runSave(run: Run): Promise<void>;
  runGet(id: string): Promise<Run | undefined>;
  runList(): Promise<Run[]>;
  runDelete(id: string): Promise<void>;
  // corpus
  corpusList(): Promise<CorpusDoc[]>;
  corpusCreate(input: CorpusInput): Promise<CorpusDoc>;
  corpusUpdate(id: string, patch: CorpusPatch): Promise<CorpusDoc>;
  corpusDelete(id: string): Promise<void>;
  // tools
  toolList(): Promise<ToolConfig[]>;
  toolSet(name: string, enabled: boolean): Promise<ToolConfig>;
  // assets (uploaded images) — returns a public URL
  storeAsset(buffer: Buffer, filename: string, contentType: string): Promise<string>;
}

let driver: StoreDriver | null = null;

export function getDriver(): StoreDriver {
  if (driver) return driver;
  const which = (process.env.DB_DRIVER ?? "supabase").toLowerCase();
  if (which === "json") {
    driver = new JsonDriver();
    console.log("Store driver: json");
  } else {
    driver = new SupabaseDriver();
    console.log("Store driver: supabase");
  }
  return driver;
}
