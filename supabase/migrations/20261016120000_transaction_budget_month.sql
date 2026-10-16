-- Flow Finance — rattacher une rentrée au mois qu'elle finance
-- Un virement reçu le 28 finance souvent le mois suivant. La règle automatique
-- ne décale que le salaire (voir PAYROLL_SHIFT_MIN_DAY) : pour tout le reste,
-- l'utilisateur tranche ligne à ligne.
-- 0 = le mois de réception, 1 = le mois suivant. NULL laisse la règle agir.

alter table public.transactions
  add column if not exists budget_month_shift smallint;

alter table public.transactions
  drop constraint if exists transactions_budget_month_shift_range;

alter table public.transactions
  add constraint transactions_budget_month_shift_range
  check (budget_month_shift is null or budget_month_shift between 0 and 1);
