import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createCityWorld,
  cityMetrics,
  housingCapacity,
  jobCapacity,
  advanceCity,
  rezone,
  validateCityState,
  stepCity,
} from '../lib/city.ts';
import { serialize, deserialize } from '../lib/world.ts';
import { CityLayer } from '../lib/city-renderer.ts';
function smallCity() {
  const w = createCityWorld(1);
  w.city.nodes = [
    { id: 0, x: 600, y: 500 },
    { id: 1, x: 640, y: 500 },
  ];
  w.city.roads = [
    { id: 0, a: 0, b: 1, lanes: 2, enabled: true, bridge: false },
  ];
  w.city.parcels = [
    {
      id: 0,
      x: 600,
      y: 510,
      width: 35,
      depth: 35,
      zone: 'residential',
      floors: 1,
      plannedFloors: 1,
      residents: 100,
      node: 0,
      style: 0,
      progress: 0,
    },
    {
      id: 1,
      x: 640,
      y: 510,
      width: 35,
      depth: 23,
      zone: 'commercial',
      floors: 0,
      plannedFloors: 1,
      residents: 0,
      node: 1,
      style: 0,
      progress: 0,
    },
  ];
  w.city.facilities = [
    { id: 1, node: 0, kind: 'power', capacity: 100, x: 590, y: 500 },
    { id: 2, node: 0, kind: 'water', capacity: 14, x: 590, y: 510 },
  ];
  w.city.revision++;
  w.city.networkRevision++;
  return w;
}
test('city headline totals come from its parcels and matched commutes', () => {
  const w = createCityWorld(),
    m = cityMetrics(w);
  assert.equal(
    m.population,
    w.city.parcels.reduce((n, p) => n + p.residents, 0),
  );
  assert.equal(
    m.housing,
    w.city.parcels.reduce((n, p) => n + housingCapacity(p), 0),
  );
  assert.equal(
    m.jobs,
    w.city.parcels.reduce((n, p) => n + jobCapacity(p), 0),
  );
  assert.equal(
    m.employed,
    m.commutes.reduce((n, t) => n + t.workers, 0),
  );
  assert.equal(m.employment, 1);
  const outgoing = new Map(),
    incoming = new Map();
  for (const t of m.commutes) {
    outgoing.set(t.home, (outgoing.get(t.home) || 0) + t.workers);
    incoming.set(t.work, (incoming.get(t.work) || 0) + t.workers);
  }
  for (const [id, workers] of outgoing)
    assert.ok(workers <= Math.floor(w.city.parcels[id].residents * 0.5));
  for (const [id, workers] of incoming)
    assert.ok(workers <= jobCapacity(w.city.parcels[id]));
});
test('daily growth keeps fractional arrivals and agrees with a 30 day step', () => {
  const a = createCityWorld(),
    b = deserialize(serialize(a));
  for (let i = 0; i < 30; i++) advanceCity(a, 1);
  advanceCity(b, 30);
  assert.equal(cityMetrics(a).population, cityMetrics(b).population);
  assert.ok(cityMetrics(a).population > 29793);
  assert.doesNotThrow(() => deserialize(serialize(a)));
});
test('completed jobs consume utilities before admitting more residents', () => {
  const w = smallCity();
  advanceCity(w, 30);
  const m = cityMetrics(w);
  assert.equal(m.population, 100);
  assert.equal(m.employed, 50);
  assert.ok(m.powerDemand <= m.powerSupply + 1e-8);
  assert.ok(m.waterDemand <= m.waterSupply + 1e-8);
});
test('rezoning cannot delete residents when planned height is reduced', () => {
  const w = createCityWorld(),
    p = w.city.parcels[89];
  p.residents = housingCapacity(p);
  w.city.revision++;
  const before = p.residents;
  const response = rezone(w, 'residential', p.x, p.y);
  assert.ok(response);
  assert.equal(p.residents, before);
});
test('cutting the bridge removes cross-island commutes without removing people', () => {
  const w = createCityWorld();
  for (const p of w.city.parcels)
    if (p.node >= 225) {
      p.zone = 'residential';
      p.floors = 10;
      p.plannedFloors = 10;
      p.residents = housingCapacity(p);
    }
  w.city.revision++;
  const before = cityMetrics(w),
    cross = before.commutes.filter(
      (t) =>
        w.city.parcels[t.home].node < 225 !== w.city.parcels[t.work].node < 225,
    );
  assert.ok(cross.length > 0);
  const bridge = w.city.roads.find(
    (r) => r.bridge && (w.city.nodes[r.a].x > 900 || w.city.nodes[r.b].x > 900),
  );
  bridge.enabled = false;
  w.city.revision++;
  w.city.networkRevision++;
  const after = cityMetrics(w);
  assert.equal(after.population, before.population);
  assert.ok(after.employed < before.employed);
  assert.equal(
    after.commutes.filter(
      (t) =>
        w.city.parcels[t.home].node < 225 !== w.city.parcels[t.work].node < 225,
    ).length,
    0,
  );
  assert.ok(after.waterRate < 1);
});
test('an isolated power plant cannot supply the other component', () => {
  const w = smallCity();
  w.city.roads[0].enabled = false;
  w.city.facilities[0].node = 1;
  w.city.networkRevision++;
  w.city.revision++;
  assert.equal(cityMetrics(w).powerRate, 0);
  w.city.facilities[0].capacity = 1e6;
  w.city.revision++;
  assert.equal(cityMetrics(w).powerRate, 0);
});
test('normal simulation only settles city growth once per day', () => {
  const w = createCityWorld(),
    rev = w.city.revision;
  for (let i = 0; i < 100; i++) {
    w.time += 0.006;
    stepCity(w);
  }
  assert.equal(w.city.revision, rev);
  w.time += 24;
  stepCity(w);
  assert.ok(w.city.revision > rev);
});
test('malformed node references and overlarge geometry are rejected', () => {
  const w = createCityWorld();
  for (const mutate of [
    (c) => (c.roads[0].a = 'map'),
    (c) => (c.parcels[0].node = 'map'),
    (c) => (c.facilities[0].node = 'map'),
    (c) => (c.parcels[0].floors = 0.5),
  ]) {
    const data = JSON.parse(serialize(w));
    mutate(data.city);
    assert.throws(() => deserialize(JSON.stringify(data)));
  }
  const c = JSON.parse(serialize(w)).city;
  for (let i = 0; i < 70; i++)
    c.roads.push({
      id: c.roads.length,
      a: 0,
      b: 8,
      lanes: 1,
      enabled: true,
      bridge: false,
    });
  assert.throws(() => validateCityState(c));
});
test('new construction remains pickable after first clicking an empty city', () => {
  const w = createCityWorld(203706, true),
    layer = new CityLayer();
  layer.update(w, 0, 1, null);
  layer.group.updateMatrixWorld(true);
  const p = w.city.parcels.find((p) => p.zone !== 'park'),
    ray = new THREE.Raycaster(
      new THREE.Vector3(p.x - 720, 500, p.y - 480),
      new THREE.Vector3(0, -1, 0),
    );
  assert.equal(layer.pick(ray), null);
  p.floors = 12;
  p.plannedFloors = 12;
  w.city.revision++;
  layer.update(w, 1, 1, null);
  layer.group.updateMatrixWorld(true);
  assert.equal(layer.pick(ray), p.id);
  for (const object of layer.group.children)
    if (object.isInstancedMesh) {
      assert.ok(object.count <= object.instanceMatrix.count);
      assert.ok(
        Array.from(
          object.instanceMatrix.array.slice(0, object.count * 16),
        ).every(Number.isFinite),
      );
    }
  layer.dispose();
});
