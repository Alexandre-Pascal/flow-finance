# Conventions de commentaires — Flow Finance

## Principes

Le code doit être **lisible sans commentaire** quand c'est possible. Les commentaires documentent l'intention, pas la syntaxe.

## En-tête de fichier

Chaque module non trivial commence par :

```typescript
/**
 * @file nom-du-fichier.ts
 * @description Rôle du module en une phrase.
 */
```

## JSDoc sur les exports publics

```typescript
/**
 * Formate un montant en devise locale.
 * @param amount - Montant numérique (peut être négatif)
 * @param locale - Code locale (`fr` | `en`)
 */
export function formatCurrency(amount: number, locale: string): string
```

## Quand commenter inline

- Logique métier non évidente (dédoublonnage, sync pagination, RLS)
- Contraintes réglementaires (DSP2, consentement)
- Workarounds temporaires avec ticket/issue

## À éviter

```typescript
// ❌ Incrémente i
i++;

// ❌ Get user
const user = getUser();
```

## Langue

Commentaires et JSDoc en **français** (cohérent avec la doc projet).
