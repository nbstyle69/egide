import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabase';
import { ActiveRegistrationStatuses, type RegistrationStatus } from '../lib/tournaments';

export type Registration = {
  id: string;
  player_id: string;
  status: RegistrationStatus;
  created_at: string;
  dropped_round: number | null;
  /** Faction déclarée pour ce tournoi (US-9.3), ou null. */
  faction: string | null;
  /** Rang du joueur dans le roster de son équipe, ou null en individuel. */
  roster_position: number | null;
  /** L'inscription d'équipe qui porte ce joueur, ou null en individuel — c'est
   *  elle qu'on compte contre la capacité d'un tournoi par équipes. */
  team_registration_id: string | null;
  profile: { pseudo: string; region: string | null } | null;
  /**
   * L'équipe qui a inscrit ce joueur, en tournoi par équipes. L'écran ne
   * l'affiche pas — c'est l'export qui en a besoin : une liste de trente noms
   * sans équipe n'est pas exploitable le jour J.
   */
  team_registration: { team: { name: string } | null } | null;
};

/** Ordre d'arrivée : il fait foi pour la liste d'attente. */
function byArrival(a: Registration, b: Registration) {
  return a.created_at.localeCompare(b.created_at);
}

/** Ordre alphabétique tolérant aux accents. */
function byPseudo(a: Registration, b: Registration) {
  return (a.profile?.pseudo ?? '').localeCompare(b.profile?.pseudo ?? '', 'fr', {
    sensitivity: 'base',
  });
}

/**
 * Inscriptions d'un tournoi, réparties en inscrits, liste d'attente
 * et désistements.
 */
export function useRegistrations(tournamentId: string | undefined) {
  const [rows, setRows] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const { data, error: dbError } = await supabase
      .from('registrations')
      .select(
        'id, player_id, status, created_at, dropped_round, faction, roster_position, team_registration_id, ' +
          'profile:profiles(pseudo, region), ' +
          'team_registration:team_registrations(team:teams(name))'
      )
      .eq('tournament_id', tournamentId);
    if (dbError) {
      setError(true);
    } else {
      setRows((data as unknown as Registration[]) ?? []);
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listes mémoïsées : sans cela leur identité changerait à chaque rendu, ce
  // qui relancerait en boucle les effets qui en dépendent (le pointage local
  // de la page Check-in serait écrasé aussitôt posé).
  const registered = useMemo(
    () => rows.filter((r) => ActiveRegistrationStatuses.includes(r.status)).sort(byPseudo),
    [rows]
  );
  const waitlisted = useMemo(
    () => rows.filter((r) => r.status === 'waitlisted').sort(byArrival),
    [rows]
  );
  const withdrawn = useMemo(
    () => rows.filter((r) => r.status === 'withdrawn').sort(byArrival),
    [rows]
  );

  return { registered, waitlisted, withdrawn, loading, error, refresh };
}
