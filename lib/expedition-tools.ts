import type { useExpedition } from './use-expedition';
import { JOURNEYS, SPOTS } from './travel-play-data';
import { validCoordinates } from './travel-play-math';
export function registerExpeditionTools(
  current: () => ReturnType<typeof useExpedition>,
) {
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
  if (!context) return () => {};
  const lifecycle = new AbortController();
  function add(
    name: string,
    title: string,
    description: string,
    properties: object,
    required: string[],
    readOnlyHint: boolean,
    execute: (input: Record<string, unknown>) => unknown,
  ) {
    try {
      void Promise.resolve(
        context!.registerTool(
          {
            name,
            title,
            description,
            inputSchema: {
              type: 'object',
              properties,
              required,
              additionalProperties: false,
            },
            annotations: {
              readOnlyHint,
              untrustedContentHint: name === 'read_expedition_progress',
            },
            execute: (input: unknown) => {
              if (!input || typeof input !== 'object' || Array.isArray(input))
                throw new Error('Expected an object.');
              const data = input as Record<string, unknown>;
              if (Object.keys(data).some((key) => !(key in properties)))
                throw new Error('Unknown argument.');
              return execute(data);
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
  }
  add(
    'list_travel_activities',
    'List travel activities',
    'List the curated photographic journeys and discovery clues. Does not reveal geographic quiz answers.',
    {},
    [],
    true,
    () => ({
      journeys: JOURNEYS,
      discoveries: SPOTS.map(({ id, placeId, title, hint }) => ({
        id,
        placeId,
        title,
        hint,
      })),
    }),
  );
  add(
    'read_expedition_progress',
    'Read exploration progress',
    'Read active gameplay, completed discoveries, travel notes and guessing results stored only on this device.',
    {},
    [],
    true,
    () => current().getState(),
  );
  add(
    'start_travel_activity',
    'Start or resume an activity',
    'Start a three-stop journey, a photographic discovery, or a five-round globe guessing game. Changes the visible destination and device-local progress.',
    {
      kind: { type: 'string', enum: ['journey', 'discovery', 'quiz'] },
      id: { type: 'string' },
      resume: { type: 'boolean' },
    },
    ['kind'],
    false,
    async (data) => {
      if (data.resume !== undefined && typeof data.resume !== 'boolean')
        throw new Error('resume must be boolean.');
      if (data.kind === 'quiz') {
        if (data.id !== undefined) throw new Error('Quiz does not take an id.');
        return current().startQuiz(data.resume === true);
      }
      if (typeof data.id !== 'string')
        throw new Error('An activity id is required.');
      if (data.kind === 'journey')
        return current().startJourney(data.id, data.resume === false);
      if (data.kind === 'discovery') return current().startHunt(data.id);
      throw new Error('Unknown activity kind.');
    },
  );
  add(
    'use_discovery_hint',
    'Reveal a discovery hint',
    'Level 1 gives direction guidance; level 2 moves the camera to the target and marks subsequent discovery as assisted.',
    { level: { type: 'integer', enum: [1, 2] } },
    ['level'],
    false,
    (data) => {
      if (data.level !== 1 && data.level !== 2)
        throw new Error('Choose hint level 1 or 2.');
      return current().revealHint(data.level);
    },
  );
  add(
    'confirm_travel_discovery',
    'Confirm the centered discovery',
    'Check the actual viewing direction against the current clue. Records a discovery only when the target is centered within its angular tolerance.',
    {},
    [],
    false,
    () => current().confirmDiscovery(),
  );
  add(
    'advance_travel_activity',
    'Continue the active activity',
    'Continue to the next journey stop, next guessing round, or next undiscovered clue. A journey stop or guessing round must be complete first.',
    {},
    [],
    false,
    () => {
      const state = current().getState();
      if (state.mode === 'quiz') return current().nextRound();
      if (state.mode === 'hunt' && state.journey)
        return current().continueJourney();
      if (state.mode === 'hunt') {
        current().nextDiscovery();
        return current().getState();
      }
      throw new Error('No active activity.');
    },
  );
  add(
    'submit_globe_guess',
    'Submit a geographic guess',
    'Submit one latitude and longitude for the current guessing round. Returns the great-circle distance and score, and reveals the actual destination.',
    {
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
    },
    ['latitude', 'longitude'],
    false,
    (data) => {
      const coords = [data.latitude, data.longitude];
      if (!validCoordinates(coords)) throw new Error('Invalid coordinates.');
      return current().submitGuess(coords);
    },
  );
  add(
    'save_travel_note',
    'Save a local travel note',
    'Save a new note for the currently visible destination and viewing direction. Text remains on this device and is returned by the progress reader.',
    { text: { type: 'string', minLength: 1, maxLength: 2000 } },
    ['text'],
    false,
    (data) => {
      if (
        typeof data.text !== 'string' ||
        !data.text.trim() ||
        data.text.length > 2000
      )
        throw new Error('Write 1–2000 characters.');
      return current().saveNote(data.text, true);
    },
  );
  add(
    'pause_travel_activity',
    'Return to free travel',
    'Leave the active activity, preserving discoveries, notes and saved progress on this device.',
    {},
    [],
    false,
    () => {
      current().exitPlay();
      return current().getState();
    },
  );
  return () => lifecycle.abort();
}
