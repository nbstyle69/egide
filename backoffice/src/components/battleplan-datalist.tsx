import { BattleplanSeason, Battleplans } from '../lib/battleplans';

/** Identifiant à passer en `list` sur tout champ de scénario. */
export const BattleplanListId = 'battleplans';

/**
 * Suggestions de scénario pour un champ texte : les plans de bataille de la
 * saison en cours, sans jamais empêcher de taper autre chose.
 *
 * Un `<datalist>` natif plutôt qu'un menu maison : le champ reste un champ
 * texte (0017), le navigateur filtre au fil de la frappe, et rien ne change
 * pour un organisateur qui joue un scénario hors liste. Le libellé rappelle
 * le tableau du GHB, utile quand les rondes alternent entre les deux.
 */
export function BattleplanDatalist() {
  return (
    <datalist id={BattleplanListId}>
      {Battleplans.map((plan) => (
        <option
          key={plan.number}
          value={plan.name}
          label={`Plan ${plan.number} · Tableau ${plan.table} · GHB ${BattleplanSeason}`}
        />
      ))}
    </datalist>
  );
}
