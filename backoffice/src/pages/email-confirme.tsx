/**
 * Page d'atterrissage après la confirmation d'adresse : /email-confirme.
 *
 * Supabase renvoie ici le joueur qui vient de cliquer le lien reçu par mail.
 * Elle existe parce qu'il fallait bien atterrir quelque part : sans elle,
 * Supabase retombe sur son `Site URL` par défaut, `http://localhost:3000`,
 * une adresse morte pour qui n'est pas en train de développer.
 *
 * Elle n'ouvre **aucune session** et c'est volontaire. Le client mobile est
 * configuré avec `detectSessionInUrl: false`, et rien dans l'app ne traite les
 * liens d'authentification entrants. La confirmation valide l'adresse, rien de
 * plus : le joueur revient dans l'app et se connecte avec son mot de passe.
 * Cette page le lui dit, au lieu de le laisser devant une erreur.
 *
 * Elle vit dans le back office faute d'un site public, mais elle s'adresse à
 * un joueur, pas à un organisateur : ni barre latérale, ni invitation à se
 * connecter ici, qui l'enverraient dans la mauvaise application.
 */
export function EmailConfirmePage() {
  return (
    <div className="public-shell">
      <header className="public-topbar">
        <div className="public-brand">EGIDE</div>
        <div className="public-tag">Inscription</div>
      </header>

      <main className="public-content">
        <div className="public-header">
          <h1 className="public-title">Ton adresse est confirmée</h1>
        </div>

        <p>
          Ton compte EGIDE est prêt. Rouvre l'application sur ton téléphone et connecte-toi
          avec l'adresse et le mot de passe que tu viens de choisir.
        </p>

        <p>
          Tu pourras alors créer ton profil de joueur, puis t'inscrire aux tournois de ta
          région.
        </p>

        <p style={{ color: 'var(--text-secondary)' }}>
          Cette page n'a plus rien à te demander : tu peux la fermer.
        </p>
      </main>

      <footer className="public-footer">
        <strong>EGIDE</strong> · Tournois Warhammer Age of Sigmar
      </footer>
    </div>
  );
}
