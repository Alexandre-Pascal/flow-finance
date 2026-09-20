-- Flow Finance — affecter « le reste » d'un livret à un objectif
-- Troisième mode d'affectation : après les montants fixes des autres objectifs,
-- ce qui reste du livret revient à celui-ci (ex. 19 k sur le Livret A, 10 k
-- réservés au matelas de sécurité, les 9 k restants vont à l'apport). Le
-- montant stocké n'est pas lu, l'objectif suit le solde réel.

alter table public.savings_goal_allocations
  drop constraint if exists savings_goal_allocations_allocation_mode_check;

alter table public.savings_goal_allocations
  add constraint savings_goal_allocations_allocation_mode_check
    check (allocation_mode in ('fixed', 'remainder', 'full'));

alter table public.savings_goal_allocations
  drop constraint if exists savings_goal_allocations_amount_check;

alter table public.savings_goal_allocations
  add constraint savings_goal_allocations_amount_check
    check (allocation_mode <> 'fixed' or amount > 0);
