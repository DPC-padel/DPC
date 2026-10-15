-- League analytics: also allow "scroll" events (how far down the League page people get).
-- Run once in Supabase → SQL editor, after league-events.sql. Safe to run again.
alter table public.league_events drop constraint if exists league_events_event_check;
alter table public.league_events add constraint league_events_event_check
  check (event in ('view', 'click', 'start', 'field', 'submit', 'invalid', 'success', 'error', 'scroll'));
