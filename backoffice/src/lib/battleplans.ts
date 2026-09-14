/**
 * Plans de bataille du General's Handbook en cours — saison 2026-27.
 *
 * Le scénario d'une ronde reste du **texte libre** (migration 0017, décision
 * assumée : la liste officielle change chaque année, une liste fermée dans le
 * code vieillirait mal, et un organisateur joue parfois un scénario maison ou
 * une saison précédente). Cette liste ne ferme donc rien : elle est proposée
 * en **suggestions** dans les champs de saisie, pour que douze organisateurs
 * écrivent « Dans les flammes » de la même façon — sinon l'historique et les
 * statistiques verraient « dans les flammes », « Flammes » et « DLF » comme
 * trois scénarios différents.
 *
 * Noms français officiels, relevés sur les cartes du GHB 2026-27 fournies par
 * le porteur le 14 septembre 2026. Les deux tableaux du livre sont conservés :
 * en tournoi, les rondes alternent souvent entre eux.
 *
 * À la saison suivante, remplacer la liste et la constante `BattleplanSeason` ;
 * les scénarios déjà enregistrés en base ne bougent pas, ce sont des textes.
 */
export const BattleplanSeason = '2026-27';

export type Battleplan = {
  /** Numéro sur la carte (1 à 12). */
  number: number;
  /** Tableau du GHB dans lequel le plan figure. */
  table: 1 | 2;
  /** Nom tel qu'il sera enregistré comme scénario de ronde. */
  name: string;
};

export const Battleplans: readonly Battleplan[] = [
  { number: 1, table: 1, name: 'Dans les flammes' },
  { number: 2, table: 1, name: 'Côtes ensanglantées' },
  { number: 3, table: 1, name: 'Avalanche de cendre' },
  { number: 4, table: 1, name: 'Les cavernes du massacre' },
  { number: 5, table: 1, name: 'Ce qui est à vous est à nous' },
  { number: 6, table: 1, name: 'Cachés dans les nuées de cendre' },
  { number: 7, table: 2, name: 'Ruines difformes' },
  { number: 8, table: 2, name: 'Malédiction de la Rogne' },
  { number: 9, table: 2, name: 'Saisir les braises' },
  { number: 10, table: 2, name: 'Terrain traître' },
  { number: 11, table: 2, name: 'Fuir la côte' },
  { number: 12, table: 2, name: 'La puissance des royaumes' },
];
