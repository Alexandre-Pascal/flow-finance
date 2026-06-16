-- Supprime les catégories en double (garde la plus ancienne par nom)

delete from public.categories duplicate
using public.categories keeper
where duplicate.user_id = keeper.user_id
  and lower(trim(duplicate.name)) = lower(trim(keeper.name))
  and duplicate.created_at > keeper.created_at;

create unique index if not exists idx_categories_user_name
  on public.categories (user_id, lower(name));
