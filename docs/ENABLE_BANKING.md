# Enable Banking — intégration

## Prérequis

1. Compte [Enable Banking](https://enablebanking.com/sign-in)
2. App **Production** avec clé `.pem` et ID application
3. Comptes liés via **Activate by linking accounts**
4. App déployée en **HTTPS** (Vercel) — `localhost` refusé en Production

## Variables d'environnement

```env
ENABLE_BANKING_APP_ID=uuid-de-votre-app
ENABLE_BANKING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
ENABLE_BANKING_REDIRECT_URL=https://votre-app.vercel.app/api/bank/callback
ENABLE_BANKING_ASPSP_NAME=Crédit Agricole [votre région]
ENABLE_BANKING_ASPSP_COUNTRY=FR
NEXT_PUBLIC_APP_URL=https://votre-app.vercel.app
CRON_SECRET=secret-aleatoire-pour-cron
```

## Endpoints

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/bank/connect` | GET | Démarre OAuth → redirect banque |
| `/api/bank/callback` | GET | Callback OAuth, crée comptes + sync initiale |
| `/api/bank/sync` | POST | Sync manuelle (session user) ou cron |

### Cron Vercel

Configuré dans [`vercel.json`](../vercel.json) — 6h UTC quotidien.

Vercel envoie `Authorization: Bearer <CRON_SECRET>`.

## Flux technique

1. **JWT RS256** signé avec la clé privée (`src/lib/enable-banking/jwt.ts`)
2. `POST /auth` → URL de redirection banque
3. `POST /sessions` avec `code` → `session_id` + comptes
4. `GET /accounts/{uid}/transactions` avec `strategy=longest` puis `default`

## Limites connues

| Limite | Détail |
|--------|--------|
| Consentement | ~180 jours, reconnexion manuelle |
| Historique | Souvent 90j en sync background après fenêtre initiale |
| Mode restreint | Uniquement les comptes que **vous** avez liés dans le Control Panel |
| Coût | 0 € en usage perso restreint |

## Pages légales

Requises pour Enable Banking Production (URLs HTTPS) :

- `/fr/privacy` — [`src/app/[locale]/privacy/page.tsx`](../src/app/[locale]/privacy/page.tsx)
- `/fr/terms` — [`src/app/[locale]/terms/page.tsx`](../src/app/[locale]/terms/page.tsx)

## Module code

```
src/lib/enable-banking/
├── jwt.ts      # Authentification API
├── client.ts   # HTTP wrappers
├── types.ts    # Mappers
└── sync.ts     # Sync → Supabase
```
