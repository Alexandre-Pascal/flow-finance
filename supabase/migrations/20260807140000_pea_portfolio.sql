-- Flow Finance — portefeuille PEA (import CSV Trade Republic + plans d'investissement)

create table if not exists public.pea_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  isin text not null,
  ticker text,
  name text not null,
  quantity numeric(24, 8) not null default 0,
  cost_basis_eur numeric(14, 2) not null default 0,
  manual_price_eur numeric(14, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, isin)
);

create table if not exists public.pea_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  holding_id uuid references public.pea_holdings (id) on delete cascade,
  kind text not null check (
    kind in ('buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee', 'interest')
  ),
  quantity numeric(24, 8) not null default 0,
  amount_eur numeric(14, 2) not null,
  transaction_date date not null,
  note text,
  source text not null default 'manual'
    check (source in ('csv', 'bank_estimate', 'manual')),
  external_ref text,
  bank_transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_ref)
);

create table if not exists public.pea_investment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  keywords text[] not null default '{}',
  holding_id uuid references public.pea_holdings (id) on delete set null,
  expected_amount_eur numeric(14, 2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pea_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  opening_date date,
  cash_balance_eur numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pea_holdings_user_id
  on public.pea_holdings (user_id);

create index if not exists idx_pea_transactions_user_id
  on public.pea_transactions (user_id);

create index if not exists idx_pea_transactions_holding_id
  on public.pea_transactions (holding_id);

create index if not exists idx_pea_transactions_source_date
  on public.pea_transactions (user_id, source, transaction_date);

create index if not exists idx_pea_transactions_bank_transaction_id
  on public.pea_transactions (bank_transaction_id);

create index if not exists idx_pea_investment_plans_user_id
  on public.pea_investment_plans (user_id);

alter table public.pea_holdings enable row level security;
alter table public.pea_transactions enable row level security;
alter table public.pea_investment_plans enable row level security;
alter table public.pea_settings enable row level security;

create policy "pea_holdings_all_own" on public.pea_holdings
  for all using (auth.uid() = user_id);

create policy "pea_transactions_all_own" on public.pea_transactions
  for all using (auth.uid() = user_id);

create policy "pea_investment_plans_all_own" on public.pea_investment_plans
  for all using (auth.uid() = user_id);

create policy "pea_settings_all_own" on public.pea_settings
  for all using (auth.uid() = user_id);

create trigger pea_holdings_updated_at
  before update on public.pea_holdings
  for each row execute function public.set_updated_at();

create trigger pea_transactions_updated_at
  before update on public.pea_transactions
  for each row execute function public.set_updated_at();

create trigger pea_investment_plans_updated_at
  before update on public.pea_investment_plans
  for each row execute function public.set_updated_at();

create trigger pea_settings_updated_at
  before update on public.pea_settings
  for each row execute function public.set_updated_at();

-- Affectation manuelle d'une transaction bancaire à un plan d'investissement
-- (override des mots-clés), sur le modèle de savings_account_id.
alter table public.transactions
  add column if not exists pea_plan_id uuid
    references public.pea_investment_plans (id) on delete set null,
  add column if not exists pea_manual boolean not null default false;
