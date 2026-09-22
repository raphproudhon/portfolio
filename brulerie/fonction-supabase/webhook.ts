// Fonction Edge Supabase — « webhook-brulerie »
//
// Rôle : enregistrer la commande quand Stripe confirme le paiement, puis
// envoyer au client son courriel de confirmation.
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
//      pas de réponse, et une commande ne doit être enregistrée qu'une fois,
//      son courriel n'être envoyé qu'une fois
//
// Déploiement : voir SETUP.md, à côté de ce fichier.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// --- Version déployée -------------------------------------------------------
// Écrite dans les journaux au démarrage, à côté de « booted ». Elle répond à la
// question qu'on ne peut pas trancher autrement : le code qui tourne ici est-il
// bien celui du dépôt ? Une panne a déjà coûté une soirée parce qu'une version
// antérieure était restée déployée, sans que rien ne le signale.
// À incrémenter à chaque modification de ce fichier.
const VERSION = '2026-09-22';

const TOLERANCE_SECONDES = 300;   // 5 minutes, la valeur conseillée par Stripe

console.log(`webhook-brulerie ${VERSION} — secrets Stripe : ${
  Deno.env.get('STRIPE_SECRET_KEY') && Deno.env.get('STRIPE_WEBHOOK_SECRET') ? 'ok' : 'INCOMPLETS'
} — envoi du courriel : ${
  Deno.env.get('BREVO_API_KEY') ? 'brevo' : Deno.env.get('RESEND_API_KEY') ? 'resend' : 'désactivé'
}`);

// Expéditeurs par défaut, selon le service configuré.
//   Brevo  : le domaine raphproudhon.fr y est déjà authentifié (DKIM, DMARC),
//            donc le courriel part vers n'importe quelle adresse.
//   Resend : le domaine d'essai ne délivre qu'au titulaire du compte, tant
//            qu'aucun domaine n'est vérifié — cf. SETUP.md.
// Le secret COURRIEL_EXPEDITEUR passe devant, au format « Nom <adresse> ».
const EXPEDITEUR_BREVO  = 'Brûlerie du Cher (démonstration) <contact@raphproudhon.fr>';
const EXPEDITEUR_RESEND = 'Brûlerie du Cher <onboarding@resend.dev>';

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

// ---------------------------------------------------------------------------
// Le courriel de confirmation
// ---------------------------------------------------------------------------

type Ligne = { intitule?: string; quantite?: number; montant?: number };
type Commande = {
  session_id: string;
  courriel: string | null;
  nom: string | null;
  montant_centimes: number;
  devise: string;
  lignes: Ligne[];
};

/** 8700 → « 87,00 € » — la virgule, puisque le courriel est en français. */
function argent(centimes: number, devise: string): string {
  const somme = (centimes / 100).toFixed(2).replace('.', ',');
  return devise?.toLowerCase() === 'eur' ? `${somme} €` : `${somme} ${devise.toUpperCase()}`;
}

/** Le nom du client vient de Stripe, donc d'un formulaire : il ne va pas brut dans du HTML. */
function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

function versionTexte(c: Commande): string {
  const lignes = c.lignes.map((l) =>
    `  ${l.quantite ?? 1} × ${l.intitule ?? 'Article'} — ${argent(l.montant ?? 0, c.devise)}`
  );
  return [
    `Bonjour${c.nom ? ' ' + c.nom : ''},`,
    '',
    'Votre commande est enregistrée. Merci !',
    '',
    'DÉMONSTRATION — la Brûlerie du Cher est une marque fictive. Le paiement',
    "s'est fait en mode test Stripe : aucune somme n'a été débitée, et rien ne",
    'sera expédié. Ce courriel montre seulement ce que recevrait un vrai client.',
    '',
    'Votre commande',
    ...lignes,
    '',
    `Total : ${argent(c.montant_centimes, c.devise)}`,
    `Référence : ${c.session_id}`,
    '',
    'Cette boutique fait partie du portfolio de Raphaël Proudhon.',
    'https://raphproudhon.fr/brulerie/',
  ].join('\n');
}

function versionHtml(c: Commande): string {
  const lignes = c.lignes.map((l) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee5dc">
          ${echapper(String(l.quantite ?? 1))} × ${echapper(String(l.intitule ?? 'Article'))}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #eee5dc;text-align:right;white-space:nowrap">
          ${argent(l.montant ?? 0, c.devise)}
        </td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr"><body style="margin:0;background:#faf7f4;font-family:Georgia,'Times New Roman',serif;color:#2b1d16">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f4;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #eee5dc;border-radius:10px">
        <tr><td style="padding:28px 28px 0">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#a9613a">Brûlerie du Cher</div>
          <h1 style="margin:10px 0 0;font-size:24px;font-weight:600">Votre commande est enregistrée</h1>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#2b1d16">
            Bonjour${c.nom ? ' ' + echapper(c.nom) : ''}, merci pour votre commande.
          </p>
        </td></tr>

        <tr><td style="padding:20px 28px 0">
          <div style="background:#fdf4e7;border:1px solid #f0d9b8;border-radius:8px;padding:14px 16px;font-size:14px;line-height:1.6">
            <strong>Démonstration.</strong> La Brûlerie du Cher est une marque fictive.
            Le paiement s'est fait en <strong>mode test Stripe</strong> : aucune somme
            n'a été débitée et rien ne sera expédié. Ce message montre simplement ce
            que recevrait un client réel.
          </div>
        </td></tr>

        <tr><td style="padding:22px 28px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">
            ${lignes}
            <tr>
              <td style="padding:14px 0 0;font-weight:700">Total</td>
              <td style="padding:14px 0 0;text-align:right;font-weight:700;white-space:nowrap">${argent(c.montant_centimes, c.devise)}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:22px 28px 28px">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b5a4e">
            Référence de la commande : ${echapper(c.session_id)}<br>
            Cette boutique fait partie du portfolio de Raphaël Proudhon —
            <a href="https://raphproudhon.fr/brulerie/" style="color:#a9613a">raphproudhon.fr</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** « Nom <adresse> » → ses deux moitiés. Brevo les veut séparées, Resend non. */
function expediteur(defaut: string): { nom: string; adresse: string } {
  const brut = Deno.env.get('COURRIEL_EXPEDITEUR') ?? defaut;
  const m = brut.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { nom: m[1], adresse: m[2] } : { nom: '', adresse: brut.trim() };
}

/**
 * Envoie la confirmation, par Brevo ou par Resend selon la clé présente dans
 * les secrets. Brevo passe devant : le domaine y est déjà authentifié, donc le
 * courriel arrive chez n'importe qui, sans configuration supplémentaire.
 *
 * « ignoré » quand aucun service n'est configuré ou qu'aucune adresse n'est
 * connue : la commande reste enregistrée, le webhook n'a pas à échouer pour
 * autant. C'est ce qui rend l'envoi facultatif.
 */
async function envoyerConfirmation(c: Commande): Promise<'envoyé' | 'ignoré' | 'échec'> {
  if (!c.courriel) return 'ignoré';

  const cleBrevo = Deno.env.get('BREVO_API_KEY');
  const cleResend = Deno.env.get('RESEND_API_KEY');
  if (!cleBrevo && !cleResend) return 'ignoré';

  const sujet = `Commande confirmée — ${argent(c.montant_centimes, c.devise)} (démonstration)`;
  const texte = versionTexte(c);      // pour les lecteurs qui n'affichent pas le HTML
  const html = versionHtml(c);

  try {
    const r = cleBrevo
      ? await (() => {
          const de = expediteur(EXPEDITEUR_BREVO);
          return fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'api-key': cleBrevo,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              sender: { name: de.nom || undefined, email: de.adresse },
              to: [{ email: c.courriel, name: c.nom || undefined }],
              subject: sujet,
              htmlContent: html,
              textContent: texte,
            }),
          });
        })()
      : await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${cleResend}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: Deno.env.get('COURRIEL_EXPEDITEUR') ?? EXPEDITEUR_RESEND,
            to: [c.courriel],
            subject: sujet,
            text: texte,
            html,
          }),
        });

    if (!r.ok) {
      console.error(`${cleBrevo ? 'Brevo' : 'Resend'} a refusé l'envoi`, r.status, await r.text());
      return 'échec';
    }
    return 'envoyé';
  } catch (e) {
    console.error('envoi impossible', e);
    return 'échec';
  }
}

// ---------------------------------------------------------------------------

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

  const commande: Commande = {
    session_id: session.id,
    courriel: session.customer_details?.email ?? null,
    nom: session.customer_details?.name ?? null,
    montant_centimes: session.amount_total,   // Stripe donne des centimes, on les garde tels quels
    devise: session.currency,
    lignes: await lignesDeLaSession(session.id, cleStripe),
  };

  const { data: ecrites, error } = await sb
    .from('commandes_brulerie')
    .upsert({ ...commande, mode_test: evenement.livemode === false },
            { onConflict: 'session_id', ignoreDuplicates: true })
    .select('id');

  if (error) {
    console.error('écriture impossible', error);
    // 500 : Stripe réessaiera, et l'upsert évitera le doublon
    return new Response('enregistrement impossible', { status: 500 });
  }

  // Rien n'a été inséré : la commande était déjà là, donc Stripe réessaie. Le
  // courriel n'est renvoyé que s'il n'était jamais parti — une confirmation en
  // double est presque aussi gênante qu'une confirmation absente.
  if (!ecrites?.length) {
    const { data: deja } = await sb
      .from('commandes_brulerie')
      .select('courriel_envoye_le')
      .eq('session_id', session.id)
      .maybeSingle();
    if (!deja || deja.courriel_envoye_le) {
      return new Response('commande déjà traitée', { status: 200 });
    }
  }

  const envoi = await envoyerConfirmation(commande);

  if (envoi === 'envoyé') {
    const { error: e } = await sb
      .from('commandes_brulerie')
      .update({ courriel_envoye_le: new Date().toISOString() })
      .eq('session_id', session.id);
    if (e) console.error('horodatage du courriel impossible', e);
  }

  if (envoi === 'échec') {
    // La commande est enregistrée, elle ne sera pas perdue. On répond tout de
    // même en erreur pour que Stripe réessaie : au prochain appel, la ligne
    // existe sans horodatage, et l'envoi est retenté.
    return new Response('commande enregistrée, courriel en échec', { status: 500 });
  }

  return new Response('commande enregistrée', { status: 200 });
});
