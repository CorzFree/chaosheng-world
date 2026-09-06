import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SPOTS, JOURNEYS, getSpot } from '../lib/travel-play-data.ts';
import { getPlace, PANORAMAS } from '../lib/travel.ts';
import { viewDirection } from '../lib/panorama-viewer.ts';
import { geographicPoint } from '../lib/travel-geometry.ts';
import {
  angularDistance,
  projectSphericalSpot,
  pointCoordinates,
  distanceKm,
  guessScore,
  shuffledRoundIds,
  validCoordinates,
} from '../lib/travel-play-math.ts';
import {
  emptyExpedition,
  parseExpedition,
  recordDiscovery,
  addGuess,
  saveTravelNote,
  makeAnswer,
} from '../lib/travel-play-state.ts';

test('each journey and clue refers to a verified real panorama', () => {
  assert.equal(SPOTS.length, 36);
  assert.equal(new Set(SPOTS.map((s) => s.id)).size, 36);
  for (const spot of SPOTS) {
    assert.equal(getPlace(spot.placeId).mode, 'panorama');
    assert.ok(Math.abs(spot.yaw) <= 180 && Math.abs(spot.pitch) <= 80);
    assert.ok(
      spot.hint && spot.description && spot.radius >= 6 && spot.radius <= 12,
    );
  }
  for (const journey of JOURNEYS) {
    assert.equal(journey.stops.length, 3);
    assert.equal(new Set(journey.stops.map((s) => s.placeId)).size, 3);
    for (const stop of journey.stops)
      assert.equal(getSpot(stop.spotId).placeId, stop.placeId);
  }
});
test('photographic overlays agree with rendered Three camera at all yaw seams and aspect ratios', () => {
  for (const yaw of [-179, 0, 90, 359])
    for (const pitch of [-55, 0, 60])
      for (const aspect of [0.55, 1, 1.8]) {
        const pose = { yaw, pitch, fov: 76 },
          camera = new THREE.PerspectiveCamera(pose.fov, aspect, 0.1, 500);
        camera.lookAt(viewDirection(yaw, pitch));
        camera.updateMatrixWorld();
        for (const offset of [-30, -8, 0, 8, 30, 180]) {
          const spot = {
              yaw: yaw + offset,
              pitch: Math.max(-80, Math.min(80, pitch + 7)),
            },
            vector = viewDirection(spot.yaw, spot.pitch),
            projected = vector.clone().project(camera);
          const output = projectSphericalSpot(spot, pose, aspect),
            front = vector.dot(viewDirection(yaw, pitch)) > 0;
          if (
            !front ||
            Math.abs(projected.x) > 1 ||
            Math.abs(projected.y) > 1
          ) {
            assert.equal(output, null);
            continue;
          }
          assert.ok(output);
          assert.ok(Math.abs(output.x - (projected.x + 1) / 2) < 1e-8);
          assert.ok(Math.abs(output.y - (1 - projected.y) / 2) < 1e-8);
        }
      }
  assert.equal(
    projectSphericalSpot(
      { yaw: 180, pitch: 0 },
      { yaw: 0, pitch: 0, fov: 76 },
      1,
    ),
    null,
  );
});
test('discovery angular hit detection handles the panorama seam and vertical targets', () => {
  assert.ok(
    Math.abs(
      angularDistance({ yaw: 359, pitch: 0 }, { yaw: 1, pitch: 0 }) - 2,
    ) < 1e-7,
  );
  assert.ok(
    Math.abs(
      angularDistance({ yaw: 0, pitch: 35 }, { yaw: 0, pitch: 45 }) - 10,
    ) < 1e-7,
  );
  assert.ok(
    angularDistance({ yaw: 0, pitch: 0 }, { yaw: 180, pitch: 0 }) > 179.999,
  );
  assert.ok(
    angularDistance({ yaw: 360, pitch: 20 }, { yaw: 0, pitch: 20 }) < 1e-5,
  );
});
test('globe coordinates survive arbitrary rotation and scaling without answer leakage', () => {
  for (const coords of [
    [0, 0],
    [35.18, 136.9],
    [-33.85, 151.21],
    [64.14, -21.93],
    [0, 179.9],
  ]) {
    const group = new THREE.Group();
    group.rotation.set(0.7, -1.5, 0.22);
    group.position.set(0.1, 0.2, -0.3);
    group.scale.set(2, 1.2, 0.9);
    group.updateMatrixWorld(true);
    const world = group.localToWorld(geographicPoint(...coords));
    const recovered = pointCoordinates(group.worldToLocal(world));
    assert.ok(Math.abs(recovered[0] - coords[0]) < 1e-8);
    assert.ok(Math.abs(recovered[1] - coords[1]) < 1e-8);
  }
  assert.throws(() => pointCoordinates({ x: 0, y: 0, z: 0 }));
});
test('great-circle distance is stable across dateline, poles and antipodes', () => {
  assert.equal(distanceKm([45, 12], [45, 12]), 0);
  assert.ok(Math.abs(distanceKm([0, 0], [0, 1]) - 111.19508) < 0.0001);
  assert.ok(Math.abs(distanceKm([0, 179], [0, -179]) - 222.39016) < 0.0001);
  assert.ok(Math.abs(distanceKm([0, 0], [0, 180]) - 20015.11444) < 0.001);
  assert.ok(distanceKm([90, 180], [90, -10]) < 1e-8);
  assert.equal(
    distanceKm([-33, 151], [40, -73]),
    distanceKm([40, -73], [-33, 151]),
  );
  assert.throws(() => distanceKm([91, 0], [0, 0]));
  assert.equal(validCoordinates([1, 2, 3]), false);
  assert.equal(validCoordinates([NaN, 2]), false);
  assert.equal(guessScore(0), 5000);
  assert.equal(guessScore(1000), 3033);
  assert.equal(guessScore(20015), 0);
});
test('guessing rounds contain five unique places and finish exactly once', () => {
  const ids = shuffledRoundIds(
    PANORAMAS.map((p) => p.id),
    () => 0.4,
  );
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  let state = { ...emptyExpedition(), quiz: { ids, answers: [] } };
  for (const id of ids) state = addGuess(state, getPlace(id).coords);
  assert.equal(state.games, 1);
  assert.equal(state.bestScore, 25000);
  assert.equal(state.quiz.answers.length, 5);
  assert.throws(() => addGuess(state, [0, 0]));
  assert.equal(state.games, 1);
});
test('assisted finds can be upgraded but independent discoveries cannot be downgraded or duplicated', () => {
  const id = SPOTS[0].id;
  let state = recordDiscovery(emptyExpedition(), id, true);
  assert.equal(state.discoveries[0].assisted, true);
  state = recordDiscovery(state, id, false);
  assert.equal(state.discoveries[0].assisted, false);
  assert.equal(recordDiscovery(state, id, true), state);
  assert.equal(state.discoveries.length, 1);
  assert.throws(() => recordDiscovery(state, 'not-real', false));
});
test('saved exploration validates quiz order and recomputes scores rather than trusting serialized totals', () => {
  const ids = PANORAMAS.slice(0, 5).map((p) => p.id);
  const source = {
    ...emptyExpedition(),
    quiz: {
      ids,
      answers: [
        { placeId: ids[0], coords: [0, 0], score: 5000, distance: 0 },
        { placeId: ids[3], coords: [0, 0], score: 5000 },
      ],
    },
  };
  const restored = parseExpedition(JSON.stringify(source));
  assert.equal(restored.quiz.answers.length, 1);
  assert.deepEqual(restored.quiz.answers[0], makeAnswer(ids[0], [0, 0]));
  assert.equal(parseExpedition('x'.repeat(500001)).quiz, null);
  assert.equal(parseExpedition('{').discoveries.length, 0);
  assert.equal(
    parseExpedition(JSON.stringify({ ...source, version: 3 })).quiz,
    null,
  );
});
test('corrupted and unknown notes or unearned journeys cannot enter the passport', () => {
  const source = {
    ...emptyExpedition(),
    completedJourneys: JOURNEYS.map((j) => j.id),
    journey: { id: JOURNEYS[0].id, index: 500 },
    discoveries: [{ id: SPOTS[0].id, at: 'bad', assisted: false }],
    notes: [
      {
        id: 'valid-id',
        placeId: 'venice_sunset',
        text: ' hello ',
        at: '2026-09-07',
        yaw: 720,
        pitch: 90,
      },
      {
        id: 'bad',
        placeId: 'not-real',
        text: 'bad',
        at: '2026-09-07',
        yaw: 0,
        pitch: 0,
      },
    ],
  };
  const restored = parseExpedition(JSON.stringify(source));
  assert.equal(restored.completedJourneys.length, 0);
  assert.equal(restored.journey, null);
  assert.equal(restored.notes.length, 1);
  assert.equal(restored.notes[0].yaw, 0);
  assert.equal(restored.notes[0].pitch, 80);
  assert.equal(restored.notes[0].text, 'hello');
  assert.throws(() =>
    saveTravelNote(emptyExpedition(), {
      id: 'a',
      placeId: 'venice_sunset',
      text: ' ',
      at: '2026-09-07',
      yaw: 0,
      pitch: 0,
    }),
  );
});
