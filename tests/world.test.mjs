import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld,
  findIslands,
  paint,
  random,
  entity,
  statistics,
  finishStroke,
  update,
  setWeather,
  serialize,
  deserialize,
  heightAt,
  seaLevel,
  COLS,
  WIDTH,
  HEIGHT,
} from '../lib/world.ts';
function empty() {
  const w = createWorld();
  w.terrain.fill(-0.3);
  w.entities = [];
  w.islands = [];
  return w;
}
function rect(w, x, y, width, height, value = 0.2) {
  for (let gy = y; gy < y + height; gy++)
    for (let gx = x; gx < x + width; gx++) w.terrain[gy * COLS + gx] = value;
}
test('repeatable finite worlds including uint32 overflow', () => {
  for (const seed of [1, 7, 821706, 2 ** 32]) {
    const a = createWorld(seed),
      b = createWorld(seed);
    assert.deepEqual(a, b);
    assert.ok(a.entities.filter((e) => e.kind === 'tree').length > 20);
    assert.ok(Array.from(a.terrain).every(Number.isFinite));
    assert.ok(Array.from({ length: 8 }, () => random(a)).some((n) => n !== 0));
  }
});
test('new neighbour does not steal old island name', () => {
  const w = empty();
  rect(w, 40, 20, 8, 8);
  findIslands(w);
  const original = { ...w.islands[0] };
  rect(w, 20, 20, 8, 8);
  findIslands(w);
  assert.equal(w.islands.find((i) => i.x === original.x).name, original.name);
});
test('erosion retains surviving island name', () => {
  const w = empty();
  rect(w, 20, 20, 120, 8);
  findIslands(w);
  const name = w.islands[0].name;
  rect(w, 20, 20, 60, 8, -0.3);
  findIslands(w);
  assert.equal(w.islands[0].name, name);
});
test('fallback island names stay unique after extensive edits', () => {
  const w = empty();
  for (let i = 0; i < 14; i++) rect(w, 6 + i * 15, 20, 6, 6);
  findIslands(w);
  for (let i = 0; i < 12; i++) rect(w, 6 + i * 15, 20, 6, 6, -0.3);
  for (let i = 0; i < 11; i++) rect(w, 6 + i * 15, 100, 6, 6);
  findIslands(w);
  assert.equal(new Set(w.islands.map((i) => i.name)).size, w.islands.length);
});
test('brush stroke refreshes geography and restores exactly', () => {
  const w = empty(),
    saved = serialize(w),
    before = statistics(w);
  for (let i = 0; i < 6; i++) paint(w, 'land', 600, 450, 70);
  finishStroke(w, 'land', before);
  assert.equal(w.islands.length, 1);
  assert.ok(w.discoveries.includes('first_island'));
  assert.equal(deserialize(saved).islands.length, 0);
  assert.deepEqual(
    Array.from(deserialize(saved).terrain),
    Array.from(empty().terrain),
  );
});
test('trees and houses reject sea and occupied ground', () => {
  const w = empty();
  assert.ok(paint(w, 'home', 600, 450, 55));
  assert.ok(paint(w, 'tree', 600, 450, 55));
  rect(w, 80, 60, 30, 30);
  assert.equal(paint(w, 'home', 600, 450, 55), null);
  assert.ok(paint(w, 'home', 601, 450, 55));
  assert.ok(paint(w, 'boat', 600, 450, 55));
  assert.equal(statistics(w).homes, 1);
});
test('rain grows trees 2.8 times faster and records maturity', () => {
  const a = empty();
  rect(a, 80, 60, 30, 30);
  entity(a, 'tree', 600, 450, 70);
  const b = deserialize(serialize(a));
  setWeather(b, 'rain');
  for (let i = 0; i < 100; i++) {
    update(a, 0.1);
    update(b, 0.1);
  }
  assert.ok(
    Math.abs((b.entities[0].age - 70) / (a.entities[0].age - 70) - 2.8) < 1e-7,
  );
  assert.ok(b.discoveries.includes('rain'));
});
test('simulation is independent of frame partitions', () => {
  const a = createWorld(),
    b = createWorld();
  for (let i = 0; i < 1000; i++) update(a, 0.01);
  for (let i = 0; i < 100; i++) update(b, 0.1);
  assert.ok(Math.abs(a.elapsed - b.elapsed) < 1e-8);
  assert.deepEqual(a.entities, b.entities);
});
test('valid near-shore boats do not move on reload', () => {
  const w = empty();
  w.time = 3;
  w.terrain[75 * COLS + 100] = 0.036;
  assert.equal(paint(w, 'boat', 600, 450, 55), null);
  const loaded = deserialize(serialize(w));
  assert.deepEqual(loaded.entities, w.entities);
});
test('boats cannot remain in an all-land world after ebb', () => {
  const w = empty();
  w.terrain.fill(0.032);
  w.time = 3;
  entity(w, 'boat', 720, 480);
  for (let i = 0; i < 800; i++) update(w, 0.1);
  assert.ok(
    w.entities
      .filter((e) => e.kind === 'boat')
      .every((e) => heightAt(w, e.x, e.y) < seaLevel(w)),
  );
});
test('five seeds stay navigable across 18 days each', () => {
  for (const seed of [1, 7, 14, 821706, 2 ** 32]) {
    const w = createWorld(seed);
    for (let i = 0; i < 72000; i++) {
      if (i % 9000 === 0) setWeather(w, i % 18000 === 0 ? 'rain' : 'mist');
      update(w, 0.1);
      for (const e of w.entities)
        if (e.kind === 'boat') {
          assert.ok(
            heightAt(w, e.x, e.y) < seaLevel(w),
            'boat on land: ' + seed,
          );
          assert.ok(e.x >= 0 && e.x < WIDTH && e.y >= 0 && e.y < HEIGHT);
        }
    }
    assert.ok(
      w.entities.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)),
    );
    const loaded = deserialize(serialize(w));
    assert.deepEqual(loaded.entities, w.entities);
    assert.deepEqual(loaded.islands, w.islands);
  }
});
test('malformed saves and oversized counters cannot damage next save', () => {
  const good = serialize(createWorld());
  for (const text of ['{', '{}', 'x'.repeat(2_500_001)])
    assert.throws(() => deserialize(text));
  for (const mutate of [
    (d) => (d.version = 99),
    (d) => (d.terrain[4] = null),
    (d) => d.terrain.pop(),
    (d) => (d.id = 1e100),
    (d) => (d.entities[0].id = 1e100),
    (d) => (d.elapsed = 1e100),
    (d) => (d.entities[0].x = WIDTH),
    (d) => (d.entities[0].variant = 5),
    (d) => (d.entities[1].id = d.entities[0].id),
  ]) {
    const d = JSON.parse(good);
    mutate(d);
    assert.throws(() => deserialize(JSON.stringify(d)));
  }
  const d = JSON.parse(good);
  d.logs[0].id = 1e100;
  const w = deserialize(JSON.stringify(d));
  entity(w, 'lantern', 100, 100);
  entity(w, 'lantern', 150, 100);
  assert.doesNotThrow(() => deserialize(serialize(w)));
});
