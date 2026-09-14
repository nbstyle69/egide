import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import {
  ActiveRegistrationStatuses,
  type RegistrationStatus,
  type Tournament,
} from '../lib/tournaments';

/**
 * `registered_count` compte les **places occupées dans l'unité du tournoi** :
 * des joueurs en individuel, des équipes en tournoi par équipes (0041 : la
 * capacité s'y compte en équipes). Compter les joueurs contre une capacité en
 * équipes affichait « 12 / 8 · Complet » pour quatre équipes de trois sur huit
 * places — vu le 14 septembre 2026 sur « Mes tournois ».
 */
export type TournamentWithCount = Tournament & { registered_count: number };

type StatusRow = { status: RegistrationStatus };
type Row = Tournament & { registrations: StatusRow[]; team_registrations: StatusRow[] };

const CountSelect = '*, registrations(status), team_registrations(status)';

/** Places occupées : équipes engagées en tournoi par équipes, joueurs sinon. */
function occupiedSlots({ type, registrations, team_registrations }: Row): number {
  const rows = type === 'team' ? team_registrations : registrations;
  return (rows ?? []).filter((r) => ActiveRegistrationStatuses.includes(r.status)).length;
}

function withCount({ registrations, team_registrations, ...tournament }: Row): TournamentWithCount {
  return {
    ...tournament,
    registered_count: occupiedSlots({ ...tournament, registrations, team_registrations }),
  };
}

/** Tournois de l'organisateur connecté + nombre d'inscrits actifs. */
export function useMyTournaments(userId: string | undefined) {
  const [tournaments, setTournaments] = useState<TournamentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setTournaments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const { data, error: dbError } = await supabase
      .from('tournaments')
      .select(CountSelect)
      .eq('organizer_id', userId);
    if (dbError) {
      setError(true);
    } else {
      setTournaments(((data as Row[]) ?? []).map(withCount));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tournaments, loading, error, refresh };
}

/** Un tournoi par id (réservé à son organisateur via RLS) + inscrits actifs. */
export function useTournament(tournamentId: string | undefined) {
  const [tournament, setTournament] = useState<TournamentWithCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId) {
      setTournament(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const { data, error: dbError } = await supabase
      .from('tournaments')
      .select(CountSelect)
      .eq('id', tournamentId)
      .maybeSingle<Row>();
    if (dbError) {
      setError(true);
      setTournament(null);
    } else if (!data) {
      setTournament(null);
    } else {
      setTournament(withCount(data));
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tournament, loading, error, refresh };
}

/**
 * Duplique un tournoi : copie ses paramètres (sans les inscrits) dans un
 * nouveau brouillon, via la fonction `duplicate_tournament`. Renvoie le
 * tournoi créé, ou un message d'erreur.
 */
export async function duplicateTournament(
  tournamentId: string,
  name: string,
  eventDate: string
) {
  if (!supabase) return { data: null, error: 'Supabase non configuré.' };
  const { data, error } = await supabase.rpc('duplicate_tournament', {
    p_tournament_id: tournamentId,
    p_name: name,
    p_event_date: eventDate,
  });
  return { data: (data as Tournament) ?? null, error: error?.message ?? null };
}
