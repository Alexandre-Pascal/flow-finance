-- Fusion de plusieurs règles de reconnaissance sous un même abonnement
-- (ex. un service payé via PayPal puis en prélèvement direct) et fin de
-- validité d'une règle devenue obsolète.

alter table public.recurring_payments
  add column if not exists merged_into_id uuid
  references public.recurring_payments (id) on delete set null;

alter table public.recurring_payments
  add column if not exists active_to date;

create index if not exists idx_recurring_payments_merged_into
  on public.recurring_payments (merged_into_id);
