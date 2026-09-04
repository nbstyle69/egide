import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  Colors,
  GreenColor,
  OnTint,
  RedBackground,
  RedColor,
  Spacing,
  TintBackground,
  TintBorder,
} from '@/constants/theme';
import type { TournamentRoster } from '@/hooks/use-tournament-roster';

type Props = {
  roster: TournamentRoster;
  busy: boolean;
  error: string | null;
  onJoin: () => void;
  onRemove: (playerId: string) => void;
  onInvite: (playerId: string) => void;
  /** Après le lancement, le roster se lit mais ne se change plus. */
  editable: boolean;
};

/**
 * Le roster de mon équipe pour ce tournoi, et les gestes qui le remplissent
 * (US-7.11).
 *
 * L'équipe s'engage d'abord, le roster se remplit ensuite — par deux chemins
 * qui aboutissent au même endroit : le capitaine appelle un joueur, ou le
 * joueur prend la place lui-même. La carte montre donc **les places vides
 * autant que les pleines** : c'est en les voyant qu'on les prend.
 */
export function RosterCard({ roster, busy, error, onJoin, onRemove, onInvite, editable }: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  if (!roster.has_team || !roster.engaged) return null;

  const size = roster.team_size ?? 0;
  const taken = roster.taken ?? 0;
  const free = roster.free ?? 0;
  const lines = roster.roster ?? [];
  const bench = roster.bench ?? [];
  const isCaptain = Boolean(roster.is_captain);
  const waiting = roster.team_status === 'waitlisted';

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <View style={styles.header}>
        <Ionicons name="people" size={16} color={colors.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {roster.team_name}
          {waiting ? ' — en liste d’attente' : ''}
        </ThemedText>
      </View>

      <ThemedText type="subtitle">
        {taken} joueur{taken > 1 ? 's' : ''} sur {size}
      </ThemedText>

      {/* Les places occupées, dans l'ordre du roster : c'est lui qui sert
          d'appariement de départ face à l'équipe adverse. */}
      {lines.map((slot) => (
        <View key={slot.player_id} style={styles.row}>
          <View style={[styles.position, { backgroundColor: colors.backgroundSelected }]}>
            <ThemedText type="small">{slot.position}</ThemedText>
          </View>
          <View style={styles.rowText}>
            <ThemedText type={slot.is_me ? 'smallBold' : 'small'}>
              {slot.pseudo}
              {slot.is_me ? ' (toi)' : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {slot.faction ?? 'Faction à déclarer'}
            </ThemedText>
          </View>
          {isCaptain && editable ? (
            <Pressable
              onPress={() => onRemove(slot.player_id)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${slot.pseudo} du roster`}
              style={({ pressed }) => [styles.smallAction, { opacity: pressed || busy ? 0.6 : 1 }]}>
              <ThemedText type="small" style={{ color: RedColor[mode] }}>
                Retirer
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ))}

      {/* Les places vides se voient. Une place qu'on ne montre pas ne se prend
          pas, et l'équipe arrive incomplète le jour J sans que personne ne
          l'ait décidé. */}
      {Array.from({ length: free }).map((_, index) => (
        <View key={`libre-${index}`} style={styles.row}>
          <View style={[styles.position, { borderColor: colors.backgroundSelected, borderWidth: 1 }]}>
            <ThemedText type="small" themeColor="textSecondary">
              {taken + index + 1}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Place libre
          </ThemedText>
        </View>
      ))}

      {error ? (
        <View style={[styles.banner, { backgroundColor: RedBackground[mode] }]}>
          <ThemedText type="small" style={{ color: RedColor[mode] }}>
            {error}
          </ThemedText>
        </View>
      ) : null}

      {/* Le geste du joueur : personne ne l'inscrit à sa place. */}
      {roster.can_join && editable ? (
        <Pressable
          onPress={onJoin}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed || busy ? 0.8 : 1 },
          ]}>
          {busy ? (
            <ActivityIndicator color={OnTint[mode]} />
          ) : (
            <ThemedText type="smallBold" style={{ color: OnTint[mode] }}>
              Prendre ma place
            </ThemedText>
          )}
        </Pressable>
      ) : null}

      {roster.in_roster ? (
        <View style={styles.confirmRow}>
          <Ionicons name="checkmark-circle" size={16} color={GreenColor[mode]} />
          <ThemedText type="small" style={{ color: GreenColor[mode] }}>
            Tu es aligné avec {roster.team_name}.
          </ThemedText>
        </View>
      ) : null}

      {/* Le banc, réservé au capitaine : inviter, c'est demander — pas décider
          à la place de quelqu'un. */}
      {isCaptain && editable && free > 0 && bench.length > 0 ? (
        <View style={styles.bench}>
          <ThemedText type="small" themeColor="textSecondary">
            Appeler un joueur de l’équipe. Il recevra une notification et prendra la place
            lui-même.
          </ThemedText>
          {bench.map((member) => (
            <View key={member.player_id} style={styles.row}>
              <ThemedText type="small" style={styles.rowText}>
                {member.pseudo}
              </ThemedText>
              <Pressable
                onPress={() => onInvite(member.player_id)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Appeler ${member.pseudo}`}
                style={({ pressed }) => [
                  styles.inviteButton,
                  {
                    backgroundColor: TintBackground[mode],
                    borderColor: TintBorder[mode],
                    opacity: pressed || busy ? 0.6 : 1,
                  },
                ]}>
                <ThemedText type="small" style={{ color: colors.tint }}>
                  Appeler
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  rowText: {
    flex: 1,
  },
  position: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAction: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  inviteButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  primaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  banner: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  bench: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
});
