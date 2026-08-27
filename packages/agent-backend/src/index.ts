import "dotenv/config";
import { createRequire } from "node:module";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { runAgent } from "./agent/loop.js";
import { createRun, deleteRun, getRun, listRuns, saveRun } from "./store/runs.js";
import { getStats } from "./store/stats.js";
import {
  listCorpus,
  createCorpus,
  updateCorpus,
  deleteCorpus,
} from "./store/corpus.js";
import { listToolConfig, setToolEnabled } from "./store/tool-config.js";
import { getDriver } from "./store/driver.js";
import { extractText } from "./extract.js";

// multer is loaded via require so its absence doesn't break typecheck; it must
// be installed (it's a dependency) for the upload endpoint to work at runtime.
const nodeRequire = createRequire(import.meta.url);
const multer = nodeRequire("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

const app = express();
app.use(cors());
// Corpus documents can carry rich HTML, so allow a generous JSON body
// (default is only 100kb).
app.use(express.json({ limit: "15mb" }));

// Serve locally-stored uploads (used when DB_DRIVER=json).
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./data/uploads";
app.use("/uploads", express.static(UPLOADS_DIR));

const PORT = Number(process.env.PORT ?? 4000);
const ADMIN_KEY = process.env.ADMIN_KEY ?? "";

if (!ADMIN_KEY) {
  console.warn(
    "[warn] ADMIN_KEY is not set — admin endpoints are UNPROTECTED. Set ADMIN_KEY in .env.",
  );
}

// Gate for admin-only endpoints. When ADMIN_KEY is unset we allow through (dev),
// otherwise the request must carry a matching x-admin-key header.
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_KEY) return next();
  const provided = req.header("x-admin-key");
  if (provided && provided === ADMIN_KEY) return next();
  res.status(401).json({ error: "Unauthorized. Provide a valid x-admin-key header." });
}

// Wrap async handlers so rejected promises become 500s instead of hanging.
function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((e: unknown) => {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ error: (e as Error).message });
    });
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, provider: process.env.LLM_PROVIDER ?? "mock" });
});

// Lets the admin login screen check a key without exposing any data.
app.get("/api/admin/verify", requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

// ---- Agent run (SSE, consumed by the chat UI — intentionally open) ---------

app.get("/api/run", async (req, res) => {
  const query = String(req.query.query ?? "").trim();
  if (!query) {
    res.status(400).json({ error: "Missing 'query' parameter." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const run = await createRun(query);
    send("run_started", { id: run.id });

    try {
      await runAgent(run, { onStep: (step) => send("step", step) });
    } catch (e) {
      send("error", { message: (e as Error).message });
    }

    await saveRun(run);
    send("run_finished", {
      id: run.id,
      status: run.status,
      answer: run.answer,
      durationMs: run.durationMs,
      sources: run.sources ?? [],
    });
  } catch (e) {
    send("error", { message: (e as Error).message });
  }
  res.end();
});

// ---- Runs (admin) ----------------------------------------------------------

// List runs with optional filters: ?status=completed&q=text&limit=50
app.get(
  "/api/runs",
  requireAdmin,
  wrap(async (req, res) => {
    const status = String(req.query.status ?? "").trim();
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const limit = Number(req.query.limit ?? 0);

    let runs = await listRuns();
    if (status) runs = runs.filter((r) => r.status === status);
    if (q) runs = runs.filter((r) => r.query.toLowerCase().includes(q));
    if (limit > 0) runs = runs.slice(0, limit);
    res.json(runs);
  }),
);

app.get(
  "/api/runs/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const run = await getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Run not found." });
      return;
    }
    res.json(run);
  }),
);

app.delete(
  "/api/runs/:id",
  requireAdmin,
  wrap(async (req, res) => {
    await deleteRun(req.params.id);
    res.json({ ok: true });
  }),
);

// Re-run a past query (runs the agent synchronously and returns the new run).
app.post(
  "/api/runs/:id/rerun",
  requireAdmin,
  wrap(async (req, res) => {
    const original = await getRun(req.params.id);
    if (!original) {
      res.status(404).json({ error: "Run not found." });
      return;
    }
    const run = await createRun(original.query);
    try {
      await runAgent(run);
    } catch (e) {
      run.status = "failed";
      run.answer = `Agent failed: ${(e as Error).message}`;
    }
    await saveRun(run);
    res.json(run);
  }),
);

// ---- Stats (admin) ---------------------------------------------------------

app.get(
  "/api/stats",
  requireAdmin,
  wrap(async (_req, res) => {
    res.json(await getStats());
  }),
);

// ---- Corpus (admin) --------------------------------------------------------

app.get(
  "/api/corpus",
  requireAdmin,
  wrap(async (_req, res) => {
    res.json(await listCorpus());
  }),
);

app.post(
  "/api/corpus",
  requireAdmin,
  wrap(async (req, res) => {
    const { title, snippet, contentHtml, tags, enabled } = req.body ?? {};
    if (!title || (!snippet && !contentHtml)) {
      res.status(400).json({ error: "title and content (snippet or contentHtml) are required." });
      return;
    }
    const doc = await createCorpus({
      title: String(title),
      snippet: snippet ? String(snippet) : "",
      contentHtml: contentHtml != null ? String(contentHtml) : null,
      tags: Array.isArray(tags) ? tags.map(String) : [],
      enabled: enabled !== false,
    });
    res.status(201).json(doc);
  }),
);

app.put(
  "/api/corpus/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const { title, snippet, contentHtml, tags, enabled } = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (title !== undefined) patch.title = String(title);
    if (snippet !== undefined) patch.snippet = String(snippet);
    if (contentHtml !== undefined) patch.contentHtml = contentHtml === null ? null : String(contentHtml);
    if (tags !== undefined) patch.tags = Array.isArray(tags) ? tags.map(String) : [];
    if (enabled !== undefined) patch.enabled = Boolean(enabled);
    const doc = await updateCorpus(req.params.id, patch);
    res.json(doc);
  }),
);

// Extract text from an uploaded PDF / image / text file (fills the editor).
app.post(
  "/api/corpus/extract",
  requireAdmin,
  upload.single("file"),
  wrap(async (req, res) => {
    const file = (req as unknown as { file?: { buffer: Buffer; mimetype: string; originalname: string } }).file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded (field name must be 'file')." });
      return;
    }
    const text = await extractText(file.buffer, file.mimetype, file.originalname);
    res.json({ text, filename: file.originalname });
  }),
);

// Store an uploaded image and return its public URL (CKEditor image uploads).
app.post(
  "/api/uploads",
  requireAdmin,
  upload.single("file"),
  wrap(async (req, res) => {
    const file = (req as unknown as { file?: { buffer: Buffer; mimetype: string; originalname: string } }).file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded (field name must be 'file')." });
      return;
    }
    const url = await getDriver().storeAsset(file.buffer, file.originalname, file.mimetype);
    res.json({ url });
  }),
);

app.delete(
  "/api/corpus/:id",
  requireAdmin,
  wrap(async (req, res) => {
    await deleteCorpus(req.params.id);
    res.json({ ok: true });
  }),
);

// ---- Tools (admin) ---------------------------------------------------------

app.get(
  "/api/tools",
  requireAdmin,
  wrap(async (_req, res) => {
    res.json(await listToolConfig());
  }),
);

app.put(
  "/api/tools/:name",
  requireAdmin,
  wrap(async (req, res) => {
    const enabled = Boolean(req.body?.enabled);
    res.json(await setToolEnabled(req.params.name, enabled));
  }),
);

app.listen(PORT, () => {
  console.log(`Agent backend on http://localhost:${PORT}`);
  console.log(`Provider: ${process.env.LLM_PROVIDER ?? "mock"}`);
  console.log(`Admin auth: ${ADMIN_KEY ? "enabled" : "DISABLED (set ADMIN_KEY)"}`);
});
