-- Flow Finance — espaces
-- Un compte joint n'est pas « un compte de plus » : c'est un budget partagé
-- avec quelqu'un d'autre. Les regrouper en espaces permet de séparer ce qui ne
-- se mélange pas — dépenses, rentrées, abonnements.
--
-- `accounts.space_id` reste nullable : un compte sans espace est traité comme
-- personnel, pour que rien ne casse entre la migration et l'affectation.

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null default 'personal' check (kind in ('personal', 'shared')),
  color text not null default '#0F172A',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_spaces_user
  on public.spaces (user_id, position);

alter table public.spaces enable row level security;

create policy "spaces_all_own" on public.spaces
  for all using (auth.uid() = user_id);

create trigger spaces_updated_at
  before update on public.spaces
  for each row execute function public.set_updated_at();

alter table public.accounts
  add column if not exists space_id uuid
    references public.spaces (id) on delete set null;

create index if not exists idx_accounts_space
  on public.accounts (space_id)
  where space_id is not null;

-- Un espace personnel pour chaque utilisateur qui a déjà des comptes.
insert into public.spaces (user_id, name, kind, position)
select distinct a.user_id, 'Perso', 'personal', 0
from public.accounts a
where not exists (
  select 1 from public.spaces s where s.user_id = a.user_id
);

update public.accounts a
set space_id = s.id
from public.spaces s
where s.user_id = a.user_id
  and s.kind = 'personal'
  and a.space_id is null;
