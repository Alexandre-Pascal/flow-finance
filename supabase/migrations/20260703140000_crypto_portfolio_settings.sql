-- Paramètres fiscaux du portefeuille crypto (investissement total de base).

create table if not exists public.crypto_portfolio_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_invested_eur numeric(14, 2) not null default 2163,
  updated_at timestamptz not null default now()
);

alter table public.crypto_portfolio_settings enable row level security;

create policy "crypto_portfolio_settings_all_own" on public.crypto_portfolio_settings
  for all using (auth.uid() = user_id);

create trigger crypto_portfolio_settings_updated_at
  before update on public.crypto_portfolio_settings
  for each row execute function public.set_updated_at();
