-- Abonnements / prélèvements récurrents (matching par montant, ex. PayPal)

create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  amount numeric(14, 2) not null check (amount > 0),
  amount_tolerance numeric(14, 2) not null default 0.05 check (amount_tolerance >= 0),
  description_pattern text not null default 'PAYPAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists recurring_payment_id uuid
  references public.recurring_payments (id) on delete set null;

create index if not exists idx_recurring_payments_user_id
  on public.recurring_payments (user_id);

create index if not exists idx_transactions_recurring_payment_id
  on public.transactions (recurring_payment_id);

create trigger recurring_payments_updated_at
  before update on public.recurring_payments
  for each row execute function public.set_updated_at();

alter table public.recurring_payments enable row level security;

create policy "recurring_payments_all_own" on public.recurring_payments
  for all using (auth.uid() = user_id);
