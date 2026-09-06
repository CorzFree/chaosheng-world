import { isCity, cityMetrics, rezone, advanceCity, type Zone } from './city.ts';
import { serialize, deserialize } from './world.ts';
import type { useWorld } from './use-world';
export function registerCityTools(c: ReturnType<typeof useWorld>) {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool: (
          tool: object,
          options: { signal: AbortSignal },
        ) => void | Promise<void>;
      };
    }
  ).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const add = (tool: object) => {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  };
  add({
    name: 'read_island_city',
    title: 'Read island city',
    description:
      'Read actual housing, population, jobs, utilities, commute demand and construction in the island city.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: () => {
      const w = c.world.current;
      if (!isCity(w)) throw new Error('The city is not ready.');
      const m = cityMetrics(w);
      return {
        population: m.population,
        housing: m.housing,
        jobs: m.jobs,
        employed: m.employed,
        powerRate: m.powerRate,
        waterRate: m.waterRate,
        commuteMinutes: m.commuteMinutes,
        metroShare: m.metroShare,
        buildings: m.buildings,
        construction: m.construction,
        metro: w.city.metro,
      };
    },
  });
  add({
    name: 'rezone_city_parcels',
    title: 'Rezone city parcels',
    description:
      'Complete zoning changes for up to 30 existing parcel IDs. Occupied housing is protected. Invalid batches make no changes. The result can be undone.',
    inputSchema: {
      type: 'object',
      properties: {
        parcelIds: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: { type: 'integer', minimum: 0 },
        },
        zone: {
          type: 'string',
          enum: ['residential', 'commercial', 'mixed', 'industrial', 'park'],
        },
      },
      required: ['parcelIds', 'zone'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input: unknown) => {
      const data = input as { parcelIds?: number[]; zone?: Zone },
        w = c.world.current;
      if (!isCity(w)) throw new Error('The city is not ready.');
      if (
        !data ||
        !Array.isArray(data.parcelIds) ||
        !data.parcelIds.length ||
        data.parcelIds.length > 30 ||
        data.parcelIds.some(
          (id) => !Number.isInteger(id) || !w.city.parcels[id],
        ) ||
        !['residential', 'commercial', 'mixed', 'industrial', 'park'].includes(
          data.zone ?? '',
        )
      )
        throw new Error('Choose valid parcel IDs and a supported zone.');
      const next = deserialize(serialize(w));
      if (!isCity(next)) throw new Error('Missing city.');
      for (const id of data.parcelIds) {
        const p = next.city.parcels[id],
          failure = rezone(next, data.zone!, p.x, p.y);
        if (failure) throw new Error(failure);
      }
      c.remember();
      c.world.current = next;
      c.sync();
      c.save();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      return {
        changed: data.parcelIds.length,
        construction: cityMetrics(next).construction,
      };
    },
  });
  return () => lifecycle.abort();
}
