-- No-op: the `corpus-assets` storage bucket is created in the Supabase
-- dashboard (Storage → New bucket → public), not via SQL — inserting into
-- storage.buckets is permission-restricted over the pooler connection.
-- Safe to delete this file.
select 1;
