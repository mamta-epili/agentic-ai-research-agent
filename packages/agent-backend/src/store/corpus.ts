import { getDriver } from "./driver.js";
import type { CorpusInput, CorpusPatch } from "./model.js";

export type { CorpusDoc } from "./model.js";

// Thin wrapper over the active storage driver. The agent reads only enabled rows.
// The searchable `snippet` is derived from the rich HTML body when present, so
// web_search keeps working on plain text while the editor stores formatting.

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    // Turn block-level boundaries into line breaks so paragraphs, headings and
    // list items don't run together into one wall of text.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article|header|footer|figcaption)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(td|th)>/gi, "\t")
    // Drop all remaining tags.
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Normalize spacing but keep newlines (paragraph structure).
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function listCorpus() {
  return getDriver().corpusList();
}

export async function listEnabledCorpus() {
  const all = await getDriver().corpusList();
  return all.filter((d) => d.enabled);
}

// Score enabled corpus docs against a query and return the top matches.
// Shared by the web_search tool (for text) and the run (for source display).
export async function matchCorpus(query: string, limit = 3) {
  const docs = await listEnabledCorpus();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return docs
    .map((doc) => {
      const hay = (doc.title + " " + doc.snippet + " " + doc.tags.join(" ")).toLowerCase();
      const score = terms.reduce((s, t) => (hay.includes(t) ? s + 1 : s), 0);
      return { doc, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.doc);
}

export async function createCorpus(input: CorpusInput) {
  const snippet =
    input.contentHtml && input.contentHtml.trim()
      ? stripHtml(input.contentHtml)
      : input.snippet;
  return getDriver().corpusCreate({ ...input, snippet });
}

export async function updateCorpus(id: string, patch: CorpusPatch) {
  const next: CorpusPatch = { ...patch };
  if (patch.contentHtml !== undefined && patch.contentHtml && patch.contentHtml.trim()) {
    next.snippet = stripHtml(patch.contentHtml);
  }
  return getDriver().corpusUpdate(id, next);
}

export async function deleteCorpus(id: string) {
  return getDriver().corpusDelete(id);
}
