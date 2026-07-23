// Configuration Supabase — voir SETUP.md, étape 2.
//
// Ces deux valeurs sont PUBLIQUES par conception : la clé "anon" est faite pour
// vivre dans le navigateur. Ce qui protège réellement les données, c'est le RLS
// activé côté Supabase (SETUP.md, étape 3).
//
// ⚠️ NE JAMAIS mettre ici la clé "service_role" : elle donne un accès total à la base.

export const SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
export const SUPABASE_ANON_KEY = "VOTRE_CLE_ANON";
