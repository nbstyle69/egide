-- Migration 0056 : la supervision compte les équipes en tournoi par équipes
--
-- CE QU'ON RÉPARE. `admin_tournaments` (0030) compte les lignes de
-- `registrations`, donc des joueurs, et l'écran les compare à `capacity` —
-- qui, depuis la 0041, se compte **en équipes** pour un tournoi par équipes.
-- Résultat, constaté le 14 septembre 2026 : « 12 / 8 · Complet » pour quatre
-- équipes de trois sur huit places. Le même défaut vivait côté client dans
-- « Mes tournois » (back office) et dans l'annuaire mobile ; il y est corrigé
-- dans le même commit, en comptant `team_registrations` quand le tournoi est
-- par équipes.
--
-- CE QU'ON FAIT. `registered_count` garde son nom et son sens d'écran — « places
-- occupées, dans l'unité du tournoi » — mais se calcule selon le type. Deux
-- jointures externes distinctes plutôt qu'une : compter des `distinct` sur un
-- produit croisé joueurs × équipes serait juste mais opaque, et le plan de
-- requête n'a pas besoin d'être malin sur quelques centaines de tournois.
--
-- Même signature, même type de retour : `create or replace` suffit.

create or replace function public.admin_tournaments(p_limit int default 300)
returns table (
  id uuid,
  name text,
  city text,
  region text,
  event_date date,
  status text,
  type text,
  capacity integer,
  points_limit integer,
  rounds_count integer,
  created_at timestamptz,
  organizer_id uuid,
  organizer_pseudo text,
  registered_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  with players as (
    select tournament_id, count(*) as n
    from public.registrations
    where status in ('registered', 'checked_in')
    group by tournament_id
  ),
  teams as (
    select tournament_id, count(*) as n
    from public.team_registrations
    where status in ('registered', 'checked_in')
    group by tournament_id
  )
  select
    t.id, t.name, t.city, t.region, t.event_date, t.status, t.type,
    t.capacity, t.points_limit, t.rounds_count, t.created_at,
    t.organizer_id, p.pseudo,
    coalesce(case when t.type = 'team' then tm.n else pl.n end, 0) as registered_count
  from public.tournaments t
  -- `left join` sur le profil : un organisateur dont le compte a disparu ne
  -- doit pas faire disparaître son tournoi de la supervision.
  left join public.profiles p on p.id = t.organizer_id
  left join players pl on pl.tournament_id = t.id
  left join teams tm on tm.tournament_id = t.id
  where public.is_admin()
  order by t.event_date desc
  limit greatest(p_limit, 1);
$$;

revoke execute on function public.admin_tournaments(int) from public, anon;
grant execute on function public.admin_tournaments(int) to authenticated;
