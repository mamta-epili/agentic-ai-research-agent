import { getDriver } from "./driver.js";

export type { ToolConfig } from "./model.js";

// Thin wrapper over the active storage driver.

export async function listToolConfig() {
  return getDriver().toolList();
}

export async function setToolEnabled(name: string, enabled: boolean) {
  return getDriver().toolSet(name, enabled);
}

// Names of enabled tools. If the store has no tool rows, all tools are allowed.
export async function enabledToolNames(): Promise<Set<string> | null> {
  const list = await getDriver().toolList();
  if (!list.length) return null; // null = "no config, allow all"
  return new Set(list.filter((t) => t.enabled).map((t) => t.name));
}
