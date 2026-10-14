-- Registration asks for date of birth instead of age.
-- Run once in Supabase → SQL editor BEFORE the new form goes live. Safe to run again.
alter table public.league_inbox
  add column if not exists dob text not null default '' check (dob ~ '^([0-9]{4}-[0-9]{2}-[0-9]{2})?$');
grant insert (dob) on public.league_inbox to anon;
