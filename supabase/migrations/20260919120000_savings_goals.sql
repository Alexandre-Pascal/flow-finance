-- Flow Finance — objectifs d'épargne
-- Un objectif porte une cible (montant, échéance optionnelle) et se finance sur
-- une part des livrets : l'utilisateur affecte un montant fixe par livret, le
-- reste du solde demeure non affecté. Un même livret peut donc porter
-- plusieurs objectifs (ex. matelas de sécurité + voyage sur le Livret A).

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  target_amount numeric(14, 2) not null check (target_amount > 0),
  target_date date,
  color text not null default '#CA8A04',
  note text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_savings_goals_user
  on public.savings_goals (user_id, position);

alter table public.savings_goals enable row level security;

create policy "savings_goals_all_own" on public.savings_goals
  for all using (auth.uid() = user_id);

create trigger savings_goals_updated_at
  before update on public.savings_goals
  for each row execute function public.set_updated_at();

create table if not exists public.savings_goal_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.savings_goals (id) on delete cascade,
  savings_account_id uuid not null references public.savings_accounts (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Une seule ligne par couple (objectif, livret) : l'affectation est un montant, pas un historique.
create unique index if not exists idx_savings_goal_allocations_unique
  on public.savings_goal_allocations (goal_id, savings_account_id);

create index if not exists idx_savings_goal_allocations_account
  on public.savings_goal_allocations (savings_account_id);

alter table public.savings_goal_allocations enable row level security;

create policy "savings_goal_allocations_all_own" on public.savings_goal_allocations
  for all using (auth.uid() = user_id);

create trigger savings_goal_allocations_updated_at
  before update on public.savings_goal_allocations
  for each row execute function public.set_updated_at();
