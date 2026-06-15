-- Flow Finance — schéma initial
-- Tables : profiles, bank_connections, accounts, transactions, categories
-- RLS : chaque utilisateur n'accède qu'à ses propres données

-- ---------------------------------------------------------------------------
-- Profiles (extension des utilisateurs Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Connexions bancaires (Enable Banking — phase 2)
-- ---------------------------------------------------------------------------
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'enable_banking',
  session_id text,
  aspsp_name text,
  valid_until timestamptz,
  status text not null default 'pending'
    check (status in ('active', 'expired', 'revoked', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Comptes bancaires
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid references public.bank_connections (id) on delete set null,
  external_uid text,
  name text not null,
  iban text,
  type text not null check (type in ('checking', 'savings')),
  balance numeric(14, 2) not null default 0,
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catégories de dépenses
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#1E3A8A',
  keyword_rules text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  entry_reference text not null,
  booking_date date not null,
  amount numeric(14, 2) not null,
  currency text not null default 'EUR',
  description text not null default '',
  status text not null default 'BOOK' check (status in ('BOOK', 'PDNG')),
  category_id uuid references public.categories (id) on delete set null,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, entry_reference)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_accounts_user_id on public.accounts (user_id);
create index if not exists idx_transactions_account_date
  on public.transactions (account_id, booking_date desc);
create index if not exists idx_bank_connections_user_id
  on public.bank_connections (user_id);

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger bank_connections_updated_at
  before update on public.bank_connections
  for each row execute function public.set_updated_at();

create trigger accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create trigger transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-création du profil à l'inscription
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, locale, currency)
  values (new.id, 'fr', 'EUR');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.bank_connections enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

-- Profiles
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Bank connections
create policy "bank_connections_all_own" on public.bank_connections
  for all using (auth.uid() = user_id);

-- Accounts
create policy "accounts_all_own" on public.accounts
  for all using (auth.uid() = user_id);

-- Categories
create policy "categories_all_own" on public.categories
  for all using (auth.uid() = user_id);

-- Transactions (via compte appartenant à l'utilisateur)
create policy "transactions_select_own" on public.transactions
  for select using (
    exists (
      select 1 from public.accounts a
      where a.id = transactions.account_id and a.user_id = auth.uid()
    )
  );
create policy "transactions_insert_own" on public.transactions
  for insert with check (
    exists (
      select 1 from public.accounts a
      where a.id = transactions.account_id and a.user_id = auth.uid()
    )
  );
create policy "transactions_update_own" on public.transactions
  for update using (
    exists (
      select 1 from public.accounts a
      where a.id = transactions.account_id and a.user_id = auth.uid()
    )
  );
create policy "transactions_delete_own" on public.transactions
  for delete using (
    exists (
      select 1 from public.accounts a
      where a.id = transactions.account_id and a.user_id = auth.uid()
    )
  );
