-- Supabase schema for the agent run store.
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query),
-- or via the Supabase CLI, before starting the backend with LLM/DB pointed at Supabase.

create table if not exists public.runs (
  id          uuid primary key,
  query       text not null,
  status      text not null,
  steps       jsonb not null default '[]'::jsonb,
  answer      text,
  provider    text,
  model       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer
);

-- Newest runs first (the admin panel lists in this order).
create index if not exists runs_created_at_idx on public.runs (created_at desc);

-- The backend uses the service-role key, which bypasses Row Level Security.
-- RLS is enabled here so that the anon/public key cannot read or write runs.
-- If you ever want to read runs with the anon key, add explicit policies below.
alter table public.runs enable row level security;
