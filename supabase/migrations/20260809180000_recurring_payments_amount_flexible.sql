-- Montant variable pour charges fixes (EDF, Free Mobile, etc.) :
-- le matching s'appuie sur le libellé, le montant devient indicatif.

alter table public.recurring_payments
  add column if not exists amount_flexible boolean not null default false;
