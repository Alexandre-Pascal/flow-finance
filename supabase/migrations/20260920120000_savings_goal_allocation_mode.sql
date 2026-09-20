-- Flow Finance — réserver un livret entier à un objectif
-- Deux façons d'affecter un livret : un montant fixe, ou la totalité du solde
-- (« tout le livret »). En mode « full », le montant stocké n'est pas lu :
-- l'objectif suit le solde réel et se complète donc automatiquement.

alter table public.savings_goal_allocations
  add column if not exists allocation_mode text not null default 'fixed'
    check (allocation_mode in ('fixed', 'full'));

alter table public.savings_goal_allocations
  drop constraint if exists savings_goal_allocations_amount_check;

alter table public.savings_goal_allocations
  add constraint savings_goal_allocations_amount_check
    check (allocation_mode = 'full' or amount > 0);
