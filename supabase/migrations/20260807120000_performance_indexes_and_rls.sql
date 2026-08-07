-- Flow Finance — optimisation des lectures
--
-- Deux corrections indépendantes :
--
-- 1. Index manquants sur les colonnes réellement filtrées par l'application.
--
-- 2. Réécriture des policies RLS en `(select auth.uid())`. Appelée directement,
--    `auth.uid()` est traitée comme volatile et réévaluée par Postgres POUR
--    CHAQUE LIGNE examinée. Enveloppée dans un sous-select, elle est évaluée
--    une seule fois par requête et le résultat est réutilisé (InitPlan).
--    Aucun changement de sémantique : les mêmes lignes restent visibles.

-- ---------------------------------------------------------------------------
-- 1. Index
-- ---------------------------------------------------------------------------

-- Les deux fonctions de ré-attribution filtrent les dépenses par compte
-- (`account_id in (...) and amount < 0`). Sans cet index, Postgres parcourt
-- toutes les transactions du compte.
create index if not exists idx_transactions_account_amount
  on public.transactions (account_id, amount);

-- Colonne ajoutée par 20260621130000 sans index : utilisée pour rattacher un
-- virement à un livret précis.
create index if not exists idx_transactions_savings_account_id
  on public.transactions (savings_account_id)
  where savings_account_id is not null;

-- `savings_adjustments` n'était indexée que sur (savings_account_id, date),
-- alors que le chargement des données filtre sur user_id.
create index if not exists idx_savings_adjustments_user_date
  on public.savings_adjustments (user_id, adjustment_date desc);

-- ---------------------------------------------------------------------------
-- 2. Policies RLS
-- ---------------------------------------------------------------------------

-- Profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id);

-- Bank connections
drop policy if exists "bank_connections_all_own" on public.bank_connections;
create policy "bank_connections_all_own" on public.bank_connections
  for all using ((select auth.uid()) = user_id);

-- Accounts
drop policy if exists "accounts_all_own" on public.accounts;
create policy "accounts_all_own" on public.accounts
  for all using ((select auth.uid()) = user_id);

-- Categories
drop policy if exists "categories_all_own" on public.categories;
create policy "categories_all_own" on public.categories
  for all using ((select auth.uid()) = user_id);

-- Transactions (via le compte appartenant à l'utilisateur).
-- C'est la table la plus lue : le gain est ici le plus important.
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (
    exists (
      select 1 from public.accounts a
      where a.id = transactions.account_id
        and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert with check (
    exists (
      select 1 from public.accounts a
      where a.id = transactions.account_id
        and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update using (
    exists (
      select 1 from public.accounts a
      where a.id = transactions.account_id
        and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete using (
    exists (
      select 1 from public.accounts a
      where a.id = transactions.account_id
        and a.user_id = (select auth.uid())
    )
  );

-- Recurring payments
drop policy if exists "recurring_payments_all_own" on public.recurring_payments;
create policy "recurring_payments_all_own" on public.recurring_payments
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Recurring suggestion dismissals
drop policy if exists "recurring_suggestion_dismissals_all_own"
  on public.recurring_suggestion_dismissals;
create policy "recurring_suggestion_dismissals_all_own"
  on public.recurring_suggestion_dismissals
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Savings
drop policy if exists "savings_accounts_all_own" on public.savings_accounts;
create policy "savings_accounts_all_own" on public.savings_accounts
  for all using ((select auth.uid()) = user_id);

drop policy if exists "savings_adjustments_all_own" on public.savings_adjustments;
create policy "savings_adjustments_all_own" on public.savings_adjustments
  for all using ((select auth.uid()) = user_id);

-- Crypto
drop policy if exists "crypto_holdings_all_own" on public.crypto_holdings;
create policy "crypto_holdings_all_own" on public.crypto_holdings
  for all using ((select auth.uid()) = user_id);

drop policy if exists "crypto_transactions_all_own" on public.crypto_transactions;
create policy "crypto_transactions_all_own" on public.crypto_transactions
  for all using ((select auth.uid()) = user_id);

drop policy if exists "crypto_portfolio_settings_all_own"
  on public.crypto_portfolio_settings;
create policy "crypto_portfolio_settings_all_own"
  on public.crypto_portfolio_settings
  for all using ((select auth.uid()) = user_id);
