import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Single shared Supabase client for every store module.

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY in packages/agent-backend/.env",
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
