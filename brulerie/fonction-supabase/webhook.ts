// Fonction Edge Supabase — « webhook-brulerie »
//
// Rôle : enregistrer la commande quand Stripe confirme le paiement.
//
// Pourquoi ne pas l'enregistrer depuis la page de remerciement ? Parce que
// cette page dépend du visiteur : il peut fermer l'onglet avant d'y arriver,
// perdre le réseau, ou au contraire l'ouvrir à la main sans avoir rien payé.
// Seul Stripe sait si l'argent est arrivé, et il le dit ici.
//
// Trois exigences pour que ce soit sérieux :
//   1. vérifier la signature — sinon n'importe qui pourrait déclarer une commande
//   2. refuser les messages trop anciens — pour qu'un message intercepté ne
//      puisse pas être rejoué plus tard
//   3. supporter d'être appelé deux fois — Stripe réessaie quand il n'obtient
//      pas de réponse, et une commande ne doit pas être enregistrée en double
//
// Déploiement : voir SETUP.md, à côté de ce fichier.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOLERANCE_SECONDES = 300;   // 5 minutes, la valeur conseillée par Stripe

/** Compare deux chaînes en temps constant : la durée ne révèle pas où elles diffèrent. */
function memeSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}

/** Recalcule la signature attendue et la confronte à celle de l'en-tête. */
async function signatureValide(corps: string, entete: string, secret: string): Promise<boolean> {
  const champs = new Map(
    entete.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as [string, string];
    }),
  );
  const horodatage = champs.get('t');
  const signee = champs.get('v1');
  if (!horodatage || !signee) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(horodatage));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDES) return false;

  const cle = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const brut = await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(`${horodatage}.${corps}`));
  const attendue = Array.from(new Uint8Array(brut)).map((o) => o.toString(16).padStart(2, '0')).join('');
  return memeSignature(attendue, signee);
}

/** Demande à Stripe le détail des articles : on ne fait pas confiance au message reçu. */
async function lignesDeLaSession(sessionId: string, cleStripe: string) {
  const r = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=50`,
    { headers: { Authorization: `Bearer ${cleStripe}` } },
  );
  if (!r.ok) {
    console.error('Stripe a refusé la lecture des articles', await r.text());
    return [];
  }
  const donnees = await r.json();
  return (donnees.data ?? []).map((l: Record<string, unknown>) => ({
    intitule: l.description,
    quantite: l.quantity,
    montant: l.amount_total,           // en centimes, tel que Stripe l'a encaissé
  }));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('méthode non autorisée', { status: 405 });

  const secretWebhook = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const cleStripe = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretWebhook || !cleStripe) {
    console.error('secrets manquants : STRIPE_WEBHOOK_SECRET ou STRIPE_SECRET_KEY');
    return new Response('configuration incomplète', { status: 500 });
  }

  // Le corps doit être lu tel quel : reformater le JSON invaliderait la signature.
  const corps = await req.text();
  const entete = req.headers.get('stripe-signature') ?? '';

  if (!await signatureValide(corps, entete, secretWebhook)) {
    // 400 et non 401 : Stripe ne réessaie pas indéfiniment un message qu'il a mal signé
    return new Response('signature invalide', { status: 400 });
  }

  const evenement = JSON.parse(corps);
  if (evenement.type !== 'checkout.session.completed') {
    // On accuse réception des autres événements sans rien faire, sinon Stripe insiste.
    return new Response('ignoré', { status: 200 });
  }

  const session = evenement.data.object;
  if (session.payment_status !== 'paid') {
    return new Response('session non payée, ignorée', { status: 200 });
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,   // contourne le RLS : c'est le serveur qui écrit
  );

  const { error } = await sb.from('commandes_brulerie').upsert({
    session_id: session.id,
    courriel: session.customer_details?.email ?? null,
    nom: session.customer_details?.name ?? null,
    montant_centimes: session.amount_total,   // Stripe donne des centimes, on les garde tels quels
    devise: session.currency,
    lignes: await lignesDeLaSession(session.id, cleStripe),
    mode_test: evenement.livemode === false,
  }, { onConflict: 'session_id', ignoreDuplicates: true });

  if (error) {
    console.error('écriture impossible', error);
    // 500 : Stripe réessaiera, et l'upsert évitera le doublon
    return new Response('enregistrement impossible', { status: 500 });
  }

  return new Response('commande enregistrée', { status: 200 });
});
