import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Regions } from '../lib/regions';
import { supabase } from '../lib/supabase';

const PointsPresets = [1000, 1500, 2000] as const;

/** Capacités de départ plausibles : 32 joueurs, ou 12 équipes. */
const DefaultCapacity = { individual: 32, team: 12 } as const;

type Props = {
  userId: string;
};

/**
 * Création d'un tournoi depuis le back office.
 *
 * Jusqu'ici la création n'existait que dans l'app mobile : un organisateur
 * installé devant son écran devait sortir son téléphone pour ouvrir un
 * tournoi, puis revenir ici pour tout le reste. Le back office est pourtant
 * l'endroit où il prépare sa saison — c'est le seul écran de gestion qui
 * manquait.
 *
 * Deux points où cet écran ne copie pas le mobile :
 *
 * — **la région est une liste fermée ici aussi**. Le formulaire d'édition la
 *   laissait en texte libre, ce qui rouvrait en silence ce que le mobile avait
 *   fermé : « Rhone alpes » et « Auvergne-Rhône-Alpes » ne se rencontrent
 *   jamais dans un filtre d'annuaire.
 *
 * — **le brouillon est offert**. Le mobile publie immédiatement ; ici on
 *   prépare souvent la saison à l'avance. Or l'ouverture des inscriptions
 *   déclenche l'alerte régionale (une seule fois par tournoi, migration 0022) :
 *   un tournoi créé en brouillon peut être relu et corrigé avant que la
 *   communauté n'en soit avertie.
 */
export function CreerTournoiPage({ userId }: Props) {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<'individual' | 'team'>('individual');
  const [teamSize, setTeamSize] = useState(3);
  const [pointsChip, setPointsChip] = useState<number | 'other'>(2000);
  const [customPoints, setCustomPoints] = useState('');
  const [rounds, setRounds] = useState(5);
  const [capacity, setCapacity] = useState<number>(DefaultCapacity.individual);
  const [openNow, setOpenNow] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState(false);
  const [busy, setBusy] = useState(false);

  const isTeam = type === 'team';

  function fieldError(key: string) {
    return errors[key] ? <div className="field-error">{errors[key]}</div> : null;
  }

  /** Change de type : la capacité change d'unité en même temps. */
  function changeType(next: 'individual' | 'team') {
    setType(next);
    // 32 équipes de 3 font 96 joueurs : garder la valeur produirait un tournoi
    // prévu pour dix fois trop de monde.
    setCapacity(DefaultCapacity[next]);
    setErrors((current) => ({ ...current, capacity: '' }));
  }

  function validate(): { points: number } | null {
    const next: Record<string, string> = {};

    if (name.trim().length < 3) next.name = 'Le nom est obligatoire (3 caractères min.).';
    if (city.trim() === '') next.city = 'Indiquez la ville du tournoi.';
    if (region === '') next.region = 'Choisissez la région du tournoi.';

    const today = new Date().toISOString().slice(0, 10);
    if (!date) {
      next.date = 'Indiquez la date du tournoi.';
    } else if (date < today) {
      next.date = 'La date doit être dans le futur.';
    }

    const points = pointsChip === 'other' ? parseInt(customPoints, 10) : pointsChip;
    if (!points || points <= 0) next.points = 'Indiquez un nombre de points valide.';

    if (rounds < 1 || rounds > 8) next.rounds = 'Le nombre de rondes doit être entre 1 et 8.';

    if (isTeam) {
      if (capacity < 2 || capacity > 64) {
        next.capacity = 'Le nombre d’équipes doit être entre 2 et 64.';
      }
      if (teamSize < 2 || teamSize > 8) {
        next.teamSize = 'Une équipe compte entre 2 et 8 joueurs.';
      }
    } else if (capacity < 4 || capacity > 200 || capacity % 2 !== 0) {
      next.capacity = 'La capacité doit être un nombre pair entre 4 et 200.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0 || !points) return null;
    return { points };
  }

  async function handleSubmit() {
    if (!supabase) return;
    const validated = validate();
    if (!validated) return;

    setBusy(true);
    setServerError(false);
    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        organizer_id: userId,
        name: name.trim(),
        city: city.trim(),
        region,
        event_date: date,
        points_limit: validated.points,
        rounds_count: rounds,
        capacity,
        type,
        // La base refuse un tournoi par équipes sans taille, et une taille sur
        // un tournoi individuel (contrainte croisée de la 0041).
        team_size: isTeam ? teamSize : null,
        status: openNow ? 'open' : 'draft',
      })
      .select('id')
      .single();
    setBusy(false);

    if (error || !data) {
      setServerError(true);
      return;
    }
    // On atterrit sur la fiche du tournoi créé : c'est de là que part tout le
    // reste (inscrits, check-in, rondes).
    navigate(`/tournois/${data.id}`);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Créer un tournoi</h1>
          <div className="page-subtitle">
            Vous en serez l’organisateur. Tout reste modifiable tant que le tournoi n’a pas
            démarré.
          </div>
        </div>
      </div>

      <div className="form-column">
        <div className="group-title">Informations</div>

        <div className="field">
          <label htmlFor="name">Nom du tournoi</label>
          <input
            id="name"
            className={`input${errors.name ? ' input-error' : ''}`}
            placeholder="Trophée de Lyon"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
          {fieldError('name')}
        </div>

        <div className="field">
          <label htmlFor="city">Ville</label>
          <input
            id="city"
            className={`input${errors.city ? ' input-error' : ''}`}
            placeholder="Lyon"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            disabled={busy}
          />
          {fieldError('city')}
        </div>

        <div className="field">
          <label htmlFor="region">Région</label>
          <select
            id="region"
            className={`input${errors.region ? ' input-error' : ''}`}
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            disabled={busy}>
            <option value="">Choisir une région…</option>
            {Regions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          {fieldError('region') ?? (
            <div className="field-hint">
              Elle sert aux filtres de l’annuaire et à l’alerte « tournoi près de chez moi ».
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="date">Date</label>
          <input
            id="date"
            type="date"
            className={`input${errors.date ? ' input-error' : ''}`}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={busy}
          />
          {fieldError('date')}
        </div>

        <div className="group-title">Format</div>

        <div className="field">
          <label>Type de tournoi</label>
          <div className="segmented">
            <button
              type="button"
              className={isTeam ? '' : 'active'}
              onClick={() => changeType('individual')}
              disabled={busy}>
              Individuel
            </button>
            <button
              type="button"
              className={isTeam ? 'active' : ''}
              onClick={() => changeType('team')}
              disabled={busy}>
              Par équipes
            </button>
          </div>
          <div className="field-hint">
            Le type ne se change plus après la création : il décide de la mécanique des
            appariements.
          </div>
        </div>

        {isTeam ? (
          <div className="field">
            <label>Joueurs par équipe</label>
            <div className="stepper">
              <button
                type="button"
                onClick={() => setTeamSize((v) => Math.max(2, v - 1))}
                disabled={busy}>
                −
              </button>
              <input
                className="input"
                value={teamSize}
                onChange={(event) => setTeamSize(parseInt(event.target.value, 10) || 2)}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setTeamSize((v) => Math.min(8, v + 1))}
                disabled={busy}>
                +
              </button>
            </div>
            {fieldError('teamSize') ?? (
              <div className="field-hint">
                3 joueurs : format français. 5 à 8 : format ETC. Toutes les équipes alignent le
                même nombre de joueurs.
              </div>
            )}
          </div>
        ) : null}

        <div className="field">
          <label>Points de liste</label>
          <div className="chips">
            {PointsPresets.map((points) => (
              <button
                key={points}
                type="button"
                className={pointsChip === points ? 'active' : ''}
                onClick={() => setPointsChip(points)}
                disabled={busy}>
                {points}
              </button>
            ))}
            <button
              type="button"
              className={pointsChip === 'other' ? 'active' : ''}
              onClick={() => setPointsChip('other')}
              disabled={busy}>
              Autre
            </button>
          </div>
          {pointsChip === 'other' ? (
            <input
              className={`input${errors.points ? ' input-error' : ''}`}
              type="number"
              placeholder="Points de liste (ex. 1250)"
              value={customPoints}
              onChange={(event) => setCustomPoints(event.target.value)}
              disabled={busy}
              style={{ marginTop: 8, maxWidth: 240 }}
            />
          ) : null}
          {fieldError('points')}
        </div>

        <div className="field">
          <label>Nombre de rondes</label>
          <div className="stepper">
            <button
              type="button"
              onClick={() => setRounds((v) => Math.max(1, v - 1))}
              disabled={busy}>
              −
            </button>
            <input
              className="input"
              value={rounds}
              onChange={(event) => setRounds(parseInt(event.target.value, 10) || 1)}
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setRounds((v) => Math.min(8, v + 1))}
              disabled={busy}>
              +
            </button>
          </div>
          {fieldError('rounds')}
        </div>

        <div className="group-title">Capacité</div>

        <div className="field">
          <label>{isTeam ? 'Nombre d’équipes maximum' : 'Nombre de joueurs maximum'}</label>
          <div className="stepper">
            <button
              type="button"
              onClick={() =>
                setCapacity((v) => (isTeam ? Math.max(2, v - 1) : Math.max(4, v - 2)))
              }
              disabled={busy}>
              −
            </button>
            <input
              className="input"
              value={capacity}
              onChange={(event) =>
                setCapacity(parseInt(event.target.value, 10) || (isTeam ? 2 : 4))
              }
              disabled={busy}
            />
            <button
              type="button"
              onClick={() =>
                setCapacity((v) => (isTeam ? Math.min(64, v + 1) : Math.min(200, v + 2)))
              }
              disabled={busy}>
              +
            </button>
          </div>
          {fieldError('capacity') ??
            (isTeam ? (
              <div className="field-hint">
                Soit {capacity * teamSize} joueurs attendus. Un nombre pair d’équipes évite les
                rondes avec exempt (bye).
              </div>
            ) : (
              <div className="field-hint">Un nombre pair évite les rondes avec exempt (bye).</div>
            ))}
        </div>

        <div className="group-title">Publication</div>

        <div className="field">
          <label>À la création</label>
          <div className="segmented">
            <button
              type="button"
              className={openNow ? 'active' : ''}
              onClick={() => setOpenNow(true)}
              disabled={busy}>
              Ouvrir les inscriptions
            </button>
            <button
              type="button"
              className={openNow ? '' : 'active'}
              onClick={() => setOpenNow(false)}
              disabled={busy}>
              Garder en brouillon
            </button>
          </div>
          <div className="field-hint">
            {openNow
              ? 'Le tournoi apparaît immédiatement dans l’annuaire, et les joueurs de la région reçoivent l’alerte.'
              : 'Le tournoi n’est visible que de vous. L’alerte régionale partira le jour où vous ouvrirez les inscriptions.'}
          </div>
        </div>

        {serverError ? (
          <div className="banner banner-danger">
            Impossible de créer le tournoi. Vérifiez votre connexion et réessayez.
          </div>
        ) : null}

        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/tournois')}
            disabled={busy}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Création…' : 'Créer le tournoi'}
          </button>
        </div>
      </div>
    </>
  );
}
