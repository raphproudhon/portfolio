-- Brûlerie du Cher — clarifier l'unité du montant
--
-- À exécuter si la table a été créée avant ce changement. Sur une base neuve,
-- commandes.sql suffit : il contient déjà la forme finale.
--
-- Le principe : on ne stocke pas d'euros à virgule. L'entier en centimes reste
-- la référence — c'est ce que Stripe encaisse — et une colonne calculée affiche
-- les euros pour la lecture. Elle ne peut pas diverger, elle est dérivée.

alter table commandes_brulerie
  rename column montant_total to montant_centimes;

alter table commandes_brulerie
  add column if not exists montant_euros numeric(10,2)
  generated always as (montant_centimes / 100.0) stored;
