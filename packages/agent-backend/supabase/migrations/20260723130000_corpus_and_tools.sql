-- Admin-managed configuration: the web_search corpus and the agent's tool toggles.

create table if not exists public.corpus (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  snippet    text not null,
  tags       text[] not null default '{}',
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tool_config (
  name        text primary key,
  enabled     boolean not null default true,
  description text
);

alter table public.corpus enable row level security;
alter table public.tool_config enable row level security;

-- Seed the corpus with the documents that used to live in tools.ts.
insert into public.corpus (title, snippet, tags) values
  ('Agentic AI, defined',
   'Agentic AI describes systems that pursue a goal over multiple steps: they plan, call tools, observe results, and adapt until the task is done.',
   '{agent,agentic,ai,definition,loop}'),
  ('The ReAct pattern',
   'ReAct interleaves reasoning and acting: the model emits a thought, chooses a tool, reads the observation, and repeats. It underpins most tool-using agents.',
   '{react,reasoning,tools,pattern,loop}'),
  ('Next.js App Router',
   'The Next.js App Router uses React Server Components and file-based routing under app/, with streaming and layouts built in.',
   '{nextjs,next,frontend,react,"app router"}'),
  ('Angular standalone components',
   'Modern Angular favors standalone components that declare their own imports, removing much of the NgModule boilerplate.',
   '{angular,admin,standalone,frontend,components}'),
  ('Server-Sent Events',
   'SSE streams text from server to client over a single long-lived HTTP response, ideal for pushing agent steps to a UI as they happen.',
   '{sse,streaming,events,http}')
on conflict do nothing;

-- Seed the tool registry.
insert into public.tool_config (name, enabled, description) values
  ('web_search', true, 'Search a small demo knowledge base for background information.'),
  ('calculator', true, 'Evaluate a basic arithmetic expression (+ - * / and parentheses).'),
  ('current_time', true, 'Get the current date and time in ISO 8601 (UTC).')
on conflict (name) do nothing;
