-- Flow Finance — comptes d'épargne gérés manuellement
-- L'utilisateur crée ses livrets/PEL, saisit un solde de base et définit les
-- libellés des virements vers/depuis le compte courant. Le solde est ensuite
-- mis à jour automatiquement à partir des transactions correspondantes.

create table if not exists public.savings_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null default 'other',
  color text not null default '#1E3A8A',
  base_balance numeric(14, 2) not null default 0,
  base_date date not null default current_date,
  interest_rate numeric(6, 3),
  ceiling numeric(14, 2),
  opening_date date,
  deposit_keywords text[] not null default '{}',
  withdrawal_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_savings_accounts_user_id
  on public.savings_accounts (user_id);

alter table public.savings_accounts enable row level security;

create policy "savings_accounts_all_own" on public.savings_accounts
  for all using (auth.uid() = user_id);

create trigger savings_accounts_updated_at
  before update on public.savings_accounts
  for each row execute function public.set_updated_at();
