import type { PanoramaPose } from './panorama-viewer';
export type Coordinates = [number, number];
const rad = Math.PI / 180;
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
export function directionFor(yaw: number, pitch: number) {
  const y = yaw * rad,
    p = pitch * rad;
  return [-Math.cos(p) * Math.cos(y), Math.sin(p), -Math.cos(p) * Math.sin(y)];
}
export function angularDistance(
  a: { yaw: number; pitch: number },
  b: { yaw: number; pitch: number },
) {
  const av = directionFor(a.yaw, a.pitch),
    bv = directionFor(b.yaw, b.pitch);
  return (
    Math.acos(
      clamp(
        av.reduce((sum, value, i) => sum + value * bv[i], 0),
        -1,
        1,
      ),
    ) / rad
  );
}
export function projectSphericalSpot(
  spot: { yaw: number; pitch: number },
  pose: PanoramaPose,
  aspect: number,
) {
  if (!Number.isFinite(aspect) || aspect <= 0) return null;
  const point = directionFor(spot.yaw, spot.pitch),
    forward = directionFor(pose.yaw, pose.pitch);
  const y = pose.yaw * rad,
    p = pose.pitch * rad;
  const right = [Math.sin(y), 0, -Math.cos(y)],
    up = [Math.sin(p) * Math.cos(y), Math.cos(p), Math.sin(p) * Math.sin(y)];
  const dot = (a: number[], b: number[]) =>
    a.reduce((sum, v, i) => sum + v * b[i], 0);
  const depth = dot(point, forward);
  if (depth <= 0) return null;
  const tangent = Math.tan((pose.fov * rad) / 2);
  const nx = dot(point, right) / (depth * tangent * aspect),
    ny = dot(point, up) / (depth * tangent);
  if (Math.abs(nx) > 1 || Math.abs(ny) > 1) return null;
  return { x: (nx + 1) / 2, y: (1 - ny) / 2 };
}
export function validCoordinates(value: unknown): value is Coordinates {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    Math.abs(value[0]) <= 90 &&
    Math.abs(value[1]) <= 180
  );
}
export function distanceKm(a: Coordinates, b: Coordinates) {
  if (!validCoordinates(a) || !validCoordinates(b))
    throw new Error('Invalid coordinates.');
  const dlat = (b[0] - a[0]) * rad,
    dlon = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dlon / 2) ** 2;
  return (
    6371.0088 *
    2 *
    Math.atan2(Math.sqrt(clamp(h, 0, 1)), Math.sqrt(1 - clamp(h, 0, 1)))
  );
}
export function guessScore(km: number) {
  if (!Number.isFinite(km) || km < 0) throw new Error('Invalid distance.');
  return Math.round(5000 * Math.exp(-km / 2000));
}
export function pointCoordinates(point: {
  x: number;
  y: number;
  z: number;
}): Coordinates {
  const length = Math.hypot(point.x, point.y, point.z);
  if (!Number.isFinite(length) || length < 1e-9)
    throw new Error('Invalid globe point.');
  return [
    Math.asin(clamp(point.y / length, -1, 1)) / rad,
    Math.atan2(-point.z, point.x) / rad,
  ];
}
export function formatCoordinates(coords: Coordinates) {
  return (
    Math.abs(coords[0]).toFixed(1) +
    '°' +
    (coords[0] < 0 ? 'S' : 'N') +
    ' / ' +
    Math.abs(coords[1]).toFixed(1) +
    '°' +
    (coords[1] < 0 ? 'W' : 'E')
  );
}
export function formatDistance(km: number) {
  return km < 1
    ? Math.round(km * 1000) + ' 米'
    : Math.round(km).toLocaleString('zh-CN') + ' 公里';
}
export function shuffledRoundIds(
  ids: string[],
  random: () => number = Math.random,
) {
  const pool = [...new Set(ids)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5);
}

export function inDiscoveryReticle(
  spot: { yaw: number; pitch: number; radius: number },
  pose: PanoramaPose,
  viewport: { width: number; height: number },
) {
  const { width, height } = viewport;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return false;
  const point = projectSphericalSpot(spot, pose, width / height);
  return (
    !!point &&
    angularDistance(spot, pose) <= spot.radius &&
    Math.abs(point.x - 0.5) * width <= 58 &&
    Math.abs(point.y - 0.5) * height <= 58
  );
}
