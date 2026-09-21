-- Brûlerie du Cher — trace de l'envoi du courriel de confirmation
--
-- À exécuter si la table a été créée avant l'ajout du courriel. Sur une base
-- neuve, commandes.sql suffit : il contient déjà la colonne.
--
-- Pourquoi la garder en base plutôt que de faire confiance à l'envoi ? Parce
-- que Stripe réessaie un webhook qui a échoué. Sans cet horodatage, la même
-- commande enverrait deux confirmations — ou aucune, si l'envoi a raté la
-- première fois et qu'on refusait de réessayer.

alter table commandes_brulerie
  add column if not exists courriel_envoye_le timestamptz;
