-- League forms land here first (fast), then the "DPL Interest" Apps Script
-- (league/interest.gs) copies them into the Players / Partners tabs and marks
-- them synced. Same pattern as calender/rsvp-inbox.sql.
-- Run once in Supabase → SQL editor.
create table if not exists public.league_inbox (
  id          bigint generated always as identity primary key,
  form        text not null check (form in ('player', 'sponsor')),
  name        text not null check (length(name) between 1 and 100),
  phone       text not null check (phone ~ '^[0-9+ ]{7,20}$'),
  email       text not null check (length(email) between 3 and 200 and position('@' in email) > 1),
  area        text not null default '' check (length(area) <= 200),
  level       text not null default '' check (length(level) <= 50),
  instagram   text not null default '' check (length(instagram) <= 100),
  company     text not null default '' check (length(company) <= 200),
  designation text not null default '' check (length(designation) <= 200),
  interest    text not null default '' check (length(interest) <= 100),
  message     text not null default '' check (length(message) <= 2000),
  created_at  timestamptz not null default now(),
  synced      boolean not null default false,
  -- a partner enquiry must name its company
  check (form = 'player' or length(company) > 0)
);

-- The website (anon key) may only add rows: no reading anyone's details, no edits.
alter table public.league_inbox enable row level security;
revoke all on public.league_inbox from anon, authenticated;
grant insert (form, name, phone, email, area, level, instagram, company, designation, interest, message) on public.league_inbox to anon;
drop policy if exists "website can submit" on public.league_inbox;
create policy "website can submit" on public.league_inbox for insert to anon with check (true);

-- Ping the DPL Interest Apps Script on every new row, so it copies it into the
-- Sheet within seconds. The body is ignored by the script; it reads the inbox itself.
create extension if not exists pg_net;
create or replace function public.league_inbox_ping() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://script.google.com/macros/s/AKfycbxeWfHin0MasnfTZFuVLEnP7q1DNWpu-OfIfUeppAfJczKvbxiF_uYnLDGThUNr1lCF/exec',
    body := jsonb_build_object('table', 'league_inbox'),
    timeout_milliseconds := 5000
  );
  return new;
end $$;
drop trigger if exists league_inbox_ping on public.league_inbox;
create trigger league_inbox_ping after insert on public.league_inbox
for each row execute function public.league_inbox_ping();
