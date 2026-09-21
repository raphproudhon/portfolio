# Brûlerie du Cher — mise en route

Boutique de démonstration : catalogue, panier et tunnel de commande jusqu'au
paiement **Stripe en mode test**. Marque fictive, aucun produit réel.

Sans configuration, la boutique fonctionne déjà : on peut parcourir le
catalogue, choisir une mouture, remplir le panier. Seul le bouton de paiement
affiche alors un message expliquant qu'il n'est pas branché.

---

## Ce qui tourne où

| Morceau | Où | Rôle |
|---|---|---|
| Catalogue, panier | navigateur | `assets/boutique.js`, panier dans `localStorage` |
| Prix, session de paiement | fonction Edge Supabase | `fonction-supabase/index.ts` |
| Page de paiement | Stripe | formulaire hébergé par Stripe, en mode test |

**Pourquoi une fonction serveur ?** Parce que les prix ne doivent jamais venir
du navigateur. La fonction a sa propre table de prix et ignore ce que le panier
lui annonce : elle ne reçoit que des références et des quantités. Sans ça,
n'importe qui paierait 1 € un sac à 19 €.

---

## Étape 1 — Compte Stripe en mode test

1. Créer un compte sur [stripe.com](https://stripe.com) — aucune validation
   d'entreprise n'est nécessaire pour le mode test.
2. Laisser l'interrupteur **« Mode test »** activé dans le tableau de bord.
3. Développeurs → Clés API → copier la **clé secrète**, qui commence par
   `sk_test_`.

> La fonction **refuse de démarrer** avec une clé de production (`sk_live_`) :
> cette démonstration ne doit jamais encaisser réellement.

## Étape 2 — Déployer la fonction

Deux chemins, au choix. **Le tableau de bord suffit** et évite d'installer
quoi que ce soit — c'est le chemin conseillé sous Windows.

### Depuis le tableau de bord Supabase

1. Projet → **Edge Functions** → *Deploy a new function* → *Via editor*
2. Nom : `paiement-brulerie`
3. Coller le contenu de `fonction-supabase/index.ts`, puis déployer
4. Project Settings → **Edge Functions** → *Secrets* → ajouter
   `STRIPE_SECRET_KEY` avec la clé `sk_test_…`

5. Dans les réglages de la fonction, **désactiver la vérification du jeton**
   (*Verify JWT*)

**Pourquoi la désactiver ?** Avant un appel comportant un en-tête
`Content-Type: application/json`, le navigateur envoie une requête préalable
`OPTIONS`. Cette requête ne porte, par conception, aucun en-tête
d'autorisation : la passerelle Supabase la rejette alors en 401, sans en-têtes
CORS, et le navigateur signale un échec réseau (« Failed to fetch ») sans
jamais atteindre le code de la fonction.

Ouvrir la fonction ne l'expose pas pour autant : elle ne lit aucune base, ne
fixe les prix qu'à partir de sa propre table, refuse une clé Stripe de
production et n'accepte qu'une adresse de retour appartenant au site.

### Ou en ligne de commande

```
supabase functions new paiement-brulerie
# remplacer le contenu par fonction-supabase/index.ts
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
supabase functions deploy paiement-brulerie --no-verify-jwt
```

## Étape 3 — Vérifier `config.js`

Déjà rempli avec le projet Supabase existant. À ne changer que si la
fonction porte un autre nom ou vit dans un autre projet.

## Étape 4 — Essayer

Remplir le panier, cliquer sur **Payer en mode test**, puis utiliser une carte
d'essai Stripe :

| Carte | Résultat attendu |
|---|---|
| `4242 4242 4242 4242` | paiement accepté → page `merci.html` |
| `4000 0000 0000 9995` | refus pour fonds insuffisants |
| `4000 0025 0000 3155` | demande une authentification 3-D Secure |

Date d'expiration : n'importe quelle date future. CVC : trois chiffres au choix.

---

## Limites assumées

- **Pas de stock ni de commandes enregistrées.** Une vraie boutique écrirait la
  commande en base à la réception du webhook `checkout.session.completed`.
  Ici, la page de succès se contente de vider le panier.
- **Pas de frais de port calculés**, pas de TVA paramétrée, pas de compte client.
- Le panier vit dans le navigateur : vidé si le visiteur efface ses données.

Ces limites sont volontaires — la démonstration montre la mécanique du tunnel
et la sécurité des prix, pas une boutique prête à vendre.
