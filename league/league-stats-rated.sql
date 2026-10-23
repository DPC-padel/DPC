-- League analytics dashboard: also say, for each registration, whether the player has an
-- official DPC rating (has played with DPC) and a ranking (2+ matches on a leaderboard).
-- Run once in Supabase → SQL editor, after league-stats-password.sql. Safe to run again.
create or replace function public.league_stats(pw text, since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from league_secret where hash = encode(digest(coalesce(pw, ''), 'sha256'), 'hex')) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_array(extract(epoch from at)::bigint, vid, sid, page, event, detail, src, device) order by at)
                        from league_events where at >= since), '[]'::jsonb),
    'regs',   coalesce((select jsonb_agg(jsonb_build_object('at', extract(epoch from i.created_at)::bigint, 'gender', i.gender, 'level', i.level,
                                  'experience', i.experience, 'side', i.side, 'availability', i.availability, 'tshirt', i.tshirt, 'dob', i.dob,
                                  'rated',  coalesce(jsonb_array_length(d.matches) > 0, false),
                                  'ranked', coalesce(nullif(d.player->>'ranking', '') is not null, false)) order by i.created_at)
                        from league_inbox i
                        left join dashboard_cache d on d.phone = right(regexp_replace(i.phone, '\D', '', 'g'), 10)
                        where i.form = 'player' and i.created_at >= since and i.name not ilike 'DPC TEST%'), '[]'::jsonb));
end $$;
revoke all on function public.league_stats(text, timestamptz) from public;
grant execute on function public.league_stats(text, timestamptz) to anon, authenticated;
