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

### `savings_goals`

Objectifs d'épargne (page Objectifs).

| Colonne | Type | Description |
|---------|------|-------------|
| name | text | Nom de l'objectif |
| target_amount | numeric | Montant à atteindre (> 0) |
| target_date | date | Échéance optionnelle |
| color | text | Couleur hex de la barre d'avancement |
| position | integer | Ordre d'affichage |

### `savings_goal_allocations`

Part d'un livret affectée à un objectif : un livret peut financer plusieurs
objectifs, et le solde non affecté reste disponible.

| Colonne | Type | Description |
|---------|------|-------------|
| goal_id | uuid | → `savings_goals` |
| savings_account_id | uuid | → `savings_accounts` |
| allocation_mode | text | `fixed` (montant) ou `full` (livret entier réservé) |
| amount | numeric | Montant affecté en mode `fixed` (> 0) ; ignoré en `full` |

**Contrainte unique** : `(goal_id, savings_account_id)`

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
