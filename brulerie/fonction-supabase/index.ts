// Fonction Edge Supabase — « paiement-brulerie »
//
// Rôle : créer une session Stripe Checkout pour le panier d'un visiteur, sans
// que la clé secrète Stripe ne touche jamais le navigateur.
//
// Règle qui justifie l'existence de cette fonction : le navigateur n'envoie que
// des RÉFÉRENCES et des QUANTITÉS. Les prix sont ceux de la table ci-dessous.
// Un panier trafiqué côté client ne peut donc pas faire baisser le montant —
// c'est l'erreur classique des boutiques « tout en JavaScript ».
//
// Déploiement : voir SETUP.md, à côté de ce fichier.

// --- Version déployée -------------------------------------------------------
// Écrite dans les journaux au démarrage, à côté de « booted ». Elle répond à la
// question qu'on ne peut pas trancher autrement : le code qui tourne ici est-il
// bien celui du dépôt ? Une panne a déjà coûté une soirée parce qu'une version
// antérieure était restée déployée, sans que rien ne le signale.
// À incrémenter à chaque modification de ce fichier.
const VERSION = '2026-09-22';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

console.log(`paiement-brulerie ${VERSION} — clé Stripe : ${
  (() => {
    const c = Deno.env.get('STRIPE_SECRET_KEY');
    return !c ? 'ABSENTE' : c.startsWith('sk_test_') ? 'test' : 'REFUSÉE (production)';
  })()
}`);

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// Prix en centimes — seule source de vérité.
const PRIX: Record<string, { nom: string; prix: number }> = {
  'ETH-250': { nom: 'Éthiopie Sidamo 250 g',    prix: 1450 },
  'COL-250': { nom: 'Colombie Huila 250 g',     prix: 1290 },
  'BRE-250': { nom: 'Brésil Cerrado 250 g',     prix: 1190 },
  'GUA-250': { nom: 'Guatemala Antigua 250 g',  prix: 1390 },
  'DEC-250': { nom: 'Déca Honduras 250 g',      prix: 1250 },
  'DEC-COF': { nom: 'Coffret découverte',       prix: 3200 },
};

const QTE_MAX = 12;        // garde-fou : pas de commande absurde
const LIGNES_MAX = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erreur: 'méthode non autorisée' }, 405);

  const cle = Deno.env.get('STRIPE_SECRET_KEY');
  if (!cle) return json({ erreur: 'clé Stripe absente des secrets' }, 500);
  if (!cle.startsWith('sk_test_')) {
    // garde-fou : cette démonstration ne doit jamais encaisser réellement
    return json({ erreur: 'cette fonction refuse une clé Stripe de production' }, 500);
  }

  let corps: { lignes?: Array<{ ref: string; qte: number; mouture?: string }>; retour?: string };
  try { corps = await req.json(); } catch { return json({ erreur: 'corps illisible' }, 400); }

  const lignes = (corps.lignes ?? []).slice(0, LIGNES_MAX);
  if (!lignes.length) return json({ erreur: 'panier vide' }, 400);

  // La page de retour doit rester sur le site : on ne redirige pas n'importe où.
  const retour = corps.retour ?? '';
  const ORIGINES = ['https://raphproudhon.fr/', 'http://127.0.0.1:', 'http://localhost:'];
  if (!ORIGINES.some((o) => retour.startsWith(o))) {
    return json({ erreur: 'adresse de retour refusée' }, 400);
  }

  // Formulaire attendu par l'API Stripe (elle ne lit pas le JSON).
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', `${retour}merci.html`);
  form.set('cancel_url', `${retour}panier.html`);
  form.set('locale', 'fr');

  let i = 0;
  for (const l of lignes) {
    const article = PRIX[l.ref];
    if (!article) return json({ erreur: `référence inconnue : ${l.ref}` }, 400);
    const qte = Math.max(1, Math.min(QTE_MAX, Math.floor(Number(l.qte) || 1)));
    const mouture = String(l.mouture ?? '').slice(0, 40);

    form.set(`line_items[${i}][quantity]`, String(qte));
    form.set(`line_items[${i}][price_data][currency]`, 'eur');
    form.set(`line_items[${i}][price_data][unit_amount]`, String(article.prix));
    form.set(`line_items[${i}][price_data][product_data][name]`, article.nom);
    if (mouture) {
      form.set(`line_items[${i}][price_data][product_data][description]`, `Mouture : ${mouture}`);
    }
    i++;
  }

  const reponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cle}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  const session = await reponse.json();
  if (!reponse.ok) {
    console.error('Stripe a refusé la session', session);
    return json({ erreur: session?.error?.message ?? 'Stripe a refusé la demande' }, 502);
  }

  return json({ url: session.url });
});
