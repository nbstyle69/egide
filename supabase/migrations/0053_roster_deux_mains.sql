-- Migration 0053 : le roster de tournoi se remplit à deux mains (US-7.11)
--
-- CE QU'ON RÉPARE. `register_team` exigeait **exactement** `team_size` joueurs,
-- désignés par le seul capitaine, en une fois. Un joueur se retrouvait donc
-- engagé dans un tournoi sans l'avoir demandé — la 0043 l'admettait noir sur
-- blanc et se contentait de lui ouvrir une porte de sortie. On réparait après
-- coup ce qu'on pouvait ne pas casser.
--
-- CE QU'ON FAIT À LA PLACE. L'équipe s'engage d'abord ; son roster **pour ce
-- tournoi** se remplit ensuite par deux chemins qui mènent au même endroit :
-- le capitaine invite un de ses membres, ou le membre prend lui-même une place
-- libre. On propose, la personne accepte.
--
-- DEUX ARBITRAGES DU PORTEUR (2026-09-04) :
--
-- 1. **La place se prend à l'engagement**, roster encore incomplet. Une équipe
--    qui recrute ne doit pas perdre sa place pendant qu'elle recrute. La
--    contrepartie — des places bloquées par des équipes qui ne se complètent
--    jamais — est déjà tenue ailleurs : le pointage du jour J est la date
--    limite, et `seed_team_tables` (0045) sait déjà produire un forfait 15-5
--    sur la place vide. Rien à inventer pour ça.
-- 2. **Le volontaire compte tout de suite, et le capitaine peut le retirer**
--    tant que le tournoi n'a pas démarré. Ni validation préalable — un
--    capitaine injoignable bloquerait son équipe — ni premier arrivé premier
--    servi, qui retirerait au capitaine l'alignement dont dépend tout le
--    protocole d'appariement de la 0046.
--
-- L'INVITATION N'EST PAS UN OBJET. Elle ne crée ni table, ni état, ni date
-- d'expiration : c'est une notification, rien de plus. Le membre invité va
-- prendre la place lui-même, exactement comme s'il l'avait vue seul. Une table
-- `roster_invitations` aurait apporté un cycle de vie complet (acceptée,
-- refusée, périmée, révoquée) pour un service que le bouton rend déjà — et
-- deux chemins d'entrée au lieu d'un, qui auraient fini par diverger.
--
-- LA COURSE À LA DERNIÈRE PLACE, ENCORE. Deux membres qui prennent la même
-- place au même instant doivent être départagés par la base et non par la
-- chance : `join_team_roster` verrouille l'inscription de l'équipe, même
-- remède que la course à la dernière place de la 0004.
--
-- L'ORDRE DU ROSTER, question laissée ouverte par l'US-7.11 : il sert de
-- position de départ à `seed_team_tables`. **Défaut retenu ici : la place
-- libre la plus basse d'abord**, donc l'ordre d'arrivée. Le capitaine garde la
-- main puisqu'il peut retirer puis recomposer (`update_team_roster`). Si le
-- porteur veut un réordonnancement explicite, il vivra dans une migration
-- suivante et ne touchera pas à ces fonctions.

-- ---------------------------------------------------------------------------
-- 1. Les deux fonctions du capitaine acceptent un roster partiel
-- ---------------------------------------------------------------------------

create or replace function public.register_team(
  p_tournament_id uuid,
  p_player_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team uuid;
  v_type text;
  v_status text;
  v_team_size integer;
  v_capacity integer;
  v_new_status text;
  v_registration uuid;
  v_conflict text;
  v_missing text;
  v_count integer;
begin
  -- Un tableau nul et un tableau vide disent la même chose ici : « je n'aligne
  -- encore personne ». On normalise à l'entrée plutôt que de semer des
  -- coalesce dans chaque requête — et surtout parce que `<> all (null)` ne
  -- retire personne, ce qui laisserait un roster figé sans rien signaler.
  p_player_ids := coalesce(p_player_ids, array[]::uuid[]);

  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  -- Le capitaine, et lui seul. Un joueur n'a qu'une équipe (0015), il n'y a
  -- donc rien à choisir : on retrouve l'équipe par son capitanat.
  select id into v_team from public.teams where captain_id = v_caller;
  if v_team is null then
    raise exception 'NOT_CAPTAIN';
  end if;

  -- Verrou sur le tournoi : deux capitaines qui inscrivent en même temps sur
  -- la dernière place doivent être départagés par la base, pas par la chance.
  -- Même remède que la course à la dernière place de la 0004.
  select type, status, team_size, capacity
    into v_type, v_status, v_team_size, v_capacity
  from public.tournaments where id = p_tournament_id for update;

  if v_type is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_type <> 'team' then
    raise exception 'NOT_A_TEAM_TOURNAMENT';
  end if;
  if v_status <> 'open' then
    raise exception 'REGISTRATIONS_CLOSED';
  end if;

  -- Le roster peut désormais être PARTIEL (0053) : l'équipe s'engage, puis se
  -- complète. Seul le dépassement reste une faute — il n'y a que team_size
  -- places, et la table de trop n'existerait nulle part.
  if array_length(p_player_ids, 1) > v_team_size then
    raise exception 'ROSTER_SIZE:%', v_team_size;
  end if;
  -- Deux fois le même joueur ferait un roster de N lignes pour N-1 personnes.
  select count(distinct pid) into v_count from unnest(p_player_ids) pid;
  if v_count <> coalesce(array_length(p_player_ids, 1), 0) then
    raise exception 'ROSTER_DUPLICATE';
  end if;

  -- Tous les joueurs doivent appartenir à l'équipe. On nomme le fautif : « un
  -- joueur n'est pas dans ton équipe » enverrait chercher lequel à la main.
  select p.pseudo into v_missing
  from unnest(p_player_ids) pid
  join public.profiles p on p.id = pid
  where not exists (
    select 1 from public.team_members m
    where m.team_id = v_team and m.player_id = pid
  )
  limit 1;
  if v_missing is not null then
    raise exception 'NOT_A_MEMBER:%', v_missing;
  end if;

  -- Déjà inscrit à ce tournoi — seul, ou avec une autre équipe. Le capitaine
  -- ne peut pas désinscrire quelqu'un d'autre : le message dit qui doit agir.
  select p.pseudo into v_conflict
  from unnest(p_player_ids) pid
  join public.registrations r
    on r.tournament_id = p_tournament_id and r.player_id = pid
  join public.profiles p on p.id = pid
  where r.status <> 'withdrawn'
  limit 1;
  if v_conflict is not null then
    raise exception 'PLAYER_ALREADY_REGISTERED:%', v_conflict;
  end if;

  if exists (
    select 1 from public.team_registrations
    where tournament_id = p_tournament_id and team_id = v_team and status <> 'withdrawn'
  ) then
    raise exception 'TEAM_ALREADY_REGISTERED';
  end if;

  -- Complet : l'équipe attend, en entier.
  v_new_status := case
    when public.team_slots_taken(p_tournament_id) >= v_capacity then 'waitlisted'
    else 'registered'
  end;

  insert into public.team_registrations (tournament_id, team_id, captain_id, status)
  values (p_tournament_id, v_team, v_caller, v_new_status)
  on conflict (tournament_id, team_id) do update
    set status = excluded.status,
        captain_id = excluded.captain_id,
        promoted_at = null,
        updated_at = now()
  returning id into v_registration;

  -- Une ligne joueur par membre du roster, dans la même transaction. Une
  -- inscription retirée est réactivée plutôt que dupliquée : l'unicité
  -- (tournament_id, player_id) de la 0003 l'exige, et l'historique y gagne.
  insert into public.registrations (
    tournament_id, player_id, status, team_registration_id, roster_position
  )
  select p_tournament_id, pid, v_new_status, v_registration, pos::int
  from unnest(p_player_ids) with ordinality as t(pid, pos)
  on conflict (tournament_id, player_id) do update
    set status = excluded.status,
        team_registration_id = excluded.team_registration_id,
        roster_position = excluded.roster_position,
        updated_at = now();

  return v_registration;
end;
$$;

revoke execute on function public.register_team(uuid, uuid[]) from public, anon;
grant execute on function public.register_team(uuid, uuid[]) to authenticated;

create or replace function public.update_team_roster(
  p_tournament_id uuid,
  p_player_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team uuid;
  v_registration uuid;
  v_team_status text;
  v_tournament_status text;
  v_team_size integer;
  v_missing text;
  v_conflict text;
  v_count integer;
begin
  -- Un tableau nul et un tableau vide disent la même chose ici : « je n'aligne
  -- encore personne ». On normalise à l'entrée plutôt que de semer des
  -- coalesce dans chaque requête — et surtout parce que `<> all (null)` ne
  -- retire personne, ce qui laisserait un roster figé sans rien signaler.
  p_player_ids := coalesce(p_player_ids, array[]::uuid[]);

  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select id into v_team from public.teams where captain_id = v_caller;
  if v_team is null then
    raise exception 'NOT_CAPTAIN';
  end if;

  select t.status, t.team_size into v_tournament_status, v_team_size
  from public.tournaments t where t.id = p_tournament_id;
  if v_tournament_status <> 'open' then
    raise exception 'REGISTRATIONS_CLOSED';
  end if;

  select id, status into v_registration, v_team_status
  from public.team_registrations
  where tournament_id = p_tournament_id and team_id = v_team and status <> 'withdrawn';
  if v_registration is null then
    raise exception 'NOT_REGISTERED';
  end if;

  -- Le roster peut désormais être PARTIEL (0053) : l'équipe s'engage, puis se
  -- complète. Seul le dépassement reste une faute — il n'y a que team_size
  -- places, et la table de trop n'existerait nulle part.
  if array_length(p_player_ids, 1) > v_team_size then
    raise exception 'ROSTER_SIZE:%', v_team_size;
  end if;
  select count(distinct pid) into v_count from unnest(p_player_ids) pid;
  if v_count <> coalesce(array_length(p_player_ids, 1), 0) then
    raise exception 'ROSTER_DUPLICATE';
  end if;

  select p.pseudo into v_missing
  from unnest(p_player_ids) pid
  join public.profiles p on p.id = pid
  where not exists (
    select 1 from public.team_members m
    where m.team_id = v_team and m.player_id = pid
  )
  limit 1;
  if v_missing is not null then
    raise exception 'NOT_A_MEMBER:%', v_missing;
  end if;

  -- Un entrant déjà inscrit ailleurs sur ce tournoi bloque, comme à
  -- l'inscription. Les sortants du roster, eux, ne sont pas concernés.
  select p.pseudo into v_conflict
  from unnest(p_player_ids) pid
  join public.registrations r
    on r.tournament_id = p_tournament_id and r.player_id = pid
  join public.profiles p on p.id = pid
  where r.status <> 'withdrawn'
    and (r.team_registration_id is distinct from v_registration)
  limit 1;
  if v_conflict is not null then
    raise exception 'PLAYER_ALREADY_REGISTERED:%', v_conflict;
  end if;

  -- Les sortants quittent le tournoi ; ils gardent leur ligne, retirée.
  update public.registrations
     set status = 'withdrawn',
         team_registration_id = null,
         roster_position = null,
         updated_at = now()
   where team_registration_id = v_registration
     and player_id <> all (p_player_ids);

  insert into public.registrations (
    tournament_id, player_id, status, team_registration_id, roster_position
  )
  select p_tournament_id, pid, v_team_status, v_registration, pos::int
  from unnest(p_player_ids) with ordinality as t(pid, pos)
  on conflict (tournament_id, player_id) do update
    set status = excluded.status,
        team_registration_id = excluded.team_registration_id,
        roster_position = excluded.roster_position,
        updated_at = now();
end;
$$;

revoke execute on function public.update_team_roster(uuid, uuid[]) from public, anon;
grant execute on function public.update_team_roster(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Le membre prend lui-même une place libre
-- ---------------------------------------------------------------------------

/**
 * Le geste du volontaire : « je joue ce tournoi avec mon équipe ».
 *
 * Il n'y a rien à accepter et personne à attendre — c'est le sens même de
 * l'arbitrage 2. La place est prise dès le clic, et le capitaine peut défaire.
 */
create or replace function public.join_team_roster(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team uuid;
  v_registration uuid;
  v_team_status text;
  v_tournament_status text;
  v_team_size integer;
  v_position integer;
  v_existing text;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  -- Son équipe, quelle que soit sa place dedans : ici le capitanat ne donne
  -- aucun droit de plus, c'est tout l'objet de l'US-7.11.
  select m.team_id into v_team
  from public.team_members m where m.player_id = v_caller;
  if v_team is null then
    raise exception 'NO_TEAM';
  end if;

  select t.status, t.team_size into v_tournament_status, v_team_size
  from public.tournaments t where t.id = p_tournament_id;
  if v_tournament_status is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_tournament_status <> 'open' then
    raise exception 'REGISTRATIONS_CLOSED';
  end if;

  -- Verrou sur l'inscription de l'équipe : deux membres qui prennent la
  -- dernière place au même instant doivent être départagés par la base.
  select id, status into v_registration, v_team_status
  from public.team_registrations
  where tournament_id = p_tournament_id and team_id = v_team and status <> 'withdrawn'
  for update;

  if v_registration is null then
    raise exception 'TEAM_NOT_REGISTERED';
  end if;

  -- Déjà inscrit à ce tournoi : soit il est dans ce roster, soit ailleurs.
  -- Les deux méritent une phrase différente à l'écran.
  select case when r.team_registration_id = v_registration then 'ROSTER' else 'OTHER' end
    into v_existing
  from public.registrations r
  where r.tournament_id = p_tournament_id
    and r.player_id = v_caller
    and r.status <> 'withdrawn';

  if v_existing = 'ROSTER' then
    raise exception 'ALREADY_IN_ROSTER';
  elsif v_existing = 'OTHER' then
    raise exception 'ALREADY_REGISTERED_ELSEWHERE';
  end if;

  -- La place libre la plus basse. Elle sert de position de départ aux tables
  -- (0045) : laisser un trou ferait un forfait là où quelqu'un joue.
  select p into v_position
  from generate_series(1, v_team_size) as p
  where not exists (
    select 1 from public.registrations r
    where r.team_registration_id = v_registration
      and r.roster_position = p
      and r.status <> 'withdrawn'
  )
  order by p
  limit 1;

  if v_position is null then
    raise exception 'ROSTER_FULL';
  end if;

  -- Le joueur suit le sort de son équipe : inscrite ou en attente, jamais
  -- l'un pendant que l'autre est l'autre.
  insert into public.registrations (
    tournament_id, player_id, status, team_registration_id, roster_position
  )
  values (p_tournament_id, v_caller, v_team_status, v_registration, v_position)
  on conflict (tournament_id, player_id) do update
    set status = excluded.status,
        team_registration_id = excluded.team_registration_id,
        roster_position = excluded.roster_position,
        updated_at = now();
end;
$$;

revoke execute on function public.join_team_roster(uuid) from public, anon;
grant execute on function public.join_team_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le capitaine retire un joueur du roster
-- ---------------------------------------------------------------------------

/**
 * Retrait à l'unité, là où `update_team_roster` demandait le roster entier.
 *
 * C'est le contrepoids de l'arbitrage 2 : le volontaire compte tout de suite
 * **parce que** le capitaine peut défaire. Sans ce geste, se porter volontaire
 * reviendrait à s'imposer.
 */
create or replace function public.remove_from_roster(
  p_tournament_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team uuid;
  v_registration uuid;
  v_tournament_status text;
  v_pseudo text;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select id into v_team from public.teams where captain_id = v_caller;
  if v_team is null then
    raise exception 'NOT_CAPTAIN';
  end if;

  select status into v_tournament_status
  from public.tournaments where id = p_tournament_id;
  -- Après le lancement les parties existent : c'est l'abandon (`drop_player`,
  -- 0013) qui s'applique, et il appartient à l'organisateur.
  if v_tournament_status is distinct from 'open' then
    raise exception 'REGISTRATIONS_CLOSED';
  end if;

  select id into v_registration
  from public.team_registrations
  where tournament_id = p_tournament_id and team_id = v_team and status <> 'withdrawn';
  if v_registration is null then
    raise exception 'TEAM_NOT_REGISTERED';
  end if;

  select p.pseudo into v_pseudo
  from public.registrations r
  join public.profiles p on p.id = r.player_id
  where r.team_registration_id = v_registration
    and r.player_id = p_player_id
    and r.status <> 'withdrawn';
  if v_pseudo is null then
    raise exception 'NOT_IN_ROSTER';
  end if;

  -- Même sortie que celle du joueur qui part de lui-même (0043) : un seul
  -- chemin, sinon deux copies d'une même règle finissent par diverger.
  update public.registrations
     set status = 'withdrawn',
         team_registration_id = null,
         roster_position = null,
         updated_at = now()
   where tournament_id = p_tournament_id and player_id = p_player_id;
end;
$$;

revoke execute on function public.remove_from_roster(uuid, uuid) from public, anon;
grant execute on function public.remove_from_roster(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Le capitaine invite un membre
-- ---------------------------------------------------------------------------

-- L'invitation est une notification, pas un état : il faut donc lui ouvrir la
-- file. `push_outbox.kind` est une liste fermée — la rouvrir est le prix à
-- payer pour que rien d'inconnu n'y entre jamais.
alter table public.push_outbox drop constraint push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('round_published', 'promoted', 'list_reviewed', 'new_registration',
                  'tournament_published', 'tournament_reminder', 'tournament_cancelled',
                  'roster_invite'));

/**
 * « Viens jouer ce tournoi avec nous. » Rien de plus : le membre invité prend
 * la place lui-même, par le même chemin que s'il l'avait vue seul.
 *
 * La fonction refuse d'inviter là où il n'y a pas de place — une invitation
 * qui ne peut pas aboutir est pire que pas d'invitation du tout.
 */
create or replace function public.invite_to_roster(
  p_tournament_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team uuid;
  v_registration uuid;
  v_tournament_status text;
  v_team_size integer;
  v_taken integer;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select id into v_team from public.teams where captain_id = v_caller;
  if v_team is null then
    raise exception 'NOT_CAPTAIN';
  end if;

  select t.status, t.team_size into v_tournament_status, v_team_size
  from public.tournaments t where t.id = p_tournament_id;
  if v_tournament_status is distinct from 'open' then
    raise exception 'REGISTRATIONS_CLOSED';
  end if;

  select id into v_registration
  from public.team_registrations
  where tournament_id = p_tournament_id and team_id = v_team and status <> 'withdrawn';
  if v_registration is null then
    raise exception 'TEAM_NOT_REGISTERED';
  end if;

  if not exists (
    select 1 from public.team_members m
    where m.team_id = v_team and m.player_id = p_player_id
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.tournament_id = p_tournament_id
      and r.player_id = p_player_id
      and r.status <> 'withdrawn'
  ) then
    raise exception 'ALREADY_REGISTERED';
  end if;

  select count(*) into v_taken
  from public.registrations r
  where r.team_registration_id = v_registration and r.status <> 'withdrawn';

  if v_taken >= v_team_size then
    raise exception 'ROSTER_FULL';
  end if;

  -- Une invitation par joueur et par tournoi : relancer trois fois n'envoie
  -- pas trois notifications. Le capitaine s'en apercevrait à la salle, pas ici.
  insert into public.push_outbox (kind, payload)
  select 'roster_invite',
         jsonb_build_object('tournament_id', p_tournament_id,
                            'player_id', p_player_id,
                            'team_id', v_team)
  where not exists (
    select 1 from public.push_outbox
    where kind = 'roster_invite'
      and payload->>'tournament_id' = p_tournament_id::text
      and payload->>'player_id' = p_player_id::text
  );
end;
$$;

revoke execute on function public.invite_to_roster(uuid, uuid) from public, anon;
grant execute on function public.invite_to_roster(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Ce que les deux écrans ont besoin de savoir
-- ---------------------------------------------------------------------------

/**
 * L'état du roster de mon équipe pour ce tournoi, en un appel.
 *
 * Capitaine et membre lisent le **même** objet : ils ne voient pas deux vérités
 * différentes, seulement deux jeux de boutons. `can_join` est calculé par la
 * base plutôt que déduit à l'écran — c'est elle qui tranchera l'appel, autant
 * qu'elle le dise avant.
 *
 * Réservée aux membres de l'équipe : le roster porte les factions déclarées,
 * visibles des connectés mais jamais des visiteurs (décision 11 du projet).
 */
create or replace function public.my_tournament_roster(p_tournament_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team uuid;
  v_team_name text;
  v_is_captain boolean;
  v_registration uuid;
  v_team_status text;
  v_team_size integer;
  v_tournament_status text;
  v_taken integer;
  v_in_roster boolean;
  v_roster jsonb;
  v_bench jsonb;
begin
  if v_caller is null then
    return jsonb_build_object('has_team', false);
  end if;

  select m.team_id, t.name, (t.captain_id = v_caller)
    into v_team, v_team_name, v_is_captain
  from public.team_members m
  join public.teams t on t.id = m.team_id
  where m.player_id = v_caller;

  if v_team is null then
    return jsonb_build_object('has_team', false);
  end if;

  select t.status, t.team_size into v_tournament_status, v_team_size
  from public.tournaments t where t.id = p_tournament_id;

  select id, status into v_registration, v_team_status
  from public.team_registrations
  where tournament_id = p_tournament_id and team_id = v_team and status <> 'withdrawn';

  if v_registration is null then
    return jsonb_build_object(
      'has_team', true, 'team_id', v_team, 'team_name', v_team_name,
      'is_captain', v_is_captain, 'engaged', false, 'team_size', v_team_size
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', r.player_id,
           'pseudo', p.pseudo,
           'position', r.roster_position,
           'faction', r.faction,
           'is_me', r.player_id = v_caller
         ) order by r.roster_position), '[]'::jsonb),
         count(*),
         bool_or(r.player_id = v_caller)
    into v_roster, v_taken, v_in_roster
  from public.registrations r
  join public.profiles p on p.id = r.player_id
  where r.team_registration_id = v_registration and r.status <> 'withdrawn';

  -- Le banc : les membres de l'équipe qui ne sont pas alignés. C'est la liste
  -- où le capitaine choisit qui inviter ; sans elle il devrait deviner.
  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', p.id, 'pseudo', p.pseudo
         ) order by p.pseudo), '[]'::jsonb)
    into v_bench
  from public.team_members m
  join public.profiles p on p.id = m.player_id
  where m.team_id = v_team
    and not exists (
      select 1 from public.registrations r
      where r.tournament_id = p_tournament_id
        and r.player_id = m.player_id
        and r.status <> 'withdrawn'
    );

  return jsonb_build_object(
    'has_team', true,
    'team_id', v_team,
    'team_name', v_team_name,
    'is_captain', v_is_captain,
    'engaged', true,
    'team_registration_id', v_registration,
    'team_status', v_team_status,
    'team_size', v_team_size,
    'taken', coalesce(v_taken, 0),
    'free', greatest(v_team_size - coalesce(v_taken, 0), 0),
    'in_roster', coalesce(v_in_roster, false),
    'can_join', v_tournament_status = 'open'
                and not coalesce(v_in_roster, false)
                and coalesce(v_taken, 0) < v_team_size,
    'roster', v_roster,
    'bench', v_bench
  );
end;
$$;

revoke execute on function public.my_tournament_roster(uuid) from public, anon;
grant execute on function public.my_tournament_roster(uuid) to authenticated;
