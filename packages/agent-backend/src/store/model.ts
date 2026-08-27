// Shared store types, kept in one place so the driver and the store wrappers
// can import them without circular dependencies.

export type { Run } from "../agent/types.js";

export interface CorpusDoc {
  id: string;
  title: string;
  snippet: string; // plain text, used for search
  contentHtml: string | null; // rich body composed in the editor
  tags: string[];
  enabled: boolean;
  createdAt: string;
}

export interface ToolConfig {
  name: string;
  enabled: boolean;
  description: string | null;
}

export interface CorpusInput {
  title: string;
  snippet: string;
  contentHtml?: string | null;
  tags?: string[];
  enabled?: boolean;
}

export type CorpusPatch = Partial<{
  title: string;
  snippet: string;
  contentHtml: string | null;
  tags: string[];
  enabled: boolean;
}>;
