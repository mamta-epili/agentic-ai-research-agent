import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pg from "pg";

// Applies every *.sql file in supabase/migrations that hasn't run yet, in
// filename order, tracking applied files in a schema_migrations table.
// Requires DATABASE_URL (Supabase: Project Settings → Database → Connection string).
//
//   npm run db:push -w agent-backend

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase", "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Add your Postgres connection string to .env\n" +
        "(Supabase → Project Settings → Database → Connection string → URI).",
    );
    process.exit(1);
  }

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found in supabase/migrations.");
    return;
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows } = await client.query<{ name: string }>(
      "select name from public.schema_migrations",
    );
    const applied = new Set(rows.map((r) => r.name));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`• skip   ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`→ apply  ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public.schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        count++;
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }

    console.log(count === 0 ? "Up to date — nothing to apply." : `Applied ${count} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
