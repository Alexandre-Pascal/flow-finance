-- Flow Finance — affectation manuelle d'une transaction à un compte d'épargne.
-- Permet de réaffecter un virement à un livret précis lorsque le libellé
-- bancaire est identique pour plusieurs comptes (override des mots-clés).

alter table public.transactions
  add column if not exists savings_account_id uuid
    references public.savings_accounts (id) on delete set null,
  add column if not exists savings_account_manual boolean not null default false;
