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

## Étape 4 — Autoriser le site à se connecter

Dans **Authentication → URL Configuration** :
- **Site URL** : `https://raphproudhon.github.io/portfolio/espace-client/`
- **Redirect URLs** : ajouter la même URL

Dans **Authentication → Providers** :
- **Email** activé
- ✅ Cocher **Confirm email** / lien magique
- ❌ Décocher **Enable email signups** → *important* : seuls les clients que tu ajoutes toi-même peuvent se connecter, pas n'importe qui sur internet.

## Étape 5 — Renseigner `config.js`

Ouvrir `espace-client/config.js` et remplacer les deux valeurs par celles de l'étape 2.

## Étape 6 — Ajouter un client

Quand tu signes un projet :

1. **Table Editor → projets → Insert row** : email du client, son nom, le titre, le forfait, l'étape 1, les dates.
2. **Authentication → Users → Add user** → *Send invitation* avec le même email.
   Le client reçoit un lien, clique, et accède à son espace. Aucun mot de passe à créer ni à transmettre.
3. À chaque avancée : **Table Editor → avancees → Insert row** (titre, détail, éventuellement un lien de preview).
   Et fais avancer le champ `etape` du projet (1 → 5).

---

## Règles de sécurité à ne jamais oublier

1. **Ne jamais commiter la clé `service_role`** — si elle fuite, régénère-la immédiatement dans Supabase.
2. **Ne jamais désactiver le RLS** sur ces tables.
3. **Garder « Enable email signups » désactivé** — sinon n'importe qui crée un compte.
4. Après toute modification des policies, **vérifier** : se connecter avec un compte test et s'assurer qu'il ne voit que son projet.

## RGPD — l'essentiel à ton échelle

Tu stockes des données personnelles (nom, email de tes clients) : tu en es responsable.
- Héberge en UE (étape 1).
- Ne collecte que le strict nécessaire (c'est déjà le cas ici).
- Supprime les données d'un client sur simple demande de sa part (`delete` de la ligne suffit).
- Mentionne-le dans tes conditions ou ton devis : « les données de suivi sont hébergées chez Supabase (UE) et supprimées sur demande. »
