import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Colors } from '@/constants/theme';

const DURATION = 600;

/**
 * Le voile qui recouvre l'app le temps qu'elle s'initialise, puis s'efface.
 *
 * Il prolonge l'écran de démarrage natif (`expo-splash-screen`, réglé dans
 * `app.json`) : même marque, même fond, pour qu'aucune couture ne se voie
 * entre les deux. Le bouclier est celui de l'écran d'accueil et de l'icône —
 * une seule marque, déclinée trois fois, jamais redessinée.
 *
 * Le fond suit le schéma clair/sombre, comme les deux variantes déclarées
 * dans `app.json` ; sans cela, l'app clignoterait d'une couleur à l'autre.
 */
export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  const mark = <Ionicons name="shield-half" size={96} color={Colors[mode].tint} />;
  const overlay = [styles.splashOverlay, { backgroundColor: Colors[mode].background }];

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={overlay}>
      {mark}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={overlay}>
      {mark}
    </View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    // RN 0.81 : absoluteFill n'est plus typé comme objet étalable.
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
