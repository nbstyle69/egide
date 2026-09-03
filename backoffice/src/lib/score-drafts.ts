import type { Draft } from '../hooks/use-score-entry';

/**
 * Sauvegarde locale des scores en cours de saisie.
 *
 * LE PROBLÈME RÉEL. La saisie du jour J se fait dans une salle des fêtes, sur
 * un wifi partagé avec cinquante téléphones. Jusqu'ici, un score tapé mais non
 * confirmé par le serveur n'existait nulle part : l'onglet fermé par erreur, le
 * portable qui se met en veille, la coupure réseau au mauvais moment, et
 * l'organisateur retourne demander leurs scores à des joueurs partis manger.
 *
 * CE QU'ON GARDE, ET CE QU'ON NE GARDE PAS. Uniquement ce que le serveur ne
 * connaît pas encore, brouillons incomplets compris — une table à moitié saisie
 * est justement celle qu'on ne veut pas retaper. Rien n'est gardé une fois la
 * ligne confirmée : la base redevient seule source de vérité, et le stockage du
 * navigateur ne doit jamais avoir d'avis sur un score enregistré.
 *
 * POURQUOI ON MÉMORISE AUSSI LA VALEUR SERVEUR (`base`). Deux organisateurs
 * saisissent parfois la même ronde à deux postes. Restaurer aveuglément un
 * brouillon écraserait le score que l'autre vient d'entrer, sans que personne
 * ne le voie. On garde donc la valeur serveur sur laquelle le brouillon a été
 * bâti : si elle a changé depuis, **le serveur gagne** et le brouillon est
 * jeté. Un brouillon perdu se retape ; un score écrasé en silence se découvre
 * au classement final.
 *
 * RIEN N'EST RÉENVOYÉ TOUT SEUL. Un brouillon retrouvé revient à l'écran comme
 * une saisie en attente, signalée comme telle. L'enregistrement reste un geste
 * de l'organisateur : il est le seul à savoir si le score qu'il avait tapé
 * était le bon.
 */

const StorageKey = 'egide.brouillons-scores';

/**
 * Un tournoi tient dans une journée. Au-delà, un brouillon retrouvé viendrait
 * d'un autre événement et sèmerait plus de doute qu'il n'épargne de frappe.
 */
const MaxAgeMs = 24 * 60 * 60 * 1000;

export type StoredDraft = {
  /** Ce que l'organisateur a tapé. */
  draft: Draft;
  /** La valeur serveur au moment de la frappe : le brouillon lui répond. */
  base: Draft;
  /** Horodatage, pour la péremption. */
  at: number;
};

type Store = Record<string, StoredDraft>;

/**
 * Le stockage du navigateur peut être indisponible (navigation privée,
 * réglages restrictifs) : il est un confort, jamais une dépendance. En cas
 * d'échec, on rend un magasin vide et la saisie fonctionne comme avant.
 */
function readStore(): Store {
  try {
    const raw = window.localStorage.getItem(StorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    const now = Date.now();
    const fresh: Store = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (entry && typeof entry.at === 'number' && now - entry.at < MaxAgeMs) {
        fresh[id] = entry;
      }
    }
    return fresh;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    window.localStorage.setItem(StorageKey, JSON.stringify(store));
  } catch {
    // Quota plein ou stockage refusé : tant pis, la saisie continue.
  }
}

/** Les brouillons encore valides, purgés des périmés. */
export function loadScoreDrafts(): Store {
  const store = readStore();
  writeStore(store);
  return store;
}

/** Retient une saisie en attente, avec la valeur serveur qu'elle corrige. */
export function saveScoreDraft(pairingId: string, draft: Draft, base: Draft): void {
  const store = readStore();
  store[pairingId] = { draft, base, at: Date.now() };
  writeStore(store);
}

/** Oublie une saisie : elle est confirmée, ou n'a plus lieu d'être. */
export function clearScoreDraft(pairingId: string): void {
  const store = readStore();
  if (!(pairingId in store)) return;
  delete store[pairingId];
  writeStore(store);
}
