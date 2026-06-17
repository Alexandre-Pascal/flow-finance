-- Flow Finance — ajustements manuels sur les comptes d'épargne
-- Dépôts espèces/chèque et intérêts saisis par l'utilisateur (hors virements bancaires).

create table if not exists public.savings_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  savings_account_id uuid not null references public.savings_accounts (id) on delete cascade,
  kind text not null check (kind in ('cash', 'check', 'interest')),
  amount numeric(14, 2) not null check (amount > 0),
  adjustment_date date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_savings_adjustments_account
  on public.savings_adjustments (savings_account_id, adjustment_date desc);

alter table public.savings_adjustments enable row level security;

create policy "savings_adjustments_all_own" on public.savings_adjustments
  for all using (auth.uid() = user_id);

create trigger savings_adjustments_updated_at
  before update on public.savings_adjustments
  for each row execute function public.set_updated_at();
