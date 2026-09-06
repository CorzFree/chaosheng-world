import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import {
  createWorld,
  COLS,
  WIDTH,
  HEIGHT,
  CELL,
  getHarbors,
  findRoute,
  update,
  setWeather,
  heightAt,
  seaLevel,
} from '../lib/world.ts';

const source = readFileSync(
  new URL('../lib/renderer3d.ts', import.meta.url),
  'utf8',
);
const moduleSource = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    "from 'three'",
    "from '" +
      new URL('../node_modules/three/build/three.module.js', import.meta.url)
        .href +
      "'",
  )
  .replace(
    "from './world'",
    "from '" + new URL('../lib/world.ts', import.meta.url).href + "'",
  );
const { createTerrainGeometry, terrainHeight, ELEVATION } = await import(
  'data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64')
);
function rayHeight(mesh, x, y) {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x - WIDTH / 2, 400, y - HEIGHT / 2),
    new THREE.Vector3(0, -1, 0),
  );
  return ray.intersectObject(mesh, false)[0]?.point.y;
}
test('three dimensional terrain agrees with ground sampling and covers all edges', () => {
  const w = createWorld(),
    geometry = createTerrainGeometry(w),
    material = new THREE.MeshBasicMaterial(),
    mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > 0);
  for (const [x, y] of [
    [0, 0],
    [600, 450],
    [733.2, 491.7],
    [1437, 450],
    [600, 957],
    [1439, 959],
  ]) {
    assert.ok(
      Math.abs(rayHeight(mesh, x, y) - terrainHeight(w, x, y)) < 0.0001,
      'ground/raycast mismatch at ' + x + ',' + y,
    );
  }
  geometry.dispose();
  material.dispose();
});
test('a sculpted saddle follows its actual triangles, not a bilinear patch', () => {
  const w = createWorld();
  w.terrain.fill(0);
  const i = 75 * COLS + 100;
  w.terrain[i] = 0.8;
  w.terrain[i + 1] = -0.3;
  w.terrain[i + COLS] = -0.3;
  w.terrain[i + COLS + 1] = 0.8;
  const geometry = createTerrainGeometry(w),
    material = new THREE.MeshBasicMaterial(),
    mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  assert.ok(Math.abs(terrainHeight(w, 603, 453) + 0.3 * ELEVATION) < 0.0001);
  assert.ok(
    Math.abs(rayHeight(mesh, 603, 453) - terrainHeight(w, 603, 453)) < 0.0001,
  );
  geometry.dispose();
  material.dispose();
});
test('land routes cannot cut a diagonal across water', () => {
  const w = createWorld();
  w.terrain.fill(-0.3);
  w.terrain[30 * COLS + 30] = 0.2;
  w.terrain[31 * COLS + 31] = 0.2;
  assert.equal(
    findRoute(w, { x: 183, y: 183 }, { x: 189, y: 189 }, 'land').length,
    0,
  );
  w.terrain[30 * COLS + 31] = 0.2;
  w.terrain[31 * COLS + 30] = 0.2;
  assert.ok(
    findRoute(w, { x: 183, y: 183 }, { x: 189, y: 189 }, 'land').length > 0,
  );
});
test('residents reach actual shade, rest, then return indoors when rain starts', () => {
  const w = createWorld();
  w.time = 12;
  let reached = false;
  for (let i = 0; i < 600; i++) {
    update(w, 0.1);
    reached ||= w.entities.some(
      (e) =>
        e.kind === 'home' &&
        e.activity === 'resting' &&
        e.purpose === 'shade' &&
        e.motion === 0 &&
        Math.hypot(e.targetX - e.x, e.targetY - e.y) > 8,
    );
  }
  assert.ok(reached, 'no resident reached shade');
  setWeather(w, 'rain');
  for (let i = 0; i < 800; i++) {
    update(w, 0.1);
    for (const e of w.entities)
      if (e.kind === 'home') assert.ok(heightAt(w, e.targetX, e.targetY) > 0.1);
  }
  assert.ok(
    w.entities
      .filter((e) => e.kind === 'home')
      .every((e) => e.activity === 'indoors'),
    'a resident did not return indoors',
  );
});
test('boats moor at a real harbor rather than merely pausing nearby', () => {
  const w = createWorld(),
    harbors = getHarbors(w);
  assert.ok(harbors.length >= 2);
  let moored = false;
  for (let i = 0; i < 8000 && !moored; i++) {
    update(w, 0.1);
    for (const e of w.entities)
      if (e.kind === 'boat') {
        assert.ok(heightAt(w, e.x, e.y) < seaLevel(w));
        if (
          e.activity === 'moored' &&
          e.destination &&
          harbors.some(
            (h) =>
              h.homeId === e.destination &&
              Math.hypot(e.x - h.x, e.y - h.y) < 1,
          )
        ) {
          moored = true;
          assert.equal(e.motion, 0);
        }
      }
  }
  assert.ok(moored, 'no boat reached a harbor');
});
