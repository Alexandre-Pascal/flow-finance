-- Flow Finance — comptes manuels (pockets Revolut, sous-comptes)
-- Revolut n'expose pas ses « pockets » en DSP2 : l'argent quitte le compte
-- principal et disparaît des totaux. On le représente par un compte créé à la
-- main, reconnu dans les libellés par un fragment stable (« MB:<uuid> »).
--
-- Le solde d'un tel compte n'est pas donné par la banque : il se reconstruit à
-- partir d'un solde d'ancrage et des virements reconnus.

alter table public.accounts
  add column if not exists match_keywords text[] not null default '{}';

alter table public.accounts
  add column if not exists base_balance numeric(14, 2) not null default 0;

-- Un compte sans identifiant bancaire et avec des mots-clés est manuel.
create index if not exists idx_accounts_manual
  on public.accounts (user_id)
  where external_uid is null;
