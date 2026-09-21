// Fonction Edge Supabase — « inviter-client »
//
// Rôle : ouvrir l'accès à l'espace client sans passer par le tableau de bord
// Supabase. Créer la ligne dans `projets` ne suffit pas : les inscriptions
// libres sont fermées, donc une adresse inconnue de l'authentification se voit
// refuser son lien de connexion. Il fallait jusqu'ici penser à faire
// « Add user → Send invitation » à la main — un oubli silencieux, dont le
// client faisait les frais.
//
// Pourquoi une fonction serveur ? Parce qu'inviter quelqu'un demande la clé de
// service, qui contourne toutes les règles d'accès de la base. Cette clé ne
// doit jamais descendre dans le navigateur : elle reste ici, et la fonction
// vérifie elle-même qui l'appelle.
//
// Deux verrous, pas un :
//   1. l'appelant doit être connecté avec l'adresse du responsable
//   2. l'adresse invitée doit déjà avoir un projet — la fonction ouvre un
//      accès, elle ne sert pas à écrire à qui l'on veut
//
// Déploiement : voir SETUP.md, à côté de ce fichier.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ADMIN_EMAIL = 'raph.proudhon@gmail.com';
const RETOUR = 'https://raphproudhon.fr/espace-client/';   // doit figurer dans les Redirect URLs

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Supabase dit « déjà enregistré » de plusieurs façons selon la version. */
function dejaInscrit(message: string, code?: string): boolean {
  return code === 'email_exists'
    || /already.*(registered|exists)|existe déjà/i.test(message);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erreur: 'méthode non autorisée' }, 405);

  const URL_SB = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SERVICE) return json({ erreur: 'clé de service absente des secrets' }, 500);

  // 1. Qui appelle ? On rejoue le jeton de session de l'appelant.
  const appelant = createClient(URL_SB, ANON, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user }, error: eUser } = await appelant.auth.getUser();
  if (eUser || !user) return json({ erreur: 'Non connecté.' }, 401);
  if ((user.email ?? '').toLowerCase() !== ADMIN_EMAIL) {
    return json({ erreur: 'Accès réservé.' }, 403);
  }

  // 2. L'adresse à inviter.
  let corps: { email?: string; nom?: string };
  try { corps = await req.json(); } catch { return json({ erreur: 'corps illisible' }, 400); }

  const email = String(corps.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ erreur: 'Adresse invalide.' }, 400);
  }
  const nom = String(corps.nom ?? '').trim().slice(0, 120);

  const admin = createClient(URL_SB, SERVICE);   // contourne le RLS : c'est le serveur

  // 3. Cette adresse est-elle bien celle d'un client ?
  const { data: projets, error: eLecture } = await admin
    .from('projets').select('id').eq('client_email', email).limit(1);
  if (eLecture) {
    console.error('lecture des projets impossible', eLecture);
    return json({ erreur: 'Lecture des projets impossible.' }, 500);
  }
  if (!projets?.length) {
    return json({ erreur: "Aucun projet n'est associé à cette adresse — créez le projet d'abord." }, 400);
  }

  // 4. L'invitation.
  const { error: eInvit } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: RETOUR,
    data: nom ? { nom } : undefined,
  });
  if (!eInvit) return json({ etat: 'invite' });

  if (!dejaInscrit(eInvit.message ?? '', (eInvit as { code?: string }).code)) {
    console.error("invitation impossible", eInvit);
    return json({ erreur: `L'invitation n'est pas partie : ${eInvit.message}` }, 502);
  }

  // 5. L'adresse avait déjà un accès — c'est le cas d'un client qui a perdu son
  //    lien. On lui en envoie simplement un nouveau, sans rien recréer.
  const anonyme = createClient(URL_SB, ANON);
  const { error: eLien } = await anonyme.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: RETOUR },
  });
  if (eLien) {
    console.error("relance impossible", eLien);
    return json({ erreur: `Cette adresse a déjà un accès, mais le lien n'est pas parti : ${eLien.message}` }, 502);
  }
  return json({ etat: 'relance' });
});
