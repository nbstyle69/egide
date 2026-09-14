-- Migration 0057 : ménage signalé par les advisors de performance Supabase
--
-- Rien ne change pour les utilisateurs : mêmes droits, mêmes lignes visibles.
-- Deux familles d'avertissements, relevées le 14 septembre 2026 après les
-- migrations 0054-0056, et qu'on solde pour la même raison que la 0052 : un
-- avertissement qu'on laisse traîner finit par masquer celui qu'il ne fallait
-- pas ignorer.
--
-- 1. `auth.uid()` réévalué à chaque ligne. Dans une politique RLS, Postgres
--    rappelle la fonction pour chaque ligne examinée ; écrit `(select
--    auth.uid())`, l'appel devient un « initplan » calculé une fois par
--    requête. Les politiques récentes le font déjà (0028, 0038…) ; celles de
--    `army_lists` (0018) et `push_tokens` (0021) datent d'avant. On les recrée
--    à l'identique, seule la forme de l'appel change.
--
-- 2. Onze clés étrangères sans index couvrant. Postgres n'en crée aucun tout
--    seul ; sans lui, chaque suppression ou mise à jour de la ligne référencée
--    (un profil, une équipe, une faction) balaie la table qui la référence.
--    Sur nos volumes c'est invisible, mais le jour où un compte est supprimé
--    au milieu d'un tournoi, ce sont ces index qui rendent le geste instantané.

-- ---------------------------------------------------------------------------
-- 1. Politiques RLS : même règle, un seul appel à auth.uid() par requête
-- ---------------------------------------------------------------------------

drop policy if exists "Le joueur et l'organisateur lisent la liste" on public.army_lists;
create policy "Le joueur et l'organisateur lisent la liste"
  on public.army_lists for select
  to authenticated
  using (
    exists (
      select 1
      from public.registrations r
      join public.tournaments t on t.id = r.tournament_id
      where r.id = army_lists.registration_id
        and (r.player_id = (select auth.uid()) or t.organizer_id = (select auth.uid()))
    )
  );

drop policy if exists "Chacun lit ses jetons" on public.push_tokens;
create policy "Chacun lit ses jetons"
  on public.push_tokens for select
  to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists "Chacun enregistre ses jetons" on public.push_tokens;
create policy "Chacun enregistre ses jetons"
  on public.push_tokens for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists "Chacun met à jour ses jetons" on public.push_tokens;
create policy "Chacun met à jour ses jetons"
  on public.push_tokens for update
  to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists "Chacun supprime ses jetons" on public.push_tokens;
create policy "Chacun supprime ses jetons"
  on public.push_tokens for delete
  to authenticated
  using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Index couvrant chaque clé étrangère qui n'en avait pas
-- ---------------------------------------------------------------------------

create index if not exists admin_actions_admin_idx on public.admin_actions (admin_id);
create index if not exists captain_picks_acted_by_idx on public.captain_picks (acted_by);
create index if not exists captain_picks_actor_team_idx on public.captain_picks (actor_team_id);
create index if not exists circuits_owner_idx on public.circuits (owner_id);
create index if not exists message_reports_reporter_idx on public.message_reports (reporter_id);
create index if not exists messages_author_idx on public.messages (author_id);
create index if not exists messages_deleted_by_idx on public.messages (deleted_by);
create index if not exists registrations_faction_idx on public.registrations (faction);
create index if not exists team_pairings_first_picker_idx on public.team_pairings (first_picker);
create index if not exists team_registrations_captain_idx on public.team_registrations (captain_id);
create index if not exists teams_captain_idx on public.teams (captain_id);
