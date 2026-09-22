// Fonction Edge Supabase — « depots-github »
//
// Rôle : lister les dépôts GitHub de Raphaël (publics ET privés) sans jamais
// exposer le jeton d'accès au navigateur.
//
// Le jeton vit dans les secrets Supabase (GITHUB_TOKEN). Cette fonction vérifie
// d'abord que l'appelant est bien connecté avec l'adresse autorisée, puis
// interroge GitHub côté serveur et ne renvoie que le strict nécessaire.
//
// Déploiement : voir GITHUB.md, à côté de ce fichier.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// --- Version déployée -------------------------------------------------------
// Écrite dans les journaux au démarrage, à côté de « booted ». Elle répond à la
// question qu'on ne peut pas trancher autrement : le code qui tourne ici est-il
// bien celui du dépôt ? Une panne a déjà coûté une soirée parce qu'une version
// antérieure était restée déployée, sans que rien ne le signale.
// À incrémenter à chaque modification de ce fichier.
const VERSION = '2026-09-22';

const ADMIN_EMAIL = 'raph.proudhon@gmail.com';

console.log(`depots-github ${VERSION} — jeton GitHub : ${Deno.env.get('GITHUB_TOKEN') ? 'ok' : 'ABSENT'}`);

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // 1. Qui appelle ? On rejoue le jeton de session de l'appelant.
  const autorisation = req.headers.get('Authorization') ?? '';
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorisation } } },
  );

  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return json({ erreur: 'Non connecté.' }, 401);
  if ((user.email ?? '').toLowerCase() !== ADMIN_EMAIL) {
    return json({ erreur: 'Accès réservé.' }, 403);
  }

  // 2. Le jeton ne quitte jamais le serveur.
  const jeton = Deno.env.get('GITHUB_TOKEN');
  if (!jeton) return json({ erreur: 'Le secret GITHUB_TOKEN n’est pas défini.' }, 500);

  const reponse = await fetch(
    'https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner',
    {
      headers: {
        Authorization: `Bearer ${jeton}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'espace-client-raphael',
      },
    },
  );

  if (!reponse.ok) {
    return json({ erreur: `GitHub a répondu ${reponse.status}.` }, 502);
  }

  // 3. On ne renvoie que ce que la page affiche.
  const depots = await reponse.json();
  return json(depots.map((d: Record<string, unknown>) => ({
    nom: d.name,
    prive: d.private,
    url: d.html_url,
    description: d.description,
    langage: d.language,
    maj: d.pushed_at,
    archive: d.archived,
    branche: d.default_branch,
  })));
});
