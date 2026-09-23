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
