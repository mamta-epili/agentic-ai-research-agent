-- Create the agent run store.
-- Applied to a linked project with:  supabase db push
-- Or locally with:                   supabase start

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
-- RLS is enabled so the anon/public key cannot read or write runs.
-- Add explicit policies below if you ever need anon access.
alter table public.runs enable row level security;
