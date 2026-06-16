-- Notes personnelles courtes sur les transactions

alter table public.transactions
  add column if not exists note text;
