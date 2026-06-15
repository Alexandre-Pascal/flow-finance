# Flow Finance — Design System

> Source of truth générée via **ui-ux-pro-max-skill**. Fichier maître détaillé : [`design-system/flow-finance/MASTER.md`](../design-system/flow-finance/MASTER.md).

## Identité

| Attribut | Valeur |
|----------|--------|
| Produit | Personal finance tracker (compte courant + livrets) |
| Style | Minimalism & Swiss Style |
| Ton | Confiance, clarté, sérieux bancaire |
| Typographie | IBM Plex Sans |

## Palette

| Rôle | Hex | Usage |
|------|-----|-------|
| Primary | `#0F172A` | Navigation, titres, texte fort |
| Secondary | `#1E3A8A` | Accents secondaires, liens |
| CTA / Accent | `#CA8A04` | Actions principales, highlights |
| Background | `#F8FAFC` | Fond application |
| Text | `#020617` | Corps de texte |

## Principes UI

- Dashboard **data-dense** : cartes KPI, tableau transactions, graphique mensuel
- Transitions **200–250 ms** sur hover et focus
- Icônes **Lucide** uniquement (pas d’emojis comme icônes)
- Contraste WCAG AA minimum (4.5:1)
- Responsive : 375px → 1440px
- Dark mode supporté via `next-themes`

## Anti-patterns (interdits)

- Gradients violet/rose « AI fintech »
- Design ludique / playful pour une app bancaire
- Hover qui décale le layout (scale agressif)
- États focus invisibles

## Composants

- **shadcn/ui** (Radix) pour primitives
- **recharts** pour graphiques dashboard
- Layout dashboard : sidebar fixe + zone contenu scrollable

## Pages

| Page | Pattern |
|------|---------|
| Login | Centré, carte simple, message confiance |
| Dashboard | Bento grid KPI + chart + dernières transactions |
| Comptes | Liste cartes par compte (courant / livret) |
| Transactions | Table filtrable + recherche |
| Settings | Sections : langue, banque, compte |
