-- Cadence semestrielle (eau, assainissement, etc.)

alter table public.recurring_payments
  drop constraint if exists recurring_payments_cadence_check;

alter table public.recurring_payments
  add constraint recurring_payments_cadence_check
  check (cadence in ('monthly', 'semiannual', 'yearly'));

alter table public.recurring_suggestion_dismissals
  drop constraint if exists recurring_suggestion_dismissals_cadence_check;

alter table public.recurring_suggestion_dismissals
  add constraint recurring_suggestion_dismissals_cadence_check
  check (cadence in ('monthly', 'semiannual', 'yearly'));
