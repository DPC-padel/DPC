-- Season One player registration: the League player form's new questions.
-- Run once in Supabase → SQL editor, after league-inbox.sql. Safe to run again.
alter table public.league_inbox
  add column if not exists gender       text not null default '' check (length(gender) <= 20),
  add column if not exists age          text not null default '' check (age ~ '^[0-9]{0,3}$'),
  add column if not exists experience   text not null default '' check (length(experience) <= 50),
  add column if not exists side         text not null default '' check (length(side) <= 20),
  add column if not exists tournament   text not null default '' check (length(tournament) <= 500),
  add column if not exists categories   text not null default '' check (length(categories) <= 300),
  add column if not exists availability text not null default '' check (length(availability) <= 50),
  add column if not exists tshirt       text not null default '' check (length(tshirt) <= 10),
  add column if not exists consent      text not null default '' check (length(consent) <= 200);

-- The website may add these too (still insert-only, never read).
grant insert (gender, age, experience, side, tournament, categories, availability, tshirt, consent) on public.league_inbox to anon;
