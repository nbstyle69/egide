# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## À lire avant de coder (Expo SDK 54)

Ce projet tourne sur **Expo SDK 54** (voir `package.json` : `expo@^54.0.0`, `react-native@0.81`, `react@19.1`). Les API Expo changent souvent d'une version à l'autre — consulte la doc versionnée **https://docs.expo.dev/versions/v54.0.0/** avant d'écrire du code qui touche à un module `expo-*`.

**Le SDK 54 est imposé, pas subi** : l'App Store du porteur plafonne Expo Go à la 54.0.2. Ne jamais remonter de SDK sans son accord explicite. `AGENTS.md` à la racine répète cette seule consigne pour les autres outils : si la version change un jour, mettre à jour les deux fichiers.

## Contexte projet

EGIDE est une app de tournois **Warhammer Age of Sigmar** (organisation, annuaire d'événements, équipes). Interface **en français**, public francophone. Le porteur débute en développement : avancer par petits incréments testables, expliquer les étapes.

**Au début de toute session de travail sur le code, lire `RESUME_PROJET.md` avant d'agir.** C'est le document de passation : il dit où en est le projet, ce qui a déjà été tranché, et les pièges déjà payés. Le relire coûte une minute ; le sauter fait re-litiger des décisions et retomber dans des pièges documentés. Inutile pour une simple question ponctuelle.

Documents de référence du dépôt, par ordre d'utilité :
- **`RESUME_PROJET.md`** — document de passation : état d'avancement, décisions déjà tranchées, pièges rencontrés, comptes de test. À lire au démarrage, et dès qu'une question dépasse le fichier courant.
- `BACKLOG.md` — tous les EPICs et User Stories, avec notes de livraison (tenu par l'agent `product-owner`).
- `CAHIER_DES_CHARGES.md` — périmètre et phasage d'origine.
- `PAIEMENTS.md` — architecture des paiements (Stripe pour les inscriptions, IAP pour le premium), **à lire avant la première ligne de code de paiement**.
- `ETUDE_LISTES.md` — étude de faisabilité de la vérification automatique des listes (EPIC-10). Elle **instruit sans trancher** : les coûts en points appartiennent à Games Workshop, donc **aucune ligne de code sur l'EPIC-10 avant décision du porteur**.
- `backoffice/README.md` — spécificités du back office.

## Deux applications, un même Supabase

Le dépôt contient **deux front-ends** qui partagent la même base Supabase (mêmes tables, mêmes fonctions RPC) :

| App | Rôle | Techno | Racine |
|---|---|---|---|
| **App mobile** (racine) | Le produit : joueurs et organisateurs sur iOS/Android/web | Expo + expo-router | `src/` |
| **Backoffice** | Console web des organisateurs (check-in, saisie scores, rondes, circuits) et console d'administration | Vite + React 19 + react-router-dom v7 | `backoffice/` |

Les deux sont des projets npm **séparés** (chacun son `package.json` et son `node_modules`). Le backoffice et `supabase/functions/` (Deno, pas Node) sont exclus du `tsconfig.json` racine. Du code proche existe en double des deux côtés (`lib/supabase.ts`, `lib/tournaments.ts`, `lib/ordinal.ts`, `lib/push.ts`, `lib/regions.ts`, `hooks/use-session.ts`, `hooks/use-standings.ts`, `hooks/use-team-standings.ts`, `components/status-badge.tsx`) — c'est volontaire : **une modification métier doit souvent être répercutée dans les deux**.

Cas particulier des **factions** : le mobile les lit dans `src/lib/factions.ts` (liste statique), le backoffice dans la table `public.factions` (migration 0038, hook `use-factions.ts`). Le fichier TS et la table sont déclarés **miroirs** : une faction ajoutée, renommée ou retirée touche les deux dans le même commit.

Deux référentiels vieillissent avec les saisons de jeu et doivent être rafraîchis, pas corrigés au cas par cas : `src/lib/factions.ts` (édition en cours) et `backoffice/src/lib/battleplans.ts` — les 12 plans de bataille du General's Handbook, **suggérés** dans les trois champs de scénario du backoffice via `<BattleplanDatalist>`. Le scénario reste du **texte libre** (0017) : la liste guide l'orthographe pour que l'historique ne voie pas trois scénarios là où il y en a un, elle n'interdit rien. À la saison suivante, remplacer la liste et la constante `BattleplanSeason`.

## Commandes

### App mobile (racine)
```bash
npm install
npm start          # expo start (choisir la plateforme dans le terminal)
npm run web        # navigateur, port 8081 — le plus rapide pour tester
npm run android    # émulateur Android
npm run ios        # simulateur iOS
npm run lint       # expo lint
npx tsc --noEmit   # vérification de types (les routes typées viennent de .expo/types/router.d.ts, généré par le serveur Expo : lancer npm run web une fois avant)
```

**Ne jamais lancer `npm run reset-project`** : c'est le script du gabarit `create-expo-app`, il déplace `src/` et `scripts/` dans `example/` et remplace l'app par un écran vide.

### Backoffice
```bash
npm --prefix backoffice install
npm --prefix backoffice run dev     # serveur Vite, port 5173
npm --prefix backoffice run build   # tsc -b && vite build — c'est aussi la vérification de types du backoffice
npm --prefix backoffice run lint    # oxlint
```

`.claude/launch.json` déclare déjà ces deux serveurs (`egide-web` sur 8081, `egide-backoffice` sur 5173).

### Validation
Il n'y a **pas de suite de tests automatisés**. La validation se fait en deux temps :
1. lancer l'app (`npm run web`) et parcourir les écrans — l'agent `qa-tester` teste dans le navigateur ;
2. pour toute fonction SQL, écrire des **assertions SQL** exécutées contre la base via le MCP `supabase` (`execute_sql`) — précédents : 13 assertions pour les équipes, 8 pour les listes d'armées.

**Le navigateur, lui, dépend de la session.** Le panneau « Browser » de l'app de bureau (`preview_start` avec `egide-web` ou `egide-backoffice`) pilote les deux apps ; les serveurs MCP Playwright et Chrome DevTools exigent Chrome, absent du poste. Trois réflexes dans le panneau :
- le serveur Expo met ~20 s à écouter — sonder `curl localhost:8081` en boucle avant de recharger ;
- les captures d'écran expirent quand la fenêtre est cachée : lire la page avec `read_page` ou `find`, ne pas insister ;
- la console **cumule** les erreurs des pages précédentes et les appels Supabase n'apparaissent pas dans `read_network_requests`. Pour attribuer un 401 à un écran, exécuter `performance.getEntriesByType('resource')` et lire `responseStatus`.

**Les écrans connectés se testent avec une session ouverte par le porteur**, dans le panneau, onglet par onglet : le jeton ne se transfère pas d'un onglet à l'autre (le classifieur bloque toute route, y compris le `localStorage` et un serveur local). L'agent ne saisit jamais de mot de passe. Quand rien n'est pilotable, la vérification passe par : assertions SQL, appels HTTP réels contre l'API Supabase, et lecture du HTML servi par le serveur Expo.

**Une assertion SQL par rôle, dans un `do $$ … $$`** qui se termine par `raise exception` (l'exception annule le bloc et son message rapporte le résultat). Piège payé deux fois : trois `set_config` posés dans les sous-requêtes d'un même `select` donnent un **faux positif** — il faut `perform set_config(...)` puis `select … into`, une instruction par rôle.

## Configuration (obligatoire pour démarrer)

Chaque app lit ses clés Supabase depuis un `.env` (copier le `.env.example` correspondant) :
- Mobile : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Backoffice : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Si les clés manquent, `supabase` vaut `null` et `isSupabaseConfigured` est `false` : chaque écran doit gérer ce cas (ne jamais supposer que le client existe).

## Architecture

### Navigation mobile — expo-router (file-based)
Les routes vivent dans `src/app/` (alias `@/*` → `src/*`, `typedRoutes` et `reactCompiler` activés). `src/app/_layout.tsx` est le **cerveau du routage** : il lit session / profil / mode invité et redirige. Les groupes :
- `(auth)/` — bienvenue, connexion, inscription, création de profil
- `(tabs)/` — 4 onglets : Événements (`index`), Tournois, Équipes, Profil
- `evenements/[id]/…` (fiche, inscrits, tables, classement, liste, `appariement` des capitaines, `inscrire-equipe`, discussion), `equipes/[id]` (+ `discussion`) et `rejoindre/[code]` — écrans poussés, **publics** : `onPublicRoute` couvre les trois préfixes `evenements`, `equipes` et `rejoindre`, car un lien profond ne doit jamais être détourné vers l'accueil. `rejoindre/[code]` est le cas limite qui explique la règle : un lien d'invitation tombe presque toujours sur quelqu'un sans compte, et le code est mis de côté (`use-pending-invite`) pour être retrouvé de l'autre côté de l'inscription
- écrans de création poussés hors onglets : `tournois/creer`, `equipes/creer`
- écrans transverses ouverts depuis le profil : `historique`, `meta` (statistiques par faction), `elo` (classement national)

La garde est **déclarative** (`<Redirect>` calculé pendant le rendu), **jamais dans un `useEffect`** : sinon l'écran d'accueil clignote pour qui est déjà connecté. Tant que `booting` est vrai, on ne rend que le splash.

Metro résout les fichiers par plateforme : un `xxx.web.tsx` à côté de `xxx.tsx` remplace ce dernier sur le web (`use-color-scheme.web.ts`, `animated-icon.web.tsx`). Une modification de comportement web se fait dans la variante `.web`, pas dans un `Platform.OS` au milieu du fichier commun.

### Navigation backoffice
Toutes les routes vivent dans `backoffice/src/App.tsx`. Sans session, seuls `/connexion` et `/circuit/:id` (page publique d'un circuit) répondent, tout le reste renvoie vers `/connexion`. Connecté : liste et création (`/tournois`, `/tournois/creer`, `/circuits`), le **jour J** (`/tournois/:id/{inscrits,check-in,rondes,classement,listes}`) et l'**administration** (`/admin/…`, réservée au rôle admin de la migration 0028).

### Couches de données
Pattern répété partout : **hook `use-*` → client Supabase → composant**.
- `src/lib/` : types + libellés FR + helpers purs (`tournaments.ts` définit `TournamentStatus`, `StatusLabels`, `formatEventDate` ; voir aussi `factions.ts`, `regions.ts`, `dates.ts`, `ordinal.ts`). Pas d'appels réseau ici.
- `src/hooks/use-*.ts` : chargent/écrivent via `supabase`, exposent `{ data, loading, refresh }`. Toujours garder `if (!supabase) …`.
- `src/components/` : présentation, thémée clair/sombre via `@/constants/theme` et `useColorScheme()`.

**Pas de temps réel** (décision assumée, re-confirmée explicitement pour les fils de discussion comme pour l'appariement des capitaines) : rafraîchissement en tirant vers le bas.

### Logique métier = fonctions Postgres (RPC)
Le cœur du tournoi vit dans la base, pas dans le client : les migrations `supabase/migrations/*.sql` définissent des fonctions `security definer` appelées via `supabase.rpc(...)`. Elles se terminent toujours par leurs `grant`/`revoke` explicites (réservées à `authenticated`, `revoke` de `anon` — sauf les lectures volontairement publiques, comme `circuit_standings`).

Familles de fonctions :
- **inscriptions** — `register_for_tournament`, `withdraw_from_tournament`, `promote_waitlist`, `remove_registration`
- **jour J, individuel** — `set_check_in`, `set_check_in_all`, `start_tournament`, `swiss_pair` / `generate_next_round`, `set_pairing_score`, `set_round_scenario`, `drop_player`, `close_tournament`
- **tournois par équipes** — `register_team`, `update_team_roster`, `withdraw_team`, `set_team_check_in`, `team_check_in_state`, `start_team_tournament`, `swiss_pair_teams` / `generate_next_team_round`, `seed_team_tables`, `team_standings`
- **appariement des capitaines** — `team_pairing_state`, `open_captain_pairing`, `captain_post_player`, `captain_offer_two`, `captain_pick_opponent`, `commit_captain_match`, `autocomplete_captain_pairing`
- **classements** — `tournament_standings`, `circuit_standings`, `national_elo`, `player_history`
- **méta** — `faction_meta_stats`, `meta_coverage`
- **équipes** — `create_team`, `join_team`, `leave_team`, `disband_team`, `transfer_captaincy`, `get_invite_code`, `regenerate_invite_code`
- **listes d'armées** — `submit_army_list`, `set_army_pdf`, `review_army_list`, `reopen_army_list`
- **discussions** — `post_message`, `thread_messages`, `delete_message`, `report_message`
- **administration** — `is_admin`, `admin_dashboard`, `admin_tournaments`, `admin_accounts`, `admin_teams`, `admin_cancel_tournament`, `admin_rename_team`, `admin_disband_team`…

### Règles métier enfouies dans le SQL
Elles ne sont écrites nulle part dans le client. Les redéfinir côté écran, c'est créer une deuxième vérité :
- `bye_scores()` — un bye vaut victoire **15 à 5** (+3 tactiques).
- **Six départages, dans cet ordre** : victoires → points marqués → tactiques marquées → différentiel de score → force des adversaires (SoS) → tirage au sort *stable*.
- `already_met()` / `already_met_team()` — l'appariement suisse ne rejoue jamais un adversaire, avec bye tournant et retour arrière ; issue de secours seulement si l'organisateur l'autorise explicitement.
- **Les seuils statistiques vivent dans la fonction, pas dans l'écran** : `faction_meta_stats` laisse le taux de victoire à `null` sous 30 parties (colonne `sample_sufficient`), `national_elo` n'affiche personne sous 5 parties. L'écran affiche ce qu'on lui donne et ne connaît aucun seuil.
- **ELO national** : départ à 1000, K = 24, marge de victoire ignorée, tournois par équipes / byes / forfaits exclus, recalculé à chaque appel (rien n'est stocké, donc un score corrigé se répercute seul).
- **Tournois par équipes** : protocole « **pose – deux – choix** » itéré N-1 fois (l'attaquant pose un de ses joueurs, le défenseur en présente deux, l'attaquant choisit, puis les rôles s'inversent) ; le dernier match se forme tout seul. Le **journal `captain_picks` est l'état** — le tour et le geste attendu s'en déduisent, rien n'est stocké en double. Aucune minuterie : l'organisateur peut agir à la place d'un capitaine absent.
- **Messages** : une seule table pour deux portées (tournoi / équipe) et **suppression douce**, jamais d'effacement.
- **Les places se comptent dans l'unité du tournoi** : des joueurs en individuel, des **équipes** en tournoi par équipes (`capacity` y est un nombre d'équipes depuis la 0041). `registered_count` porte ce sens des deux côtés (`use-tournaments.ts`, `use-my-tournaments.ts`) et dans `admin_tournaments` (0056). Compter les joueurs contre cette capacité affichait « 12 / 8 · Complet » à quatre équipes de trois.
- **Le classement individuel masque lui-même ce qui est privé** : `tournament_standings` est `security definer` depuis la 0055 et rend `pseudo` et `faction` **nuls quand `auth.uid()` est nul**. Rangs, bilans et points restent publics — le mode invité est une décision assumée, les pseudos réservés aux connectés aussi. L'écran affiche ce qu'on lui donne (`pseudo` est `string | null` côté mobile) ; il ne connaît pas la règle.

Une **fonction de trigger** se termine par son `revoke` (`from public, anon, authenticated`) comme une fonction RPC se termine par son `grant` — migration 0052. Le privilège ne protège rien (Postgres refuse d'appeler une fonction de trigger directement), mais un avertissement d'advisor qu'on laisse traîner finit par masquer celui qu'il ne fallait pas ignorer.

Deux habitudes de la même famille, posées en 0057 : dans une politique RLS, écrire **`(select auth.uid())`** et non `auth.uid()` — sinon Postgres rappelle la fonction à chaque ligne examinée ; et **toute clé étrangère nouvelle reçoit son index**, que Postgres ne crée jamais tout seul. Lancer `get_advisors` (MCP `supabase`, `security` puis `performance`) après chaque migration : ce qui reste aujourd'hui est voulu — fonctions `security definer` exposées à `authenticated`, lectures publiques accordées à `anon`, deux tables à politiques multiples.

**Les migrations sont numérotées et immuables** : pour changer le schéma ou une fonction, **ajouter une nouvelle migration** `00NN_description.sql`, ne jamais éditer une existante. Corollaire facile à oublier : une fonction est souvent **redéfinie plus tard** par `create or replace` — `start_tournament` et `generate_next_round` sont réécrits en 0045 pour aiguiller entre tournoi individuel et tournoi par équipes. Avant de modifier une fonction, `grep` son nom dans **toutes** les migrations et repartir de la **dernière** définition.

### Comment une migration atteint la base
Il n'y a **pas de CLI Supabase configurée** dans le dépôt (pas de `supabase/config.toml`, pas de stack locale) : le fichier sous `supabase/migrations/` est la source de vérité versionnée, mais il faut l'appliquer au projet distant — via le serveur MCP `supabase` déclaré dans `.mcp.json` (`apply_migration`) ou l'éditeur SQL du dashboard. Écrire le fichier ne suffit donc jamais : vérifier ensuite que la fonction existe bien en base.

Le projet distant est `ajmhcslxlkjlvaxcazav` (région eu-west-3) : c'est le `project_id` à passer aux outils MCP `supabase`.

Le projet Supabase du palier gratuit **se met en veille** après ~1 semaine d'inactivité (« Network request failed » côté app) — le réveiller depuis le dashboard ou via MCP `restore_project`.

### Notifications push
Chaîne complète : `push_tokens` (jeton du device, migration 0021) → `push_outbox` (file + 5 triggers `queue_*`, migration 0022) → Edge Function `supabase/functions/send-push` (unique porte de sortie vers l'API Expo). Seconde Edge Function du dépôt : `admin-account`, pour les opérations de compte réservées aux admins.

La file n'est pas vidée par un cron : **le client appelle `flushPushQueue()`** (`src/lib/push.ts`, dupliqué dans `backoffice/src/lib/push.ts`) après toute action qui crée un événement à notifier. Un tap sur une notif lit `data.url` et fait `router.push(url)` (voir `_layout.tsx`). Web exclu (`Platform.OS === 'web'`), et **Expo Go ne reçoit plus les push distantes depuis le SDK 53** : tester la réception exige un development build (`eas build --profile development`, `projectId` déjà dans `app.json`).

## Conventions

- **Tout le texte utilisateur, les commentaires et les noms de routes sont en français.** Les identifiants de code (variables, types) sont en anglais ; les colonnes SQL en anglais snake_case.
- **Aucune formulation genrée** : on ne connaît pas le genre des joueurs. Écrire « tu as le bye », pas « il est exempt ».
- Commentaires rédigés : ils expliquent le *pourquoi* métier, pas le *quoi*. Les en-têtes de migration sont le modèle à suivre (la décision, l'alternative écartée, la raison). Garder ce ton.
- Thème clair/sombre systématique via `@/constants/theme` — `useTheme()` (`src/hooks/use-theme.ts`) rend directement la palette du schéma courant, `useColorScheme()` seulement quand on a besoin du mode lui-même. Jamais de couleur en dur. Le design system y est centralisé : `Colors` (accent doré `tint`), paires sémantiques clair/sombre (`GreenColor`, `RedColor`, `TintBackground`…), échelle `Spacing` (`half`…`six`) pour les marges, `MaxContentWidth`. **Règle de contraste** : tout texte posé sur un fond `tint` doit utiliser `OnTint` (blanc en clair, noir sur l'or sombre) — sinon le contraste tombe à ~1,9:1, illisible.
- Sur le web, les polices exposées par `Fonts` sont des variables CSS (`--font-display`…) définies dans `src/global.css`, que `theme.ts` importe. Ajouter une police touche donc aux deux fichiers.
- Statuts et libellés centralisés dans `lib/tournaments.ts` (`StatusLabels`, `TypeLabels`, `ActiveRegistrationStatuses`) — réutiliser, ne pas redéfinir.
- Deux helpers du backoffice portent une décision, pas un utilitaire : `lib/score-drafts.ts` garde en local les scores tapés mais pas encore confirmés (le wifi d'une salle des fêtes lâche) — il mémorise aussi la valeur serveur d'origine, et **si elle a changé, le serveur gagne et le brouillon est jeté** ; rien n'est jamais réenvoyé tout seul. `lib/export.ts` écrit les CSV avec séparateur `;`, BOM UTF-8 et fins de ligne CRLF, pour qu'Excel FR les ouvre avec les accents.
- Le backoffice n'a **aucune bibliothèque de composants** : CSS fait main dans `backoffice/src/index.css`, variables reprenant le thème doré.
- Un commit par US livrée, message en français expliquant le **pourquoi**.
- **Aucun build EAS, envoi sur une boutique ou publication sans autorisation explicite du porteur.** Ils consomment ses crédits, sur son compte, et produisent un artefact à son nom. Préparer, vérifier, annoncer que c'est prêt, puis **attendre** : une question restée sans réponse n'est pas un oui.

## Pièges déjà payés cher

1. **RLS filtre les lignes, jamais les colonnes.** Une table publique contenant un secret (ex. `teams.invite_code`) l'expose à tous : `revoke select` puis `grant select` colonne par colonne + fonction dédiée (migration 0016).
   **Un `revoke` par colonne ne sert à rien tant qu'un droit de table subsiste** (migrations 0058-0059, 19 septembre 2026). `revoke insert (role) …` n'a eu **aucun effet** sur `profiles`, parce que la table portait encore un `GRANT INSERT` entier hérité de la 0001 : un droit de table couvre toutes les colonnes, présentes et futures. Il faut `revoke insert on <table>` puis ré-accorder colonne par colonne, comme la 0028 l'avait fait pour `UPDATE`. Et **restreindre une colonne sensible, c'est traiter les deux verbes** : `UPDATE` verrouillé et `INSERT` ouvert laissaient n'importe quel nouvel inscrit se créer un profil avec `role = 'admin'`. Vérifier `information_schema.role_table_grants` avant de croire un `revoke` par colonne.

   **Corollaire qui a coûté trois semaines** : PostgREST refuse la requête **entière** dès qu'une seule colonne demandée est interdite au rôle. La fiche d'un événement réclamait `registrations.faction`, privée depuis la 0038 — tout visiteur sans compte lisait « Événement introuvable », sur tous les événements, du 27 août au 14 septembre 2026 (réparé en 0054-0055). Donc : après avoir rendu une colonne privée, `grep` les `select(` des **deux** clients pour trouver qui la nomme encore ; et une requête client qui dépend de la session doit la lire du jeton (`supabase.auth.getSession()`), pas d'un `userId` qui n'arrive qu'au second rendu.
2. **Ne jamais appeler `refresh()` après chaque écriture** dans un écran de saisie rapide : le rechargement fait clignoter le tableau et détruit le focus clavier. Garder un état `saved` local.
3. **Toute action différée reçoit sa cible explicitement**, jamais déduite de l'état — les fermetures vieillissent.
4. **Amorçage de formulaire** : un `useEffect` de préremplissage doit attendre **tous** les chargements amont (session → tournoi → inscription → profil) ; chaque hook aval retombe `loading=false` tant que son paramètre est `undefined`.
5. **`router.back()` échoue** sur un écran ouvert par lien direct : prévoir un repli `router.replace` vers l'écran parent.
6. **Le `Modal` de React Native Web ne disparaît pas** quand `visible` repasse à faux : le monter conditionnellement (`{open ? <Modal/> : null}`).
7. **Tous les hooks avant tout `return` conditionnel** : un `useMemo` placé après un retour anticipé casse l'ordre des hooks (page blanche).
8. **Un état partagé entre écrans ne vit pas dans deux `useState`** : trois stores hors React le prouvent — le drapeau invité (`src/hooks/use-guest.ts`), le code d'invitation en attente (`src/hooks/use-pending-invite.ts`, écrit par l'écran d'invitation, lu puis **consommé** par l'onglet Équipes), et le profil (`src/hooks/use-profile.ts`). Modèle à reprendre : module + `useSyncExternalStore`.
   Le profil a rejoint la liste le 19 septembre 2026, après une rechute coûteuse : la garde de `_layout.tsx` et l'écran de création de profil appelaient chacun `useProfile`, donc chacun son `useState`. Le profil était **bel et bien écrit en base**, la garde continuait de le croire absent, et l'écran restait figé. Rien n'échouait, rien ne s'affichait — le symptôme le plus coûteux à diagnostiquer. **Le signe qui doit alerter : un bouton qui ne fait « rien ».** Vérifier d'abord en base si l'écriture a eu lieu ; si oui, le bug est dans la propagation de l'état, pas dans l'enregistrement.

## Agents et workflow du dépôt

Des sous-agents spécialisés sont définis dans `.claude/agents/` : `product-owner` (backlog, périmètre), `ux-ui` (conçoit avant chaque mise en page — **avis UX/UI requis avant de coder un écran**), `developpeur` (implémente), `qa-tester` (teste dans le navigateur, ne corrige pas).

Le design system est publié sur claude.ai/design (projet « EGIDE »), sources HTML dans `design-system/`. **`src/constants/theme.ts` fait foi** ; les fiches suivent.
