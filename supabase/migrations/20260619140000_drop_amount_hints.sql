-- Retrait de amount_hints : la catégorisation se fait uniquement par libellé.

alter table public.categories
  drop column if exists amount_hints;
