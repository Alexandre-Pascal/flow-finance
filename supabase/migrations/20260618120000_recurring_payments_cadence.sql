-- Cadence mensuelle / annuelle pour les prélèvements récurrents hors PayPal

alter table public.recurring_payments
  add column if not exists cadence text not null default 'monthly'
  check (cadence in ('monthly', 'yearly'));

alter table public.recurring_payments
  add column if not exists billing_month smallint
  check (billing_month is null or (billing_month >= 1 and billing_month <= 12));
