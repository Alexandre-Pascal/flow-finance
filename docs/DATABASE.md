# Base de données — Flow Finance

## Tables

### `profiles`

Extension du user Supabase Auth.

| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | = `auth.users.id` |
| locale | text | `fr` ou `en` |
| currency | text | Devise par défaut (`EUR`) |

### `bank_connections`

Connexion Enable Banking (une entrée par flux OAuth réussi).

| Colonne | Type | Description |
|---------|------|-------------|
| session_id | text | ID session Enable Banking |
| valid_until | timestamptz | Expiration consentement (~180j) |
| status | text | `active`, `expired`, `revoked`, `pending` |

### `accounts`

Comptes bancaires synchronisés ou saisis.

| Colonne | Type | Description |
|---------|------|-------------|
| type | text | `checking` ou `savings` |
| external_uid | text | UID Enable Banking |
| balance | numeric | Dernier solde connu |

### `transactions`

| Colonne | Type | Description |
|---------|------|-------------|
| entry_reference | text | ID unique par compte (dédoublonnage) |
| booking_date | date | Date comptable |
| amount | numeric | Montant signé |
| status | text | `BOOK` ou `PDNG` |

**Contrainte unique** : `(account_id, entry_reference)`

### `categories`

Catégories personnalisées avec règles mot-clé (`keyword_rules text[]`).

## RLS

Toutes les tables sont protégées : un utilisateur ne voit que ses lignes (`auth.uid() = user_id` ou jointure via `accounts`).

## Migration

Fichier : [`supabase/migrations/20260615120000_initial_schema.sql`](../supabase/migrations/20260615120000_initial_schema.sql)

Appliquer via le SQL Editor Supabase ou CLI :

```bash
supabase db push
```

## Trigger

`on_auth_user_created` crée automatiquement un `profiles` à l'inscription.
