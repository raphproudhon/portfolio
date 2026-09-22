# Espace client — installation

Guide pour mettre en route l'espace de suivi de projet.
Architecture : **frontend statique** (GitHub Pages) + **Supabase** (authentification + base de données).

---

## Étape 1 — Créer le projet Supabase (à faire par Raphaël)

1. Aller sur [supabase.com](https://supabase.com) → **Start your project** → se connecter avec GitHub.
2. **New project** :
   - Name : `espace-client`
   - Database password : générer et **le stocker dans un gestionnaire de mots de passe** (il ne sert qu'à l'accès direct à la base, pas au site)
   - Region : `Europe (Paris)` ou `Europe (Frankfurt)` — données hébergées en UE, c'est mieux pour le RGPD
3. Attendre ~2 minutes que le projet se crée.

## Étape 2 — Récupérer les clés

Dans **Project Settings → API** :

| Clé | Où elle va | Sensibilité |
|---|---|---|
| **Project URL** (`https://xxxxx.supabase.co`) | dans `config.js` | publique, sans risque |
| **anon / public key** | dans `config.js` | **publique par conception** — elle est inoffensive tant que le RLS est actif |
| **service_role key** | **NULLE PART** | 🚨 accès total à la base — ne jamais la copier dans le code, ni la commiter, ni la partager |

> La clé `anon` est faite pour être dans le navigateur : c'est le **RLS** (étape 3) qui protège réellement les données, pas le secret de la clé.

## Étape 3 — Créer les tables et les règles de sécurité

Dans Supabase : **SQL Editor** → **New query** → coller ce script → **Run**.

```sql
-- ============ TABLES ============

-- Un projet = un client
create table projets (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  nom_client text not null,
  titre text not null,                    -- ex. "Site vitrine — Domaine X"
  forfait text,                           -- ex. "Site vitrine"
  montant numeric,
  etape int not null default 1,           -- 1=cadrage 2=design 3=developpement 4=relecture 5=livre
  date_debut date,
  date_livraison_prevue date,
  created_at timestamptz default now()
);

-- Les mises à jour visibles par le client
create table avancees (
  id uuid primary key default gen_random_uuid(),
  projet_id uuid not null references projets(id) on delete cascade,
  titre text not null,
  detail text,
  lien text,                              -- lien de preview, maquette, etc.
  action_client text,                     -- ce que le client doit faire, si besoin
  created_at timestamptz default now()
);

-- ============ SÉCURITÉ (RLS) ============
-- Sans ces règles, n'importe qui pourrait lire tous les projets.

alter table projets enable row level security;
alter table avancees enable row level security;

-- Un client connecté ne voit QUE le projet associé à son email
create policy "client voit son projet"
  on projets for select
  to authenticated
  using (client_email = auth.jwt() ->> 'email');

create policy "client voit ses avancees"
  on avancees for select
  to authenticated
  using (
    exists (
      select 1 from projets p
      where p.id = avancees.projet_id
        and p.client_email = auth.jwt() ->> 'email'
    )
  );

-- Aucune policy d'écriture : les clients ne peuvent RIEN modifier.
-- Raphaël met à jour les projets depuis l'interface Supabase (Table Editor).

create index on avancees (projet_id, created_at desc);
```

## Étape 3 bis — Te donner accès à tous tes projets

Sans ça, tu vois la même chose qu'un client : un seul projet. Ces deux policies
t'autorisent, **toi seul**, à lire toute la table. À coller dans le **SQL Editor** :

```sql
create policy "responsable voit tout"
  on projets for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'raph.proudhon@gmail.com');

create policy "responsable voit toutes les avancees"
  on avancees for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'raph.proudhon@gmail.com');
```

Les policies `select` se cumulent : un client garde son projet, toi tu as tout.
Toujours aucune policy d'écriture — les modifications passent par le Table Editor.

Il faut ensuite que **ton adresse existe comme utilisateur**. Comme les inscriptions
libres sont désactivées (étape 4), ajoute-toi à la main : **Authentication → Users →
Add user → Send invitation**, avec `raph.proudhon@gmail.com`.

Ensuite, sur `/espace-client/`, tu te connectes avec ton adresse comme un client :
le tableau de bord bascule automatiquement sur la vue « tous les projets ».
Le repérage se fait sur `ADMIN_EMAIL` dans `config.js`, mais c'est bien le RLS
ci-dessus qui autorise la lecture — modifier le fichier côté navigateur ne donne
accès à rien de plus.

## Étape 3 ter — Saisir depuis la page plutôt que depuis Supabase

Avec les policies ci-dessus tu ne fais que **lire**. Ces quatre-là te permettent
de créer un projet, changer son étape, publier et supprimer une avancée
directement depuis l'espace privé. À coller dans le **SQL Editor** :

```sql
create policy "responsable cree des projets"
  on projets for insert
  to authenticated
  with check (auth.jwt() ->> 'email' = 'raph.proudhon@gmail.com');

create policy "responsable modifie les projets"
  on projets for update
  to authenticated
  using      (auth.jwt() ->> 'email' = 'raph.proudhon@gmail.com')
  with check (auth.jwt() ->> 'email' = 'raph.proudhon@gmail.com');

create policy "responsable cree des avancees"
  on avancees for insert
  to authenticated
  with check (auth.jwt() ->> 'email' = 'raph.proudhon@gmail.com');

create policy "responsable supprime des avancees"
  on avancees for delete
  to authenticated
  using (auth.jwt() ->> 'email' = 'raph.proudhon@gmail.com');
```

Les clients restent en lecture seule : aucune policy d'écriture ne les vise.
Volontairement, il n'y a **pas** de suppression de projet depuis la page — c'est
trop définitif pour un bouton. Ça reste dans le Table Editor.

## Étape 3 quater — Conserver le questionnaire de chiffrage (ajouté le 21/09/2026)

Le bouton « + Nouveau projet » de l'espace privé passe maintenant par un questionnaire
(type de projet, pages, options, contenu, délai) qui calcule un montant et pré-remplit
le projet. Pour garder la trace de ce chiffrage avec le projet, ajoute une colonne
`devis` (JSON). À coller dans le **SQL Editor** :

```sql
alter table projets add column if not exists devis jsonb;
```

Sans cette colonne, le projet est quand même créé, mais le détail du questionnaire
n'est pas enregistré (la page l'indique en orange après la création).

La vue client n'affiche pas cette colonne : elle ne montre que
`forfait`, `montant` et les dates. La grille tarifaire est dans `index.html`,
constante `TARIFS`, en tête de la section « Nouveau projet ».

## Étape 3 quinquies — Les notes internes (ajouté le 22/09/2026)

Un espace de notes clôt le questionnaire, sous la dernière question, et se
retrouve dans la carte de chaque projet : ce qui s'est dit au téléphone, les
contraintes, ce qu'il ne faut pas oublier. En passant le questionnaire
(« Passer le questionnaire »), on ne le croise pas — les notes s'ajoutent
alors depuis la carte du projet, une fois celui-ci créé.

**Pourquoi une table à part, et pas une colonne de `projets` ?** Parce qu'un
client connecté peut lire sa propre ligne de `projets` par l'API — c'est le RLS
qui l'autorise, et c'est voulu. Le masquer dans l'affichage ne le masquerait
pas dans les données. Des notes rangées là seraient donc lisibles par celui
qu'elles concernent. Le RLS travaille par ligne, pas par colonne : la seule
séparation solide est une table distincte, sans aucune policy pour les clients.

```sql
create table if not exists notes_projet (
  projet_id  uuid primary key references projets(id) on delete cascade,
  texte      text not null default '',
  updated_at timestamptz not null default now()
);

alter table notes_projet enable row level security;

-- Aucune policy pour les clients : sans policy, le RLS refuse tout.
drop policy if exists "notes du responsable" on notes_projet;
create policy "notes du responsable"
  on notes_projet for all
  to authenticated
  using      ( (auth.jwt() ->> 'email') = 'raph.proudhon@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'raph.proudhon@gmail.com' );
```

Sans cette table, la page marche : les notes ne sont simplement pas
enregistrées, et la création du projet le signale en orange.

## Étape 3 sexies — La remise (ajouté le 22/09/2026)

Le bloc de chiffrage porte un menu déroulant de remise **collé au montant
proposé** — c'est là qu'on décide d'un geste commercial, pas dans un champ
perdu plus bas. Tranches de 5 % jusqu'à la moitié. Le montant affiché est
toujours le **net** ; le taux et le
montant brut sont conservés dans la colonne `devis`, de sorte que la carte du
projet réaffiche plus tard le sous-total, la remise et le total.

Deux règles pour que le chiffre à l'écran ne soit jamais ambigu :

- Le net est **arrondi aux 10 €**. Les totaux de base tombent sur des multiples
  de 50 ; une remise ne doit pas les transformer en 1 487,50 €.
- **Un montant tapé à la main remet la remise à zéro** et devient la nouvelle
  référence. Sans ça, on ne saurait plus si le chiffre affiché est brut ou net.

Le menu n'apparaît qu'avec un chiffrage calculé : sans questionnaire, il n'y a
pas de montant de référence à réduire — on saisit directement le prix voulu.

Rien à exécuter : la remise voyage dans la colonne `devis`, qui existe déjà.

## Étape 4 — Autoriser le site à se connecter

Dans **Authentication → URL Configuration** :
- **Site URL** : `https://raphproudhon.fr/espace-client/`
- **Redirect URLs** : ajouter la même URL

Dans **Authentication → Providers** :
- **Email** activé
- ✅ Cocher **Confirm email** / lien magique
- ❌ Décocher **Enable email signups** → *important* : seuls les clients que tu ajoutes toi-même peuvent se connecter, pas n'importe qui sur internet.

## Étape 5 — Renseigner `config.js`

Ouvrir `espace-client/config.js` et remplacer les deux valeurs par celles de l'étape 2.

## Étape 6 — La fonction qui ouvre l'accès des clients

Sans elle, tout marche, mais il faut penser à inviter chaque client à la main
dans **Authentication → Users** — un oubli silencieux, dont le client fait les
frais : il demande son lien, et Supabase le refuse sans que personne ne le sache.

1. **Edge Functions** → *Deploy a new function* → *Via editor* → nom
   `inviter-client`, contenu de `fonction-supabase/inviter-client.ts`.
2. **Vérification du jeton désactivée** (*Verify JWT*). Ce n'est pas un trou :
   la fonction vérifie elle-même que l'appelant est connecté avec l'adresse du
   responsable. Sans ça, la requête préalable `OPTIONS` du navigateur — qui ne
   porte jamais d'en-tête d'autorisation — serait rejetée avant d'atteindre le
   code, et la page afficherait « fonction injoignable ».
3. Aucun secret à ajouter : `SUPABASE_SERVICE_ROLE_KEY` est fourni
   automatiquement aux fonctions du projet.

En ligne de commande&nbsp;:

```
supabase functions deploy inviter-client --no-verify-jwt
```

**Ce que la fonction refuse** — elle manipule la clé de service, qui contourne
toutes les règles d'accès de la base, donc elle se garde deux fois :

- **un appelant qui n'est pas le responsable** : le jeton de session est rejoué
  côté serveur, et l'adresse doit être celle de l'administrateur ;
- **une adresse sans projet** : la fonction ouvre l'accès d'un client, elle ne
  sert pas à écrire à n'importe qui. Le projet doit exister d'abord.

Si l'adresse a déjà un accès, la fonction ne recrée rien&nbsp;: elle envoie un
nouveau lien de connexion. C'est ce qui rend le bouton **« Renvoyer
l'invitation&nbsp;»** sûr à cliquer deux fois.

## Étape 7 — Ajouter un client

Quand tu signes un projet, depuis l'espace client lui-même (bouton
**+ Nouveau projet**) : le projet est créé **et** le client invité dans la
foulée. La page affiche laquelle des deux situations s'est produite —
invitation envoyée, ou lien renvoyé à une adresse déjà connue.

Si la fonction de l'étape 6 n'est pas déployée, la page le dit et rappelle la
manœuvre manuelle :

1. **Table Editor → projets → Insert row** : email du client, son nom, le titre, le forfait, l'étape 1, les dates.
2. **Authentication → Users → Add user** → *Send invitation* avec le même email.
   Le client reçoit un lien, clique, et accède à son espace. Aucun mot de passe à créer ni à transmettre.

Ensuite, à chaque avancée : **Table Editor → avancees → Insert row** (titre,
détail, éventuellement un lien de preview) — ou le formulaire « Publier une
avancée » dans la carte du projet. Et fais avancer le champ `etape` (1 → 5).

---

---

## Configuration en place (23/07/2026, mise à jour 13/09/2026)

| Élément | Valeur |
|---|---|
| Projet Supabase | `oxxkfrbornlernvvpbjh` — région AWS eu-west-3 (Paris) |
| Inscriptions publiques | **désactivées** (`disable_signup: true`) — vérifié |
| Envoi d'emails | **Brevo** en SMTP personnalisé (300 emails/jour gratuits) |
| Host / Port | `smtp-relay.brevo.com` / `587` |
| Username SMTP | `b315fd001@smtp-brevo.com` (⚠️ pas l'adresse Gmail) |
| Expéditeur affiché | Raphaël Proudhon &lt;contact@raphproudhon.fr&gt; — domaine authentifié dans Brevo (DKIM ✓, DMARC ✓) |

## Dépannage — « mon client ne reçoit pas le lien »

Depuis la page, la nature de la panne se lit dans le message affiché — et le
détail technique (statut, code) dans la console du navigateur. Trois familles :

**« Cette adresse n'est pas encore ouverte »** — l'adresse n'existe pas dans
**Authentication → Users**. Les inscriptions libres sont fermées (étape 4),
donc créer la ligne dans `projets` ne suffit pas. Supabase répond `otp_disabled`.
Parade : le bouton **« Renvoyer l'invitation »** dans la carte du projet, qui
ouvre l'accès en un clic. S'il échoue, la manœuvre manuelle reste
**Add user → Send invitation** avec la même adresse.

**« Trop de demandes »** — limite d'envoi atteinte, elle se lève seule.

**« L'envoi est momentanément en panne »** — l'adresse est bien connue, c'est
le courrier qui ne part pas. À vérifier dans cet ordre :

1. **La clé SMTP Brevo a expiré ?** Elle meurt après **90 jours consécutifs sans aucun envoi**. En période creuse, c'est le suspect n°1 → régénérer la clé dans Brevo et la recoller dans Supabase.
2. **Le projet Supabase est en pause ?** Le plan gratuit met le projet en pause après **7 jours sans activité**. Le réveiller depuis le tableau de bord Supabase (voir la parade ci-dessous).
3. **Quota Brevo dépassé ?** 300 emails/jour — improbable à cette échelle.
4. **Vérifier les logs** : Brevo → Transactionnel → Logs (l'email est-il parti ?), puis Supabase → Logs → Auth.

## Parade contre la mise en pause automatique

Le plan gratuit Supabase met le projet en pause après 7 jours d'inactivité — un client tomberait alors sur un espace mort.

**Solution gratuite** : surveiller l'URL ci-dessous avec UptimeRobot (gratuit), vérification toutes les 12 h. Chaque appel interroge la base et compte comme une activité, ce qui empêche la mise en pause.

```
https://oxxkfrbornlernvvpbjh.supabase.co/rest/v1/projets?apikey=<CLE_ANON>&select=id&limit=1
```

(remplacer `<CLE_ANON>` par la clé publique qui est dans `config.js`)

⚠️ **Ne pas utiliser** `…/rest/v1/` seul ni `/auth/v1/health` : les deux renvoient **401**, donc UptimeRobot les signale en panne — et ils n'interrogent pas la base, donc ils n'empêchent pas la mise en pause. Testé le 23/07/2026.

La clé dans l'URL ne pose pas de problème : c'est la clé publique, déjà présente dans le code du site, et le RLS renvoie `[]` (aucune donnée client exposée).

## Domaine authentifié dans Brevo (fait le 13/09/2026)

`raphproudhon.fr` est authentifié dans Brevo → les liens magiques partent de `contact@raphproudhon.fr`, signés DKIM au nom du domaine, DMARC `p=reject` respecté. Testé : le mail arrive de `contact@` sans « via ».

Enregistrements DNS posés chez Infomaniak (zone de `raphproudhon.fr`) — **ne pas supprimer** :

| Type | Nom | Cible |
|---|---|---|
| TXT | `@` | `brevo-code:…` (code de vérification) |
| CNAME | `brevo1._domainkey` | `b1.raphproudhon-fr.dkim.brevo.com` |
| CNAME | `brevo2._domainkey` | `b2.raphproudhon-fr.dkim.brevo.com` |
| CNAME | `em` | `em-raphproudhon-fr.brand.brevosend.com` |
| CNAME | `r.em` | `em-raphproudhon-fr.r.brand.brevosend.com` |
| CNAME | `img.em` | `em-raphproudhon-fr.img.brand.brevosend.com` |

Le SPF (`v=spf1 include:spf.infomaniak.ch -all`) et le DMARC (`p=reject`) d'Infomaniak sont **inchangés** — Brevo n'en a pas besoin (retour géré sur le sous-domaine `em`). Un seul SPF et un seul DMARC par domaine : ne jamais en ajouter un second.

Ancien expéditeur `raph.proudhon@gmail.com` dans Brevo : peut être supprimé, il ne sert plus.

## Règles de sécurité à ne jamais oublier

1. **Ne jamais commiter la clé `service_role`** — si elle fuite, régénère-la immédiatement dans Supabase.
2. **Ne jamais désactiver le RLS** sur ces tables.
3. **Garder « Enable email signups » désactivé** — sinon n'importe qui crée un compte.
   La fonction `inviter-client` est la seule porte d'entrée, et elle n'ouvre un
   accès qu'à une adresse qui a déjà un projet.
4. Après toute modification des policies, **vérifier** : se connecter avec un compte test et s'assurer qu'il ne voit que son projet.

## RGPD — l'essentiel à ton échelle

Tu stockes des données personnelles (nom, email de tes clients) : tu en es responsable.
- Héberge en UE (étape 1).
- Ne collecte que le strict nécessaire (c'est déjà le cas ici).
- Supprime les données d'un client sur simple demande de sa part (`delete` de la ligne suffit).
- Mentionne-le dans tes conditions ou ton devis : « les données de suivi sont hébergées chez Supabase (UE) et supprimées sur demande. »

---

## Vérifier quelle version tourne

Chaque fonction écrit son numéro de version dans ses journaux **au démarrage**,
juste à côté de la ligne `booted` :

```
webhook-brulerie 2026-09-22 — secrets Stripe : ok — envoi du courriel : brevo
```

Cette ligne répond à la seule question qu'on ne peut pas trancher autrement :
*le code qui tourne est-il bien celui du dépôt ?* Elle dit aussi, sans jamais
révéler de valeur, quels secrets la fonction a trouvés — `INCOMPLETS`,
`ABSENTE` ou `désactivé` sautent aux yeux.

Pour la faire apparaître sans attendre un vrai appel, visitez l'adresse de la
fonction dans un navigateur : elle répond « méthode non autorisée », ce qui
suffit à la réveiller et à écrire la ligne.

Comparez la date affichée avec celle du `const VERSION` en tête du fichier
dans le dépôt. Si elles diffèrent, la fonction déployée est périmée : recollez
le fichier. **Cette vérification est née d'une panne réelle** — une version
antérieure au renommage d'une colonne était restée déployée, et rien ne le
signalait : ni Stripe, ni la table, ni le message d'erreur.
