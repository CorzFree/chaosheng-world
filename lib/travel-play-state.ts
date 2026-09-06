import { getPlace, PANORAMAS } from './travel.ts';
import { getSpot, getJourney } from './travel-play-data.ts';
import {
  distanceKm,
  guessScore,
  validCoordinates,
  type Coordinates,
} from './travel-play-math.ts';
export type Discovery = { id: string; at: string; assisted: boolean };
export type TravelNote = {
  id: string;
  placeId: string;
  text: string;
  at: string;
  yaw: number;
  pitch: number;
  fov: number;
};
export type GuessAnswer = {
  placeId: string;
  coords: Coordinates;
  distance: number;
  score: number;
};
export type GuessSession = { ids: string[]; answers: GuessAnswer[] };
export type ExpeditionMemory = {
  version: 1;
  discoveries: Discovery[];
  notes: TravelNote[];
  completedJourneys: string[];
  journey: { id: string; index: number } | null;
  quiz: GuessSession | null;
  bestScore: number;
  games: number;
};
export function emptyExpedition(): ExpeditionMemory {
  return {
    version: 1,
    discoveries: [],
    notes: [],
    completedJourneys: [],
    journey: null,
    quiz: null,
    bestScore: 0,
    games: 0,
  };
}
const validDate = (v: unknown): v is string =>
  typeof v === 'string' && v.length < 60 && Number.isFinite(Date.parse(v));
export function makeAnswer(placeId: string, coords: Coordinates): GuessAnswer {
  const place = getPlace(placeId);
  if (!place || place.mode !== 'panorama' || !validCoordinates(coords))
    throw new Error('Invalid guess.');
  const distance = distanceKm(place.coords, coords);
  return {
    placeId,
    coords: [...coords],
    distance,
    score: guessScore(distance),
  };
}
export function parseExpedition(text: string | null): ExpeditionMemory {
  const state = emptyExpedition();
  if (!text || text.length > 500000) return state;
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return state;
    const seen = new Set<string>();
    if (Array.isArray(raw.discoveries))
      for (const d of raw.discoveries.slice(0, 100)) {
        if (
          d &&
          typeof d.id === 'string' &&
          getSpot(d.id) &&
          validDate(d.at) &&
          typeof d.assisted === 'boolean' &&
          !seen.has(d.id)
        ) {
          state.discoveries.push({ id: d.id, at: d.at, assisted: d.assisted });
          seen.add(d.id);
        }
      }
    const notes = new Set<string>();
    if (Array.isArray(raw.notes))
      for (const n of raw.notes.slice(0, 100)) {
        if (
          n &&
          typeof n.id === 'string' &&
          /^[A-Za-z0-9_-]{1,80}$/.test(n.id) &&
          !notes.has(n.id) &&
          typeof n.placeId === 'string' &&
          getPlace(n.placeId) &&
          typeof n.text === 'string' &&
          n.text.trim() &&
          validDate(n.at) &&
          typeof n.yaw === 'number' &&
          Number.isFinite(n.yaw) &&
          typeof n.pitch === 'number' &&
          Number.isFinite(n.pitch)
        ) {
          state.notes.push({
            id: n.id,
            placeId: n.placeId,
            text: n.text.trim().slice(0, 2000),
            at: n.at,
            yaw: ((n.yaw % 360) + 360) % 360,
            pitch: Math.max(-80, Math.min(80, n.pitch)),
            fov:
              typeof n.fov === 'number' && Number.isFinite(n.fov)
                ? Math.max(35, Math.min(100, n.fov))
                : 76,
          });
          notes.add(n.id);
        }
      }
    if (Array.isArray(raw.completedJourneys))
      state.completedJourneys = [
        ...new Set<string>(
          raw.completedJourneys.filter(
            (id: unknown) => typeof id === 'string' && !!getJourney(id),
          ),
        ),
      ].filter((id) =>
        getJourney(id)!.stops.every((s) =>
          state.discoveries.some((d) => d.id === s.spotId),
        ),
      );
    if (raw.journey && typeof raw.journey.id === 'string') {
      const journey = getJourney(raw.journey.id),
        index = raw.journey.index;
      if (
        journey &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < journey.stops.length
      )
        state.journey = { id: journey.id, index };
    }
    if (
      raw.quiz &&
      Array.isArray(raw.quiz.ids) &&
      raw.quiz.ids.length === 5 &&
      new Set(raw.quiz.ids).size === 5 &&
      raw.quiz.ids.every(
        (id: unknown) =>
          typeof id === 'string' && PANORAMAS.some((p) => p.id === id),
      ) &&
      Array.isArray(raw.quiz.answers)
    ) {
      const quiz: GuessSession = { ids: [...raw.quiz.ids], answers: [] };
      for (const [i, a] of raw.quiz.answers.slice(0, 5).entries()) {
        if (!a || a.placeId !== quiz.ids[i] || !validCoordinates(a.coords))
          break;
        quiz.answers.push(makeAnswer(a.placeId, a.coords));
      }
      state.quiz = quiz;
    }
    if (
      Number.isInteger(raw.bestScore) &&
      raw.bestScore >= 0 &&
      raw.bestScore <= 25000
    )
      state.bestScore = raw.bestScore;
    if (Number.isInteger(raw.games) && raw.games >= 0)
      state.games = Math.min(100000, raw.games);
    return state;
  } catch {
    return state;
  }
}
export function recordDiscovery(
  state: ExpeditionMemory,
  id: string,
  assisted: boolean,
  at = new Date().toISOString(),
): ExpeditionMemory {
  if (!getSpot(id) || !validDate(at)) throw new Error('Unknown discovery.');
  const previous = state.discoveries.find((d) => d.id === id);
  if (previous && !previous.assisted) return state;
  return {
    ...state,
    discoveries: [
      ...state.discoveries.filter((d) => d.id !== id),
      { id, assisted, at },
    ],
  };
}
export function addGuess(
  state: ExpeditionMemory,
  coords: Coordinates,
): ExpeditionMemory {
  const quiz = state.quiz;
  if (!quiz || quiz.answers.length >= quiz.ids.length)
    throw new Error('No open guessing round.');
  const answers = [
    ...quiz.answers,
    makeAnswer(quiz.ids[quiz.answers.length], coords),
  ];
  const complete = answers.length === quiz.ids.length,
    total = answers.reduce((sum, a) => sum + a.score, 0);
  return {
    ...state,
    quiz: { ...quiz, answers },
    bestScore: complete ? Math.max(state.bestScore, total) : state.bestScore,
    games: state.games + (complete ? 1 : 0),
  };
}
export function saveTravelNote(
  state: ExpeditionMemory,
  note: TravelNote,
): ExpeditionMemory {
  if (
    !getPlace(note.placeId) ||
    !note.text.trim() ||
    note.text.length > 2000 ||
    !validDate(note.at)
  )
    throw new Error('Write a note of 1–2000 characters.');
  return {
    ...state,
    notes: [note, ...state.notes.filter((n) => n.id !== note.id)].slice(0, 100),
  };
}
