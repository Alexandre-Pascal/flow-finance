# Contributing — Flow Finance

## Branches

- `main` — stable
- `feat/*` — nouvelles fonctionnalités
- `fix/*` — corrections

## Commits (Conventional Commits)

```
feat(scope): description courte
fix(scope): description
docs: mise à jour README
chore: dépendances
```

Exemples du projet :

```
feat(i18n): add next-intl with fr/en routes
feat(db): add supabase schema and RLS policies
feat(auth): add magic link login flow
feat(ui): add dashboard layout with design system
```

## Code

- TypeScript strict
- Commentaires : voir [`docs/COMMENTING.md`](docs/COMMENTING.md)
- UI : respecter [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)
- Pas de secrets dans le repo (`.pem`, `.env.local`)

## Pull requests

1. Décrire le changement et la motivation
2. Vérifier `npm run build` et `npm run lint`
3. Screenshots pour les changements UI
