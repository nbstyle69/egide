import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useSyncExternalStore } from 'react';

import { normalizeCode } from '@/lib/invite-code';

const StorageKey = 'egide.invitation-en-attente';

/**
 * Code d'invitation reçu par lien, mis de côté le temps de se créer un compte.
 *
 * Le lien d'un capitaine tombe souvent sur quelqu'un qui n'a pas encore EGIDE.
 * Il ouvre l'app, doit s'inscrire, confirmer son adresse, choisir un pseudo —
 * et à la sortie de ce couloir, le code a disparu. Il faut alors retourner
 * chercher le message dans la conversation. Le lien n'aurait servi à rien.
 *
 * On le retient donc jusqu'à ce qu'il serve. Hors React, et pour la même
 * raison que le drapeau invité : il est écrit par l'écran d'invitation et lu
 * par l'onglet Équipes, que deux `useState` séparés ne feraient jamais se
 * rencontrer.
 *
 * Il est **consommé**, pas seulement lu : une invitation retombée dans
 * l'onglet Équipes trois semaines plus tard n'aurait aucun sens.
 */
let code: string | null = null;
let loading = true;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Une seule lecture du stockage au démarrage de l'app. */
const restored = AsyncStorage.getItem(StorageKey)
  .then((value) => {
    code = value ? normalizeCode(value) || null : null;
  })
  .catch(() => {
    code = null;
  })
  .finally(() => {
    loading = false;
    emit();
  });

export function usePendingInvite() {
  const state = useSyncExternalStore(
    subscribe,
    () => (loading ? null : code),
    () => null
  );

  /** Met un code de côté avant d'envoyer quelqu'un se créer un compte. */
  const remember = useCallback(async (value: string) => {
    const clean = normalizeCode(value);
    if (!clean) return;
    code = clean;
    emit();
    await AsyncStorage.setItem(StorageKey, clean).catch(() => {});
  }, []);

  /** Rend le code une fois, et l'oublie : une invitation ne sert qu'une fois. */
  const consume = useCallback(async () => {
    const value = code;
    code = null;
    emit();
    await AsyncStorage.removeItem(StorageKey).catch(() => {});
    return value;
  }, []);

  return { pendingCode: state, loading, remember, consume };
}

/** Exposé pour les tests : promesse résolue quand le stockage est lu. */
export const pendingInviteRestored = restored;
