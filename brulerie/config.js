// Brûlerie du Cher — réglages de la démonstration.
//
// Ces deux valeurs sont PUBLIQUES par conception : elles servent seulement à
// joindre la fonction. La clé secrète Stripe, elle, ne vit que dans les
// secrets Supabase — jamais ici, jamais dans Git.
//
// Si la fonction n'est pas encore déployée, la boutique fonctionne quand même :
// le bouton de paiement explique alors qu'il n'est pas branché.

// Le tiret final fait partie du nom de la fonction déployée : le slug Supabase
// est figé à la création et ne suit pas un renommage.
export const FONCTION_PAIEMENT = 'https://oxxkfrbornlernvvpbjh.supabase.co/functions/v1/paiement-brulerie-';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94eGtmcmJvcm5sZXJudnZwYmpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MzI5OTgsImV4cCI6MjEwMDQwODk5OH0.2pUkm9vRmxPPtfMPSWYCp23UZYjeJ_6CeRZA6p5yGk4';
