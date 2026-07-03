-- Flow Finance — portefeuille crypto (import fichier + transactions manuelles)

create table if not exists public.crypto_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  xpub text,
  symbol text not null,
  quantity numeric(24, 12) not null default 0,
  cost_basis_eur numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, xpub, symbol)
);

create table if not exists public.crypto_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  holding_id uuid not null references public.crypto_holdings (id) on delete cascade,
  kind text not null check (kind in ('buy', 'sell', 'deposit', 'withdrawal')),
  quantity numeric(24, 12) not null,
  amount_eur numeric(14, 2) not null,
  transaction_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crypto_holdings_user_id
  on public.crypto_holdings (user_id);

create index if not exists idx_crypto_transactions_user_id
  on public.crypto_transactions (user_id);

create index if not exists idx_crypto_transactions_holding_id
  on public.crypto_transactions (holding_id);

alter table public.crypto_holdings enable row level security;
alter table public.crypto_transactions enable row level security;

create policy "crypto_holdings_all_own" on public.crypto_holdings
  for all using (auth.uid() = user_id);

create policy "crypto_transactions_all_own" on public.crypto_transactions
  for all using (auth.uid() = user_id);

create trigger crypto_holdings_updated_at
  before update on public.crypto_holdings
  for each row execute function public.set_updated_at();

create trigger crypto_transactions_updated_at
  before update on public.crypto_transactions
  for each row execute function public.set_updated_at();
