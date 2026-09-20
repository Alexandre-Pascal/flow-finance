-- Flow Finance — financer un objectif avec le PEA
-- Jusqu'ici une affectation pointait forcément un livret. On généralise : une
-- affectation vise un support, livret (`savings`, avec son id) ou PEA (`pea`,
-- un seul par utilisateur, donc sans id). La crypto reste hors sujet.

alter table public.savings_goal_allocations
  add column if not exists source_kind text not null default 'savings'
    check (source_kind in ('savings', 'pea'));

alter table public.savings_goal_allocations
  alter column savings_account_id drop not null;

alter table public.savings_goal_allocations
  drop constraint if exists savings_goal_allocations_source_check;

alter table public.savings_goal_allocations
  add constraint savings_goal_allocations_source_check
    check (
      (source_kind = 'savings' and savings_account_id is not null)
      or (source_kind = 'pea' and savings_account_id is null)
    );

-- Un seul PEA par objectif (l'index unique existant ne couvre pas les NULL).
create unique index if not exists idx_savings_goal_allocations_pea
  on public.savings_goal_allocations (goal_id)
  where source_kind = 'pea';
