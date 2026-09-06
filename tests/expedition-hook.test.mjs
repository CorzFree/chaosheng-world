// Regression harness for camera hit testing, captured travel notes and async activity races.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(project, 'package.json'));
const ts = require('typescript');
const localModule = (name) =>
  import(pathToFileURL(path.join(project, 'lib', name + '.ts')).href);
const { SPOTS } = await localModule('travel-play-data');
const { getPlace, PANORAMAS } = await localModule('travel');
const { projectSphericalSpot } = await localModule('travel-play-math');
const { parseExpedition } = await localModule('travel-play-state');

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
let dispatcher;
function depsChanged(previous, next) {
  return (
    !previous ||
    !next ||
    previous.length !== next.length ||
    next.some((value, i) => !Object.is(value, previous[i]))
  );
}
const runtime = {
  useRef(value) {
    const h = dispatcher,
      index = h.cursor++;
    return h.slots[index] ?? (h.slots[index] = { current: value });
  },
  useState(initial) {
    const h = dispatcher,
      index = h.cursor++;
    const slot =
      h.slots[index] ??
      (h.slots[index] = {
        value: typeof initial === 'function' ? initial() : initial,
      });
    return [
      slot.value,
      (update) => {
        const value =
          typeof update === 'function' ? update(slot.value) : update;
        if (!Object.is(slot.value, value)) {
          slot.value = value;
          h.dirty = true;
        }
      },
    ];
  },
  useEffect(effect, deps) {
    const h = dispatcher,
      index = h.cursor++,
      previous = h.slots[index];
    if (!previous || depsChanged(previous.deps, deps)) {
      h.slots[index] = { deps, cleanup: previous?.cleanup };
      h.effects.push(() => {
        previous?.cleanup?.();
        h.slots[index].cleanup = effect();
      });
    }
  },
  useMemo(factory, deps) {
    const h = dispatcher,
      index = h.cursor++,
      previous = h.slots[index];
    if (!previous || depsChanged(previous.deps, deps)) {
      h.slots[index] = { deps, value: factory() };
    }
    return h.slots[index].value;
  },
  useCallback(callback, deps) {
    return runtime.useMemo(() => callback, deps);
  },
};
runtime.useLayoutEffect = runtime.useEffect;
globalThis.__expeditionReviewHooks = runtime;
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const source = fs.readFileSync(
  path.join(project, 'lib', 'use-expedition.ts'),
  'utf8',
);
let compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
compiled = compiled.replace(
  /import\s*\{([^}]+)\}\s*from\s*['"]react['"];?/g,
  (_, names) =>
    'const {' +
    names.replace(/\bas\b/g, ':') +
    '} = globalThis.__expeditionReviewHooks;',
);
compiled = compiled.replace(
  /from\s*(['"])(\.\/[^'"]+|@\/[^'"]+)\1/g,
  (_, quote, specifier) => {
    let filename = specifier.startsWith('@/')
      ? path.join(project, specifier.slice(2))
      : path.resolve(project, 'lib', specifier);
    if (!path.extname(filename)) {
      filename += fs.existsSync(filename + '.ts') ? '.ts' : '.tsx';
    }
    return 'from ' + quote + pathToFileURL(filename).href + quote;
  },
);
const { useExpedition } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);

export function createTravelFixture(id = PANORAMAS[0].id) {
  const bounds = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 360,
    bottom: 760,
    width: 360,
    height: 760,
  };
  const surface = {
    clientWidth: bounds.width,
    clientHeight: bounds.height,
    width: bounds.width,
    height: bounds.height,
    getBoundingClientRect: () => ({ ...bounds }),
  };
  surface.parentElement = {
    clientWidth: bounds.width,
    clientHeight: bounds.height,
    getBoundingClientRect: () => ({ ...bounds }),
  };
  const api = {
    state: {
      id,
      loading: false,
      error: '',
      view: { yaw: 0, pitch: 0, fov: 76 },
    },
    canvas: { current: surface },
    auto: false,
    immersive: false,
    fallback: false,
    deferred: false,
    requests: [],
    lookCalls: [],
    pendingId: null,
  };
  let sequence = 0;
  api.getState = () => ({
    ...api.state,
    view: { ...api.state.view },
    viewport: { width: bounds.width, height: bounds.height },
  });
  api.getViewport = () => ({ width: bounds.width, height: bounds.height });
  api.toggleAuto = () => {
    api.auto = !api.auto;
  };
  api.toggleImmersive = async () => {
    api.immersive = !api.immersive;
  };
  api.lookAround = (pose) => {
    api.lookCalls.push({ ...pose });
    Object.assign(api.state.view, pose);
  };
  api.travelTo = (place) => {
    const token = ++sequence;
    api.state.loading = true;
    api.state.error = '';
    api.pendingId = place.id;
    const commit = () => {
      if (token !== sequence) return;
      Object.assign(api.state, {
        id: place.id,
        loading: false,
        error: '',
        view: {
          yaw: place.initialYaw ?? 0,
          pitch: place.initialPitch ?? 0,
          fov: 76,
        },
      });
      api.pendingId = null;
    };
    if (!api.deferred) {
      commit();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      api.requests.push({
        id: place.id,
        succeed() {
          commit();
          resolve();
        },
        // Matches useTravel.travelTo returning after a superseded load.
        abandon() {
          resolve();
        },
      });
    });
  };
  return api;
}

export function createExpeditionHarness(api) {
  const h = {
    slots: [],
    cursor: 0,
    effects: [],
    dirty: false,
    result: null,
    render() {
      for (let attempt = 0; attempt < 12; attempt++) {
        this.dirty = false;
        this.cursor = 0;
        this.effects = [];
        dispatcher = this;
        this.result = useExpedition({
          ...api,
          active: getPlace(api.state.id),
          pose: { ...api.state.view },
          loading: api.state.loading ? api.pendingId : null,
          error: api.state.error,
        });
        for (const effect of this.effects) effect();
        if (!this.dirty) return this.result;
      }
      throw new Error('Hook did not settle after 12 synchronous renders.');
    },
    destroy() {
      for (const slot of this.slots) slot?.cleanup?.();
    },
  };
  h.render();
  return h;
}

const cases = [
  [
    'offscreen target must not be awarded on a narrow, zoomed viewport',
    async () => {
      storage.clear();
      const spot = [...SPOTS].sort(
        (a, b) => Math.abs(a.pitch) - Math.abs(b.pitch),
      )[0];
      const api = createTravelFixture(spot.placeId);
      const h = createExpeditionHarness(api);
      await h.result.startHunt(spot.id);
      api.state.view = {
        yaw: spot.yaw - 9.5,
        pitch: spot.pitch,
        fov: 35,
      };
      h.render();
      assert.equal(projectSphericalSpot(spot, api.state.view, 360 / 760), null);
      const before = h.result.getState().discoveries;
      let outcome;
      try {
        outcome = h.result.confirmDiscovery();
      } catch (error) {
        outcome = { rejected: error.message };
      }
      const after = h.result.getState().discoveries;
      console.log(
        '  evidence:',
        JSON.stringify({
          spotId: spot.id,
          pose: api.state.view,
          viewport: [360, 760],
          outcome,
          before,
          after,
        }),
      );
      assert.equal(after, before, 'A completely offscreen target was awarded.');
      h.destroy();
    },
  ],
  [
    'new notes keep their opening place and full camera snapshot',
    async () => {
      storage.clear();
      const api = createTravelFixture(PANORAMAS[0].id);
      const h = createExpeditionHarness(api);
      api.state.view = { yaw: 30, pitch: 10, fov: 35 };
      // A second scene is already loading when the user starts writing.
      api.deferred = true;
      const flight = api.travelTo(PANORAMAS[1]);
      h.render();
      h.result.beginNote();
      h.render();
      api.requests[0].succeed();
      await flight;
      h.render();
      const note = h.result.saveNote('写下原先那一眼的细节');
      console.log(
        '  evidence:',
        JSON.stringify({
          openedAt: PANORAMAS[0].id,
          savedPlaceId: note.placeId,
          savedPose: { yaw: note.yaw, pitch: note.pitch, fov: note.fov },
        }),
      );
      assert.equal(
        note.placeId,
        PANORAMAS[0].id,
        'Note moved to the newly loaded place.',
      );
      assert.deepEqual(
        { yaw: note.yaw, pitch: note.pitch, fov: note.fov },
        { yaw: 30, pitch: 10, fov: 35 },
      );
      api.deferred = false;
      await h.result.revisitNote(note);
      assert.equal(
        api.lookCalls.at(-1)?.fov,
        35,
        'Revisit dropped saved field of view.',
      );
      const legacy = { ...note };
      delete legacy.fov;
      const restored = parseExpedition(
        JSON.stringify({
          ...h.result.memory,
          notes: [legacy],
        }),
      );
      assert.equal(
        restored.notes[0]?.fov,
        76,
        'Legacy notes need a default FOV.',
      );
      h.destroy();
    },
  ],
  [
    'an obsolete hunt cannot report failure over the successfully loaded hunt',
    async () => {
      storage.clear();
      const api = createTravelFixture(PANORAMAS[0].id);
      api.deferred = true;
      const h = createExpeditionHarness(api);
      const a = SPOTS.find((s) => s.placeId === PANORAMAS[1].id);
      const b = SPOTS.find((s) => s.placeId === PANORAMAS[2].id);
      const first = h.result.startHunt(a.id);
      const second = h.result.startHunt(b.id);
      assert.equal(api.requests.length, 2);
      api.requests[1].succeed();
      await second;
      api.requests[0].abandon();
      await first;
      h.render();
      console.log(
        '  evidence:',
        JSON.stringify({
          active: api.state.id,
          target: h.result.getState().target?.id,
          ready: !api.state.loading && !api.state.error,
          feedback: h.result.feedback,
        }),
      );
      assert.equal(api.state.id, b.placeId);
      assert.equal(h.result.getState().target?.id, b.id);
      assert.equal(
        h.result.feedback,
        '',
        'Old operation left a false loading error.',
      );
      h.destroy();
    },
  ],
];

for (const [name, run] of cases) test(name, run);
