-- Pixel Murim accounts: run once in Supabase -> SQL Editor -> New query -> Run.
-- One row per player: the in-game name, the game-server key that carries the ranking, and save data.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null unique check (name ~ '^[A-Z0-9]{1,10}$'),
  server_token text not null check (length(server_token) between 16 and 40),
  save jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- each player reads and writes only their own row
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- "is this name free?" for the sign-up screen, without exposing anyone's row
create or replace function public.name_taken(n text) returns boolean
language sql security definer set search_path = public stable
as $$ select exists (select 1 from public.profiles where name = upper(n)) $$;
grant execute on function public.name_taken(text) to anon, authenticated;
