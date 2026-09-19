import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/** Une ligne de la table `profiles` dans Supabase. */
export type Profile = {
  id: string;
  pseudo: string;
  region: string | null;
  faction_favorite: string | null;
  /** Alerte « tournoi dans ma région » (US-6.4). */
  notify_region: boolean;
  /** Notification à chaque inscription sur mes tournois (US-6.3). */
  notify_registrations: boolean;
  created_at: string;
  updated_at: string;
};

type State = { profile: Profile | null; loading: boolean };

/**
 * État partagé, hors React — même remède que le drapeau invité
 * (`use-guest.ts`) et pour la même raison, payée cher le 19 septembre 2026.
 *
 * Le profil est lu par la **garde du layout racine**, qui décide si l'on doit
 * passer par la création de profil, ET par l'écran de création lui-même, qui
 * appelle `refresh` une fois la ligne écrite. Tant que chaque appel de
 * `useProfile` gardait son propre `useState`, ces deux-là ne se voyaient pas :
 * le profil était bel et bien créé en base, la garde continuait de le croire
 * absent, et l'écran ne bougeait pas. Rien n'échouait, rien ne s'affichait —
 * le pire des symptômes.
 *
 * Un seul état, tous les abonnés prévenus : la garde recalcule sa redirection
 * dans la foulée de l'enregistrement.
 */
const Initial: State = { profile: null, loading: true };

let state: State = Initial;
/** Compte dont le profil est chargé ; évite de recharger à chaque montage. */
let loadedFor: string | undefined;
let hasLoaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setState(next: State) {
  state = next;
  emit();
}

async function load(userId: string | undefined) {
  // Posé avant l'attente : un second écran qui se monte dans la foulée voit
  // que le chargement est lancé et ne le déclenche pas une deuxième fois.
  loadedFor = userId;
  hasLoaded = true;

  if (!supabase || !userId) {
    setState({ profile: null, loading: false });
    return;
  }

  setState({ profile: state.profile, loading: true });
  // maybeSingle : renvoie la ligne si elle existe, sinon null (pas d'erreur).
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle<Profile>();

  // Une réponse qui arrive après un changement de compte ne doit pas écraser
  // le profil du nouveau : à la déconnexion, les deux se croisent.
  if (loadedFor !== userId) return;
  setState({ profile: data ?? null, loading: false });
}

/**
 * Profil du joueur connecté. `profile` vaut null tant qu'il n'en a pas créé.
 * `refresh` recharge après une création ou une modification, et prévient
 * **tous** les écrans montés, garde du routage comprise.
 */
export function useProfile(userId: string | undefined) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    // Rendu serveur du web statique : un instantané figé, jamais l'état muté.
    () => Initial
  );

  useEffect(() => {
    if (!hasLoaded || loadedFor !== userId) load(userId);
  }, [userId]);

  const refresh = useCallback(async () => {
    await load(userId);
  }, [userId]);

  return { profile: snapshot.profile, loading: snapshot.loading, refresh };
}
