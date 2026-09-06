import { PANORAMAS, getPlace } from './travel.ts';
export type Visit = { id: string; at: string };
export type TravelMemory = { saved: string[]; visits: Visit[]; last: string };

const INITIAL = PANORAMAS[0];
export function parseMemory(text: string | null): TravelMemory {
  const fallback = { saved: [], visits: [], last: INITIAL.id };
  if (!text || text.length > 200000) return fallback;
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object') return fallback;
    const saved = Array.isArray(raw.saved)
      ? raw.saved
          .filter((id: unknown) => typeof id === 'string' && !!getPlace(id))
          .slice(0, 60)
      : [];
    const visits = Array.isArray(raw.visits)
      ? raw.visits
          .filter(
            (v: Visit) =>
              v &&
              typeof v.id === 'string' &&
              !!getPlace(v.id) &&
              typeof v.at === 'string' &&
              Number.isFinite(Date.parse(v.at)),
          )
          .slice(0, 60)
      : [];
    return {
      saved: [...new Set<string>(saved)],
      visits: visits.filter(
        (v: Visit, index: number) =>
          visits.findIndex((candidate: Visit) => candidate.id === v.id) ===
          index,
      ),
      last:
        typeof raw.last === 'string' && getPlace(raw.last)
          ? raw.last
          : INITIAL.id,
    };
  } catch {
    return fallback;
  }
}
