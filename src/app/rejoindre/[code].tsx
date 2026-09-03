import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, OnTint, Spacing } from '@/constants/theme';
import { usePendingInvite } from '@/hooks/use-pending-invite';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { CodeLength, formatCode, normalizeCode, spellCode } from '@/lib/invite-code';
import { supabase } from '@/lib/supabase';
import { teamErrorMessage } from '@/lib/teams';

/**
 * Arrivée d'un lien d'invitation d'équipe (`egide://rejoindre/ABC123`).
 *
 * L'écran est **public** : un lien tombe presque toujours sur quelqu'un qui
 * n'a pas encore de compte, et le renvoyer à l'écran d'accueil sans un mot
 * ferait passer l'invitation pour un lien mort. Il voit donc de quoi il
 * s'agit, puis on l'accompagne — le code étant mis de côté pour le retrouver
 * de l'autre côté de l'inscription.
 *
 * On ne rejoint jamais tout seul. Rejoindre une équipe engage : la personne
 * apparaîtra au roster, pourra être alignée en tournoi, et ne peut appartenir
 * qu'à une seule équipe à la fois. C'est un geste, pas un effet de bord d'un
 * lien cliqué.
 */
export default function RejoindreScreen() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const params = useLocalSearchParams<{ code?: string }>();
  const code = normalizeCode(params.code ?? '');

  const { session, loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading } = useProfile(session?.user.id);
  const { remember } = usePendingInvite();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le code est mis de côté dès qu'on ne peut pas encore agir : pas de compte,
  // ou un compte sans pseudo que la garde du layout racine va détourner vers
  // la création de profil. C'est l'onglet Équipes qui le retrouvera de l'autre
  // côté du couloir — sinon le lien n'aurait servi à rien, et il faudrait
  // retourner chercher le code dans la conversation.
  const cantActYet = !session || (!profileLoading && !profile);
  useEffect(() => {
    if (!sessionLoading && cantActYet && code.length === CodeLength) {
      remember(code);
    }
  }, [sessionLoading, cantActYet, code, remember]);

  async function join() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: dbError } = await supabase.rpc('join_team', { p_invite_code: code });
    setBusy(false);
    if (dbError) {
      setError(teamErrorMessage(dbError));
      return;
    }
    // L'onglet Équipes affiche désormais l'équipe rejointe : c'est la preuve
    // que ça a marché, mieux qu'un message.
    router.replace('/equipes');
  }

  let content;

  if (code.length !== CodeLength) {
    content = (
      <View style={styles.block}>
        <ThemedText type="title" style={styles.title}>
          Ce lien d’invitation est incomplet
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          Demande à la personne qui t’invite de le renvoyer, ou saisis directement les
          6 caractères du code dans l’onglet Équipes.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.replace('/equipes')}>
          <ThemedText style={[styles.primaryButtonText, { color: OnTint[mode] }]}>
            Ouvrir l’onglet Équipes
          </ThemedText>
        </Pressable>
      </View>
    );
  } else if (sessionLoading || (session && profileLoading)) {
    content = <ActivityIndicator color={colors.tint} style={styles.block} />;
  } else if (!session) {
    content = (
      <View style={styles.block}>
        <ThemedText type="title" style={styles.title}>
          Tu es invité à rejoindre une équipe
        </ThemedText>
        <ThemedText
          style={[styles.code, { color: colors.tint }]}
          accessibilityLabel={`Code d’invitation : ${spellCode(code)}`}>
          {formatCode(code)}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          Crée ton compte EGIDE pour l’accepter. Le code est gardé de côté : tu n’auras pas à
          le ressaisir.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.replace('/(auth)/bienvenue')}>
          <ThemedText style={[styles.primaryButtonText, { color: OnTint[mode] }]}>
            Créer mon compte
          </ThemedText>
        </Pressable>
      </View>
    );
  } else if (!profile) {
    // Un compte sans pseudo est inutilisable en tournoi : la garde du layout
    // racine s'en occupe. On ne double pas la redirection ici.
    content = <ActivityIndicator color={colors.tint} style={styles.block} />;
  } else {
    content = (
      <View style={styles.block}>
        <ThemedText type="title" style={styles.title}>
          Rejoindre une équipe
        </ThemedText>
        <ThemedText
          style={[styles.code, { color: colors.tint }]}
          accessibilityLabel={`Code d’invitation : ${spellCode(code)}`}>
          {formatCode(code)}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          Tu apparaîtras au roster de l’équipe, et tu pourras être aligné en tournoi. On ne
          peut appartenir qu’à une seule équipe à la fois.
        </ThemedText>
        {error ? (
          <ThemedText type="small" style={[styles.centered, { color: colors.tint }]}>
            {error}
          </ThemedText>
        ) : null}
        <Pressable
          disabled={busy}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={join}>
          {busy ? (
            <ActivityIndicator color={OnTint[mode]} />
          ) : (
            <ThemedText style={[styles.primaryButtonText, { color: OnTint[mode] }]}>
              Rejoindre l’équipe
            </ThemedText>
          )}
        </Pressable>
        <Pressable
          disabled={busy}
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.replace('/equipes')}>
          <ThemedText>Plus tard</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          {/* Ouvert par lien direct, cet écran n'a pas d'écran parent dans la
              pile : `router.back()` échouerait. On remplace toujours. */}
          <Pressable
            onPress={() => router.replace('/equipes')}
            style={styles.backButton}
            accessibilityLabel="Fermer">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        {content}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.two,
  },
  block: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  centered: {
    textAlign: 'center',
  },
  code: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: 4,
  },
  primaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    alignSelf: 'stretch',
  },
  primaryButtonText: {
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
});
