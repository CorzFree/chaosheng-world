import { getPlace, PLACES } from './travel';
import type { useTravel } from './use-travel';
export function registerTravelTools(c: ReturnType<typeof useTravel>) {
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
  const life = new AbortController();
  const add = (tool: object) => {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: life.signal }),
      ).catch(() => {});
    } catch {}
  };
  add({
    name: 'list_travel_destinations',
    title: 'List real destinations',
    description:
      'List the real photographic and official Street View destinations available in this travel window.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: () =>
      PLACES.map((p) => ({
        id: p.id,
        name: p.name,
        country: p.country,
        region: p.region,
        mode: p.mode,
        navigable: !!p.navigable,
      })),
  });
  add({
    name: 'read_travel_view',
    title: 'Read current travel view',
    description:
      'Read the selected destination, image loading state and local panorama viewing angle.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: () => c.getState(),
  });
  add({
    name: 'travel_to_destination',
    title: 'Go to a real destination',
    description:
      'Open a listed real panorama or official street view in the visible travel window. Records this destination in device-local online travel history.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input: unknown) => {
      const data = input as { id?: unknown };
      const place =
        data && typeof data.id === 'string' ? getPlace(data.id) : undefined;
      if (!place)
        throw new Error('Unknown destination. List destinations first.');
      await c.travelTo(place);
      for (let i = 0; i < 160 && c.getState().loading; i++)
        await new Promise((resolve) => setTimeout(resolve, 75));
      return c.getState();
    },
  });
  add({
    name: 'look_around_panorama',
    title: 'Look around a real panorama',
    description:
      'Change horizontal angle, vertical angle or field of view in a locally hosted real panorama. Does not control Google Street View.',
    inputSchema: {
      type: 'object',
      properties: {
        yaw: { type: 'number', minimum: -360, maximum: 360 },
        pitch: { type: 'number', minimum: -80, maximum: 80 },
        fov: { type: 'number', minimum: 35, maximum: 100 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input: unknown) => {
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Expected panorama angles.');
      const data = input as Record<string, unknown>;
      if (
        !Object.keys(data).length ||
        Object.keys(data).some((k) => !['yaw', 'pitch', 'fov'].includes(k))
      )
        throw new Error('Unknown viewing parameter.');
      for (const [key, value] of Object.entries(data)) {
        if (
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < (key === 'yaw' ? -360 : key === 'pitch' ? -80 : 35) ||
          value > (key === 'yaw' ? 360 : key === 'pitch' ? 80 : 100)
        )
          throw new Error('Viewing parameter is outside its range.');
      }
      c.lookAround(data as { yaw?: number; pitch?: number; fov?: number });
      await new Promise((resolve) => setTimeout(resolve, 500));
      return c.getState();
    },
  });
  return () => life.abort();
}
