-- ============================================================
--  DPC lockdown — run once in Supabase → SQL editor.
--  Replace CHANGE_ME with your new admin password first (the same one you put
--  in the scripts' ADMIN_PASSWORD Script Property). Safe to run again.
--
--  After this:
--   - nobody can list dashboard_cache; a dashboard is read with its owner's key
--     (login hands it out) through dashboard_for()
--   - RSVPs with phone numbers live only in games_private; admin pages read
--     them through admin_rsvps(password)
--   - a second registration for the same game is refused here (the site can't
--     see phone numbers any more to check)
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Admin password, stored as a hash ─────────────────────────
create table if not exists public.admin_secret (
  id   int primary key default 1 check (id = 1),
  hash text not null
);
alter table public.admin_secret enable row level security;
revoke all on public.admin_secret from anon, authenticated;
insert into public.admin_secret (id, hash)
values (1, encode(extensions.digest('CHANGE_ME', 'sha256'), 'hex'))
on conflict (id) do update set hash = excluded.hash;

-- ── Games: RSVPs with phones (written by the games script) ───
create table if not exists public.games_private (
  source     text primary key,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.games_private enable row level security;
revoke all on public.games_private from anon, authenticated;

create or replace function public.admin_rsvps(pw text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from admin_secret where hash = encode(digest(coalesce(pw, ''), 'sha256'), 'hex')) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  return coalesce((select payload from games_private where source = 'rsvps'), '[]'::jsonb);
end $$;
revoke all on function public.admin_rsvps(text) from public;
grant execute on function public.admin_rsvps(text) to anon, authenticated;

create or replace function public.rsvp_inbox_not_twice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from games_private g, jsonb_array_elements(g.payload) r
             where g.source = 'rsvps' and r->>'eventId' = new.event_id and r->>'phone' = new.phone) then
    raise exception 'Already registered for this event.' using errcode = '23505';   -- → HTTP 409, as before
  end if;
  return new;
end $$;
drop trigger if exists rsvp_inbox_not_twice on public.rsvp_inbox;
create trigger rsvp_inbox_not_twice before insert on public.rsvp_inbox
for each row execute function public.rsvp_inbox_not_twice();

-- ── Dashboards: only with the owner's key ────────────────────
alter table public.dashboard_cache add column if not exists key text;
create unique index if not exists dashboard_cache_key on public.dashboard_cache (key);
revoke select on public.dashboard_cache from anon, authenticated;

create or replace function public.dashboard_for(k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('phone', phone, 'player', player, 'matches', matches)
  from dashboard_cache where key = k and length(k) = 64
$$;
revoke all on function public.dashboard_for(text) from public;
grant execute on function public.dashboard_for(text) to anon, authenticated;

-- For the health check: which matches are on some dashboard (no phones, no names).
create or replace function public.dashboard_match_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select distinct m->>'matchId' from dashboard_cache, jsonb_array_elements(matches::jsonb) m
$$;
revoke all on function public.dashboard_match_ids() from public;
grant execute on function public.dashboard_match_ids() to anon, authenticated;
