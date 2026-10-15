-- League analytics dashboard (DPC-padel/dpl-stats) gets its own password, separate from Games admin.
-- Replace CHANGE_ME with the dashboard password, then run once in Supabase → SQL editor. Safe to run again.
create table if not exists public.league_secret (
  id   int primary key default 1 check (id = 1),
  hash text not null
);
alter table public.league_secret enable row level security;
revoke all on public.league_secret from anon, authenticated;
insert into public.league_secret (id, hash)
values (1, encode(extensions.digest('CHANGE_ME', 'sha256'), 'hex'))
on conflict (id) do update set hash = excluded.hash;

create or replace function public.league_stats(pw text, since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from league_secret where hash = encode(digest(coalesce(pw, ''), 'sha256'), 'hex')) then
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
