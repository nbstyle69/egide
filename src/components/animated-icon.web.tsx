/**
 * Variante web : pas de voile de démarrage.
 *
 * Le navigateur affiche déjà la page dès qu'elle est prête, et il n'y a pas
 * d'écran de démarrage natif à prolonger. Metro choisit ce fichier à la place
 * de `animated-icon.tsx` sur le web (résolution par plateforme).
 */
export function AnimatedSplashOverlay() {
  return null;
}
