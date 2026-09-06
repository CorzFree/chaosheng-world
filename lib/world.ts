export const WIDTH = 1440,
  HEIGHT = 960,
  CELL = 6,
  COLS = WIDTH / CELL,
  ROWS = HEIGHT / CELL;
export type Tool =
  | 'look'
  | 'land'
  | 'tree'
  | 'home'
  | 'boat'
  | 'lantern'
  | 'water';
export type Weather = 'clear' | 'rain' | 'mist';
export type Entity = {
  id: number;
  kind: 'tree' | 'home' | 'boat' | 'lantern';
  x: number;
  y: number;
  age: number;
  angle: number;
  variant: number;
  targetX: number;
  targetY: number;
  rest: number;
};
export type Island = {
  name: string;
  x: number;
  y: number;
  area: number;
  cells: number[];
};
export type Entry = {
  id: number;
  day: number;
  hour: number;
  text: string;
  kind: 'nature' | 'life' | 'you' | 'discovery';
};
export type World = {
  version: 1;
  seed: number;
  rng: number;
  terrain: Float32Array;
  entities: Entity[];
  islands: Island[];
  time: number;
  weather: Weather;
  weatherLeft: number;
  elapsed: number;
  id: number;
  revision: number;
  logs: Entry[];
  discoveries: string[];
  planted: number;
  grown: number;
  rainGrowth: boolean;
  tickAccumulator: number;
};
export const ISLAND_NAMES = [
  '听潮屿',
  '眠风岛',
  '青螺洲',
  '微雨汀',
  '晚灯湾',
  '归舟岛',
  '星泊屿',
  '云栖洲',
  '萤火汀',
  '白露岛',
  '南风屿',
  '小满洲',
];
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export function hash(x: number, y: number, seed: number) {
  let n =
    Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1447);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function random(w: World) {
  let n = w.rng;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  w.rng = n >>> 0;
  return w.rng / 4294967296;
}
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let u = x - ix,
    v = y - iy;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  return (
    (hash(ix, iy, seed) * (1 - u) + hash(ix + 1, iy, seed) * u) * (1 - v) +
    (hash(ix, iy + 1, seed) * (1 - u) + hash(ix + 1, iy + 1, seed) * u) * v
  );
}
export function heightAt(w: World, x: number, y: number) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x >= WIDTH ||
    y >= HEIGHT
  )
    return -1;
  return w.terrain[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)];
}
export function seaLevel(w: World) {
  return 0.05 + Math.sin((w.time / 24) * Math.PI * 4) * 0.023;
}
export function hour(w: World) {
  return ((w.time % 24) + 24) % 24;
}
export function day(w: World) {
  return Math.floor(w.time / 24) + 1;
}
export function nightAmount(w: World) {
  return clamp((Math.cos((hour(w) / 24) * Math.PI * 2) + 0.05) * 1.5, 0, 0.78);
}
export function log(w: World, text: string, kind: Entry['kind'] = 'nature') {
  if (w.logs[0]?.text === text) return;
  w.logs.unshift({ id: w.id++, day: day(w), hour: hour(w), text, kind });
  w.logs = w.logs.slice(0, 80);
}
export function entity(
  w: World,
  kind: Entity['kind'],
  x: number,
  y: number,
  age = 0,
): Entity {
  const e = {
    id: w.id++,
    kind,
    x,
    y,
    age,
    angle: random(w) * Math.PI * 2,
    variant: Math.floor(random(w) * 4),
    targetX: x,
    targetY: y,
    rest: 0,
  };
  w.entities.push(e);
  return e;
}
export function findIslands(w: World) {
  const seen = new Uint8Array(COLS * ROWS),
    islands: Island[] = [],
    old = w.islands;
  const priorCells = new Map<number, number>();
  old.forEach((o, index) =>
    (o.cells ?? []).forEach((cell) => priorCells.set(cell, index)),
  );
  const candidates: { next: number; old: number; score: number }[] = [];
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || w.terrain[i] < 0.11) continue;
    const q = [i];
    seen[i] = 1;
    let sx = 0,
      sy = 0;
    const overlaps = new Map<number, number>();
    for (let head = 0; head < q.length; head++) {
      const n = q[head],
        x = n % COLS,
        y = Math.floor(n / COLS);
      sx += x;
      sy += y;
      const prior = priorCells.get(n);
      if (prior !== undefined)
        overlaps.set(prior, (overlaps.get(prior) || 0) + 1);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ni = ny * COLS + nx;
        if (!seen[ni] && w.terrain[ni] >= 0.11) {
          seen[ni] = 1;
          q.push(ni);
        }
      }
    }
    if (q.length > 30) {
      const index = islands.length;
      islands.push({
        name: '',
        x: (sx / q.length) * CELL,
        y: (sy / q.length) * CELL,
        area: q.length,
        cells: q,
      });
      for (const [prior, count] of overlaps)
        candidates.push({ next: index, old: prior, score: count });
    }
  }
  const usedOld = new Set<number>(),
    usedNames = new Set<string>();
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    if (
      islands[c.next].name ||
      usedOld.has(c.old) ||
      usedNames.has(old[c.old].name)
    )
      continue;
    islands[c.next].name = old[c.old].name;
    usedOld.add(c.old);
    usedNames.add(old[c.old].name);
  }
  for (const island of islands) {
    if (island.name) continue;
    let name = ISLAND_NAMES.find((n) => !usedNames.has(n));
    if (!name) {
      let n = 1;
      while (usedNames.has('无名屿 ' + n)) n++;
      name = '无名屿 ' + n;
    }
    island.name = name;
    usedNames.add(name);
  }
  w.islands = islands.sort((a, b) => b.area - a.area);
}
export function createWorld(seed = 821706): World {
  const w: World = {
    version: 1,
    seed,
    rng: seed >>> 0 || 1,
    terrain: new Float32Array(COLS * ROWS),
    entities: [],
    islands: [],
    time: 8.5,
    weather: 'clear',
    weatherLeft: 0,
    elapsed: 0,
    id: 1,
    revision: 1,
    logs: [],
    discoveries: [],
    planted: 0,
    grown: 0,
    rainGrowth: false,
    tickAccumulator: 0,
  };
  const centers = [
    [0.35, 0.42, 0.17, 0.23],
    [0.68, 0.32, 0.12, 0.14],
    [0.69, 0.72, 0.15, 0.13],
    [0.29, 0.78, 0.085, 0.085],
    [0.16, 0.21, 0.07, 0.08],
    [0.83, 0.53, 0.055, 0.06],
  ].map(([x, y, rx, ry]) => [
    x + (random(w) - 0.5) * 0.06,
    y + (random(w) - 0.5) * 0.07,
    rx,
    ry,
  ]);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const u = x / COLS,
        v = y / ROWS;
      let h = -0.22;
      for (const [cx, cy, rx, ry] of centers) {
        const dx = (u - cx) / rx,
          dy = (v - cy) / ry;
        h = Math.max(h, 0.55 - (dx * dx + dy * dy) * 0.48);
      }
      h +=
        (noise(x / 13, y / 13, seed) - 0.5) * 0.22 +
        (noise(x / 5, y / 5, seed + 13) - 0.5) * 0.065;
      w.terrain[y * COLS + x] = clamp(h, -0.3, 0.85);
    }
  findIslands(w);
  for (let i = 0; i < 1800 && w.entities.length < 125; i++) {
    const x = random(w) * WIDTH,
      y = random(w) * HEIGHT;
    if (
      heightAt(w, x, y) > 0.15 &&
      !w.entities.some((e) => Math.hypot(e.x - x, e.y - y) < 20)
    )
      entity(w, 'tree', x, y, 80 + random(w) * 100);
  }
  for (const island of w.islands.slice(0, 3)) {
    for (let i = 0; i < 80; i++) {
      const x = island.x + (random(w) - 0.5) * 150,
        y = island.y + (random(w) - 0.5) * 130;
      if (heightAt(w, x, y) > 0.12 && heightAt(w, x, y) < 0.4) {
        w.entities = w.entities.filter(
          (e) => Math.hypot(e.x - x, e.y - y) > 24,
        );
        entity(w, 'home', x, y, 200);
        break;
      }
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = WIDTH * (0.48 + i * 0.07),
      y = HEIGHT * (0.63 - i * 0.1);
    if (heightAt(w, x, y) < -0.02) entity(w, 'boat', x, y, 30);
  }
  log(w, '几座小岛，在潮声里醒来了。');
  return w;
}
export function paint(
  w: World,
  tool: Tool,
  x: number,
  y: number,
  radius: number,
): string | null {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x >= WIDTH ||
    y >= HEIGHT
  )
    return null;
  if (tool === 'land' || tool === 'water') {
    const r = clamp(Number.isFinite(radius) ? radius : 55, 12, 100);
    for (
      let gy = Math.max(0, Math.floor((y - r) / CELL));
      gy < Math.min(ROWS, Math.ceil((y + r) / CELL));
      gy++
    )
      for (
        let gx = Math.max(0, Math.floor((x - r) / CELL));
        gx < Math.min(COLS, Math.ceil((x + r) / CELL));
        gx++
      ) {
        const d = Math.hypot(gx * CELL - x, gy * CELL - y) / r;
        if (d < 1) {
          const i = gy * COLS + gx;
          w.terrain[i] = clamp(
            w.terrain[i] + (tool === 'land' ? 0.16 : -0.15) * (1 - d) ** 0.7,
            -0.3,
            0.8,
          );
        }
      }
    w.revision++;
    w.entities = w.entities.filter(
      (e) =>
        e.kind === 'boat' ||
        e.kind === 'lantern' ||
        heightAt(w, e.x, e.y) > 0.1,
    );
    return null;
  }
  if (tool === 'look') return null;
  if (w.entities.length >= 700) return '这片海已经很热闹了，先陪它待一会儿。';
  const h = heightAt(w, x, y);
  if (tool === 'tree' || tool === 'home') {
    if (h < 0.12) return '选一块不被潮水淹没的陆地吧。';
    const spacing = tool === 'home' ? 32 : 15;
    if (
      w.entities.some(
        (e) =>
          e.kind !== 'boat' &&
          e.kind !== 'lantern' &&
          Math.hypot(e.x - x, e.y - y) < spacing,
      )
    )
      return '这里有邻居了，留一点呼吸的空隙。';
  }
  if (tool === 'boat' && h > seaLevel(w) - 0.035)
    return '小船要从开阔的海面出发。';
  entity(w, tool, x, y);
  if (tool === 'tree') w.planted++;
  return null;
}
export function statistics(w: World) {
  return {
    islands: w.islands.length,
    trees: w.entities.filter((e) => e.kind === 'tree').length,
    homes: w.entities.filter((e) => e.kind === 'home').length,
    boats: w.entities.filter((e) => e.kind === 'boat').length,
    lanterns: w.entities.filter((e) => e.kind === 'lantern').length,
  };
}

export const DISCOVERIES: Record<
  string,
  { title: string; description: string }
> = {
  first_island: { title: '一隅成岛', description: '亲手让陆地从海面升起。' },
  first_tree: { title: '一点新绿', description: '在岛上种下第一棵树。' },
  grown: { title: '绿意成荫', description: '三株幼苗长成了树。' },
  rain: { title: '雨的礼物', description: '一场雨，帮助幼苗长大。' },
  boats: { title: '海上来信', description: '放出一艘属于你的小船。' },
  night: { title: '把夜留亮', description: '灯笼与小屋，一起照亮夜晚。' },
  dawn: { title: '又一个清晨', description: '陪群岛看过一次日出。' },
  forest: { title: '风的花园', description: '亲手种下二十棵树。' },
};
export function discover(w: World, id: string) {
  if (!w.discoveries.includes(id)) {
    w.discoveries.push(id);
    log(w, '发现 · ' + DISCOVERIES[id].title, 'discovery');
  }
}
export function setWeather(w: World, weather: Weather) {
  if (w.weather === weather) return;
  w.weather = weather;
  w.weatherLeft = weather === 'clear' ? 0 : 100 + random(w) * 65;
  w.rainGrowth = false;
  log(
    w,
    weather === 'rain'
      ? '雨落下来，海面起了细小的圆。'
      : weather === 'mist'
        ? '雾把远处的岛，轻轻藏了起来。'
        : '云慢慢散开，海面又亮了一点。',
  );
}
export function finishStroke(
  w: World,
  tool: Tool,
  before: {
    islands: number;
    trees: number;
    homes: number;
    boats: number;
    lanterns: number;
  },
) {
  if (tool === 'land' || tool === 'water') {
    findIslands(w);
    reconcile(w);
  }
  const after = statistics(w);
  if (tool === 'land' && after.islands > before.islands) {
    log(w, '海面有了新的落脚处。', 'you');
    discover(w, 'first_island');
  }
  if (after.trees > before.trees) {
    log(
      w,
      after.trees - before.trees > 1
        ? '你种下的小树，开始一起听风。'
        : '一点新绿，在岛上站稳了。',
      'you',
    );
    discover(w, 'first_tree');
  }
  if (after.homes > before.homes) log(w, '一扇新窗，开始等候夜色。', 'you');
  if (after.boats > before.boats) {
    log(w, '一只小船，把水路走成了日常。', 'you');
    discover(w, 'boats');
  }
  if (after.lanterns > before.lanterns)
    log(w, '你留下一点光，等晚风经过。', 'you');
  if (w.planted >= 20) discover(w, 'forest');
}
function waterSpot(
  w: World,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const valid = (px: number, py: number) =>
    px > 12 &&
    py > 12 &&
    px < WIDTH - 12 &&
    py < HEIGHT - 12 &&
    heightAt(w, px, py) < seaLevel(w) - 0.04;
  if (valid(x, y)) return { x, y };
  for (let radius = 18; radius < Math.max(WIDTH, HEIGHT); radius += 18)
    for (let a = 0; a < 24; a++) {
      const px = x + Math.cos((a / 24) * Math.PI * 2) * radius,
        py = y + Math.sin((a / 24) * Math.PI * 2) * radius;
      if (valid(px, py)) return { x: px, y: py };
    }
  return null;
}
export function reconcile(w: World) {
  w.entities = w.entities.filter((e) => {
    if (e.kind === 'boat' && heightAt(w, e.x, e.y) >= seaLevel(w) - 0.015) {
      const p = waterSpot(w, e.x, e.y);
      if (!p) return false;
      e.x = p.x;
      e.y = p.y;
    }
    if (e.kind === 'tree' || e.kind === 'home')
      return heightAt(w, e.x, e.y) > 0.1;
    return true;
  });
}
export function update(w: World, delta: number) {
  if (!Number.isFinite(delta) || delta <= 0) return;
  w.tickAccumulator += Math.min(delta, 1);
  // Fixed 100 ms steps make ecology independent of display frame rate.
  while (w.tickAccumulator >= 0.1 - 1e-10) {
    w.tickAccumulator = Math.max(0, w.tickAccumulator - 0.1);
    step(w, 0.1);
  }
}
function step(w: World, dt: number) {
  const previousHour = Math.floor(hour(w));
  w.elapsed += dt;
  w.time += dt * 0.06;
  const h = hour(w),
    currentHour = Math.floor(h);
  if (currentHour !== previousHour) {
    if (currentHour === 6) {
      log(w, '天亮了，海面先接住第一束光。');
      discover(w, 'dawn');
    }
    if (currentHour === 18) log(w, '暮色慢慢靠岸，小屋亮起了灯。', 'life');
    if (currentHour === 0) log(w, '夜深了，潮水还醒着。');
  }
  if (w.weather !== 'clear') {
    w.weatherLeft -= dt;
    if (w.weatherLeft <= 0) setWeather(w, 'clear');
  }
  const tide = seaLevel(w),
    night = nightAmount(w) > 0.25;
  for (const e of w.entities) {
    const oldAge = e.age;
    e.age += dt * (e.kind === 'tree' && w.weather === 'rain' ? 2.8 : 1);
    if (e.kind === 'tree' && oldAge < 95 && e.age >= 95) {
      w.grown++;
      if (w.grown === 1) log(w, '那株小树，终于有了自己的树荫。');
      if (w.grown >= 3) discover(w, 'grown');
      if (w.weather === 'rain') {
        w.rainGrowth = true;
        discover(w, 'rain');
      }
    }
    if (e.kind === 'home') {
      if (night || w.weather === 'rain') {
        const dx = e.x - e.targetX,
          dy = e.y + 5 - e.targetY,
          d = Math.hypot(dx, dy);
        if (d > 1) {
          e.targetX += (dx / Math.max(d, 1)) * Math.min(d, dt * 8);
          e.targetY += (dy / Math.max(d, 1)) * Math.min(d, dt * 8);
        }
      } else if (e.rest > 0) e.rest = Math.max(0, e.rest - dt);
      else {
        const nx = e.targetX + Math.cos(e.angle) * dt * 6,
          ny = e.targetY + Math.sin(e.angle) * dt * 6;
        if (heightAt(w, nx, ny) > 0.12 && Math.hypot(nx - e.x, ny - e.y) < 48) {
          e.targetX = nx;
          e.targetY = ny;
        } else {
          e.angle += 1.5 + random(w) * 2;
          e.rest = 2 + random(w) * 5;
        }
        if (random(w) < dt * 0.035) {
          e.angle += random(w) * 2 - 1;
          e.rest = 3 + random(w) * 5;
        }
      }
      if (heightAt(w, e.targetX, e.targetY) < 0.11) {
        e.targetX = e.x;
        e.targetY = e.y + 4;
      }
    }
    if (e.kind === 'boat') {
      if (heightAt(w, e.x, e.y) > tide - 0.015) {
        const p = waterSpot(w, e.x, e.y);
        if (p) {
          e.x = p.x;
          e.y = p.y;
        } else {
          e.rest = -999;
        }
        continue;
      }
      if (e.rest > 0) {
        e.rest = Math.max(0, e.rest - dt);
        continue;
      }
      const speed = w.weather === 'rain' ? 3.5 : 7;
      const valid = (a: number, d: number) => {
        const nx = e.x + Math.cos(a) * d,
          ny = e.y + Math.sin(a) * d;
        return (
          nx > 14 &&
          ny > 14 &&
          nx < WIDTH - 14 &&
          ny < HEIGHT - 14 &&
          heightAt(w, nx, ny) < tide - 0.025
        );
      };
      if (!valid(e.angle, 22)) {
        let found = false;
        for (const turn of [0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2, Math.PI])
          if (valid(e.angle + turn, 24)) {
            e.angle += turn;
            found = true;
            break;
          }
        if (!found) {
          e.angle += 0.5;
          e.rest = 1;
          continue;
        }
      }
      if (valid(e.angle, dt * speed)) {
        e.x += Math.cos(e.angle) * dt * speed;
        e.y += Math.sin(e.angle) * dt * speed;
      }
      if (random(w) < dt * 0.06) e.angle += (random(w) - 0.5) * 0.5;
      if (
        h > 17 &&
        h < 21 &&
        random(w) < dt * 0.008 &&
        w.entities.some(
          (home) =>
            home.kind === 'home' &&
            Math.hypot(home.x - e.x, home.y - e.y) < 160,
        )
      ) {
        e.rest = 25 + random(w) * 25;
        log(w, '天色渐晚，小船在岸边歇了歇。', 'life');
      }
    }
    if (e.kind === 'lantern' && heightAt(w, e.x, e.y) < tide) {
      const nx = e.x + dt * 1.8,
        ny = e.y + Math.sin(w.elapsed * 0.05 + e.id) * dt * 0.5;
      if (
        nx < WIDTH - 12 &&
        ny > 12 &&
        ny < HEIGHT - 12 &&
        heightAt(w, nx, ny) < tide
      ) {
        e.x = nx;
        e.y = ny;
      }
    }
  }
  w.entities = w.entities.filter(
    (e) => !(e.kind === 'boat' && e.rest === -999),
  );
  if (
    night &&
    w.entities.some((e) => e.kind === 'lantern') &&
    w.entities.some((e) => e.kind === 'home')
  )
    discover(w, 'night');
  // One modest spreading attempt per 12 seconds; forest density is capped.
  if (
    Math.floor(w.elapsed / 12) !== Math.floor((w.elapsed - dt) / 12) &&
    w.entities.length < 480
  ) {
    const trees = w.entities.filter((e) => e.kind === 'tree' && e.age > 140);
    if (trees.length && random(w) < (w.weather === 'rain' ? 0.7 : 0.27)) {
      const parent = trees[Math.floor(random(w) * trees.length)],
        a = random(w) * Math.PI * 2,
        r = 22 + random(w) * 20,
        x = parent.x + Math.cos(a) * r,
        y = parent.y + Math.sin(a) * r;
      if (
        heightAt(w, x, y) > 0.14 &&
        !w.entities.some((e) => Math.hypot(e.x - x, e.y - y) < 19)
      ) {
        entity(w, 'tree', x, y);
        if (!w.logs.some((e) => e.text === '风替一棵树，种下了邻居。'))
          log(w, '风替一棵树，种下了邻居。');
      }
    }
  }
}
export function serialize(w: World) {
  return JSON.stringify({ ...w, terrain: Array.from(w.terrain) });
}
export function deserialize(text: string): World {
  if (text.length > 2_500_000) throw new Error('这份海图太大了。');
  const d = JSON.parse(text);
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  const validId = (n: unknown) =>
    Number.isSafeInteger(n) && (n as number) > 0 && (n as number) < 1e12;
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.terrain) ||
    d.terrain.length !== COLS * ROWS ||
    !d.terrain.every(
      (n: unknown) =>
        finite(n) && (n as number) >= -0.31 && (n as number) <= 0.86,
    ) ||
    !Array.isArray(d.entities) ||
    d.entities.length > 700 ||
    !finite(d.seed) ||
    !finite(d.time) ||
    d.time < 0 ||
    d.time > 1e8 ||
    !finite(d.rng) ||
    !finite(d.elapsed) ||
    d.elapsed < 0 ||
    d.elapsed > 1e9 ||
    !validId(d.id) ||
    !['clear', 'rain', 'mist'].includes(d.weather)
  )
    throw new Error('这份文件不是完整的潮生海图。');
  for (const e of d.entities) {
    if (
      !e ||
      !validId(e.id) ||
      !['tree', 'home', 'boat', 'lantern'].includes(e.kind) ||
      ![
        'id',
        'x',
        'y',
        'age',
        'angle',
        'variant',
        'targetX',
        'targetY',
        'rest',
      ].every((k) => finite(e[k])) ||
      e.x < 0 ||
      e.x >= WIDTH ||
      e.y < 0 ||
      e.y >= HEIGHT ||
      e.age < 0 ||
      e.age > 1e9 ||
      Math.abs(e.angle) > 1e12 ||
      e.rest < 0 ||
      e.rest > 1e6 ||
      e.variant < 0 ||
      e.variant > 3 ||
      !Number.isInteger(e.variant)
    )
      throw new Error('海图中的居民记录有些模糊，请换一份存档。');
  }
  const ids = d.entities.map((e: Entity) => e.id);
  if (new Set(ids).size !== ids.length) throw new Error('海图里有重复的记录。');
  const w: World = {
    ...d,
    terrain: Float32Array.from(d.terrain),
    rng: d.rng >>> 0 || 1,
    islands: [],
    logs: [],
    discoveries: [],
    revision: 1,
    tickAccumulator: 0,
    weatherLeft: finite(d.weatherLeft) ? clamp(d.weatherLeft, 0, 200) : 0,
    planted: finite(d.planted) ? Math.max(0, d.planted) : 0,
    grown: finite(d.grown) ? Math.max(0, d.grown) : 0,
    rainGrowth: !!d.rainGrowth,
  };
  if (Array.isArray(d.logs))
    w.logs = d.logs
      .filter(
        (e: Entry) =>
          e &&
          validId(e.id) &&
          finite(e.day) &&
          finite(e.hour) &&
          typeof e.text === 'string' &&
          e.text.length <= 160 &&
          ['nature', 'life', 'you', 'discovery'].includes(e.kind),
      )
      .slice(0, 80);
  if (Array.isArray(d.discoveries))
    w.discoveries = [
      ...new Set<string>(
        d.discoveries.filter(
          (s: unknown) =>
            typeof s === 'string' && Object.hasOwn(DISCOVERIES, s),
        ),
      ),
    ];
  if (Array.isArray(d.islands))
    w.islands = d.islands
      .filter(
        (i: Island) =>
          i &&
          typeof i.name === 'string' &&
          i.name.length <= 18 &&
          finite(i.x) &&
          finite(i.y) &&
          finite(i.area),
      )
      .slice(0, 300)
      .map((i: Island) => ({
        ...i,
        cells: Array.isArray(i.cells)
          ? i.cells.filter(
              (n) => Number.isInteger(n) && n >= 0 && n < COLS * ROWS,
            )
          : [],
      }));
  w.id = Math.max(
    d.id,
    ...ids.map((id: number) => id + 1),
    ...w.logs.map((e) => e.id + 1),
  );
  findIslands(w);
  reconcile(w);
  return w;
}
