-- Flow Finance — abonnements rattachés à un espace
-- Les abonnements d'un budget partagé n'ont rien à faire dans la liste du
-- budget perso, et une règle perso ne doit pas capter une dépense du joint.
-- `null` vaut espace personnel, comme pour les comptes.

alter table public.recurring_payments
  add column if not exists space_id uuid
    references public.spaces (id) on delete set null;

create index if not exists idx_recurring_payments_space
  on public.recurring_payments (space_id)
  where space_id is not null;

update public.recurring_payments r
set space_id = s.id
from public.spaces s
where s.user_id = r.user_id
  and s.kind = 'personal'
  and r.space_id is null;
