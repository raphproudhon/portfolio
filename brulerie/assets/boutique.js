/* Brûlerie du Cher — catalogue et panier.
   Marque fictive : ce catalogue sert de démonstration.

   Le panier vit dans le navigateur (localStorage). Les prix affichés ici ne
   font pas foi : la fonction de paiement a sa propre table de prix et ignore
   ce que le navigateur lui envoie, sans quoi n'importe qui pourrait payer
   1 € un sac à 19 €. */

export const CATALOGUE = [
  { ref:'ETH-250', nom:'Éthiopie Sidamo',      prix:1450, poids:'250 g', notes:'Fleurs blanches, bergamote, thé noir',  torre:'Filtre',   fond:'#c98b4b' },
  { ref:'COL-250', nom:'Colombie Huila',       prix:1290, poids:'250 g', notes:'Caramel, noisette, orange sanguine',    torre:'Polyvalent', fond:'#a9613a' },
  { ref:'BRE-250', nom:'Brésil Cerrado',       prix:1190, poids:'250 g', notes:'Chocolat noir, amande grillée',          torre:'Espresso', fond:'#7a4a32' },
  { ref:'GUA-250', nom:'Guatemala Antigua',    prix:1390, poids:'250 g', notes:'Cacao, pomme cuite, épices douces',      torre:'Polyvalent', fond:'#8d5a3b' },
  { ref:'DEC-250', nom:'Déca Honduras',        prix:1250, poids:'250 g', notes:'Sans caféine, décaféiné à l\'eau',       torre:'Filtre',   fond:'#6b4a3a' },
  { ref:'DEC-COF', nom:'Coffret découverte',   prix:3200, poids:'4 × 125 g', notes:'Quatre origines à goûter à l\'aveugle', torre:'Assortiment', fond:'#2b1d16' },
];

export const MOUTURES = ['Grains entiers', 'Filtre', 'Espresso', 'Piston'];

export const euros = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
export const fiche  = ref => CATALOGUE.find(p => p.ref === ref);

const CLE = 'brulerie-panier';

export function lirePanier() {
  try { return JSON.parse(localStorage.getItem(CLE)) || []; }
  catch { return []; }               // navigation privée, stockage bloqué…
}

function ecrirePanier(lignes) {
  try { localStorage.setItem(CLE, JSON.stringify(lignes)); } catch { /* tant pis */ }
  majBadge();
}

export function ajouter(ref, mouture, qte = 1) {
  const lignes = lirePanier();
  const existante = lignes.find(l => l.ref === ref && l.mouture === mouture);
  if (existante) existante.qte += qte;
  else lignes.push({ ref, mouture, qte });
  ecrirePanier(lignes);
}

export function changerQte(i, qte) {
  const lignes = lirePanier();
  if (!lignes[i]) return;
  if (qte <= 0) lignes.splice(i, 1); else lignes[i].qte = qte;
  ecrirePanier(lignes);
}

export const total = () =>
  lirePanier().reduce((s, l) => s + (fiche(l.ref)?.prix || 0) * l.qte, 0);

export const nbArticles = () =>
  lirePanier().reduce((s, l) => s + l.qte, 0);

export function majBadge() {
  const b = document.getElementById('badge-panier');
  if (!b) return;
  const n = nbArticles();
  b.textContent = n;
  b.hidden = n === 0;
}

document.addEventListener('DOMContentLoaded', majBadge);
