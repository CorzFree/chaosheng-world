import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  PLACES,
  PANORAMAS,
  STREET_PLACES,
  filterPlaces,
  mapsSearch,
  verifyPlace,
} from '../lib/travel.ts';
import { parseMemory } from '../lib/travel-state.ts';
import { viewDirection, constrainPose } from '../lib/panorama-viewer.ts';
import {
  geographicPoint,
  rotateForScreenDrag,
} from '../lib/travel-geometry.ts';
test('every destination is real-source-backed with unique IDs and valid coordinates', () => {
  assert.equal(PLACES.length, 18);
  assert.equal(new Set(PLACES.map((p) => p.id)).size, PLACES.length);
  assert.equal(new Set(PLACES.map((p) => p.region)).size, 6);
  for (const p of PLACES) {
    assert.ok(verifyPlace(p), p.id);
    assert.ok(p.photographer && p.source && p.licenseUrl);
    assert.equal(new URL(p.source).protocol, 'https:');
  }
});
test('locally hosted panoramas and card photographs are actually packaged', () => {
  assert.equal(PANORAMAS.length, 12);
  for (const p of PLACES) {
    for (const value of [p.image, p.preview].filter(Boolean))
      assert.ok(
        existsSync(new URL('../public' + value, import.meta.url)),
        value,
      );
  }
  assert.ok(
    existsSync(new URL('../public/travel/credits.html', import.meta.url)),
  );
  for (const p of PANORAMAS) {
    assert.equal(p.width, p.height * 2);
    assert.ok(['CC0 1.0', 'CC BY-SA 4.0'].includes(p.license));
  }
});
test('street experiences only use genuine recorded official embed URLs', () => {
  assert.equal(STREET_PLACES.length, 6);
  for (const p of STREET_PLACES) {
    const url = new URL(p.embed);
    assert.equal(url.hostname, 'www.google.com');
    assert.equal(url.pathname, '/maps/embed');
    assert.ok(url.searchParams.get('pb').startsWith('!4v'));
    assert.equal(p.navigable, true);
    assert.equal(p.photographer, 'Google 街景');
  }
});
test('panorama viewing preserves left-right orientation and the upper hemisphere', () => {
  const geometry = new THREE.SphereGeometry(100, 96, 64).scale(-1, 1, 1),
    material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide }),
    mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  for (const [yaw, expected] of [
    [0, 0.5],
    [90, 0.75],
    [-90, 0.25],
  ]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(), viewDirection(yaw, 0)),
      hit = ray.intersectObject(mesh)[0];
    assert.ok(hit);
    assert.ok(Math.abs(hit.uv.x - expected) < 1e-5);
  }
  const north = new THREE.Raycaster(
    new THREE.Vector3(),
    viewDirection(0, 30),
  ).intersectObject(mesh)[0];
  assert.ok(north.uv.y > 0.66 && north.uv.y < 0.67);
  geometry.dispose();
  material.dispose();
});
test('NASA globe coordinates match the exterior sphere image', () => {
  const geometry = new THREE.SphereGeometry(1, 72, 48),
    material = new THREE.MeshBasicMaterial(),
    mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  for (const [lat, lon] of [
    [0, 0],
    [0, 90],
    [45, 0],
    [-33, 151],
  ]) {
    const position = geographicPoint(lat, lon, 3),
      hit = new THREE.Raycaster(
        position,
        position.clone().negate().normalize(),
      ).intersectObject(mesh)[0];
    assert.ok(hit);
    assert.ok(Math.abs(hit.uv.x - (lon + 180) / 360) < 0.003);
    assert.ok(Math.abs(hit.uv.y - (lat + 90) / 180) < 0.003);
  }
  geometry.dispose();
  material.dispose();
});
test('dragging downward moves the near face down at different longitudes', () => {
  for (const [lat, lon] of [
    [45, 12],
    [0, 90],
    [0, -90],
    [-33, 151],
    [64, -21],
  ]) {
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
    camera.position.copy(geographicPoint(lat, lon, 3.3));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const group = new THREE.Group(),
      marker = new THREE.Object3D();
    marker.position.copy(geographicPoint(lat, lon, 1.035));
    group.add(marker);
    group.updateMatrixWorld(true);
    const before = marker.getWorldPosition(new THREE.Vector3()).project(camera);
    rotateForScreenDrag(group, camera, 0, 0.08);
    group.updateMatrixWorld(true);
    const after = marker.getWorldPosition(new THREE.Vector3()).project(camera);
    assert.ok(after.y < before.y, lat + ',' + lon);
    assert.ok(Math.abs(after.x - before.x) < 0.001);
  }
});
test('view constraints and destination filters behave predictably', () => {
  assert.deepEqual(constrainPose({ yaw: -450, pitch: 150, fov: 200 }), {
    yaw: 270,
    pitch: 80,
    fov: 100,
  });
  assert.ok(filterPlaces('日本').every((p) => p.country === '日本'));
  assert.equal(filterPlaces('', 'Oceania')[0].id, 'sydney');
  assert.equal(filterPlaces('', 'all', 'street').length, 6);
  const search = new URL(mapsSearch('京都 神社 & 森林'));
  assert.equal(search.searchParams.get('query'), '京都 神社 & 森林');
  assert.equal(search.hostname, 'www.google.com');
});
test('travel history rejects malformed records and never accepts unknown destination IDs', () => {
  assert.equal(parseMemory('{').last, 'venice_sunset');
  assert.equal(parseMemory('x'.repeat(200001)).saved.length, 0);
  const parsed = parseMemory(
    JSON.stringify({
      saved: ['tokyo', 'tokyo', '<script>'],
      last: 'not-real',
      visits: [
        { id: 'paris', at: '2026-09-06T00:00:00Z' },
        { id: 'paris', at: '2026-09-05T00:00:00Z' },
        { id: 'bogus', at: '2026-09-06' },
        { id: 'tokyo', at: 'not-a-date' },
      ],
    }),
  );
  assert.deepEqual(parsed.saved, ['tokyo']);
  assert.equal(parsed.visits.length, 1);
  assert.equal(parsed.last, 'venice_sunset');
});
