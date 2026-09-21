/* En-tête et pied de page communs aux pages de la boutique.
   Un site statique de quatre pages ne justifie pas un générateur : ce module
   écrit les deux fragments, et chaque page reste lisible dans un navigateur. */
import { majBadge } from './boutique.js';

const PAGES = [
  { href:'./',            texte:'Nos cafés' },
  { href:'#abonnement',   texte:'Abonnement', masquable:true },
  { href:'#maison',       texte:'La maison',  masquable:true },
];

export function poserGabarit(actif = '') {
  const nav = document.createElement('nav');
  nav.className = 'top';
  nav.innerHTML = `
  <div class="wrap">
    <a class="marque" href="./">Brûlerie du <em>Cher</em></a>
    <ul>
      ${PAGES.map(p => `<li${p.masquable ? ' class="masquable"' : ''}><a href="${p.href}">${p.texte}</a></li>`).join('')}
      <li>
        <a class="lien-panier" href="panier.html" aria-label="Voir le panier">
          Panier <span id="badge-panier" hidden>0</span>
        </a>
      </li>
    </ul>
  </div>`;

  const bandeau = document.createElement('div');
  bandeau.className = 'bandeau';
  bandeau.innerHTML = `<b>Démonstration</b> — marque fictive, aucun café ne sera expédié.
    Le paiement fonctionne en mode test Stripe. <a href="../">Voir le portfolio</a>`;

  const pied = document.createElement('footer');
  pied.innerHTML = `
  <div class="wrap">
    <span>Brûlerie du Cher — marque fictive créée pour la démonstration</span>
    <span><a href="../">raphproudhon.fr</a> · <a href="../mentions-legales.html">Mentions légales</a></span>
  </div>`;

  document.body.prepend(nav);
  document.body.prepend(bandeau);
  document.body.append(pied);
  majBadge();
  if (actif) document.title = `${actif} — Brûlerie du Cher`;
}
