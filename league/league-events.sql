-- League analytics: anonymous page events from league/track.js, read by league/stats/.
-- Run once in Supabase → SQL editor (after lockdown.sql, which holds the admin password). Safe to run again.
create table if not exists public.league_events (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  vid     text not null check (length(vid) between 1 and 20),     -- random id per browser
  sid     text not null check (length(sid) between 1 and 20),     -- random id per tab session
  page    text not null check (page in ('league', 'register')),
  event   text not null check (event in ('view', 'click', 'start', 'field', 'submit', 'invalid', 'success', 'error')),
  detail  text not null default '' check (length(detail) <= 80),
  src     text not null default '' check (length(src) <= 60),
  device  text not null default '' check (device in ('', 'mobile', 'desktop'))
);
create index if not exists league_events_at on public.league_events (at);

-- The website may only add events: no reading, no edits.
alter table public.league_events enable row level security;
revoke all on public.league_events from anon, authenticated;
grant insert (vid, sid, page, event, detail, src, device) on public.league_events to anon;
drop policy if exists "website can log" on public.league_events;
create policy "website can log" on public.league_events for insert to anon with check (true);

-- Stats page: events since a date plus registration mix (no names, phones or emails),
-- behind the same admin password as Games admin.
-- ponytail: returns raw events and the page adds them up; move the sums into SQL past ~50k events.
create or replace function public.league_stats(pw text, since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from admin_secret where hash = encode(digest(coalesce(pw, ''), 'sha256'), 'hex')) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_array(extract(epoch from at)::bigint, vid, sid, page, event, detail, src, device) order by at)
                        from league_events where at >= since), '[]'::jsonb),
    'regs',   coalesce((select jsonb_agg(jsonb_build_object('at', extract(epoch from created_at)::bigint, 'gender', gender, 'level', level,
                                  'experience', experience, 'side', side, 'availability', availability, 'tshirt', tshirt, 'dob', dob) order by created_at)
                        from league_inbox where form = 'player' and created_at >= since and name not ilike 'DPC TEST%'), '[]'::jsonb));
end $$;
revoke all on function public.league_stats(text, timestamptz) from public;
grant execute on function public.league_stats(text, timestamptz) to anon, authenticated;
