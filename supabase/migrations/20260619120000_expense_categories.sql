-- Catégories de dépenses : apprentissage par montant et verrouillage manuel

alter table public.categories
  add column if not exists amount_hints numeric[] not null default '{}';

alter table public.transactions
  add column if not exists category_manual boolean not null default false;

create index if not exists idx_transactions_category_id
  on public.transactions (category_id);

create unique index if not exists idx_categories_user_name
  on public.categories (user_id, lower(name));
