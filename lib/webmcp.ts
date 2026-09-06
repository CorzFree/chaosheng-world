import {
  serialize,
  deserialize,
  paint,
  statistics,
  finishStroke,
  day,
  hour,
  setWeather,
  type Tool,
  type Weather,
} from './world';
import type { useWorld } from './use-world';
type Context = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerWorldTools(c: ReturnType<typeof useWorld>) {
  const context = (document as Document & { modelContext?: Context })
    .modelContext;
  if (!context?.registerTool) return () => {};
  const life = new AbortController();
  const add = (tool: Parameters<Context['registerTool']>[0]) => {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: life.signal }),
      ).catch(() => {});
    } catch {
      /* The world works without browser agent support. */
    }
  };
  add({
    name: 'read_archipelago',
    title: 'Read the living archipelago',
    description:
      'Read current island names, ecological counts, weather, time, and recent world events. Coordinates span x 0–1439 and y 0–959.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => {
      const w = c.world.current;
      if (!w) throw new Error('World is still arriving.');
      return {
        ...statistics(w),
        day: day(w),
        hour: hour(w),
        weather: w.weather,
        islands: w.islands.map(({ name, x, y }) => ({ name, x, y })),
        recentEvents: w.logs.slice(0, 6).map((e) => e.text),
      };
    },
  });
  add({
    name: 'create_archipelago_changes',
    title: 'Shape the archipelago',
    description:
      'Complete a batch of up to 40 world edits using the same brush and placement rules as the visible tools. Land and water edits apply five brush passes at each coordinate. The entire batch is rejected if a placement is invalid. Changes can be undone in the interface.',
    inputSchema: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          minItems: 1,
          maxItems: 40,
          items: {
            type: 'object',
            properties: {
              tool: {
                type: 'string',
                enum: ['land', 'water', 'tree', 'home', 'boat', 'lantern'],
              },
              x: { type: 'number', minimum: 0, maximum: 1439 },
              y: { type: 'number', minimum: 0, maximum: 959 },
            },
            required: ['tool', 'x', 'y'],
            additionalProperties: false,
          },
        },
      },
      required: ['edits'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async (input: unknown) => {
      const data = input as { edits?: { tool: Tool; x: number; y: number }[] };
      if (
        !data ||
        typeof data !== 'object' ||
        Object.keys(data).some((k) => k !== 'edits') ||
        !Array.isArray(data.edits) ||
        !data.edits.length ||
        data.edits.length > 40 ||
        data.edits.some(
          (e) =>
            !e ||
            !['land', 'water', 'tree', 'home', 'boat', 'lantern'].includes(
              e.tool,
            ) ||
            !Number.isFinite(e.x) ||
            !Number.isFinite(e.y) ||
            e.x < 0 ||
            e.x > 1439 ||
            e.y < 0 ||
            e.y > 959 ||
            Object.keys(e).some((k) => !['tool', 'x', 'y'].includes(k)),
        )
      )
        throw new Error('Expected 1–40 valid edits inside the world bounds.');
      const current = c.world.current;
      if (!current) throw new Error('World is still arriving.');
      const next = deserialize(serialize(current));
      for (const edit of data.edits) {
        const before = statistics(next);
        for (
          let i = 0;
          i < (['land', 'water'].includes(edit.tool) ? 5 : 1);
          i++
        ) {
          const failure = paint(
            next,
            edit.tool,
            edit.x,
            edit.y,
            c.view.current.radius,
          );
          if (failure) throw new Error(failure);
        }
        finishStroke(next, edit.tool, before);
      }
      c.remember();
      next.revision = current.revision + 1;
      c.world.current = next;
      c.sync();
      c.save();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      return { applied: data.edits.length, ...statistics(next) };
    },
  });
  add({
    name: 'set_archipelago_weather',
    title: 'Change the island weather',
    description:
      'Set clear skies, rain, or mist in the visible world. Rain helps young trees grow faster. Weather changes are undoable.',
    inputSchema: {
      type: 'object',
      properties: {
        weather: { type: 'string', enum: ['clear', 'rain', 'mist'] },
      },
      required: ['weather'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async (input: unknown) => {
      const data = input as { weather?: Weather };
      if (
        !data ||
        typeof data !== 'object' ||
        Object.keys(data).some((k) => k !== 'weather') ||
        !['clear', 'rain', 'mist'].includes(data.weather ?? '')
      )
        throw new Error('Weather must be clear, rain, or mist.');
      if (!c.world.current) throw new Error('World is still arriving.');
      c.changeWeather(data.weather!);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      return { weather: c.world.current.weather };
    },
  });
  return () => life.abort();
}
