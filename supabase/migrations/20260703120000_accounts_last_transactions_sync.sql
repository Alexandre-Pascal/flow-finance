-- Dernière sync transactions réussie (indépendant de updated_at sur balance refresh).
alter table public.accounts
  add column if not exists last_transactions_synced_at timestamptz;

comment on column public.accounts.last_transactions_synced_at is
  'Horodatage de la dernière synchronisation transactions Enable Banking réussie.';
