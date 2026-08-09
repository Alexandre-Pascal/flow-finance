-- Préférences utilisateur (modules visibles, mots-clés salaire / personne suivie)

alter table public.profiles
  add column if not exists settings jsonb not null default '{}'::jsonb;
