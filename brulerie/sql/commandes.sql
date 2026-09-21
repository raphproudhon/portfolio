-- Brûlerie du Cher — table des commandes
--
-- À exécuter une fois dans le SQL Editor de Supabase, avant de déployer le
-- webhook. Le webhook écrit ici avec la clé de service ; personne d'autre n'y
-- accède, sauf l'administrateur en lecture.

create table if not exists commandes_brulerie (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null unique,          -- identifiant Stripe : garantit l'unicité
  courriel      text,
  nom           text,
  montant_centimes integer not null,           -- Stripe compte en centimes : on garde l'entier,
                                               -- jamais un nombre à virgule pour de l'argent
  devise        text not null default 'eur',
  lignes        jsonb not null default '[]'::jsonb,
  mode_test     boolean not null default true,
  created_at    timestamptz not null default now(),

  -- rempli quand la confirmation est partie : Stripe réessaie les webhooks,
  -- et un client ne doit pas recevoir deux fois le même courriel
  courriel_envoye_le timestamptz,

  -- colonne calculée, pour lire le montant sans faire la division de tête.
  -- Elle dérive de l'entier : impossible qu'elle diverge.
  montant_euros numeric(10,2) generated always as (montant_centimes / 100.0) stored
);

-- Recherche par date, l'usage courant d'un carnet de commandes
create index if not exists commandes_brulerie_date on commandes_brulerie (created_at desc);

alter table commandes_brulerie enable row level security;

-- Aucune policy pour les visiteurs : sans policy, le RLS refuse tout.
-- La clé de service utilisée par le webhook contourne le RLS — c'est voulu,
-- c'est le serveur qui écrit, jamais le navigateur.

-- Seul l'administrateur connecté peut relire les commandes.
drop policy if exists "lecture par l'administrateur" on commandes_brulerie;
create policy "lecture par l'administrateur"
  on commandes_brulerie for select
  to authenticated
  using ( (auth.jwt() ->> 'email') = 'raph.proudhon@gmail.com' );
