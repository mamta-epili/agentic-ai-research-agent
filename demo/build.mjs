/**
 * Bundles the real agent for the browser.
 *
 *   node demo/build.mjs [--watch]
 *
 * Two substitutions, and only two:
 *
 *   1. `store/driver.js` is aliased to demo/shims/driver.ts, so the store
 *      wrappers read an in-memory corpus instead of Supabase or a JSON file.
 *   2. `process.env` is replaced at build time with the offline settings the
 *      repo already documents (LLM_PROVIDER=mock). No key is read, and none
 *      can be: there is no process.env in the output at all.
 *
 * Everything else — the ReAct loop, the tool dispatch, the mock provider, the
 * corpus scoring — is compiled from src/ as it stands. If the loop changes,
 * re-running this picks the change up, so the demo cannot quietly drift into
 * demonstrating code that no longer exists.
 */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const backend = path.join(root, "packages/agent-backend/src");

const watch = process.argv.includes("--watch");

const shim = path.join(here, "shims/driver.ts");

/**
 * Redirects every import of the backend's storage driver to the browser shim.
 * esbuild's `alias` option takes package names only, so path substitution has
 * to happen in a resolver. The importer check keeps the redirect inside the
 * backend, so an unrelated file called driver.js elsewhere is untouched.
 */
const swapDriver = {
  name: "swap-store-driver",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /(^|\/)driver\.js$/ }, (args) => {
      const fromBackend = path.resolve(args.resolveDir).startsWith(backend);
      return fromBackend ? { path: shim } : undefined;
    });
  },
};

const options = {
  entryPoints: [path.join(here, "entry.ts")],
  outfile: path.join(here, "agent.bundle.js"),
  bundle: true,
  format: "esm",
  target: ["es2022"],
  platform: "browser",
  sourcemap: false,
  minify: !watch,
  legalComments: "none",
  logLevel: "info",
  plugins: [swapDriver],

  // Compile-time environment. Every variable the backend reads is pinned to
  // its offline value, and `process.env` itself is replaced with an empty
  // object, so no lookup can reach a real one. `define` takes JS literals or
  // entity names only, hence the injected constant rather than `({})`.
  define: {
    "process.env.LLM_PROVIDER": '"mock"',
    "process.env.GEMINI_API_KEY": "undefined",
    "process.env.GEMINI_MODEL": "undefined",
    "process.env.DB_DRIVER": '"memory"',
    "process.env.NODE_ENV": '"production"',
    "process.env": "__EMPTY_ENV__",
  },
  inject: [path.join(here, "shims/env.js")],
};

if (watch) {
  const { context } = await import("esbuild");
  const ctx = await context(options);
  await ctx.watch();
  console.log("watching demo sources…");
} else {
  const result = await build(options);
  if (result.errors.length === 0) {
    console.log("demo/agent.bundle.js written — real agent loop, mock provider, no key.");
  }
}
