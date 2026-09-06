import { isCity, ZONES } from './city.ts';
import {
  WIDTH,
  HEIGHT,
  COLS,
  ROWS,
  CELL,
  hash,
  heightAt,
  nightAmount,
  seaLevel,
  type World,
  type Tool,
  type Entity,
} from './world';
export type View = {
  zoom: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pointer: { x: number; y: number } | null;
  tool: Tool;
  radius: number;
  labels: boolean;
  reducedMotion: boolean;
  yaw?: number;
  pitch?: number;
  street?: boolean;
  streetX?: number;
  streetY?: number;
};
export class Renderer {
  readonly is3D = false;
  destroy() {}
  pan(dx: number, dy: number, v: View) {
    const s = this.scale(v);
    v.x += dx / s;
    v.y += dy / s;
  }

  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  terrain: HTMLCanvasElement;
  revision = -1;
  tide = -1;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.terrain = document.createElement('canvas');
    this.terrain.width = WIDTH;
    this.terrain.height = HEIGHT;
  }
  scale(v: View) {
    return Math.min(v.width / WIDTH, v.height / HEIGHT) * v.zoom;
  }
  screenToWorld(x: number, y: number, v: View) {
    const s = this.scale(v);
    return {
      x: (x - v.width / 2) / s + WIDTH / 2 - v.x,
      y: (y - v.height / 2) / s + HEIGHT / 2 - v.y,
    };
  }
  rebuild(w: World) {
    const c = this.terrain.getContext('2d')!,
      small = document.createElement('canvas');
    small.width = COLS;
    small.height = ROWS;
    const sc = small.getContext('2d')!,
      im = sc.createImageData(COLS, ROWS),
      tide = seaLevel(w);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x,
          h = w.terrain[i] - tide,
          grain = (hash(x, y, w.seed) - 0.5) * 9;
        let color: number[];
        if (h < -0.17) color = [29, 79, 88];
        else if (h < -0.08) color = [34, 94, 99];
        else if (h < -0.025) color = [48, 119, 120];
        else if (h < 0) color = [82, 148, 140];
        else if (h < 0.026) color = [192, 196, 151];
        else if (h < 0.07) color = [179, 188, 125];
        else if (h < 0.15) color = [134, 165, 101];
        else if (h < 0.26) color = [114, 150, 86];
        else if (h < 0.36) color = [100, 138, 78];
        else color = [88, 122, 72];
        const slope =
          x > 0 && y > 0 ? (w.terrain[i - 1 - COLS] - w.terrain[i]) * 70 : 0;
        for (let k = 0; k < 3; k++)
          im.data[i * 4 + k] = Math.max(
            0,
            Math.min(255, color[k] + grain + slope),
          );
        im.data[i * 4 + 3] = 255;
      }
    sc.putImageData(im, 0, 0);
    c.imageSmoothingEnabled = true;
    c.drawImage(small, 0, 0, WIDTH, HEIGHT);
    for (const level of [
      tide - 0.12,
      tide - 0.045,
      tide + 0.003,
      0.18,
      0.29,
      0.4,
    ]) {
      c.beginPath();
      for (let y = 0; y < ROWS - 1; y++)
        for (let x = 0; x < COLS - 1; x++) {
          const i = y * COLS + x,
            a = w.terrain[i],
            b = w.terrain[i + 1],
            d = w.terrain[i + COLS],
            e = w.terrain[i + COLS + 1],
            pts: number[][] = [];
          const edge = (
            v1: number,
            v2: number,
            x1: number,
            y1: number,
            x2: number,
            y2: number,
          ) => {
            if (v1 < level !== v2 < level) {
              const t = (level - v1) / (v2 - v1);
              pts.push([
                (x1 + (x2 - x1) * t) * CELL,
                (y1 + (y2 - y1) * t) * CELL,
              ]);
            }
          };
          edge(a, b, x, y, x + 1, y);
          edge(b, e, x + 1, y, x + 1, y + 1);
          edge(e, d, x + 1, y + 1, x, y + 1);
          edge(d, a, x, y + 1, x, y);
          for (let p = 0; p + 1 < pts.length; p += 2) {
            c.moveTo(pts[p][0], pts[p][1]);
            c.lineTo(pts[p + 1][0], pts[p + 1][1]);
          }
        }
      c.strokeStyle =
        level < tide
          ? 'rgba(167,216,194,.14)'
          : level < tide + 0.01
            ? 'rgba(236,235,194,.65)'
            : 'rgba(45,89,65,.16)';
      c.lineWidth = level < tide + 0.01 && level > tide ? 2 : 1;
      c.stroke();
    }
    this.revision = w.revision;
    this.tide = Math.round(tide * 100);
  }
  draw(w: World, v: View, t: number) {
    const c = this.ctx,
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (
      this.canvas.width !== Math.round(v.width * dpr) ||
      this.canvas.height !== Math.round(v.height * dpr)
    ) {
      this.canvas.width = Math.round(v.width * dpr);
      this.canvas.height = Math.round(v.height * dpr);
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, v.width, v.height);
    c.fillStyle = '#1d4f58';
    c.fillRect(0, 0, v.width, v.height);
    if (nightAmount(w) > 0) {
      c.fillStyle = 'rgba(8,20,49,' + nightAmount(w) * 0.72 + ')';
      c.fillRect(0, 0, v.width, v.height);
    }
    if (
      this.revision !== w.revision ||
      this.tide !== Math.round(seaLevel(w) * 100)
    )
      this.rebuild(w);
    const s = this.scale(v);
    c.save();
    c.translate(v.width / 2, v.height / 2);
    c.scale(s, s);
    c.translate(-WIDTH / 2 + v.x, -HEIGHT / 2 + v.y);
    c.drawImage(this.terrain, 0, 0);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(196,229,213,.19)';
    c.beginPath();
    for (let i = 0; i < 180; i++) {
      const x = hash(i, 4, w.seed) * WIDTH,
        y = hash(i, 9, w.seed) * HEIGHT,
        drift = Math.sin(t * 0.2 + i) * 6;
      if (heightAt(w, x, y) < -0.03) {
        c.moveTo(x + drift, y);
        c.quadraticCurveTo(x + 9 + drift, y - 2, x + 18 + drift, y);
      }
    }
    c.stroke();
    // Gulls keep their own slow circles above the sea.
    c.strokeStyle = 'rgba(239,237,207,.72)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const x = 200 + hash(i, 71, w.seed) * 1000 + Math.cos(t * 0.045 + i) * 60,
        y = 130 + hash(i, 93, w.seed) * 660 + Math.sin(t * 0.045 + i) * 28,
        flap = Math.sin(t * 3 + i) * 3;
      c.beginPath();
      c.moveTo(x - 7, y + flap);
      c.quadraticCurveTo(x - 3, y - 3, x, y);
      c.quadraticCurveTo(x + 3, y - 3, x + 7, y + flap);
      c.stroke();
    }
    if (isCity(w)) {
      for (const road of w.city.roads) {
        if (!road.enabled) continue;
        const a = w.city.nodes[road.a],
          b = w.city.nodes[road.b];
        c.strokeStyle = road.bridge ? '#b4b7aa' : '#53605c';
        c.lineWidth = road.lanes * 1.5 + 2;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
      for (const p of w.city.parcels) {
        if (p.zone === 'park') {
          c.fillStyle = '#577750';
        } else {
          c.fillStyle = p.floors ? ZONES[p.zone].color : '#9b9c77';
        }
        c.fillRect(p.x - p.width / 2, p.y - p.depth / 2, p.width, p.depth);
        if (p.floors > 20) {
          c.fillStyle = '#d4d5c0';
          c.fillRect(
            p.x - p.width * 0.2,
            p.y - p.depth * 0.2,
            p.width * 0.4,
            p.depth * 0.4,
          );
        }
      }
    }
    for (const e of [...w.entities].sort((a, b) => a.y - b.y))
      this.drawEntity(e, w, t);
    if (v.labels)
      for (const island of w.islands) {
        c.save();
        c.translate(island.x, island.y + 62);
        c.font = '500 19px "Songti SC", SimSun, serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const m = c.measureText(island.name).width;
        c.fillStyle = 'rgba(17,57,61,.73)';
        c.beginPath();
        c.roundRect(-m / 2 - 15, -16, m + 30, 33, 16);
        c.fill();
        c.fillStyle = '#f1edd2';
        c.fillText(island.name, 0, 0);
        c.restore();
      }
    const darkness = nightAmount(w);
    if (darkness > 0) {
      c.fillStyle = 'rgba(8,20,49,' + darkness * 0.72 + ')';
      c.fillRect(0, 0, WIDTH, HEIGHT);
      for (const e of w.entities)
        if (e.kind === 'home' || e.kind === 'lantern') {
          const r = e.kind === 'home' ? 35 : 25,
            glow = c.createRadialGradient(e.x, e.y - 7, 0, e.x, e.y - 7, r);
          glow.addColorStop(0, 'rgba(255,206,105,' + darkness * 0.8 + ')');
          glow.addColorStop(1, 'rgba(255,184,65,0)');
          c.fillStyle = glow;
          c.fillRect(e.x - r, e.y - r - 7, r * 2, r * 2);
          c.fillStyle = '#ffdb81';
          c.fillRect(e.x - 2, e.y - 10, 4, 5);
        }
    }
    if (w.weather === 'rain') {
      c.strokeStyle = 'rgba(206,229,221,.33)';
      c.lineWidth = 1.1;
      c.beginPath();
      for (let i = 0; i < 220; i++) {
        const x = (hash(i, 2, 1) * WIDTH + t * 40) % WIDTH,
          y = (hash(i, 3, 1) * HEIGHT + t * 310) % HEIGHT;
        c.moveTo(x, y);
        c.lineTo(x - 5, y + 16);
      }
      c.stroke();
      c.fillStyle = 'rgba(27,57,69,.14)';
      c.fillRect(0, 0, WIDTH, HEIGHT);
    }
    if (w.weather === 'mist')
      for (let i = 0; i < 6; i++) {
        const x = ((i * 310 + t * 7) % (WIDTH + 500)) - 250,
          y = 170 + i * 140,
          g = c.createRadialGradient(x, y, 0, x, y, 300);
        g.addColorStop(0, 'rgba(224,237,221,.23)');
        g.addColorStop(1, 'rgba(224,237,221,0)');
        c.fillStyle = g;
        c.fillRect(x - 300, y - 300, 600, 600);
      }
    if (v.pointer) {
      c.beginPath();
      c.arc(
        v.pointer.x,
        v.pointer.y,
        ['land', 'water'].includes(v.tool)
          ? v.radius
          : v.tool === 'home'
            ? 25
            : v.tool === 'look'
              ? 7
              : 15,
        0,
        Math.PI * 2,
      );
      c.fillStyle = 'rgba(240,235,189,.12)';
      c.fill();
      c.lineWidth = 1.4 / s;
      c.setLineDash([4 / s, 4 / s]);
      c.strokeStyle = '#fff3c3';
      c.stroke();
      c.setLineDash([]);
    }
    c.restore();
    const g = c.createRadialGradient(
      v.width / 2,
      v.height / 2,
      v.width * 0.15,
      v.width / 2,
      v.height / 2,
      Math.max(v.width, v.height) * 0.7,
    );
    g.addColorStop(0, 'rgba(9,42,50,0)');
    g.addColorStop(1, 'rgba(6,33,44,.28)');
    c.fillStyle = g;
    c.fillRect(0, 0, v.width, v.height);
  }
  drawEntity(e: Entity, w: World, t: number) {
    const c = this.ctx;
    c.save();
    c.translate(e.x, e.y);
    if (e.kind === 'tree') {
      const growth = Math.min(1, 0.3 + e.age / 130),
        sway = Math.sin(t * 1.5 + e.id) * 1.1;
      c.scale(growth, growth);
      c.fillStyle = 'rgba(20,58,48,.18)';
      c.beginPath();
      c.ellipse(7, 3, 12, 5, -0.2, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#675a3c';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(0, 1);
      c.lineTo(sway, -17);
      c.stroke();
      if (e.variant % 2 === 0) {
        for (let i = 0; i < 3; i++) {
          c.fillStyle = ['#295e4c', '#347455', '#488360'][i];
          c.beginPath();
          c.moveTo(sway, -34 + i * 8);
          c.lineTo(-12 + i * 2, -12 + i * 6);
          c.lineTo(12 - i * 2, -12 + i * 6);
          c.closePath();
          c.fill();
        }
      } else
        for (let i = 0; i < 4; i++) {
          c.fillStyle = ['#2c674d', '#397a54', '#528956', '#63925d'][i];
          c.beginPath();
          c.ellipse(
            (i % 2 ? 5 : -4) + sway,
            -18 - (i > 1 ? 8 : 0),
            8,
            10,
            0,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
    }
    if (e.kind === 'home') {
      c.fillStyle = 'rgba(23,53,42,.18)';
      c.beginPath();
      c.ellipse(8, 4, 23, 7, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#eadcb5';
      c.fillRect(-13, -15, 26, 20);
      c.fillStyle = '#b9b088';
      c.fillRect(9, -15, 6, 20);
      c.fillStyle = ['#b6734f', '#536e73', '#9b6455', '#687b5a'][e.variant];
      c.beginPath();
      c.moveTo(-18, -14);
      c.lineTo(-1, -31);
      c.lineTo(18, -14);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(44,59,47,.3)';
      c.lineWidth = 1.4;
      c.stroke();
      c.fillStyle = '#685f47';
      c.fillRect(-4, -5, 6, 10);
      c.fillStyle = '#eebc68';
      c.fillRect(-10, -10, 4, 5);
      c.fillRect(6, -10, 4, 5);
      c.fillStyle = '#c5bda4';
      c.fillRect(8, -29, 4, 10);
      if (w.weather !== 'rain')
        for (let i = 0; i < 3; i++) {
          c.fillStyle = 'rgba(235,227,196,' + (0.16 - i * 0.035) + ')';
          c.beginPath();
          c.ellipse(
            12 + Math.sin(t + i) * 3 + i * 2,
            -34 - ((t * 5 + i * 7) % 22),
            4 + i,
            3 + i,
            0,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
    }
    if (e.kind === 'home') {
      const dx = e.targetX - e.x,
        dy = e.targetY - e.y;
      if (Math.hypot(dx, dy - 5) > 6) {
        c.fillStyle = 'rgba(27,53,43,.24)';
        c.beginPath();
        c.ellipse(dx + 2, dy + 2, 4, 2, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#5e6350';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(dx - 1, dy);
        c.lineTo(dx - 2, dy + 3 + Math.sin(t * 5 + e.id));
        c.moveTo(dx + 1, dy);
        c.lineTo(dx + 2, dy + 3 - Math.sin(t * 5 + e.id));
        c.stroke();
        c.fillStyle = ['#dbb469', '#b3c4b0', '#b7755e', '#c5c195'][e.variant];
        c.fillRect(dx - 2, dy - 5, 4, 6);
        c.fillStyle = '#ebd4a9';
        c.beginPath();
        c.arc(dx, dy - 7, 2.3, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (e.kind === 'boat') {
      c.rotate(e.angle);
      c.fillStyle = 'rgba(198,230,210,.23)';
      c.beginPath();
      c.ellipse(-17, 0, 12, 2.5, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#d9b97f';
      c.beginPath();
      c.moveTo(15, 0);
      c.quadraticCurveTo(-1, -9, -12, -4);
      c.lineTo(-12, 4);
      c.quadraticCurveTo(0, 9, 15, 0);
      c.fill();
      c.strokeStyle = '#645640';
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = '#f5edcc';
      c.beginPath();
      c.moveTo(0, -1);
      c.lineTo(-3, -23);
      c.lineTo(-13, -2);
      c.closePath();
      c.fill();
      c.strokeStyle = '#725e41';
      c.beginPath();
      c.moveTo(0, 5);
      c.lineTo(-3, -25);
      c.stroke();
    }
    if (e.kind === 'lantern') {
      const f = Math.sin(t * 2 + e.id) * 2;
      c.fillStyle = 'rgba(235,173,66,.15)';
      c.beginPath();
      c.ellipse(0, 7, 9, 3, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#f3c56e';
      c.beginPath();
      c.roundRect(-4, -9 + f, 8, 11, 3);
      c.fill();
      c.strokeStyle = '#ad7540';
      c.lineWidth = 1;
      c.stroke();
      c.fillStyle = '#fff0af';
      c.fillRect(-1, -5 + f, 2, 4);
    }
    c.restore();
  }
}
