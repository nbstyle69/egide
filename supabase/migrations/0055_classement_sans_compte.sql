-- Migration 0055 : le classement individuel se lit sans compte
--
-- CE QU'ON RÉPARE. `tournament_standings` s'exécute avec les droits de
-- l'appelant, et lit `registrations.faction` depuis la 0039. Or la 0038 a
-- retiré cette colonne à `anon` — à raison. Depuis le 27 août, un visiteur
-- sans compte qui ouvre le classement d'un tournoi individuel reçoit donc un
-- refus (« Impossible de charger le classement »), constaté le 14 septembre
-- 2026 au premier parcours navigateur. Le classement par équipes, lui,
-- fonctionne : `team_standings` est en `security definer` depuis sa création.
--
-- CE QUI ÉTAIT DÉJÀ VRAI, ET QU'ON GARDE. Deux règles de visibilité coexistent
-- et ne se contredisent pas :
--   - les classements sont publics (décision « mode invité », RESUME §5.3) ;
--   - les pseudos et la faction déclarée sont réservés aux membres connectés
--     (politique de `profiles` depuis la 0001, règle 1 de la 0038).
-- Avant la 0039, l'invité obtenait une liste vide — la jointure interne sur
-- `profiles`, filtrée par RLS, ne laissait rien passer — et l'écran lui
-- racontait que « le classement apparaîtra après les premiers résultats ».
-- Ce n'était pas une erreur, mais c'était faux.
--
-- CE QU'ON FAIT. La fonction passe en `security definer`, comme
-- `team_standings`, et applique elle-même la règle : rang, bilan et points
-- pour tout le monde ; pseudo et faction à `null` quand personne n'est
-- connecté. C'est la fiche de l'événement qui montre le chemin — elle affiche
-- déjà « Les pseudos des inscrits sont visibles par les membres connectés »
-- à la place de la liste. La règle vit dans la fonction, pas dans l'écran :
-- un client qui oublierait de masquer n'aurait rien à masquer.
--
-- Même signature, même type de retour : `create or replace` suffit, et
-- `player_history` (0039), qui s'appuie dessus en `cross join lateral`,
-- n'a rien à changer — appelée par un connecté, elle reçoit les pseudos.

create or replace function public.tournament_standings(p_tournament_id uuid)
returns table (
  rank integer,
  player_id uuid,
  pseudo text,
  faction text,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  points_for integer,
  points_against integer,
  point_diff integer,
  tactics integer,
  win_score numeric,
  opponents_wins numeric,
  dropped boolean,
  dropped_round integer
)
language sql
security definer
stable
set search_path = public
as $$
  with results as (
    select * from public.player_results where tournament_id = p_tournament_id
  ),
  totals as (
    select r.player_id,
           count(*)::int as played,
           (count(*) filter (where r.points_for > r.points_against)
            + count(*) filter (where r.points_for = r.points_against) * 0.5) as win_score,
           count(*) filter (where r.points_for > r.points_against)::int as wins,
           count(*) filter (where r.points_for = r.points_against)::int as draws,
           count(*) filter (where r.points_for < r.points_against)::int as losses,
           coalesce(sum(r.points_for), 0)::int as points_for,
           coalesce(sum(r.points_against), 0)::int as points_against,
           coalesce(sum(r.tactics), 0)::int as tactics
    from results r
    group by r.player_id
  ),
  wins_by_player as (
    select player_id,
           (count(*) filter (where points_for > points_against)
            + count(*) filter (where points_for = points_against) * 0.5) as wins
    from results group by player_id
  ),
  sos as (
    select r.player_id, coalesce(sum(w.wins), 0) as opponents_wins
    from results r
    left join wins_by_player w on w.player_id = r.opponent_id
    where r.opponent_id is not null
    group by r.player_id
  ),
  -- Un seul point de décision pour les deux colonnes réservées.
  viewer as (
    select auth.uid() is not null as connected
  )
  select row_number() over (
           order by t.win_score desc,
                    t.points_for desc,
                    t.tactics desc,
                    (t.points_for - t.points_against) desc,
                    coalesce(s.opponents_wins, 0) desc,
                    md5(t.player_id::text || p_tournament_id::text)
         )::int as rank,
         t.player_id,
         case when v.connected then pr.pseudo end as pseudo,
         case when v.connected then reg.faction end as faction,
         t.played,
         t.wins,
         t.draws,
         t.losses,
         t.points_for,
         t.points_against,
         (t.points_for - t.points_against)::int as point_diff,
         t.tactics,
         t.win_score,
         coalesce(s.opponents_wins, 0) as opponents_wins,
         coalesce(reg.status = 'dropped', false) as dropped,
         reg.dropped_round
  from totals t
  cross join viewer v
  join public.profiles pr on pr.id = t.player_id
  left join sos s on s.player_id = t.player_id
  left join public.registrations reg
    on reg.player_id = t.player_id and reg.tournament_id = p_tournament_id
  order by rank;
$$;

revoke execute on function public.tournament_standings(uuid) from public;
grant execute on function public.tournament_standings(uuid) to authenticated, anon;
