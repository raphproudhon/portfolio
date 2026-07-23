// Configuration Supabase — voir SETUP.md, étape 2.
//
// Ces deux valeurs sont PUBLIQUES par conception : la clé "anon" est faite pour
// vivre dans le navigateur. Ce qui protège réellement les données, c'est le RLS
// activé côté Supabase (SETUP.md, étape 3).
//
// ⚠️ NE JAMAIS mettre ici la clé "service_role" : elle donne un accès total à la base.

export const SUPABASE_URL = "https://oxxkfrbornlernvvpbjh.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94eGtmcmJvcm5sZXJudnZwYmpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MzI5OTgsImV4cCI6MjEwMDQwODk5OH0.2pUkm9vRmxPPtfMPSWYCp23UZYjeJ_6CeRZA6p5yGk4";
