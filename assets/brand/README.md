# Identité — Raphael.dev

Logo de la marque freelance. Concept : le point terracotta de « .dev » devient la
signature, il ponctue le « R » dans le monogramme.

## Couleurs
- Encre : `#16150f`
- Terracotta (accent) : `#d96f32`
- Blanc cassé (fond) : `#f6f4ef` / `#f4f2ee`

## Typographie
Space Grotesk (700 pour le logo).

## Fichiers
| Fichier | Usage |
|---|---|
| `favicon.png` | Icône d'onglet, avatar (fond clair) |
| `favicon-dark.png` | Variante fond sombre |
| `logo-lockup.png` | Signature principale (monogramme + nom + sous-titre) |
| `monogramme-clair.png` / `monogramme-sombre.png` | Monogramme seul |
| `mot-symbole-clair.png` / `mot-symbole-sombre.png` | Mot-symbole seul |

## Règle de construction
Dans le monogramme, tout est proportionnel à la taille de la tuile `--s` :
rayon `0.23·s`, R `0.61·s`, point `0.122·s` positionné à `0.186·s` de la droite et
`0.20·s` du bas. Ainsi le point garde le même écart au R à toutes les tailles.
Le monogramme du site est reconstruit en HTML/CSS (classe `.logo-mark`) avec ces mêmes ratios.
