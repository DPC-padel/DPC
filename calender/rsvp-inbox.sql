-- Game registrations land here first (fast), then the games Apps Script copies
-- them into the RSVPs tab of the Sheet and marks them synced.
-- Run once in Supabase → SQL editor.

create table public.rsvp_inbox (
  id         bigint generated always as identity primary key,
  event_id   text not null check (length(event_id) between 1 and 64),
  event_name text not null default '' check (length(event_name) <= 200),
  name       text not null check (length(name) between 1 and 100),
  phone      text not null check (phone ~ '^[0-9]{7,15}$'),
  status     text not null default 'confirmed' check (status in ('confirmed', 'waitlist')),
  created_at timestamptz not null default now(),
  synced     boolean not null default false
);

-- A double tap can't queue the same person twice while they wait to be copied.
-- Once copied (synced), they can register again if the Sheet row is removed.
create unique index rsvp_inbox_pending_once on public.rsvp_inbox (event_id, phone) where not synced;

-- The website (anon key) may only add rows: no reading phone numbers, no edits.
alter table public.rsvp_inbox enable row level security;
revoke all on public.rsvp_inbox from anon, authenticated;
grant insert (event_id, event_name, name, phone, status) on public.rsvp_inbox to anon;
create policy "website can register" on public.rsvp_inbox for insert to anon with check (true);

-- Ping the games Apps Script on every new row so it copies it into the Sheet
-- within seconds (same as a dashboard "Database Webhook", set up in SQL).
-- The body is ignored by the script; it reads the inbox itself.
create extension if not exists pg_net;

create or replace function public.rsvp_inbox_ping() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://script.google.com/macros/s/AKfycbzcuaikfX6twFzhGkHz6A5oh1vdUnCu-17br2YqIpzPG7D4DE1cJn9VRLt7wFSJOpQB/exec',
    body := jsonb_build_object('table', 'rsvp_inbox'),
    timeout_milliseconds := 5000
  );
  return new;
end $$;

create trigger rsvp_inbox_ping after insert on public.rsvp_inbox
for each row execute function public.rsvp_inbox_ping();
