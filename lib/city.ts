import {
  createWorld,
  entity,
  hash,
  log,
  WIDTH,
  HEIGHT,
  CELL,
  COLS,
  ROWS,
  clamp,
  findIslands,
  type World,
} from './world.ts';

export const CITY_SCALE = 2;
export type Zone =
  | 'residential'
  | 'commercial'
  | 'mixed'
  | 'industrial'
  | 'park';
export type CityTool = 'inspect' | Zone | 'road' | 'clear';
export type CityNode = { id: number; x: number; y: number };
export type CityRoad = {
  id: number;
  a: number;
  b: number;
  lanes: number;
  enabled: boolean;
  bridge: boolean;
  built?: boolean;
};
export type Parcel = {
  id: number;
  x: number;
  y: number;
  width: number;
  depth: number;
  zone: Zone;
  floors: number;
  plannedFloors: number;
  residents: number;
  node: number;
  style: number;
  progress: number;
  arrivalProgress?: number;
};
export type Facility = {
  id: number;
  node: number;
  kind: 'power' | 'water' | 'port';
  capacity: number;
  x: number;
  y: number;
};
export type CityState = {
  version: 1;
  revision: number;
  networkRevision: number;
  nodes: CityNode[];
  roads: CityRoad[];
  parcels: Parcel[];
  facilities: Facility[];
  metro: boolean;
  metroBuilt?: boolean;
  ageDays: number;
  lastClock: number;
};
export type CityWorld = World & { city: CityState };
export type Commute = {
  home: number;
  work: number;
  workers: number;
  edges: number[];
  nodes: number[];
  metro: boolean;
  minutes: number;
};
export type CityMetrics = {
  population: number;
  housing: number;
  jobs: number;
  employed: number;
  powerDemand: number;
  powerSupply: number;
  waterDemand: number;
  waterSupply: number;
  powerRate: number;
  waterRate: number;
  employment: number;
  commuteMinutes: number;
  metroShare: number;
  congestion: number;
  parks: number;
  buildings: number;
  construction: number;
  connected: number;
  commutes: Commute[];
  roadLoads: Map<number, number>;
  components: number[];
};
export const ZONES: Record<Zone, { name: string; color: string }> = {
  residential: { name: '住宅', color: '#a1b595' },
  commercial: { name: '商务', color: '#80aabe' },
  mixed: { name: '混合街区', color: '#c5a77e' },
  industrial: { name: '工业港区', color: '#9ca2ae' },
  park: { name: '公园', color: '#5f9167' },
};
export function isCity(w: World | null | undefined): w is CityWorld {
  return !!w?.city;
}
function smoothNoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy,
    u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  return (
    (hash(ix, iy, seed) * (1 - u) + hash(ix + 1, iy, seed) * u) * (1 - v) +
    (hash(ix, iy + 1, seed) * (1 - u) + hash(ix + 1, iy + 1, seed) * u) * v
  );
}
export function createCityWorld(seed = 203706, empty = false): CityWorld {
  const w = createWorld(seed) as CityWorld;
  w.entities = [];
  w.islands = [];
  w.logs = [];
  w.discoveries = [];
  w.time = 9.1;
  w.elapsed = 0;
  w.revision++;
  for (let iy = 0; iy < ROWS; iy++)
    for (let ix = 0; ix < COLS; ix++) {
      const x = ix * CELL,
        y = iy * CELL,
        dx = (x - 675) / 255,
        dy = (y - 474) / 413;
      const coast =
        0.16 -
        (dx * dx + dy * dy) * 0.18 +
        (smoothNoise(x / 92, y / 92, seed) - 0.5) * 0.044;
      let h = coast;
      // The city is built on a broad bedrock shelf; wilderness remains mountainous.
      if (x > 457 && x < 862 && y > 125 && y < 832)
        h = Math.max(
          h,
          0.122 + (smoothNoise(x / 250, y / 270, seed + 1) - 0.5) * 0.008,
        );
      for (const [cx, cy, rx, ry, peak] of [
        [240, 320, 175, 255, 0.62],
        [1100, 530, 175, 220, 0.37],
        [240, 790, 145, 105, 0.4],
        [1180, 160, 110, 90, 0.4],
      ]) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        h = Math.max(
          h,
          peak -
            d * (peak + 0.16) +
            (smoothNoise(x / 42, y / 47, seed + 7) - 0.5) * 0.05,
        );
      }
      if (x > 1008 && x < 1204 && y > 476 && y < 684)
        h = 0.12 + (smoothNoise(x / 240, y / 240, seed + 12) - 0.5) * 0.003;
      w.terrain[iy * COLS + ix] = clamp(h, -0.3, 0.8);
    }
  findIslands(w);
  const names = ['新曼哈顿', '西岸自然保护区', '东岸工坊', '南礁', '北岬'];
  w.islands.forEach(
    (island, index) => (island.name = names[index] ?? '离岸小岛'),
  );
  const nodes: CityNode[] = [],
    roads: CityRoad[] = [],
    parcels: Parcel[] = [];
  const cols = 9,
    rows = 25,
    x0 = 484,
    y0 = 141,
    sx = 43,
    sy = 27;
  const park = (x: number, y: number) =>
    x > 607 && x < 737 && y > 293 && y < 462;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      nodes.push({ id: nodes.length, x: x0 + c * sx, y: y0 + r * sy });
  const road = (a: number, b: number, lanes: number, bridge = false) => {
    const pa = nodes[a],
      pb = nodes[b];
    roads.push({
      id: roads.length,
      a,
      b,
      lanes,
      bridge,
      enabled:
        (!empty || Math.abs(pa.x - 656) < 4 || Math.abs(pb.x - 656) < 4) &&
        !park((pa.x + pb.x) / 2, (pa.y + pb.y) / 2),
    });
  };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const a = r * cols + c;
      if (r < rows - 1) road(a, a + cols, c % 3 === 1 ? 3 : 2);
      if (c < cols - 1) road(a, a + 1, r % 6 === 0 ? 3 : 1);
    }
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++)
      for (let section = 0; section < 4; section++) {
        const x = x0 + c * sx + 11 + (section % 2) * 20,
          y = y0 + r * sy + 8 + Math.floor(section / 2) * 11;
        const inPark = park(x, y),
          random = hash(c * 5 + section, r, seed),
          downtown = y > 626,
          midtown = y > 464 && y < 600;
        const zone: Zone = inPark
          ? 'park'
          : downtown
            ? random > 0.23
              ? 'commercial'
              : 'mixed'
            : midtown
              ? random > 0.55
                ? 'commercial'
                : 'mixed'
              : random > 0.85
                ? 'mixed'
                : 'residential';
        const towers = zone === 'commercial' && (downtown || midtown),
          distance = Math.abs(x - 688) / 190;
        const planned = inPark
          ? 0
          : towers
            ? Math.round(
                (downtown ? 30 : 22) +
                  (1 - distance) * (downtown ? 65 : 46) * random,
              )
            : Math.round(4 + random * (zone === 'mixed' ? 15 : 9));
        const floors = empty ? 0 : planned;
        parcels.push({
          id: parcels.length,
          x,
          y,
          width: 13 + hash(section, r + 4, seed) * 3,
          depth: 7 + hash(c, r + 31, seed) * 1.5,
          zone,
          floors,
          plannedFloors: planned,
          residents: 0,
          node: r * cols + c,
          style: Math.floor(random * 5),
          progress: 0,
        });
      }
  // Eastern borough, physically connected to the core by one working bridge.
  const eastStart = nodes.length;
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 5; c++)
      nodes.push({ id: nodes.length, x: 1020 + c * 38, y: 488 + r * 33 });
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 5; c++) {
      const n = eastStart + r * 5 + c;
      if (c < 4) road(n, n + 1, 2);
      if (r < 5) road(n, n + 5, 2);
    }
  road(14 * cols + 8, eastStart + 2 * 5, 4, true);
  const west = nodes.length;
  nodes.push({ id: west, x: 335, y: nodes[12 * cols].y });
  road(12 * cols, west, 3, true);
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 4; c++) {
      const x = 1020 + c * 38 + 19,
        y = 488 + r * 33 + 16.5,
        zone: Zone = r >= 3 ? 'industrial' : c < 2 ? 'residential' : 'mixed',
        floors =
          zone === 'industrial' ? 3 : 6 + Math.floor(hash(c, r, seed + 77) * 9);
      parcels.push({
        id: parcels.length,
        x,
        y,
        width: 27,
        depth: 23,
        zone,
        floors: empty ? 0 : floors,
        plannedFloors: floors,
        residents: 0,
        node: eastStart + r * 5 + c,
        style: Math.floor(hash(c, r, seed + 88) * 5),
        progress: 0,
      });
    }
  for (const road of roads) road.built = road.enabled;
  const facilities: Facility[] = [
    {
      id: 1,
      node: eastStart + 4 * 5 + 3,
      kind: 'power',
      capacity: 42000,
      x: 1188,
      y: 664,
    },
    { id: 2, node: 3 * cols, kind: 'water', capacity: 14000, x: 460, y: 230 },
    {
      id: 3,
      node: 23 * cols + 8,
      kind: 'port',
      capacity: 26000,
      x: 885,
      y: 770,
    },
    {
      id: 4,
      node: 22 * cols + 3,
      kind: 'power',
      capacity: 28000,
      x: 599,
      y: 820,
    },
  ];
  w.city = {
    version: 1,
    revision: 1,
    networkRevision: 1,
    nodes,
    roads,
    parcels,
    facilities,
    metro: !empty,
    metroBuilt: !empty,
    ageDays: empty ? 0 : 3650,
    lastClock: w.time,
  };
  // Preserve wild shores and one uninterrupted urban park.
  for (let i = 0; i < 4200 && w.entities.length < 430; i++) {
    const x = hash(i, 12, seed) * WIDTH,
      y = hash(i, 13, seed) * HEIGHT,
      h =
        w.terrain[
          Math.min(ROWS - 1, Math.floor(y / CELL)) * COLS +
            Math.min(COLS - 1, Math.floor(x / CELL))
        ];
    const urban = x > 447 && x < 887 && y > 110 && y < 850,
      eastUrban = x > 1000 && x < 1220 && y > 470 && y < 705;
    if (
      h > 0.11 &&
      h < 0.65 &&
      ((!urban && !eastUrban) || park(x, y) || empty) &&
      !w.entities.some((e) => Math.hypot(e.x - x, e.y - y) < 9)
    )
      entity(w, 'tree', x, y, 130 + hash(i, 51, seed) * 60);
  }
  if (!empty)
    for (const p of parcels)
      p.residents = Math.floor(
        housingCapacity(p) * (0.65 + hash(p.id, 91, seed) * 0.3),
      );
  clearConstructionTrees(w);
  const metrics = cityMetrics(w);
  if (!empty && metrics.powerRate < 1)
    for (const p of parcels)
      p.residents = Math.floor(p.residents * metrics.powerRate);
  log(
    w,
    empty
      ? '第一条通往港口的路，已经落在岛上。'
      : '清晨的新曼哈顿，开始了一天的通勤。',
    'life',
  );
  return w;
}
export function housingCapacity(p: Parcel) {
  return Math.floor(
    (p.width *
      p.depth *
      CITY_SCALE ** 2 *
      p.floors *
      0.75 *
      (p.zone === 'residential' ? 1 : p.zone === 'mixed' ? 0.65 : 0)) /
      35,
  );
}
export function jobCapacity(p: Parcel) {
  return Math.floor(
    (p.width *
      p.depth *
      CITY_SCALE ** 2 *
      p.floors *
      0.8 *
      (p.zone === 'commercial'
        ? 1
        : p.zone === 'mixed'
          ? 0.35
          : p.zone === 'industrial'
            ? 0.6
            : 0)) /
      (p.zone === 'industrial' ? 50 : 25),
  );
}
type Graph = {
  signature: string;
  adj: { to: number; edge: number; cost: number }[][];
  components: number[];
  paths: Map<
    number,
    { distance: Float64Array; parent: Int32Array; edge: Int32Array }
  >;
};
const graphCache = new WeakMap<CityState, Graph>();
function graph(city: CityState) {
  const signature = String(city.networkRevision),
    cached = graphCache.get(city);
  if (cached?.signature === signature) return cached;
  const adj: Graph['adj'] = Array.from({ length: city.nodes.length }, () => []);
  for (const r of city.roads)
    if (r.enabled) {
      const a = city.nodes[r.a],
        b = city.nodes[r.b],
        cost = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, r.lanes);
      adj[r.a].push({ to: r.b, edge: r.id, cost });
      adj[r.b].push({ to: r.a, edge: r.id, cost });
    }
  const components = Array(city.nodes.length).fill(-1);
  let component = 0;
  for (const node of city.nodes)
    if (components[node.id] === -1) {
      const queue = [node.id];
      components[node.id] = component;
      for (let i = 0; i < queue.length; i++)
        for (const edge of adj[queue[i]])
          if (components[edge.to] === -1) {
            components[edge.to] = component;
            queue.push(edge.to);
          }
      component++;
    }
  const g = { signature, adj, components, paths: new Map() };
  graphCache.set(city, g);
  return g;
}
function pathsFrom(city: CityState, g: Graph, start: number) {
  const prior = g.paths.get(start);
  if (prior) return prior;
  const n = city.nodes.length,
    distance = new Float64Array(n),
    parent = new Int32Array(n),
    edge = new Int32Array(n),
    seen = new Uint8Array(n);
  distance.fill(Infinity);
  parent.fill(-1);
  edge.fill(-1);
  distance[start] = 0;
  for (let i = 0; i < n; i++) {
    let best = -1;
    for (let j = 0; j < n; j++)
      if (!seen[j] && (best < 0 || distance[j] < distance[best])) best = j;
    if (best < 0 || !Number.isFinite(distance[best])) break;
    seen[best] = 1;
    for (const next of g.adj[best]) {
      const value = distance[best] + next.cost;
      if (value < distance[next.to]) {
        distance[next.to] = value;
        parent[next.to] = best;
        edge[next.to] = next.edge;
      }
    }
  }
  const result = { distance, parent, edge };
  g.paths.set(start, result);
  return result;
}
const metricsCache = new WeakMap<
  CityState,
  { revision: number; metrics: CityMetrics }
>();
export function cityMetrics(w: CityWorld): CityMetrics {
  const city = w.city,
    cached = metricsCache.get(city);
  if (cached?.revision === city.revision) return cached.metrics;
  const g = graph(city),
    commutes: Commute[] = [],
    roadLoads = new Map<number, number>(),
    remaining = new Map(city.parcels.map((p) => [p.id, jobCapacity(p)]));
  let population = 0,
    housing = 0,
    jobs = 0,
    employed = 0,
    weightedMinutes = 0,
    metroWorkers = 0,
    connected = 0;
  const powerSupply = new Map<number, number>(),
    waterSupply = new Map<number, number>(),
    powerDemand = new Map<number, number>(),
    waterDemand = new Map<number, number>();
  for (const f of city.facilities) {
    const component = g.components[f.node],
      map = f.kind === 'water' ? waterSupply : powerSupply;
    if (f.kind !== 'port')
      map.set(component, (map.get(component) || 0) + f.capacity);
  }
  const work = city.parcels.filter((p) => jobCapacity(p) > 0);
  for (const p of city.parcels) {
    population += p.residents;
    housing += housingCapacity(p);
    jobs += jobCapacity(p);
    const component = g.components[p.node];
    if (g.adj[p.node].length) connected++;
    powerDemand.set(
      component,
      (powerDemand.get(component) || 0) + p.residents * 0.6,
    );
    waterDemand.set(
      component,
      (waterDemand.get(component) || 0) + p.residents * 0.12,
    );
    let seeking = Math.floor(p.residents * 0.5);
    if (!seeking || !g.adj[p.node].length) continue;
    const paths = pathsFrom(city, g, p.node),
      destinations = work
        .filter(
          (job) =>
            remaining.get(job.id)! > 0 && g.components[job.node] === component,
        )
        .sort(
          (a, b) =>
            paths.distance[a.node] - paths.distance[b.node] || a.id - b.id,
        );
    for (const job of destinations) {
      if (!seeking) break;
      const workers = Math.min(seeking, remaining.get(job.id) || 0);
      if (!workers || !Number.isFinite(paths.distance[job.node])) continue;
      const edges: number[] = [],
        nodes = [job.node];
      let current = job.node;
      while (current !== p.node && current >= 0) {
        edges.unshift(paths.edge[current]);
        current = paths.parent[current];
        if (current >= 0) nodes.unshift(current);
      }
      if (current !== p.node) continue;
      const metro =
        city.metro &&
        Math.abs(p.x - 656) < 155 &&
        Math.abs(job.x - 656) < 155 &&
        Math.hypot(p.x - job.x, p.y - job.y) > 100;
      const distance = nodes
        .slice(1)
        .reduce(
          (sum, node, index) =>
            sum +
            Math.hypot(
              city.nodes[node].x - city.nodes[nodes[index]].x,
              city.nodes[node].y - city.nodes[nodes[index]].y,
            ) *
              CITY_SCALE,
          0,
        );
      const minutes = metro ? 4 + distance / 450 : 3 + distance / 210;
      commutes.push({
        home: p.id,
        work: job.id,
        workers,
        edges,
        nodes,
        metro,
        minutes,
      });
      for (const edge of edges)
        roadLoads.set(
          edge,
          (roadLoads.get(edge) || 0) + (workers * (metro ? 0.2 : 1)) / 2,
        );
      seeking -= workers;
      remaining.set(job.id, (remaining.get(job.id) || 0) - workers);
      employed += workers;
      weightedMinutes += workers * minutes;
      if (metro) metroWorkers += workers;
      powerDemand.set(
        component,
        (powerDemand.get(component) || 0) + workers * 0.8,
      );
      waterDemand.set(
        component,
        (waterDemand.get(component) || 0) + workers * 0.04,
      );
    }
  }
  let suppliedPower = 0,
    suppliedWater = 0,
    totalPower = 0,
    totalWater = 0;
  for (const [component, demand] of powerDemand) {
    totalPower += demand;
    suppliedPower += Math.min(demand, powerSupply.get(component) || 0);
  }
  for (const [component, demand] of waterDemand) {
    totalWater += demand;
    suppliedWater += Math.min(demand, waterSupply.get(component) || 0);
  }
  const loads = city.roads
    .filter((r) => r.enabled)
    .map((r) => (roadLoads.get(r.id) || 0) / (r.lanes * 700));
  const congestion = loads.length
    ? loads.reduce((a, b) => a + b, 0) / loads.length
    : 0;
  const metrics: CityMetrics = {
    population,
    housing,
    jobs,
    employed,
    powerDemand: totalPower,
    powerSupply: [...powerSupply.values()].reduce((a, b) => a + b, 0),
    waterDemand: totalWater,
    waterSupply: [...waterSupply.values()].reduce((a, b) => a + b, 0),
    powerRate: totalPower ? suppliedPower / totalPower : 1,
    waterRate: totalWater ? suppliedWater / totalWater : 1,
    employment: population
      ? employed /
        Math.max(
          1,
          city.parcels.reduce(
            (sum, p) => sum + Math.floor(p.residents * 0.5),
            0,
          ),
        )
      : 1,
    commuteMinutes: employed
      ? (weightedMinutes / employed) * (1 + 0.15 * Math.min(5, congestion) ** 4)
      : 0,
    metroShare: employed ? metroWorkers / employed : 0,
    congestion,
    parks: city.parcels
      .filter((p) => p.zone === 'park')
      .reduce((sum, p) => sum + p.width * p.depth * CITY_SCALE ** 2, 0),
    buildings: city.parcels.filter((p) => p.floors > 0 && p.zone !== 'park')
      .length,
    construction: city.parcels.filter((p) => p.plannedFloors > p.floors).length,
    connected,
    commutes,
    roadLoads,
    components: g.components,
  };
  metricsCache.set(city, { revision: city.revision, metrics });
  return metrics;
}
export function parcelAt(w: CityWorld, x: number, y: number) {
  return w.city.parcels.find(
    (p) =>
      Math.abs(x - p.x) < p.width / 2 + 2 &&
      Math.abs(y - p.y) < p.depth / 2 + 2,
  );
}
export function rezone(
  w: CityWorld,
  tool: CityTool,
  x: number,
  y: number,
): string | null {
  if (tool === 'inspect') return null;
  const city = w.city;
  if (tool === 'road') {
    const distance = (r: CityRoad) => {
      const a = city.nodes[r.a],
        b = city.nodes[r.b],
        dx = b.x - a.x,
        dy = b.y - a.y,
        t = clamp(
          ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy),
          0,
          1,
        );
      return Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
    };
    const target = [...city.roads].sort((a, b) => distance(a) - distance(b))[0];
    if (!target || distance(target) > 18)
      return '沿街道或桥梁点击，可以接通路网。';
    if (target.enabled) return null;
    target.enabled = true;
    target.built = true;
    city.networkRevision++;
    city.revision++;
    clearConstructionTrees(w);
    log(
      w,
      target.bridge
        ? '桥梁已接通，两岸的通勤重新开始。'
        : '新的路段接入了城市。',
      'you',
    );
    return null;
  }
  const p = parcelAt(w, x, y);
  if (!p) return '请在现有街区内选择一块地。';
  const zone = tool === 'clear' ? 'park' : tool;
  if (p.zone === zone && tool !== 'clear') return null;
  if (p.residents > 0 && zone !== 'residential' && zone !== 'mixed')
    return '这栋楼还有居民。请先改建空置地块，或选择混合街区。';
  const planned =
    zone === 'park'
      ? 0
      : zone === 'commercial'
        ? 32
        : zone === 'mixed'
          ? 16
          : zone === 'industrial'
            ? 4
            : 12;
  const finalFloors = zone === 'park' ? 0 : Math.min(p.floors, planned);
  if (p.residents > housingCapacity({ ...p, zone, floors: finalFloors }))
    return '现有居民需要足够的住房，请先扩建住宅，再调整这块地。';
  p.zone = zone;
  p.plannedFloors = planned;
  p.floors = zone === 'park' ? 0 : Math.min(p.floors, p.plannedFloors);
  p.residents = Math.min(p.residents, housingCapacity(p));
  p.progress = 0;
  city.revision++;
  log(w, '街区 ' + p.id + ' 已规划为' + ZONES[zone].name + '。', 'you');
  return null;
}
export function advanceCity(w: CityWorld, days: number) {
  if (!Number.isFinite(days) || days <= 0) return;
  const city = w.city,
    metrics = cityMetrics(w),
    g = graph(city),
    serviceNodes = new Set(
      city.facilities
        .filter((f) => f.kind === 'power')
        .map((f) => g.components[f.node]),
    ),
    waterNodes = new Set(
      city.facilities
        .filter((f) => f.kind === 'water')
        .map((f) => g.components[f.node]),
    );
  city.ageDays += days;
  for (const p of city.parcels) {
    const connected =
      g.adj[p.node].length > 0 &&
      serviceNodes.has(g.components[p.node]) &&
      waterNodes.has(g.components[p.node]);
    if (connected && p.zone !== 'park' && p.floors < p.plannedFloors) {
      p.progress += days / 10;
      const floors = Math.min(
        p.plannedFloors - p.floors,
        Math.floor(p.progress + 1e-9),
      );
      p.floors += floors;
      p.progress = Math.max(0, p.progress - floors);
    }
  }
  city.revision++;
  const budgets = new Map<
    number,
    { jobs: number; power: number; water: number }
  >();
  const budget = (component: number) => {
    let b = budgets.get(component);
    if (!b) {
      b = { jobs: 0, power: 0, water: 0 };
      budgets.set(component, b);
    }
    return b;
  };
  for (const f of city.facilities) {
    const b = budget(g.components[f.node]);
    if (f.kind === 'power') b.power += f.capacity;
    if (f.kind === 'water') b.water += f.capacity;
  }
  for (const p of city.parcels) {
    const b = budget(g.components[p.node]);
    b.jobs += jobCapacity(p);
    b.power -= p.residents * 0.6;
    b.water -= p.residents * 0.12;
  }
  for (const trip of cityMetrics(w).commutes) {
    const b = budget(g.components[city.parcels[trip.home].node]);
    b.jobs -= trip.workers;
    b.power -= trip.workers * 0.8;
    b.water -= trip.workers * 0.04;
  }
  for (const p of city.parcels) {
    const capacity = housingCapacity(p),
      b = budget(g.components[p.node]);
    if (p.residents >= capacity || !g.adj[p.node].length) continue;
    p.arrivalProgress = Math.min(
      capacity - p.residents,
      (p.arrivalProgress || 0) + (Math.max(2, capacity * 0.04) * days) / 30,
    );
    const incoming = Math.max(
      0,
      Math.floor(
        Math.min(
          capacity - p.residents,
          p.arrivalProgress,
          b.jobs * 2,
          b.power,
          b.water / 0.14,
        ) + 1e-9,
      ),
    );
    p.arrivalProgress = Math.max(0, p.arrivalProgress - incoming);
    p.residents += incoming;
    b.jobs -= incoming * 0.5;
    b.power -= incoming;
    b.water -= incoming * 0.14;
  }
  clearConstructionTrees(w);
  city.revision++;
}
export function stepCity(w: CityWorld) {
  if (w.time < w.city.lastClock) w.city.lastClock = w.time;
  const delta = Math.floor(Math.max(0, w.time - w.city.lastClock) / 24);
  if (delta) {
    w.city.lastClock += delta * 24;
    advanceCity(w, delta);
  }
}
export function setMetro(w: CityWorld, enabled: boolean) {
  w.city.metro = enabled;
  if (enabled) w.city.metroBuilt = true;
  w.city.revision++;
  log(
    w,
    enabled
      ? '地铁恢复运行，地面车流开始分担。'
      : '地铁暂停，通勤转向地面道路。',
    'you',
  );
}
export function validateCityState(data: unknown): asserts data is CityState {
  const c = data as CityState,
    finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  if (
    !c ||
    c.version !== 1 ||
    !Array.isArray(c.nodes) ||
    c.nodes.length > 800 ||
    !c.nodes.length ||
    !Array.isArray(c.roads) ||
    c.roads.length > 1800 ||
    !Array.isArray(c.parcels) ||
    c.parcels.length > 1400 ||
    !Array.isArray(c.facilities) ||
    c.facilities.length > 30 ||
    !finite(c.ageDays) ||
    c.ageDays < 0 ||
    c.ageDays > 1e6 ||
    !finite(c.lastClock) ||
    c.lastClock < 0 ||
    c.lastClock > 1e8 ||
    typeof c.metro !== 'boolean' ||
    (c.metroBuilt !== undefined && typeof c.metroBuilt !== 'boolean') ||
    !Number.isSafeInteger(c.revision) ||
    !Number.isSafeInteger(c.networkRevision)
  )
    throw new Error('城市海图的数据不完整。');
  for (const [n, node] of c.nodes.entries())
    if (
      node.id !== n ||
      !finite(node.x) ||
      !finite(node.y) ||
      node.x < 0 ||
      node.x > WIDTH ||
      node.y < 0 ||
      node.y > HEIGHT
    )
      throw new Error('城市路网坐标无效。');
  for (const [i, r] of c.roads.entries())
    if (
      r.id !== i ||
      !Number.isInteger(r.a) ||
      !Number.isInteger(r.b) ||
      r.a < 0 ||
      r.b < 0 ||
      r.a >= c.nodes.length ||
      r.b >= c.nodes.length ||
      !c.nodes[r.a] ||
      !c.nodes[r.b] ||
      r.a === r.b ||
      !Number.isInteger(r.lanes) ||
      r.lanes < 1 ||
      r.lanes > 8 ||
      typeof r.enabled !== 'boolean' ||
      typeof r.bridge !== 'boolean' ||
      (r.built !== undefined && typeof r.built !== 'boolean')
    )
      throw new Error('城市道路记录无效。');
  for (const [i, p] of c.parcels.entries())
    if (
      p.id !== i ||
      !Object.hasOwn(ZONES, p.zone) ||
      !Number.isInteger(p.node) ||
      p.node < 0 ||
      p.node >= c.nodes.length ||
      !c.nodes[p.node] ||
      ![
        'x',
        'y',
        'width',
        'depth',
        'floors',
        'plannedFloors',
        'residents',
        'style',
        'progress',
      ].every((k) => finite(p[k as keyof Parcel])) ||
      p.x < 0 ||
      p.x > WIDTH ||
      p.y < 0 ||
      p.y > HEIGHT ||
      p.width <= 0 ||
      p.width > 80 ||
      p.depth <= 0 ||
      p.depth > 80 ||
      !Number.isInteger(p.floors) ||
      !Number.isInteger(p.plannedFloors) ||
      !Number.isInteger(p.residents) ||
      !Number.isInteger(p.style) ||
      p.floors < 0 ||
      p.floors > 130 ||
      p.plannedFloors < 0 ||
      p.plannedFloors > 130 ||
      p.residents < 0 ||
      p.residents > housingCapacity(p) ||
      p.progress < 0 ||
      p.progress > 1000 ||
      p.style < 0 ||
      p.style > 4 ||
      (p.arrivalProgress !== undefined &&
        (!finite(p.arrivalProgress) ||
          p.arrivalProgress < 0 ||
          p.arrivalProgress > 100000))
    )
      throw new Error('城市地块记录无效。');
  const roadInstances = c.roads.reduce(
    (sum, r) =>
      sum +
      (r.bridge
        ? 22
        : Math.max(
            1,
            Math.ceil(
              Math.hypot(
                c.nodes[r.a].x - c.nodes[r.b].x,
                c.nodes[r.a].y - c.nodes[r.b].y,
              ) / 18,
            ),
          )),
    0,
  );
  if (roadInstances > 2000)
    throw new Error('城市道路太密，超过当前海图的绘制容量。');
  for (const f of c.facilities)
    if (
      !Number.isInteger(f.node) ||
      f.node < 0 ||
      f.node >= c.nodes.length ||
      !c.nodes[f.node] ||
      !['power', 'water', 'port'].includes(f.kind) ||
      !finite(f.capacity) ||
      f.capacity < 0 ||
      f.capacity > 1e7 ||
      !finite(f.x) ||
      !finite(f.y) ||
      f.x < 0 ||
      f.x > WIDTH ||
      f.y < 0 ||
      f.y > HEIGHT
    )
      throw new Error('城市设施记录无效。');
}

export function clearConstructionTrees(w: CityWorld) {
  const built = w.city.parcels.filter((p) => p.floors > 0 && p.zone !== 'park'),
    roads = w.city.roads.filter((r) => r.enabled);
  w.entities = w.entities.filter((e) => {
    if (e.kind !== 'tree') return true;
    if (
      built.some(
        (p) =>
          Math.abs(e.x - p.x) < p.width / 2 + 1 &&
          Math.abs(e.y - p.y) < p.depth / 2 + 1,
      )
    )
      return false;
    return !roads.some((r) => {
      const a = w.city.nodes[r.a],
        b = w.city.nodes[r.b],
        dx = b.x - a.x,
        dy = b.y - a.y,
        t = clamp(
          ((e.x - a.x) * dx + (e.y - a.y) * dy) / (dx * dx + dy * dy),
          0,
          1,
        );
      return (
        Math.hypot(e.x - a.x - dx * t, e.y - a.y - dy * t) <
        r.lanes * 0.75 + 1.4
      );
    });
  });
}
export function setEastBridge(w: CityWorld, enabled: boolean) {
  const road = w.city.roads.find(
    (r) => r.bridge && (w.city.nodes[r.a].x > 900 || w.city.nodes[r.b].x > 900),
  );
  if (!road || road.enabled === enabled) return;
  road.enabled = enabled;
  if (enabled) road.built = true;
  w.city.networkRevision++;
  w.city.revision++;
  log(
    w,
    enabled
      ? '东桥恢复通行，两岸的岗位与管线重新连通。'
      : '东桥已封闭，跨岛通勤和管线服务正在重新分配。',
    'you',
  );
}
export function eastBridgeOpen(w: CityWorld) {
  return !!w.city.roads.find(
    (r) => r.bridge && (w.city.nodes[r.a].x > 900 || w.city.nodes[r.b].x > 900),
  )?.enabled;
}
