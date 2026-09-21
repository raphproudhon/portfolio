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
| Enregistrement, confirmation | fonction Edge Supabase | `fonction-supabase/webhook.ts` |
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

## Étape 5 — Enregistrer les commandes

Sans cette étape, le paiement fonctionne mais rien n'est conservé. Avec elle,
chaque paiement confirmé écrit une ligne en base.

**Pourquoi un webhook plutôt que la page de remerciement ?** Parce que cette
page dépend du visiteur : il peut fermer l'onglet avant d'y arriver, perdre le
réseau — ou au contraire l'ouvrir à la main sans avoir rien payé. Seul Stripe
sait si l'argent est arrivé.

1. **La table.** SQL Editor → coller `sql/commandes.sql` → Run.

2. **La fonction.** Edge Functions → *Deploy a new function* → *Via editor* →
   nom `webhook-brulerie`, contenu de `fonction-supabase/webhook.ts`.
   **Vérification du jeton désactivée** : Stripe n'envoie pas de jeton Supabase,
   il signe ses messages autrement. Copier l'URL de la fonction.

3. **L'abonnement côté Stripe.** Développeurs → Webhooks → *Ajouter un
   endpoint* → coller l'URL → choisir le seul événement
   `checkout.session.completed` → créer. Stripe affiche alors un **secret de
   signature** qui commence par `whsec_`.

4. **Le secret.** Project Settings → Edge Functions → Secrets → ajouter
   `STRIPE_WEBHOOK_SECRET` avec cette valeur.

5. **L'essai.** Refaire un paiement de test, puis Table Editor →
   `commandes_brulerie` : une ligne doit apparaître, avec le courriel, le
   montant en centimes et le détail des articles.

### Ce que la fonction refuse

- **Une signature absente ou fausse** — sinon n'importe qui pourrait déclarer
  une commande payée en appelant l'adresse.
- **Un message vieux de plus de cinq minutes** — pour qu'un message intercepté
  ne puisse pas être rejoué plus tard.
- **Un doublon** — Stripe réessaie quand il n'obtient pas de réponse ; la
  commande est identifiée par sa session, et une seconde écriture ne crée pas
  de seconde ligne.

Les articles ne sont pas lus dans le message reçu : la fonction les redemande à
Stripe avec sa clé secrète. Le montant enregistré est donc celui réellement
encaissé.

---

## Étape 6 — Le courriel de confirmation (facultatif)

Sans cette étape, tout continue de fonctionner : la commande est enregistrée,
simplement personne n'écrit au client. Le webhook constate l'absence de clé
d'envoi et passe son chemin.

L'envoi passe par [Resend](https://resend.com) : une adresse HTTP, pas de
serveur de courrier à tenir. Le webhook y confie le message juste après avoir
écrit la commande.

1. **La colonne.** SQL Editor → coller `sql/migration-courriel.sql` → Run.
   (Sur une base créée après ce changement, `commandes.sql` la contient déjà.)

2. **Le compte.** Créer un compte Resend, puis API Keys → *Create API key* →
   copier la clé, qui commence par `re_`.

3. **Le secret.** Project Settings → Edge Functions → Secrets → ajouter
   `RESEND_API_KEY`.

4. **L'expéditeur.** Sans réglage, les messages partent de
   `onboarding@resend.dev`, le domaine d'essai de Resend — qui ne délivre
   **qu'à l'adresse du titulaire du compte**. C'est suffisant pour voir le
   courriel arriver. Pour écrire à n'importe qui, il faut vérifier un domaine
   dans Resend (Domains → *Add domain*, puis les trois enregistrements DNS
   qu'il indique) et ajouter le secret `COURRIEL_EXPEDITEUR`, par exemple
   `Brûlerie du Cher <boutique@raphproudhon.fr>`.

5. **Redéployer** `webhook-brulerie`, puis refaire un paiement de test. Le
   courriel arrive, et la colonne `courriel_envoye_le` de la commande porte
   l'heure de l'envoi.

> La page `merci.html` annonce au client que sa confirmation est partie : si
> cette étape est laissée de côté, cette phrase promet un courriel que personne
> n'envoie. À retirer, dans ce cas.

**Pourquoi horodater l'envoi ?** Parce que Stripe réessaie un webhook qui a
échoué. Sans cette colonne, une seconde tentative renverrait la même
confirmation ; avec elle, le courriel n'est retenté que s'il n'était jamais
parti. Et si Resend refuse l'envoi, la fonction répond en erreur **après**
avoir enregistré la commande : Stripe réessaie, la commande n'est pas
dupliquée, le courriel finit par partir.

Le message annonce en clair qu'il s'agit d'une démonstration, que rien ne sera
expédié et qu'aucune somme n'a été débitée — écrire à quelqu'un au nom d'une
marque fictive sans le dire serait malhonnête.

---

## Limites assumées

- **Pas de stock.** Les six références sont toujours disponibles.
- **Pas de suivi d'expédition** : le client reçoit sa confirmation, rien après.
- **Pas de frais de port calculés**, pas de TVA paramétrée, pas de compte client.
- Le panier vit dans le navigateur : vidé si le visiteur efface ses données.

Ces limites sont volontaires — la démonstration montre la mécanique du tunnel
et la sécurité des prix, pas une boutique prête à vendre.
