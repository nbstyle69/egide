import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
  ActiveRegistrationStatuses,
  type RegistrationStatus,
  type Tournament,
} from '@/lib/tournaments';

/**
 * Tournoi + places occupées, **dans l'unité du tournoi** : des joueurs en
 * individuel, des équipes en tournoi par équipes (0041 : la capacité s'y
 * compte en équipes). Compter les joueurs contre une capacité en équipes
 * annonçait « Complet » à quatre équipes de trois sur huit places.
 */
export type TournamentWithCount = Tournament & { registered_count: number };

type StatusRow = { status: RegistrationStatus };
type Row = Tournament & { registrations: StatusRow[]; team_registrations: StatusRow[] };

const CountSelect = '*, registrations(status), team_registrations(status)';

/** Transforme les inscriptions imbriquées en simple compteur. */
function withCount(rows: Row[] | null): TournamentWithCount[] {
  return (rows ?? []).map(({ registrations, team_registrations, ...tournament }) => {
    const slots = tournament.type === 'team' ? team_registrations : registrations;
    return {
      ...tournament,
      registered_count: (slots ?? []).filter((r) => ActiveRegistrationStatuses.includes(r.status))
        .length,
    };
  });
}

/**
 * Liste les tournois créés par l'utilisateur connecté (« Mes tournois »),
 * triés par date d'événement croissante.
 */
export function useMyTournaments(userId: string | undefined) {
  const [tournaments, setTournaments] = useState<TournamentWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setTournaments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('tournaments')
      .select(CountSelect)
      .eq('organizer_id', userId)
      .order('event_date', { ascending: true });
    setTournaments(withCount(data as Row[] | null));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tournaments, loading, refresh };
}

/**
 * Liste publique des événements à venir (statut « inscriptions ouvertes »
 * ou « en cours »), triés par date croissante.
 */
export function useUpcomingEvents(past = false) {
  const [events, setEvents] = useState<TournamentWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const query = supabase.from('tournaments').select(CountSelect);
    const { data } = past
      ? // Passés : les tournois terminés, du plus récent au plus ancien —
        // on y cherche un résultat, pas une inscription.
        await query.eq('status', 'completed').order('event_date', { ascending: false })
      : // À venir : les tournois où il se passe encore quelque chose.
        await query
          .in('status', ['open', 'in_progress'])
          .gte('event_date', today)
          .order('event_date', { ascending: true });
    setEvents(withCount(data as Row[] | null));
    setLoading(false);
  }, [past]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { events, loading, refresh };
}
