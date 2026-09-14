import { useEffect, useState } from 'react';

import { Modal } from './modal';
import { supabase } from '../lib/supabase';
import type { TournamentType } from '../lib/tournaments';
import { BattleplanDatalist, BattleplanListId } from './battleplan-datalist';

type Props = {
  tournamentId: string;
  /** Type du tournoi : il change ce qui est apparié, et donc tout le texte. */
  type: TournamentType;
  /** Joueurs par équipe, non nul seulement en tournoi par équipes. */
  teamSize: number | null;
  /** Joueurs pointés présents : ce sont eux qui seront appariés. */
  presentCount: number;
  /** Pseudos des inscrits non pointés, qui vont être écartés. */
  absentNames: string[];
  /** Libellé du bouton secondaire, selon la page d'où l'on vient. */
  cancelLabel: string;
  onCancel: () => void;
  /** Le scénario saisi est remonté à la page, qui l'écrit après coup. */
  onLaunched: (scenario: string) => void;
};

type TeamState = { team_name: string; status: string };

/**
 * Confirmation du lancement. Le tournoi devient irréversiblement « en cours »,
 * donc la modale nomme ce qui sera écarté et, s'il y a des absents, demande
 * une case à cocher.
 *
 * **Un tournoi par équipes n'apparie pas des joueurs.** Il apparie des équipes,
 * et les tables se déduisent ensuite des rosters puis se négocient entre
 * capitaines. Annoncer « 12 joueurs appariés au hasard sur 6 tables » y
 * décrivait un tirage qui n'a jamais lieu : la modale lit donc le type et
 * change de phrase.
 */
export function LaunchTournamentModal({
  tournamentId,
  type,
  teamSize,
  presentCount,
  absentNames,
  cancelLabel,
  onCancel,
  onLaunched,
}: Props) {
  const isTeam = type === 'team';

  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Le message exact de la base, plutôt qu'une phrase inventée par l'écran. */
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * Le tournoi tournait déjà. C'est le cas du double clic : le premier appel a
   * réussi, le second se heurte au verrou. Dire « vérifiez votre connexion »
   * ici serait accuser le réseau d'une réussite.
   */
  const [alreadyRunning, setAlreadyRunning] = useState(false);
  const [scenario, setScenario] = useState('');
  const [teams, setTeams] = useState<TeamState[] | null>(null);

  // L'état d'un tournoi par équipes se compte en équipes : la page appelante
  // ne connaît que les joueurs, on va donc le chercher ici.
  useEffect(() => {
    if (!isTeam || !supabase) return;
    supabase
      .rpc('team_check_in_state', { p_tournament_id: tournamentId })
      .then(({ data, error }) => {
        if (!error && data) setTeams(data as TeamState[]);
      });
  }, [isTeam, tournamentId]);

  const presentTeams = teams?.filter((t) => t.status === 'checked_in') ?? [];
  const absentTeams = teams?.filter((t) => t.status !== 'checked_in') ?? [];

  // Ce qui est apparié, et ce que ça produit.
  const unitCount = isTeam ? presentTeams.length : presentCount;
  const encounters = Math.ceil(unitCount / 2);
  const tables = isTeam ? encounters * (teamSize ?? 0) : Math.floor(unitCount / 2);
  const isOdd = unitCount % 2 === 1;

  const absentList = isTeam ? absentTeams.map((t) => t.team_name) : absentNames;
  const absentCount = absentList.length;
  const shownNames = absentList.slice(0, 5).join(', ');
  const extraNames = absentCount > 5 ? ` … et ${absentCount - 5} autres.` : '';

  async function handleLaunch() {
    if (!supabase) return;
    setBusy(true);
    setFailure(null);
    const { error } = await supabase.rpc('start_tournament', {
      p_tournament_id: tournamentId,
    });
    setBusy(false);

    if (error) {
      const message = (error.message ?? '').trim();
      if (message.includes('ne peut plus être lancé')) {
        setAlreadyRunning(true);
        return;
      }
      // Les fonctions de lancement renvoient déjà des phrases lisibles
      // (« Il faut au moins deux équipes présentes… ») : les remplacer par un
      // message générique ferait chercher une panne de réseau là où la base a
      // dit exactement ce qui manquait.
      setFailure(
        message || 'Impossible de lancer le tournoi. Vérifiez votre connexion et réessayez.'
      );
      return;
    }
    onLaunched(scenario);
  }

  return (
    <Modal title="Lancer le tournoi et générer la ronde 1 ?" locked={busy} onClose={onCancel}>
      {isTeam ? (
        <p style={{ margin: 0 }}>
          {teams === null ? (
            'Lecture du pointage des équipes…'
          ) : (
            <>
              {unitCount} équipe{unitCount > 1 ? 's' : ''} pointée{unitCount > 1 ? 's' : ''}{' '}
              présente{unitCount > 1 ? 's' : ''} ser{unitCount > 1 ? 'ont' : 'a'} appariée
              {unitCount > 1 ? 's' : ''} au hasard : {encounters} rencontre
              {encounters > 1 ? 's' : ''}, soit {tables} table{tables > 1 ? 's' : ''}. Les tables
              de chaque rencontre partent de l’ordre des rosters ; les capitaines les
              négocient ensuite.
            </>
          )}
        </p>
      ) : (
        <p style={{ margin: 0 }}>
          {presentCount} joueur{presentCount > 1 ? 's' : ''} pointé
          {presentCount > 1 ? 's' : ''} présent{presentCount > 1 ? 's' : ''} ser
          {presentCount > 1 ? 'ont' : 'a'} apparié{presentCount > 1 ? 's' : ''} au hasard sur{' '}
          {tables} table{tables > 1 ? 's' : ''}.
        </p>
      )}

      {isOdd ? (
        <div className="banner banner-info">
          {isTeam
            ? 'Le nombre d’équipes présentes est impair : une équipe sera tirée au sort pour être exempte (bye). Chacun de ses joueurs remporte sa table 15 points de partie contre 5.'
            : 'Le nombre de présents est impair : un joueur sera tiré au sort pour être exempt (bye). Il remporte automatiquement la ronde 15 points de partie contre 5.'}
        </div>
      ) : null}

      {absentCount > 0 ? (
        <div className="banner banner-info banner-info-danger">
          {isTeam ? (
            <>
              {absentCount} équipe{absentCount > 1 ? 's' : ''} non pointée
              {absentCount > 1 ? 's' : ''} ser{absentCount > 1 ? 'ont' : 'a'} écartée
              {absentCount > 1 ? 's' : ''} du tournoi : {shownNames}
              {extraNames}
            </>
          ) : (
            <>
              {absentCount} joueur{absentCount > 1 ? 's' : ''} non pointé
              {absentCount > 1 ? 's' : ''} ser{absentCount > 1 ? 'ont' : 'a'} écarté
              {absentCount > 1 ? 's' : ''} du tournoi : {shownNames}
              {extraNames}
            </>
          )}
        </div>
      ) : null}

      <label className="field">
        <span>Scénario de la ronde 1 (facultatif)</span>
        <input
          type="text"
          maxLength={80}
          placeholder="ex. Dans les flammes"
          list={BattleplanListId}
          value={scenario}
          disabled={busy}
          onChange={(event) => setScenario(event.target.value)}
        />
        <BattleplanDatalist />
        <span className="field-hint">
          Affiché aux joueurs dans l’app. Modifiable ensuite depuis la page Rondes.
        </span>
      </label>

      <p style={{ margin: 0 }}>
        Une fois le tournoi lancé, les inscriptions et le pointage sont figés.{' '}
        <strong>Vous ne pourrez pas revenir en arrière.</strong>
      </p>

      {absentCount > 0 ? (
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>
            {isTeam
              ? absentCount > 1
                ? `J’ai vérifié : ces ${absentCount} équipes sont bien absentes.`
                : 'J’ai vérifié : cette équipe est bien absente.'
              : absentCount > 1
                ? `J’ai vérifié : ces ${absentCount} joueurs sont bien absents.`
                : 'J’ai vérifié : ce joueur est bien absent.'}
          </span>
        </label>
      ) : null}

      {/* Le tournoi tournait déjà : on le dit, et on propose le seul geste
          utile — recharger pour voir la ronde 1. Proposer « Réessayer »
          enverrait se cogner au même verrou. */}
      {alreadyRunning ? (
        <div className="banner banner-info">
          Ce tournoi est <strong>déjà lancé</strong> — il a probablement démarré à votre
          premier clic. Rechargez la page pour voir la ronde 1.
        </div>
      ) : null}

      {failure ? <div className="banner banner-danger">{failure}</div> : null}

      <div className="modal-actions">
        <button className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          {alreadyRunning ? 'Fermer' : cancelLabel}
        </button>
        {alreadyRunning ? (
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Recharger la page
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={busy || (absentCount > 0 && !checked)}
            onClick={handleLaunch}>
            {busy ? 'Lancement…' : failure ? 'Réessayer' : 'Lancer le tournoi'}
          </button>
        )}
      </div>
    </Modal>
  );
}
