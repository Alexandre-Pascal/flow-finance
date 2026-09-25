-- Flow Finance — virements entre les comptes de l'utilisateur
-- Un virement d'un compte à l'autre n'est ni une dépense ni un revenu : il ne
-- fait que déplacer de l'argent. Faute de le reconnaître, chaque virement était
-- compté deux fois, en sortie sur un compte et en entrée sur l'autre.
--
-- La contrepartie est détectée par le libellé (qui nomme le titulaire du compte
-- visé), et `transfer_manual` permet de trancher à la main quand le libellé ne
-- dit rien — les conversions Revolut « To EUR », par exemple.

alter table public.transactions
  add column if not exists transfer_account_id uuid
    references public.accounts (id) on delete set null;

alter table public.transactions
  add column if not exists transfer_manual boolean not null default false;

create index if not exists idx_transactions_transfer_account
  on public.transactions (transfer_account_id)
  where transfer_account_id is not null;
