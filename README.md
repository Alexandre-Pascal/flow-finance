# Flow Finance

Tracker de finances personnelles — comptes courants et livrets, synchronisation bancaire via Open Banking (Enable Banking).

## Fonctionnalités

- Tableau de bord : soldes, dépenses/revenus du mois, graphique
- Liste des comptes (courant + livret)
- Historique des transactions
- Interface **FR / EN** (next-intl)
- Auth Supabase (Google OAuth) ou **mode démo** sans configuration
- Sync bancaire Enable Banking (phase 2, après déploiement HTTPS)

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| i18n | next-intl |
| Backend | Next.js Route Handlers |
| Base de données | Supabase (Postgres + Auth + RLS) |
| Banque | Enable Banking API (DSP2) |
| Charts | Recharts |
| Design | ui-ux-pro-max-skill |

## Prérequis

- Node.js 20+
- npm
- Compte [Supabase](https://supabase.com) (optionnel pour mode démo)
- Compte [Enable Banking](https://enablebanking.com) (phase 2)

## Installation

```bash
git clone https://github.com/<votre-user>/flow-finance.git
cd flow-finance
npm install
cp .env.example .env.local
npm run dev
```

Ouvrir [http://localhost:3000/fr](http://localhost:3000/fr) — en l'absence de Supabase, le **mode démo** s'active automatiquement.

## Variables d'environnement

Voir [`.env.example`](.env.example). Ne jamais committer `.env.local` ni les fichiers `.pem`.

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build production |
| `npm run start` | Serveur production |
| `npm run lint` | ESLint |

## Base de données

Appliquer la migration initiale dans le SQL Editor Supabase :

```
supabase/migrations/20260615120000_initial_schema.sql
```

Voir [`docs/DATABASE.md`](docs/DATABASE.md).

## Authentification Google

Configurer dans Supabase (**Authentication → Providers → Google**) :

1. Créer des identifiants OAuth sur [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Type : **Web application**
3. **Authorized redirect URI** (copier depuis Supabase) :
   ```
   https://xqgeqaibrsskxrnxjoug.supabase.co/auth/v1/callback
   ```
4. Coller **Client ID** et **Client Secret** dans Supabase → activer Google
5. **Authentication → URL Configuration** → Redirect URLs :
   ```
   http://localhost:3000/auth/callback
   https://flow-finance-omega.vercel.app/auth/callback
   ```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Enable Banking](docs/ENABLE_BANKING.md)
- [i18n](docs/I18N.md)
- [Conventions de commentaires](docs/COMMENTING.md)
- [Contributing](CONTRIBUTING.md)

## Roadmap

- [x] Phase 1 — UI, i18n, auth, schéma DB, mode démo
- [x] Phase 2 — Module Enable Banking (connect, callback, sync, cron)
- [ ] Phase 3 — Catégorisation auto, budgets, export CSV

## Licence

MIT
