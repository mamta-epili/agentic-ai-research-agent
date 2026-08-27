import { randomUUID } from "node:crypto";
import { getDriver } from "./driver.js";
import type { Run } from "../agent/types.js";

// Thin wrapper over the active storage driver (Supabase or JSON file).

export async function createRun(query: string): Promise<Run> {
  const run: Run = {
    id: randomUUID(),
    query,
    status: "running",
    steps: [],
    provider: "",
    model: "",
    createdAt: new Date().toISOString(),
  };
  await getDriver().runCreate(run);
  return run;
}

export async function saveRun(run: Run): Promise<void> {
  await getDriver().runSave(run);
}

export async function getRun(id: string): Promise<Run | undefined> {
  return getDriver().runGet(id);
}

export async function listRuns(): Promise<Run[]> {
  return getDriver().runList();
}

export async function deleteRun(id: string): Promise<void> {
  await getDriver().runDelete(id);
}
