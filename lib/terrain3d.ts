import * as THREE from 'three';
import { WIDTH, HEIGHT, COLS, ROWS, CELL, hash, type World } from './world.ts';
export const ELEVATION = 180;
export function terrainHeight(w: World, x: number, y: number) {
  const gx = Math.max(0, Math.min(COLS - 1, x / CELL));
  const gy = Math.max(0, Math.min(ROWS - 1, y / CELL));
  const ix = Math.floor(gx),
    iy = Math.floor(gy),
    fx = gx - ix,
    fy = gy - iy;
  const at = (dx: number, dy: number) =>
    w.terrain[Math.min(ROWS - 1, iy + dy) * COLS + Math.min(COLS - 1, ix + dx)];
  return (
    (fx + fy <= 1
      ? at(0, 0) + (at(1, 0) - at(0, 0)) * fx + (at(0, 1) - at(0, 0)) * fy
      : at(1, 1) +
        (at(0, 1) - at(1, 1)) * (1 - fx) +
        (at(1, 0) - at(1, 1)) * (1 - fy)) * ELEVATION
  );
}
export function createTerrainGeometry(w: World) {
  const geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT, COLS, ROWS);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++)
    p.setY(
      i,
      w.terrain[
        Math.min(ROWS - 1, Math.floor(i / (COLS + 1))) * COLS +
          Math.min(COLS - 1, i % (COLS + 1))
      ] * ELEVATION,
    );
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal'),
    colors = new Float32Array(p.count * 3);
  const sand = new THREE.Color('#bfb795'),
    grass = new THREE.Color('#64744a'),
    high = new THREE.Color('#556349'),
    rock = new THREE.Color('#8a8b80');
  const color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const h =
        w.terrain[
          Math.min(ROWS - 1, Math.floor(i / (COLS + 1))) * COLS +
            Math.min(COLS - 1, i % (COLS + 1))
        ],
      slope = 1 - normal.getY(i);
    color.copy(sand).lerp(grass, THREE.MathUtils.smoothstep(h, 0.085, 0.18));
    color.lerp(high, THREE.MathUtils.smoothstep(h, 0.26, 0.6) * 0.65);
    color.lerp(
      rock,
      THREE.MathUtils.smoothstep(slope, 0.16, 0.57) *
        THREE.MathUtils.smoothstep(h, 0.1, 0.24),
    );
    color.multiplyScalar(
      0.9 + hash(i % COLS, Math.floor(i / COLS), w.seed) * 0.17,
    );
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
