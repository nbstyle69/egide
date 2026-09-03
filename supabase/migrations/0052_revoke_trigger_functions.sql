-- Migration 0052 : ménage des droits sur les fonctions de trigger
--
-- Les advisors Supabase signalent que sept fonctions de trigger sont
-- exécutables par `anon` et `authenticated`. Elles l'étaient par défaut :
-- Postgres accorde `execute` à `public` sur toute fonction créée, et aucune
-- des migrations qui les ont posées (0022, 0038, 0042) ne l'avait retiré.
--
-- CE N'EST PAS UNE FAILLE, et c'est pourquoi la correction arrive maintenant
-- plutôt qu'en urgence. Une fonction de trigger ne s'appelle pas directement :
-- elle prend son argument dans `NEW`/`OLD` et dans `TG_*`, qu'un appel normal
-- ne fournit pas. Postgres refuse d'ailleurs `select public.queue_promoted()`
-- avec « trigger functions can only be called as triggers ».
--
-- ON LA CORRIGE QUAND MÊME, pour deux raisons. D'abord parce qu'un
-- avertissement d'advisor qu'on choisit d'ignorer finit par masquer celui
-- qu'il ne fallait pas ignorer : une liste d'alertes n'est utile que si elle
-- est vide. Ensuite parce que le privilège ne protège rien ici, mais il ne
-- coûte rien non plus — et le retirer aligne ces sept fonctions sur la règle
-- déjà tenue partout ailleurs dans le projet (`revoke` de `public`/`anon`,
-- `grant` explicite au seul rôle qui doit appeler).
--
-- LE DÉCLENCHEMENT DES TRIGGERS N'EST PAS AFFECTÉ. Le droit d'exécution d'une
-- fonction de trigger est vérifié à la **création du trigger**, pas à chaque
-- ligne écrite : une fois `create trigger` passé, la fonction s'exécute avec
-- les droits du propriétaire du trigger, quel que soit le rôle qui écrit dans
-- la table. Les cinq files `queue_*` continuent donc de remplir `push_outbox`,
-- et les deux gardes continuent de refuser ce qu'elles refusaient.
--
-- Corollaire à tenir pour la suite : **toute nouvelle fonction de trigger se
-- termine par son `revoke`**, comme toute fonction RPC se termine par son
-- `grant`.

-- Les cinq files de notification (0022).
revoke execute on function public.queue_tournament_published() from public, anon, authenticated;
revoke execute on function public.queue_new_registration() from public, anon, authenticated;
revoke execute on function public.queue_promoted() from public, anon, authenticated;
revoke execute on function public.queue_round_published() from public, anon, authenticated;
revoke execute on function public.queue_list_reviewed() from public, anon, authenticated;

-- La garde « combler oui, réécrire non » sur la faction déclarée (0038).
revoke execute on function public.guard_registration_faction() from public, anon, authenticated;

-- La garde de taille d'équipe à l'inscription (0042).
revoke execute on function public.guard_team_size() from public, anon, authenticated;
