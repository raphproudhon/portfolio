// Brûlerie du Cher — réglages de la démonstration.
//
// FONCTION_PAIEMENT : URL de la fonction Edge Supabase qui crée la session
// Stripe Checkout (voir fonction-supabase/index.ts et SETUP.md).
// Laissée vide, la boutique fonctionne quand même : le tunnel s'arrête sur un
// récapitulatif et explique que le paiement n'est pas branché.
export const FONCTION_PAIEMENT = '';

// Clé « anon » du projet Supabase — publique par conception, elle sert
// seulement à joindre la fonction.
export const SUPABASE_ANON_KEY = '';
