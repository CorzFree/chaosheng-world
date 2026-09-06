'use client';
import { useEffect, useRef, useState } from 'react';
import {
  createWorld,
  paint,
  statistics,
  finishStroke,
  heightAt,
  day,
  hour,
  seaLevel,
  update,
  setWeather,
  serialize,
  deserialize,
  log,
  WIDTH,
  HEIGHT,
  COLS,
  CELL,
  clamp,
  type Tool,
  type World,
  type Weather,
  type Entry,
} from './world';
import { Renderer, type View } from './renderer';
import { SeaAudio } from './audio';
import { Renderer3D } from './renderer3d';
import {
  createCityWorld,
  isCity,
  cityMetrics,
  advanceCity,
  stepCity,
  parcelAt,
  rezone,
  setMetro,
  setEastBridge,
  eastBridgeOpen,
  ZONES,
  type CityTool,
  type CityMetrics,
} from './city.ts';
import type { CityOverlay } from './city-renderer.ts';
import { assetPath } from './paths';
const STORAGE_KEY = 'chaosheng.metro.v1';
const LEGACY_KEY = 'chaosheng.world.v1';
export const TOOL_IDS: Tool[] = [
  'look',
  'land',
  'tree',
  'home',
  'boat',
  'lantern',
  'water',
];
type Stats = ReturnType<typeof statistics>;
export type Snapshot = Stats & {
  city?: CityMetrics & {
    ageDays: number;
    metro: boolean;
    metroBuilt: boolean;
    bridgeOpen: boolean;
  };
  day: number;
  hour: number;
  weather: Weather;
  tide: string;
  seed: number;
  logs: Entry[];
  discoveries: string[];
  islandsList: World['islands'];
};
type Drag = {
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  pan: boolean;
  orbit?: boolean;
  tool: Tool;
  before: Stats;
  snapshot: string;
  paintX: number;
  paintY: number;
  changed: boolean;
};
export function useWorld({ classic = false }: { classic?: boolean } = {}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    world = useRef<World | null>(null),
    renderer = useRef<Renderer | Renderer3D | null>(null),
    audio = useRef<SeaAudio | null>(null);
  const view = useRef<View>({
    zoom: 1,
    x: 0,
    y: 0,
    width: 1000,
    height: 720,
    pointer: null,
    tool: 'look',
    radius: 55,
    labels: true,
    reducedMotion: false,
    yaw: 0.12,
    pitch: 0.91,
  });
  const options = useRef({
    paused: false,
    speed: 1,
    modal: false,
    sound: false,
    hidden: false,
  });
  const drag = useRef<Drag | null>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>()),
    pinch = useRef<{ distance: number; zoom: number } | null>(null),
    history = useRef<string[]>([]),
    future = useRef<string[]>([]);
  const [is3D, setIs3D] = useState(false);
  const [cityTool, setCityTool] = useState<CityTool>('inspect'),
    cityToolRef = useRef<CityTool>('inspect');
  const [street, setStreet] = useState(false),
    streetNode = useRef<number>(0),
    streetMove = useRef<{
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      elapsed: number;
      duration: number;
    } | null>(null),
    orbitView = useRef({ yaw: 0.23, pitch: 0.71, zoom: 1.14, x: 0, y: 0 });
  const [cityOverlay, setCityOverlayState] = useState<CityOverlay>('natural');
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [ready, setReady] = useState(false),
    [tool, setTool] = useState<Tool>('look'),
    [paused, setPaused] = useState(false),
    [speed, setSpeed] = useState(1),
    [sound, setSound] = useState(false),
    [radius, setRadius] = useState(55),
    [labels, setLabels] = useState(true),
    [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState(
      '点击建筑查看用途；选择分区，可以改建街区。',
    ),
    [saved, setSaved] = useState('此设备自动保存'),
    [canUndo, setCanUndo] = useState(false),
    [canRedo, setCanRedo] = useState(false),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [selection, setSelection] = useState<{
      title: string;
      detail: string;
    } | null>(null);
  const messageTime = useRef(0),
    lastFrame = useRef(0),
    lastUi = useRef(0),
    lastPaint = useRef(0);
  function notify(text: string) {
    setMessage(text);
    messageTime.current = Date.now();
  }
  function sync() {
    const w = world.current;
    if (!w) return;
    setSnapshot({
      ...statistics(w),
      city: isCity(w)
        ? {
            ...cityMetrics(w),
            ageDays: w.city.ageDays,
            metro: w.city.metro,
            metroBuilt: w.city.metroBuilt ?? w.city.metro,
            bridgeOpen: eastBridgeOpen(w),
          }
        : undefined,
      day: day(w),
      hour: hour(w),
      weather: w.weather,
      tide: Math.cos((w.time / 24) * Math.PI * 4) > 0 ? '涨潮中' : '退潮中',
      seed: w.seed,
      logs: [...w.logs],
      discoveries: [...w.discoveries],
      islandsList: w.islands.map((i) => ({ ...i, cells: [] })),
    });
    setCanUndo(history.current.length > 0);
    setCanRedo(future.current.length > 0);
    setZoom(view.current.zoom);
    audio.current?.weather(w.weather);
  }
  function save() {
    if (!world.current) return;
    try {
      localStorage.setItem(
        isCity(world.current) ? STORAGE_KEY : LEGACY_KEY,
        serialize(world.current),
      );
      setSaved('已留在这台设备');
    } catch {
      setSaved('未能自动保存 · 请导出海图');
    }
  }
  function remember(text?: string) {
    if (!world.current) return;
    history.current.push(text ?? serialize(world.current));
    if (history.current.length > 24) history.current.shift();
    future.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }
  function choose(t: Tool) {
    if (!TOOL_IDS.includes(t)) return;
    view.current.tool = t;
    setTool(t);
    setSelection(null);
  }
  function togglePause() {
    options.current.paused = !options.current.paused;
    setPaused(options.current.paused);
  }
  function changeSpeed(n: number) {
    options.current.speed = n;
    setSpeed(n);
  }
  function resetView() {
    if (view.current.street) Object.assign(view.current, orbitView.current);
    view.current.street = false;
    setStreet(false);
    streetMove.current = null;
    view.current.zoom = 1;
    view.current.x = 0;
    view.current.y = 0;
    setZoom(1);
  }
  function changeZoom(n: number) {
    view.current.zoom = clamp(n, 0.65, 3.5);
    setZoom(view.current.zoom);
  }
  function setBrush(n: number) {
    view.current.radius = clamp(n, 20, 95);
    setRadius(view.current.radius);
  }
  function setMapLabels(on: boolean) {
    view.current.labels = on;
    setLabels(on);
  }
  function setModal(on: boolean) {
    options.current.modal = on;
  }
  async function toggleSound() {
    try {
      if (options.current.sound) {
        await audio.current?.stop();
        options.current.sound = false;
      } else {
        await audio.current?.start();
        options.current.sound = true;
        audio.current?.weather(world.current?.weather ?? 'clear');
      }
      setSound(options.current.sound);
    } catch {
      notify('海声暂时没能响起，再点一次试试。');
    }
  }
  function changeWeather(weather: Weather) {
    const w = world.current;
    if (!w) return;
    remember();
    setWeather(w, weather);
    sync();
    save();
  }
  function seekTime(h: number) {
    const w = world.current;
    if (!w) return;
    w.time = Math.floor(w.time / 24) * 24 + clamp(h, 0, 23.99);
    sync();
  }
  function undo() {
    if (!world.current || !history.current.length) return;
    future.current.push(serialize(world.current));
    world.current = deserialize(history.current.pop()!);
    if (renderer.current) renderer.current.revision = -1;
    setSelection(null);
    sync();
    save();
    notify('刚才的一步，已经轻轻收回。');
  }
  function redo() {
    if (!world.current || !future.current.length) return;
    history.current.push(serialize(world.current));
    world.current = deserialize(future.current.pop()!);
    if (renderer.current) renderer.current.revision = -1;
    sync();
    save();
    notify('那一步，又回到了海图上。');
  }
  function newWorld(seed?: number) {
    remember();
    world.current = createWorld(
      seed ?? crypto.getRandomValues(new Uint32Array(1))[0],
    );
    renderer.current!.revision = -1;
    resetView();
    setSelection(null);
    sync();
    save();
    notify('一片新的海。旧世界还可以撤回。');
  }
  function inspect(x: number, y: number) {
    const w = world.current;
    if (!w) return;
    if (isCity(w)) {
      const parcel = parcelAt(w, x, y);
      selectCity(parcel?.id ?? null);
      return;
    }
    const nearest = w.entities
      .map((e) => ({ e, d: Math.hypot(e.x - x, e.y - y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (nearest && nearest.d < 30) {
      const e = nearest.e;
      setSelection(
        e.kind === 'tree'
          ? {
              title: e.age < 95 ? '一株幼苗' : '一棵海岛树',
              detail:
                e.age < 95
                  ? '正在慢慢长大。雨天会长得更快一些。'
                  : '枝叶已成荫。风偶尔会替它种下邻居。',
            }
          : e.kind === 'home'
            ? {
                title: '一户人家',
                detail:
                  w.weather === 'rain'
                    ? '窗里亮着灯，主人正在等雨停。'
                    : '岛民会去海岸听潮、中午在树荫休息，傍晚拜访邻居。',
              }
            : e.kind === 'boat'
              ? {
                  title: '一叶小舟',
                  detail:
                    e.rest > 0
                      ? '暂时在这里歇一会儿。'
                      : '正在前往下一处码头。靠岸后会收帆停留，退潮时会重新寻找水路。',
                }
              : {
                  title: '一盏小灯',
                  detail: '天暗下来时，它会把附近的夜色照暖。',
                },
      );
      return;
    }
    const cell = Math.floor(y / CELL) * COLS + Math.floor(x / CELL);
    const island = w.islands.find((i) => i.cells.includes(cell));
    if (island && heightAt(w, x, y) > 0.1)
      setSelection({
        title: island.name,
        detail:
          '这片陆地上有 ' +
          w.entities.filter(
            (e) =>
              e.kind === 'tree' &&
              island.cells.includes(
                Math.floor(e.y / CELL) * COLS + Math.floor(e.x / CELL),
              ),
          ).length +
          ' 棵树。潮汐每天来访两次。',
      });
    else
      setSelection({
        title: '一片潮水',
        detail: '海面随时间涨落。选「造岛」，在这里按住片刻。',
      });
  }
  function screenPoint(clientX: number, clientY: number) {
    const b = canvas.current!.getBoundingClientRect();
    return renderer.current!.screenToWorld(
      clientX - b.left,
      clientY - b.top,
      view.current,
    );
  }
  function applyAt(x: number, y: number, force = false) {
    const w = world.current,
      d = drag.current;
    if (!w || !d || d.pan) return;
    const now = performance.now();
    if (!force && now - lastPaint.current < 45) return;
    if (
      d.tool === 'tree' &&
      !force &&
      Math.hypot(x - d.paintX, y - d.paintY) < 17
    )
      return;
    const oldId = w.id,
      oldRevision = w.revision,
      oldCityRevision = isCity(w) ? w.city.revision : 0,
      m = isCity(w)
        ? rezone(w, cityToolRef.current, x, y)
        : paint(w, d.tool, x, y, view.current.radius);
    if (m && now - lastPaint.current > 200) notify(m);
    else if (m && force) notify(m);
    if (
      w.id !== oldId ||
      w.revision !== oldRevision ||
      (isCity(w) && w.city.revision !== oldCityRevision)
    ) {
      d.changed = true;
      d.paintX = x;
      d.paintY = y;
      if (!['land', 'water'].includes(d.tool)) audio.current?.chime(w.id);
    }
    lastPaint.current = now;
  }
  function finishDrag() {
    const d = drag.current,
      w = world.current;
    drag.current = null;
    if (d && w && d.changed) {
      remember(d.snapshot);
      finishStroke(w, d.tool, d.before);
      sync();
      save();
    }
    pinch.current = null;
  }
  function pointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!world.current || !renderer.current) return;
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      finishDrag();
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: view.current.zoom,
      };
      return;
    }
    if (pointers.current.size > 2) return;
    const p = screenPoint(e.clientX, e.clientY);
    view.current.pointer = p;
    const pan =
      view.current.tool === 'look' ||
      e.button === 1 ||
      e.shiftKey ||
      e.button === 2 ||
      e.altKey;
    drag.current = {
      lastX: e.clientX,
      lastY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      pan,
      orbit: e.button === 2 || e.altKey,
      tool: view.current.tool,
      before: statistics(world.current),
      snapshot: pan ? '' : serialize(world.current),
      paintX: p.x,
      paintY: p.y,
      changed: false,
    };
    if (!pan) applyAt(p.x, p.y, true);
  }
  function pointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!renderer.current) return;
    const p = screenPoint(e.clientX, e.clientY);
    view.current.pointer = p;
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      changeZoom(
        (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
          Math.max(1, pinch.current.distance),
      );
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (d.pan) {
      if ((d.orbit || view.current.street) && renderer.current.is3D) {
        view.current.yaw =
          (view.current.yaw ?? 0.12) - (e.clientX - d.lastX) * 0.006;
        view.current.pitch = clamp(
          (view.current.pitch ?? 0.91) + (e.clientY - d.lastY) * 0.004,
          view.current.street ? -0.45 : 0.38,
          view.current.street ? 0.75 : 1.4,
        );
      } else
        renderer.current.pan(
          e.clientX - d.lastX,
          e.clientY - d.lastY,
          view.current,
        );
      view.current.x = clamp(view.current.x, -WIDTH * 0.75, WIDTH * 0.75);
      view.current.y = clamp(view.current.y, -HEIGHT * 0.75, HEIGHT * 0.75);
    } else if (
      ['land', 'water', 'tree'].includes(d.tool) ||
      (isCity(world.current) && cityToolRef.current !== 'inspect')
    ) {
      const dist = Math.hypot(p.x - d.paintX, p.y - d.paintY);
      if (dist > view.current.radius * 0.6 && d.tool !== 'tree') {
        const steps = Math.min(
            15,
            Math.ceil(dist / Math.max(12, view.current.radius * 0.4)),
          ),
          ox = d.paintX,
          oy = d.paintY;
        for (let i = 1; i <= steps; i++)
          applyAt(
            ox + ((p.x - ox) * i) / steps,
            oy + ((p.y - oy) * i) / steps,
            true,
          );
      } else applyAt(p.x, p.y);
    }
    d.lastX = e.clientX;
    d.lastY = e.clientY;
  }
  function pointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (d?.pan && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) {
      if (isCity(world.current) && renderer.current instanceof Renderer3D) {
        const bounds = canvas.current!.getBoundingClientRect();
        selectCity(
          renderer.current.pickCity(
            e.clientX - bounds.left,
            e.clientY - bounds.top,
            view.current,
          ),
        );
      } else {
        const p = screenPoint(e.clientX, e.clientY);
        inspect(p.x, p.y);
      }
    }
    pointers.current.delete(e.pointerId);
    finishDrag();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function pointerCancel(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    finishDrag();
  }
  function download(content: Blob, name: string) {
    const url = URL.createObjectURL(content),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function exportWorld() {
    if (world.current) {
      download(
        new Blob([serialize(world.current)], { type: 'application/json' }),
        '潮生-第' + day(world.current) + '天.json',
      );
      notify('海图已打包，收好这一片海。');
    }
  }
  async function importWorld(file: File) {
    try {
      if (file.size > 2_500_000)
        throw new Error('请选择小于 2.5 MB 的潮生海图。');
      const next = deserialize(await file.text());
      remember();
      world.current = next;
      renderer.current!.revision = -1;
      setSelection(null);
      resetView();
      sync();
      save();
      notify('熟悉的潮声，回来了。');
      if (!classic && !isCity(next))
        window.location.assign(assetPath('/isles/'));
      if (classic && isCity(next)) window.location.assign(assetPath('/'));
    } catch (e) {
      notify(e instanceof Error ? e.message : '没能读懂这份海图。');
    }
  }
  function postcard() {
    const w = world.current;
    if (!w || !renderer.current) return;
    const out = document.createElement('canvas');
    out.width = 1600;
    out.height = 1160;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#eff3e7';
    ctx.fillRect(0, 0, 1600, 1160);
    const source = canvas.current!,
      scale = Math.min(1520 / source.width, 1000 / source.height),
      dw = source.width * scale,
      dh = source.height * scale;
    ctx.fillStyle = '#1d4f58';
    ctx.fillRect(40, 40, 1520, 1000);
    ctx.drawImage(source, 40 + (1520 - dw) / 2, 40 + (1000 - dh) / 2, dw, dh);
    ctx.fillStyle = '#305a51';
    ctx.font = '36px SimSun,serif';
    ctx.fillText('潮 生', 54, 1102);
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      '第 ' + day(w) + ' 天 · ' + formatTime(hour(w)) + '  /  愿你常有一片海',
      1545,
      1100,
    );
    out.toBlob((blob) => {
      if (blob) {
        download(blob, '潮生-海上明信片.png');
        notify('这一刻的海，已经收进明信片。');
      }
    }, 'image/png');
  }
  useEffect(() => {
    const initial = classic ? createWorld() : createCityWorld();
    let loadMessage = '';
    try {
      const stored = localStorage.getItem(classic ? LEGACY_KEY : STORAGE_KEY);
      if (stored) world.current = deserialize(stored);
      else world.current = initial;
    } catch {
      world.current = initial;
      loadMessage = '旧海图没能读取。你仍可以导入备份，这片海暂时重新开始。';
    }
    if (loadMessage) notify(loadMessage);
    if (isCity(world.current)) {
      view.current.zoom = 1.14;
      view.current.pitch = 0.71;
      view.current.yaw = 0.23;
      setZoom(1.14);
    }
    view.current.reducedMotion = matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    options.current.paused = view.current.reducedMotion;
    setPaused(options.current.paused);
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2');
    if (context) {
      context.getExtension('WEBGL_lose_context')?.loseContext();
      renderer.current = new Renderer3D(canvas.current!);
      setIs3D(true);
    } else {
      renderer.current = new Renderer(canvas.current!);
      notify('这台设备使用平面海图模式，世界仍可以正常游玩。');
    }

    audio.current = new SeaAudio();
    const observer = new ResizeObserver(([e]) => {
      view.current.width = e.contentRect.width;
      view.current.height = e.contentRect.height;
    });
    observer.observe(canvas.current!.parentElement!);
    let frame = 0;
    const loop = (t: number) => {
      const w = world.current;
      if (w && !options.current.hidden) {
        const dt = Math.min((t - (lastFrame.current || t)) / 1000, 0.08);
        const move = streetMove.current;
        if (move) {
          move.elapsed += dt;
          const progress = Math.min(1, move.elapsed / move.duration),
            ease = progress * progress * (3 - 2 * progress);
          view.current.streetX = move.fromX + (move.toX - move.fromX) * ease;
          view.current.streetY = move.fromY + (move.toY - move.fromY) * ease;
          if (progress >= 1) streetMove.current = null;
        }

        if (!options.current.paused && !options.current.modal) {
          update(w, dt * options.current.speed);
          if (isCity(w)) stepCity(w);
        }
        const d = drag.current;
        if (
          !options.current.modal &&
          d &&
          !d.pan &&
          ['land', 'water'].includes(d.tool) &&
          view.current.pointer
        )
          applyAt(view.current.pointer.x, view.current.pointer.y);
        renderer.current?.draw(
          w,
          view.current,
          view.current.reducedMotion ? 0 : w.elapsed + w.tickAccumulator,
        );
        if (t - lastUi.current > 350) {
          sync();
          lastUi.current = t;
        }
      }
      lastFrame.current = t;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const timer = setInterval(save, 12000);
    const visibility = () => {
      options.current.hidden = document.hidden;
      lastFrame.current = 0;
      if (document.hidden) {
        save();
        void audio.current?.context?.suspend();
      } else if (options.current.sound) void audio.current?.context?.resume();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const before = screenPoint(e.clientX, e.clientY);
      changeZoom(view.current.zoom * Math.exp(-e.deltaY * 0.001));
      const after = screenPoint(e.clientX, e.clientY);
      view.current.x += after.x - before.x;
      view.current.y += after.y - before.y;
    };
    const keys = (e: KeyboardEvent) => {
      if (options.current.modal) return;
      const target = e.target as HTMLElement;
      if (
        target.matches(
          'input,textarea,select,[contenteditable=true],[role=slider]',
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        exportWorld();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (
        view.current.street &&
        target === canvas.current &&
        ['w', 'W', 's', 'S', 'ArrowUp', 'ArrowDown'].includes(e.key)
      ) {
        e.preventDefault();
        walkStreet(['s', 'S', 'ArrowDown'].includes(e.key) ? -1 : 1);
        return;
      }
      if (/^[1-7]$/.test(e.key)) {
        if (isCity(world.current))
          chooseCity(
            [
              'inspect',
              'residential',
              'commercial',
              'mixed',
              'industrial',
              'park',
              'road',
            ][Number(e.key) - 1] as CityTool,
          );
        else choose(TOOL_IDS[Number(e.key) - 1]);
        e.preventDefault();
      }
      if (e.code === 'Space' && target === canvas.current) {
        e.preventDefault();
        togglePause();
      }
      if (e.key === 'Escape') {
        choose('look');
        setSelection(null);
      }
      if (target === canvas.current) {
        const p = view.current.pointer ?? {
            x: WIDTH / 2 - view.current.x,
            y: HEIGHT / 2 - view.current.y,
          },
          step = e.shiftKey ? 40 : 12;
        let used = true;
        if (e.key === 'ArrowLeft') p.x -= step;
        else if (e.key === 'ArrowRight') p.x += step;
        else if (e.key === 'ArrowUp') p.y -= step;
        else if (e.key === 'ArrowDown') p.y += step;
        else if (e.key === 'Enter') {
          const w = world.current!;
          if (view.current.tool === 'look') inspect(p.x, p.y);
          else {
            remember();
            const before = statistics(w);
            const m = isCity(w)
              ? rezone(w, cityToolRef.current, p.x, p.y)
              : paint(w, view.current.tool, p.x, p.y, view.current.radius);
            if (m) notify(m);
            finishStroke(w, view.current.tool, before);
            sync();
            save();
          }
        } else if (e.key === '+' || e.key === '=')
          changeZoom(view.current.zoom + 0.2);
        else if (e.key === '-') changeZoom(view.current.zoom - 0.2);
        else used = false;
        if (used) {
          e.preventDefault();
          view.current.pointer = {
            x: clamp(p.x, 0, WIDTH - 1),
            y: clamp(p.y, 0, HEIGHT - 1),
          };
        }
      }
    };
    const c = canvas.current!;
    c.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', keys);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', visibility);
    sync();
    setReady(true);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      observer.disconnect();
      c.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', keys);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', visibility);
      audio.current?.destroy();
      renderer.current?.destroy();
    };
  }, []);
  function chooseCity(kind: CityTool) {
    if (view.current.street && kind !== 'inspect') {
      notify('返回鸟瞰后，可以规划街区。');
      return;
    }
    cityToolRef.current = kind;
    setCityTool(kind);
    view.current.tool = kind === 'inspect' ? 'look' : 'home';
    setTool(view.current.tool);
  }
  function selectCity(id: number | null) {
    setSelectedCityId(id);
    if (renderer.current instanceof Renderer3D) renderer.current.selectCity(id);
    const w = world.current;
    if (isCity(w) && id !== null) {
      const p = w.city.parcels[id];
      if (p)
        setSelection({
          title: ZONES[p.zone].name + ' · ' + p.id,
          detail: p.floors + ' 层 / ' + p.residents + ' 位居民',
        });
    } else setSelection(null);
  }
  function changeCityOverlay(overlay: CityOverlay) {
    setCityOverlayState(overlay);
    if (renderer.current instanceof Renderer3D)
      renderer.current.setCityOverlay(overlay);
  }
  function toggleMetro() {
    const w = world.current;
    if (!isCity(w)) return;
    remember();
    setMetro(w, !w.city.metro);
    sync();
    save();
  }
  function toggleBridge() {
    const w = world.current;
    if (!isCity(w)) return;
    remember();
    setEastBridge(w, !eastBridgeOpen(w));
    sync();
    save();
  }
  function advanceQuarter() {
    const w = world.current;
    if (!isCity(w)) return;
    remember();
    advanceCity(w, 90);
    w.time += 24 * 90;
    w.city.lastClock = w.time;
    log(w, '九十天过去了。建设按接通的道路与水电推进。', 'life');
    sync();
    save();
    notify('已推进 90 天；新增楼层与入住按实际容量结算。');
  }
  function newCity(empty = false) {
    remember();
    world.current = createCityWorld(
      crypto.getRandomValues(new Uint32Array(1))[0],
      empty,
    );
    renderer.current!.revision = -1;
    chooseCity('inspect');
    selectCity(null);
    resetView();
    view.current.zoom = 1.14;
    view.current.pitch = 0.71;
    sync();
    save();
  }
  function recoverLegacy() {
    try {
      save();
      const saved = localStorage.getItem(LEGACY_KEY);
      if (!saved) {
        notify('这台设备还没有旧群岛存档，可以导入以前的 JSON 海图。');
        return;
      }
      remember();
      world.current = deserialize(saved);
      renderer.current!.revision = -1;
      choose('look');
      sync();
      notify('已取回原野群岛，都市存档仍独立保存。');
    } catch {
      notify('旧群岛存档暂时无法读取。');
    }
  }
  function toggleStreet() {
    const w = world.current;
    if (!isCity(w) || !(renderer.current instanceof Renderer3D)) return;
    if (view.current.street) {
      Object.assign(view.current, orbitView.current);
      view.current.street = false;
      setStreet(false);
      streetMove.current = null;
      sync();
      return;
    }
    orbitView.current = {
      yaw: view.current.yaw ?? 0.23,
      pitch: view.current.pitch ?? 0.71,
      zoom: view.current.zoom,
      x: view.current.x,
      y: view.current.y,
    };
    const parcel =
        selectedCityId !== null ? w.city.parcels[selectedCityId] : null,
      target = parcel ? { x: parcel.x, y: parcel.y } : { x: 570, y: 600 };
    const nodes = w.city.nodes
      .filter((n) =>
        w.city.roads.some((r) => r.enabled && (r.a === n.id || r.b === n.id)),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - target.x, a.y - target.y) -
          Math.hypot(b.x - target.x, b.y - target.y),
      );
    const node = nodes[0];
    if (!node) return;
    streetNode.current = node.id;
    view.current.streetX = node.x;
    view.current.streetY = node.y;
    view.current.street = true;
    view.current.pitch = 0.1;
    view.current.yaw = parcel
      ? Math.atan2(parcel.x - node.x, -(parcel.y - node.y))
      : 0;
    setStreet(true);
    chooseCity('inspect');
    notify('拖动画面环顾；W / S 或下方按钮沿路移动。');
    canvas.current?.focus({ preventScroll: true });
  }
  function walkStreet(direction = 1) {
    const w = world.current;
    if (!isCity(w) || !view.current.street || streetMove.current) return;
    const node = w.city.nodes[streetNode.current];
    if (!node) return;
    const yaw = view.current.yaw ?? 0,
      dx = Math.sin(yaw) * direction,
      dy = -Math.cos(yaw) * direction;
    const next = w.city.roads
      .filter((r) => r.enabled && (r.a === node.id || r.b === node.id))
      .map((r) => w.city.nodes[r.a === node.id ? r.b : r.a])
      .sort((a, b) => {
        const score = (p: typeof a) =>
          ((p.x - node.x) * dx + (p.y - node.y) * dy) /
          Math.max(0.001, Math.hypot(p.x - node.x, p.y - node.y));
        return score(b) - score(a);
      })[0];
    if (!next) {
      notify('这条路尚未接通。');
      return;
    }
    const fromX = view.current.streetX ?? node.x,
      fromY = view.current.streetY ?? node.y;
    streetMove.current = {
      fromX,
      fromY,
      toX: next.x,
      toY: next.y,
      elapsed: 0,
      duration: Math.max(
        2,
        Math.min(9, Math.hypot(next.x - fromX, next.y - fromY) / 10),
      ),
    };
    streetNode.current = next.id;
  }
  function turnCamera() {
    view.current.yaw = (view.current.yaw ?? 0.12) + Math.PI / 4;
    sync();
  }
  function tiltCamera() {
    if (view.current.street) {
      view.current.pitch = (view.current.pitch ?? 0.1) > 0.2 ? -0.05 : 0.35;
      sync();
      return;
    }
    view.current.pitch = (view.current.pitch ?? 0.91) > 0.95 ? 0.58 : 1.25;
    sync();
  }
  return {
    street,
    toggleStreet,
    walkStreet,
    cityTool,
    cityOverlay,
    selectedCityId,
    chooseCity,
    selectCity,
    changeCityOverlay,
    toggleMetro,
    toggleBridge,
    advanceQuarter,
    newCity,
    recoverLegacy,
    is3D,
    turnCamera,
    tiltCamera,
    canvas,
    world,
    view,
    ready,
    tool,
    paused,
    speed,
    sound,
    radius,
    labels,
    zoom,
    message,
    saved,
    canUndo,
    canRedo,
    snapshot,
    selection,
    setSelection,
    notify,
    sync,
    remember,
    choose,
    togglePause,
    changeSpeed,
    resetView,
    changeZoom,
    setBrush,
    setMapLabels,
    setModal,
    toggleSound,
    changeWeather,
    seekTime,
    undo,
    redo,
    newWorld,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    exportWorld,
    importWorld,
    postcard,
    save,
  };
}
export function formatTime(h: number) {
  return (
    Math.floor(h).toString().padStart(2, '0') +
    ':' +
    Math.floor((h % 1) * 60)
      .toString()
      .padStart(2, '0')
  );
}
