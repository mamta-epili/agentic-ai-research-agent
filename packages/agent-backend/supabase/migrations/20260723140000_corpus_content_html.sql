-- Rich HTML body for corpus documents (composed in CKEditor). The plain-text
-- `snippet` column stays as the searchable text (derived from this HTML).
alter table public.corpus add column if not exists content_html text;
