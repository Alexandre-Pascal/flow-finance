-- Différencier les abonnements au même montant via le jour de prélèvement

alter table public.recurring_payments
  add column if not exists billing_day smallint
  check (billing_day is null or (billing_day >= 1 and billing_day <= 31));

alter table public.transactions
  add column if not exists recurring_payment_manual boolean not null default false;
