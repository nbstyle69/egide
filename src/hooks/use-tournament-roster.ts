import { useCallback, useEffect, useState } from 'react';

import { flushPushQueue } from '@/lib/push';
import { supabase } from '@/lib/supabase';

/** Une place occupée du roster de mon équipe pour ce tournoi. */
export type RosterSlot = {
  player_id: string;
  pseudo: string;
  position: number;
  faction: string | null;
  is_me: boolean;
};

/** Un membre de l'équipe qui n'est pas aligné : le capitaine peut l'appeler. */
export type BenchMember = { player_id: string; pseudo: string };

export type TournamentRoster = {
  has_team: boolean;
  team_id?: string;
  team_name?: string;
  is_captain?: boolean;
  engaged?: boolean;
  team_registration_id?: string;
  team_status?: string;
  team_size?: number;
  taken?: number;
  free?: number;
  in_roster?: boolean;
  /**
   * Calculé par la base, pas déduit ici. C'est elle qui tranchera l'appel :
   * autant qu'elle dise avant si le bouton a un sens.
   */
  can_join?: boolean;
  roster?: RosterSlot[];
  bench?: BenchMember[];
};

/** Traduit les refus de la base en phrases. La base ne parle pas à l'utilisateur. */
export function rosterErrorMessage(message: string): string {
  const code = message.split(':')[0];
  switch (code) {
    case 'ROSTER_FULL':
      return 'Le roster est déjà complet. Ton capitaine peut libérer une place.';
    case 'ALREADY_IN_ROSTER':
      return 'Tu es déjà dans ce roster.';
    case 'ALREADY_REGISTERED_ELSEWHERE':
    case 'ALREADY_REGISTERED':
      return 'Tu es déjà inscrit à ce tournoi. Retire-toi d’abord.';
    case 'TEAM_NOT_REGISTERED':
      return 'Ton équipe n’est pas engagée sur ce tournoi.';
    case 'NO_TEAM':
      return 'Il faut faire partie d’une équipe.';
    case 'NOT_CAPTAIN':
      return 'Seul le capitaine peut faire ça.';
    case 'NOT_IN_ROSTER':
      return 'Ce joueur n’est pas dans le roster.';
    case 'REGISTRATIONS_CLOSED':
      return 'Les inscriptions de ce tournoi sont closes.';
    default:
      return 'Action impossible. Vérifie ta connexion et réessaie.';
  }
}

/**
 * L'état du roster de mon équipe pour un tournoi, et les gestes qui le
 * changent (US-7.11).
 *
 * Capitaine et membre lisent le même objet : ils ne voient pas deux vérités
 * différentes, seulement deux jeux de boutons.
 */
export function useTournamentRoster(tournamentId: string | undefined, userId: string | undefined) {
  const [state, setState] = useState<TournamentRoster>({ has_team: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Ce que le geste vient de faire, quand il ne se voit pas autrement.
   * Prendre une place ou en retirer un joueur se lit dans le roster ;
   * **appeler quelqu'un ne change rien à l'écran** — sans un mot, le bouton
   * paraît mort et on le presse trois fois.
   */
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId || !userId) {
      setState({ has_team: false });
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: dbError } = await supabase.rpc('my_tournament_roster', {
      p_tournament_id: tournamentId,
    });
    if (!dbError && data) setState(data as TournamentRoster);
    setLoading(false);
  }, [tournamentId, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Un appel générique : les quatre gestes ne diffèrent que par leur nom. */
  const call = useCallback(
    async (fn: string, params: Record<string, string>) => {
      if (!supabase || !tournamentId) return false;
      setBusy(true);
      setError(null);
      setNotice(null);
      const { error: dbError } = await supabase.rpc(fn, {
        p_tournament_id: tournamentId,
        ...params,
      });
      setBusy(false);
      if (dbError) {
        setError(rosterErrorMessage(dbError.message));
        return false;
      }
      // Ici on recharge, contrairement à la saisie de scores : le roster n'est
      // pas un écran de frappe rapide, et l'état vient d'ailleurs (un autre
      // membre a pu prendre une place entre-temps).
      await refresh();
      return true;
    },
    [tournamentId, refresh]
  );

  const join = useCallback(() => call('join_team_roster', {}), [call]);
  const remove = useCallback(
    (playerId: string) => call('remove_from_roster', { p_player_id: playerId }),
    [call]
  );
  const invite = useCallback(
    async (playerId: string, pseudo: string) => {
      const ok = await call('invite_to_roster', { p_player_id: playerId });
      if (!ok) return false;
      // Convention du projet : le client vide la file après toute action qui y
      // dépose un événement. Sans cet appel, l'invitation attendait qu'une
      // autre action de l'app la pousse — un délai que personne n'explique.
      flushPushQueue();
      setNotice(`${pseudo} a été appelé. Il verra la place et la prendra lui-même.`);
      return true;
    },
    [call]
  );

  return {
    roster: state,
    loading,
    busy,
    error,
    setError,
    notice,
    setNotice,
    refresh,
    join,
    remove,
    invite,
  };
}
