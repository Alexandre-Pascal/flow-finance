-- Catégories de dépenses : verrouillage manuel des affectations

alter table public.transactions
  add column if not exists category_manual boolean not null default false;

create index if not exists idx_transactions_category_id
  on public.transactions (category_id);

create unique index if not exists idx_categories_user_name
  on public.categories (user_id, lower(name));
