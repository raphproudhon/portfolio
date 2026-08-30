# Voir ses dépôts GitHub depuis l'espace privé

Une fois en place, la vue « Vos projets » affiche la liste de **tous** tes dépôts,
privés compris, avec leur langage et leur date de dernière activité.

## Pourquoi une fonction serveur

L'API GitHub ne montre les dépôts privés qu'avec un jeton d'accès. Or la page est
un fichier statique : tout ce qu'on y met est lisible par n'importe quel visiteur,
et un jeton posé là donnerait à tout le monde l'accès à tes dépôts.

Le jeton vit donc dans les **secrets Supabase**, et une petite fonction serveur
fait l'intermédiaire. Elle vérifie d'abord que l'appelant est connecté avec ton
adresse, puis interroge GitHub et ne renvoie que le nom, la visibilité, le
langage et la date. Le jeton ne descend jamais dans le navigateur.

## Étape 1 — Créer le jeton GitHub

Sur github.com : **Settings** (menu du profil) → tout en bas à gauche
**Developer settings** → **Personal access tokens** → **Fine-grained tokens** →
**Generate new token**.

| Champ | Valeur |
|---|---|
| Token name | `espace-client` |
| Expiration | 90 jours (à renouveler, c'est voulu) |
| Repository access | **All repositories** |
| Permissions → Repository permissions → **Metadata** | **Read-only** |

Ne coche **rien d'autre**. « Metadata: Read-only » suffit à lister les dépôts et
ne donne accès ni au code, ni aux issues, ni à quoi que ce soit d'autre.

Clique **Generate token** et copie la valeur — elle ne s'affiche qu'une fois.

> Ce jeton ne doit jamais être collé dans un fichier du dépôt, ni m'être
> communiqué. Il ne va qu'à un seul endroit : l'étape 2.

## Étape 2 — Le déposer dans Supabase

Supabase → ton projet → **Edge Functions** → onglet **Secrets**
(ou **Project Settings → Edge Functions → Secrets** selon la version).

**Add new secret** :

- Name : `GITHUB_TOKEN`
- Value : le jeton copié à l'étape 1

## Étape 3 — Déployer la fonction

**Depuis le tableau de bord** (le plus simple) : Supabase → **Edge Functions** →
**Deploy a new function** → **Via editor**.

- Nom de la fonction : `depots-github` — le nom doit être exactement celui-là,
  c'est lui que la page appelle.
- Efface le code d'exemple, colle le contenu de `fonction-supabase/index.ts`.
- **Deploy**.

**Depuis la ligne de commande**, si tu préfères :

```bash
npm i -g supabase
supabase login
supabase link --project-ref oxxkfrbornlernvvpbjh
mkdir -p supabase/functions/depots-github
cp espace-client/fonction-supabase/index.ts supabase/functions/depots-github/index.ts
supabase functions deploy depots-github
```

## Étape 4 — Vérifier

Recharge https://raphproudhon.github.io/portfolio/espace-client/

La carte **« Mes dépôts GitHub »** doit se remplir en une seconde ou deux.

Si elle affiche « Liste indisponible » :

- la fonction ne s'appelle pas exactement `depots-github` ;
- ou le secret `GITHUB_TOKEN` n'est pas enregistré ;
- ou le jeton a expiré — il suffit d'en régénérer un et de refaire l'étape 2.

Le détail de l'erreur est visible dans Supabase → **Edge Functions** →
`depots-github` → onglet **Logs**.

## Quand le jeton expire

Au bout de 90 jours la liste redevient indisponible. Rien n'est cassé : tu
régénères un jeton (étape 1) et tu remplaces le secret (étape 2). La fonction,
elle, n'a pas besoin d'être redéployée.
