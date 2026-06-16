-- Masquer des suggestions de prélèvements récurrents (faux positifs)

create table if not exists public.recurring_suggestion_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cluster_key text not null,
  source text not null check (source in ('paypal', 'general')),
  amount numeric(14, 2) not null check (amount > 0),
  billing_day smallint not null check (billing_day >= 1 and billing_day <= 31),
  billing_month smallint check (billing_month is null or (billing_month >= 1 and billing_month <= 12)),
  cadence text not null default 'monthly' check (cadence in ('monthly', 'yearly')),
  description_pattern text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, cluster_key)
);

create index if not exists idx_recurring_suggestion_dismissals_user_id
  on public.recurring_suggestion_dismissals (user_id);

alter table public.recurring_suggestion_dismissals enable row level security;

create policy "recurring_suggestion_dismissals_all_own"
  on public.recurring_suggestion_dismissals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
