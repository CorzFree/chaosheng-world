import * as THREE from 'three';
import {
  cityMetrics,
  jobCapacity,
  housingCapacity,
  ZONES,
  CITY_SCALE,
  type CityWorld,
  type Parcel,
  type CityRoad,
  type CityMetrics,
} from './city.ts';
import { terrainHeight } from './terrain3d.ts';
import { WIDTH, HEIGHT, hash, hour } from './world.ts';

export type CityOverlay = 'natural' | 'zones' | 'traffic' | 'transit';
export class CityLayer {
  readonly group = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private roofs: THREE.InstancedMesh;
  private roads: THREE.InstancedMesh;
  private sidewalks: THREE.InstancedMesh;
  private vehicles: THREE.InstancedMesh;
  private lights: THREE.InstancedMesh;
  private train: THREE.InstancedMesh;
  private people: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private night = { value: 0 };
  private overlay: CityOverlay = 'natural';
  private revision = -1;
  private world: CityWorld | null = null;
  private mapping: number[] = [];
  private dummy = new THREE.Object3D();
  private detail = new THREE.Group();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private routeData: {
    points: THREE.Vector3[];
    length: number;
    lengths: number[];
    speed: number;
    weight: number;
  }[] = [];
  private focus = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: '#ecc969',
      wireframe: true,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    }),
  );
  constructor() {
    const building = this.material({
      color: '#ffffff',
      roughness: 0.76,
      metalness: 0.08,
    });
    building.onBeforeCompile = (shader) => {
      shader.uniforms.uCityNight = this.night;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nattribute float aFloors;attribute float aSeed;attribute float aOccupancy;attribute float aOffice;varying vec3 vLocal;varying vec3 vFace;varying float vFloors;varying float vSeed;varying float vOccupancy;varying float vOffice;',
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLocal=position+vec3(.5);vFace=normal;vFloors=aFloors;vSeed=aSeed;vOccupancy=aOccupancy;vOffice=aOffice;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nuniform float uCityNight;varying vec3 vLocal;varying vec3 vFace;varying float vFloors;varying float vSeed;varying float vOccupancy;varying float vOffice;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat side=1.-step(.5,abs(vFace.y));float across=abs(vFace.x)>.5?vLocal.z:vLocal.x;vec2 cell=fract(vec2(across*(5.+vOffice*4.),vLocal.y*max(1.,vFloors)));float pane=smoothstep(.12,.18,cell.x)*(1.-smoothstep(.78,.84,cell.x))*smoothstep(.12,.18,cell.y)*(1.-smoothstep(.75,.83,cell.y))*side;float row=floor(vLocal.y*max(1.,vFloors));float col=floor(across*(5.+vOffice*4.));float occupied=step(fract(sin(row*127.1+col*311.7+vSeed*93.4)*43758.5),vOccupancy*.82);vec3 glass=mix(vec3(.075,.081,.07),vec3(.105,.165,.20),vOffice);diffuseColor.rgb=mix(diffuseColor.rgb,glass,pane*.85);',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=mix(vec3(1.,.63,.27),vec3(.68,.80,.88),vOffice*.45)*pane*occupied*uCityNight*1.55;',
      );
    };
    building.customProgramCacheKey = () => 'city-facades-1';
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (const key of ['aFloors', 'aSeed', 'aOccupancy', 'aOffice'])
      geo.setAttribute(
        key,
        new THREE.InstancedBufferAttribute(new Float32Array(5000), 1),
      );
    this.bodies = this.instances(geo, building, 5000);
    this.roofs = this.instances(
      new THREE.BoxGeometry(1, 1, 1),
      this.material({ color: '#646964', roughness: 0.95 }),
      3500,
    );
    this.roads = this.instances(
      new THREE.BoxGeometry(1, 1, 1),
      this.material({ color: '#363a3c', roughness: 0.97 }),
      2000,
    );
    this.sidewalks = this.instances(
      new THREE.BoxGeometry(1, 1, 1),
      this.material({ color: '#a6a69a', roughness: 1 }),
      2200,
    );
    this.vehicles = this.instances(
      new THREE.BoxGeometry(1.15, 0.7, 2.6),
      this.material({ color: '#ffffff', roughness: 0.5, metalness: 0.23 }),
      340,
    );
    this.lights = this.instances(
      new THREE.BoxGeometry(0.85, 0.16, 0.13),
      new THREE.MeshBasicMaterial({ color: '#fff0c3' }),
      680,
    );
    this.people = this.instances(
      new THREE.BoxGeometry(0.23, 0.75, 0.22),
      this.material({ color: '#ffffff', roughness: 1 }),
      200,
    );
    this.heads = this.instances(
      new THREE.SphereGeometry(0.08, 5, 4),
      this.material({ color: '#bea88f', roughness: 1 }),
      200,
    );
    this.train = this.instances(
      new THREE.BoxGeometry(1.9, 1.8, 8),
      this.material({ color: '#b6beb9', roughness: 0.4, metalness: 0.55 }),
      16,
    );
    this.group.add(this.detail, this.focus);
    this.focus.visible = false;
    this.focus.renderOrder = 8;
  }
  private material(p: THREE.MeshStandardMaterialParameters) {
    const m = new THREE.MeshStandardMaterial(p);
    this.materials.add(m);
    return m;
  }
  private instances(g: THREE.BufferGeometry, m: THREE.Material, n: number) {
    this.geometries.add(g);
    this.materials.add(m);
    const mesh = new THREE.InstancedMesh(g, m, n);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);
    return mesh;
  }
  private instance(
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    angle = 0,
    color?: THREE.Color,
  ) {
    this.dummy.position.set(x - WIDTH / 2, y, z - HEIGHT / 2);
    this.dummy.rotation.set(0, angle, 0);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
    if (color) mesh.setColorAt(index, color);
  }
  private mesh(
    g: THREE.BufferGeometry,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) {
    this.geometries.add(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x - WIDTH / 2, y, z - HEIGHT / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.detail.add(mesh);
    return mesh;
  }
  private base(w: CityWorld, p: Parcel) {
    return (
      Math.max(
        ...[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([a, b]) =>
          terrainHeight(w, p.x + (a * p.width) / 2, p.y + (b * p.depth) / 2),
        ),
      ) + 0.3
    );
  }
  private roadHeight(w: CityWorld, r: CityRoad, t: number) {
    const a = w.city.nodes[r.a],
      b = w.city.nodes[r.b];
    return r.bridge
      ? terrainHeight(w, a.x, a.y) * (1 - t) +
          terrainHeight(w, b.x, b.y) * t +
          Math.sin(t * Math.PI) * 3.5 +
          1
      : terrainHeight(w, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) + 0.23;
  }
  setOverlay(overlay: CityOverlay) {
    if (this.overlay !== overlay) {
      this.overlay = overlay;
      this.revision = -1;
    }
  }
  pick(raycaster: THREE.Raycaster) {
    const hit = raycaster.intersectObject(this.bodies, false)[0];
    return hit?.instanceId === undefined
      ? null
      : (this.mapping[hit.instanceId] ?? null);
  }
  select(id: number | null) {
    this.focus.visible = id !== null;
    if (id === null || !this.world) return;
    const p = this.world.city.parcels[id];
    if (!p) {
      this.focus.visible = false;
      return;
    }
    const h = Math.max(2, p.floors * 1.8);
    this.focus.position.set(
      p.x - WIDTH / 2,
      this.base(this.world, p) + h / 2,
      p.y - HEIGHT / 2,
    );
    this.focus.scale.set(p.width + 1, h + 1, p.depth + 1);
  }
  private clearDetail() {
    this.detail.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        if (this.geometries.delete(o.geometry)) o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials) if (this.materials.delete(m)) m.dispose();
      }
    });
    this.group.remove(this.detail);
    this.detail = new THREE.Group();
    this.group.add(this.detail);
  }
  private build(w: CityWorld) {
    this.clearDetail();
    let body = 0,
      roof = 0,
      road = 0,
      sidewalk = 0;
    this.mapping = [];
    const metrics = cityMetrics(w),
      jobFill = new Map<number, number>();
    for (const trip of metrics.commutes)
      jobFill.set(trip.work, (jobFill.get(trip.work) || 0) + trip.workers);
    const attrs = this.bodies.geometry.attributes as Record<
      string,
      THREE.InstancedBufferAttribute
    >;
    for (const p of w.city.parcels) {
      const base = this.base(w, p),
        color =
          this.overlay === 'zones'
            ? new THREE.Color(ZONES[p.zone].color)
            : new THREE.Color(
                p.zone === 'commercial'
                  ? ['#89999e', '#657c86', '#a0a9a6', '#768d96', '#b6b4a5'][
                      p.style
                    ]
                  : p.zone === 'industrial'
                    ? '#929c9d'
                    : ['#a39b83', '#9a7964', '#b5aa91', '#807267', '#b9ad98'][
                        p.style
                      ],
              );
      if (p.zone === 'park') {
        if (this.overlay === 'zones') {
          this.instance(
            this.sidewalks,
            sidewalk++,
            p.x,
            base,
            p.y,
            p.width,
            0.2,
            p.depth,
            0,
            new THREE.Color('#62946a'),
          );
        }
        continue;
      }
      this.instance(
        this.sidewalks,
        sidewalk++,
        p.x,
        base - 0.28,
        p.y,
        p.width + 1.1,
        0.45,
        p.depth + 1.1,
        0,
        new THREE.Color('#a9aa9c'),
      );
      if (p.floors <= 0) {
        if (p.plannedFloors > 0) {
          this.instance(
            this.roofs,
            roof++,
            p.x,
            base + 0.16,
            p.y,
            p.width * 0.9,
            0.3,
            p.depth * 0.9,
            0,
            new THREE.Color('#8b7e60'),
          );
        }
        continue;
      }
      const occupancy = housingCapacity(p)
        ? p.residents / housingCapacity(p)
        : (jobFill.get(p.id) || 0) / Math.max(1, jobCapacity(p));
      const addBody = (
        width: number,
        depth: number,
        height: number,
        y: number,
        floors: number,
      ) => {
        this.instance(
          this.bodies,
          body,
          p.x,
          y,
          p.y,
          width,
          height,
          depth,
          0,
          color,
        );
        attrs.aFloors.setX(body, floors);
        attrs.aSeed.setX(body, p.id + 0.1);
        attrs.aOccupancy.setX(body, occupancy);
        attrs.aOffice.setX(
          body,
          p.zone === 'commercial' ? 1 : p.zone === 'industrial' ? 0.4 : 0,
        );
        this.mapping[body] = p.id;
        body++;
      };
      const h = p.floors * 1.8,
        tall = p.floors > 20;
      if (tall) {
        addBody(p.width, p.depth, h * 0.72, base + h * 0.36, p.floors * 0.72);
        addBody(
          p.width * 0.79,
          p.depth * 0.76,
          h * 0.2,
          base + h * 0.82,
          p.floors * 0.2,
        );
        addBody(
          p.width * 0.58,
          p.depth * 0.56,
          h * 0.08,
          base + h * 0.96,
          Math.max(1, p.floors * 0.08),
        );
      } else addBody(p.width, p.depth, h, base + h / 2, p.floors);
      this.instance(
        this.roofs,
        roof++,
        p.x,
        base + h + 0.35,
        p.y,
        p.width * (tall ? 0.47 : 0.54),
        0.7,
        p.depth * (tall ? 0.4 : 0.52),
        0,
        new THREE.Color('#676c65'),
      );
      if (p.floors > 65 && p.style % 2 === 0)
        this.instance(
          this.roofs,
          roof++,
          p.x,
          base + h + 8,
          p.y,
          0.45,
          16,
          0.45,
          0,
          new THREE.Color('#b7bdb4'),
        );
    }
    for (const r of w.city.roads) {
      if (!r.enabled && !r.built && this.overlay !== 'zones') continue;
      const a = w.city.nodes[r.a],
        b = w.city.nodes[r.b],
        length = Math.hypot(b.x - a.x, b.y - a.y),
        parts = r.bridge ? 22 : Math.max(1, Math.ceil(length / 18)),
        angle = Math.atan2(b.x - a.x, b.y - a.y),
        width = r.lanes * 1.5 + 1.8;
      const load = (metrics.roadLoads.get(r.id) || 0) / (r.lanes * 700),
        color =
          this.overlay === 'traffic'
            ? new THREE.Color(
                load > 1 ? '#d2674d' : load > 0.5 ? '#d4b064' : '#6f9b7a',
              )
            : new THREE.Color(
                r.enabled ? '#3d4140' : r.built ? '#916e4e' : '#8e9a80',
              );
      for (let i = 0; i < parts; i++) {
        const t = (i + 0.5) / parts,
          x = a.x + (b.x - a.x) * t,
          y = a.y + (b.y - a.y) * t,
          h = this.roadHeight(w, r, t);
        this.instance(
          this.roads,
          road++,
          x,
          h,
          y,
          width,
          0.26,
          length / parts + 0.5,
          angle,
          color,
        );
      }
      if (r.bridge) this.bridge(w, r, width);
    }
    for (const mesh of [this.bodies, this.roofs, this.roads, this.sidewalks]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (const attr of Object.values(attrs))
      if (attr instanceof THREE.InstancedBufferAttribute)
        attr.needsUpdate = true;
    this.bodies.count = body;
    this.bodies.computeBoundingSphere();
    this.roofs.count = roof;
    this.roads.count = road;
    this.sidewalks.count = sidewalk;
    this.infrastructure(w);
    this.buildRoutes(w, metrics);
    this.revision = w.city.revision;
    this.world = w;
  }
  private bridge(w: CityWorld, r: CityRoad, width: number) {
    const a = w.city.nodes[r.a],
      b = w.city.nodes[r.b],
      dx = b.x - a.x,
      dz = b.y - a.y,
      length = Math.hypot(dx, dz),
      px = dz / length,
      pz = -dx / length,
      steel = this.material({
        color: '#687678',
        roughness: 0.72,
        metalness: 0.35,
      });
    const cableHeight = (t: number) => {
      const deck = this.roadHeight(w, r, t);
      return (
        deck +
        (t < 0.25
          ? 2 + (t / 0.25) * 38
          : t > 0.75
            ? 2 + ((1 - t) / 0.25) * 38
            : 13 + 27 * ((t - 0.5) / 0.25) ** 2)
      );
    };
    for (const t of [0.25, 0.75]) {
      const x = a.x + dx * t,
        y = a.y + dz * t,
        deck = this.roadHeight(w, r, t);
      for (const side of [-1, 1])
        this.mesh(
          new THREE.BoxGeometry(1.2, 42, 1.2),
          steel,
          x + px * width * 0.62 * side,
          deck + 20,
          y + pz * width * 0.62 * side,
        );
      const beam = this.mesh(
        new THREE.BoxGeometry(width * 1.6, 1.4, 1.3),
        steel,
        x,
        deck + 40,
        y,
      );
      beam.rotation.y = -Math.atan2(pz, px);
    }
    for (const side of [-1, 1]) {
      const points = [];
      for (let i = 0; i <= 32; i++) {
        const t = i / 32,
          x = a.x + dx * t + px * width * 0.62 * side,
          y = a.y + dz * t + pz * width * 0.62 * side;
        points.push(
          new THREE.Vector3(x - WIDTH / 2, cableHeight(t), y - HEIGHT / 2),
        );
        if (i % 2 === 0 && i > 0 && i < 32) {
          const low = this.roadHeight(w, r, t),
            height = cableHeight(t) - low;
          this.mesh(
            new THREE.CylinderGeometry(0.08, 0.08, height, 4),
            steel,
            x,
            low + height / 2,
            y,
          );
        }
      }
      const geometry = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        60,
        0.12,
        4,
        false,
      );
      this.geometries.add(geometry);
      const cable = new THREE.Mesh(geometry, steel);
      this.detail.add(cable);
    }
  }
  private infrastructure(w: CityWorld) {
    const concrete = this.material({ color: '#a6aaa2', roughness: 1 }),
      metal = this.material({
        color: '#7c8f95',
        roughness: 0.55,
        metalness: 0.35,
      }),
      water = this.material({
        color: '#416e70',
        roughness: 0.25,
        metalness: 0.3,
      });
    // Park reservoirs and a continuous pedestrian landscape.
    const pond = this.mesh(
      new THREE.CylinderGeometry(1, 1, 0.25, 48),
      water,
      674,
      terrainHeight(w, 674, 376) + 0.2,
      376,
    );
    pond.scale.set(26, 1, 39);
    // Utility plants are real service providers in the city model.
    for (const f of w.city.facilities) {
      const y = terrainHeight(w, f.x, f.y);
      if (f.kind === 'water') {
        for (let i = 0; i < 3; i++)
          this.mesh(
            new THREE.CylinderGeometry(7, 7, 4, 18),
            metal,
            f.x - 9 + i * 9,
            y + 2,
            f.y,
          );
        this.mesh(
          new THREE.BoxGeometry(19, 5, 10),
          concrete,
          f.x,
          y + 2.5,
          f.y + 12,
        );
      }
      if (f.kind === 'power') {
        this.mesh(
          new THREE.BoxGeometry(24, 7, 14),
          concrete,
          f.x,
          y + 3.5,
          f.y,
        );
        for (let i = 0; i < 2; i++)
          this.mesh(
            new THREE.CylinderGeometry(1.5, 2.2, 30, 10),
            metal,
            f.x - 6 + i * 12,
            y + 15,
            f.y,
          );
      }
      if (f.kind === 'port') {
        const deckY = Math.max(15.5, y);
        this.mesh(
          new THREE.BoxGeometry(36, 2, 76),
          concrete,
          f.x,
          deckY - 1,
          f.y,
        );
        for (let r = 0; r < 8; r++)
          for (let c = 0; c < 4; c++) {
            const container = this.material({
              color: ['#725d50', '#6f878c', '#b1926a', '#637466'][(r + c) % 4],
              roughness: 0.9,
            });
            this.mesh(
              new THREE.BoxGeometry(6, 2.7, 3),
              container,
              f.x - 12 + c * 8,
              deckY + 1.35 + (r % 3 === 0 ? 2.7 : 0),
              f.y - 27 + r * 7,
            );
          }
        for (let i = 0; i < 3; i++) {
          const x = f.x + 17,
            z = f.y - 23 + i * 24;
          this.mesh(new THREE.BoxGeometry(1, 28, 1), metal, x, deckY + 14, z);
          this.mesh(
            new THREE.BoxGeometry(25, 1, 1),
            metal,
            x + 6,
            deckY + 28,
            z,
          );
        }
      }
    }
    // Elevated metro follows the western edge of the central park.
    if (w.city.metroBuilt ?? w.city.metro) {
      for (let y = 155; y < 785; y += 27) {
        const ground = terrainHeight(w, 570, y);
        this.mesh(
          new THREE.BoxGeometry(4, 0.5, 28),
          metal,
          570,
          ground + 5.5,
          y,
        );
        if (Math.round(y) % 3 === 2)
          this.mesh(
            new THREE.BoxGeometry(0.9, 5.5, 0.9),
            concrete,
            570,
            ground + 2.75,
            y,
          );
      }
      for (const y of [190, 325, 460, 595, 730]) {
        const ground = terrainHeight(w, 570, y);
        this.mesh(
          new THREE.BoxGeometry(8, 0.7, 22),
          concrete,
          570,
          ground + 5.1,
          y,
        );
        this.mesh(new THREE.BoxGeometry(8, 0.5, 22), metal, 570, ground + 9, y);
      }
    }
    if (this.overlay === 'transit') {
      const points = [
          new THREE.Vector3(570 - WIDTH / 2, 40, 155 - HEIGHT / 2),
          new THREE.Vector3(570 - WIDTH / 2, 40, 780 - HEIGHT / 2),
        ],
        geometry = new THREE.BufferGeometry().setFromPoints(points),
        material = new THREE.LineBasicMaterial({
          color: '#70b8df',
          depthTest: false,
        });
      this.geometries.add(geometry);
      this.materials.add(material);
      this.detail.add(new THREE.Line(geometry, material));
    }
  }
  private buildRoutes(w: CityWorld, metrics: CityMetrics) {
    this.routeData = [];
    for (const trip of metrics.commutes) {
      if (trip.nodes.length < 2) continue;
      const points = trip.nodes.map((id, index) => {
        const n = w.city.nodes[id],
          edge =
            w.city.roads[trip.edges[Math.min(index, trip.edges.length - 1)]],
          t = edge?.a === id ? 0 : 1;
        return new THREE.Vector3(
          n.x,
          edge ? this.roadHeight(w, edge, t) : terrainHeight(w, n.x, n.y) + 0.2,
          n.y,
        );
      });
      const lengths = [0];
      for (let i = 1; i < points.length; i++)
        lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
      const loads = trip.edges.map(
        (id) =>
          (metrics.roadLoads.get(id) || 0) / (w.city.roads[id].lanes * 700),
      );
      const max = Math.max(0.1, ...loads);
      this.routeData.push({
        points,
        length: lengths[lengths.length - 1],
        lengths,
        speed: 8 / (1 + 0.15 * Math.min(4, max) ** 4),
        weight: trip.workers * (trip.metro ? 0.2 : 1),
      });
    }
  }
  update(w: CityWorld, t: number, daylight: number, selected: number | null) {
    if (this.world !== w || this.revision !== w.city.revision) this.build(w);
    this.night.value = 1 - daylight;
    this.select(selected);
    const h = hour(w),
      rush =
        0.22 +
        0.78 *
          Math.max(
            Math.exp(-(((h - 8.4) / 1.6) ** 2)),
            Math.exp(-(((h - 18) / 1.7) ** 2)),
          );
    const totalWeight = this.routeData.reduce((sum, r) => sum + r.weight, 0),
      count = Math.min(330, Math.floor((90 + totalWeight / 35) * rush));
    let cars = 0;
    if (totalWeight > 0)
      for (let i = 0; i < count; i++) {
        let pick = hash(i, 71, w.seed) * totalWeight,
          route = this.routeData[0];
        for (const candidate of this.routeData) {
          pick -= candidate.weight;
          if (pick <= 0) {
            route = candidate;
            break;
          }
        }
        const distance =
            (t * route.speed + hash(i, 81, w.seed) * route.length) %
            Math.max(1, route.length),
          reverse = h > 15 !== (i % 7 === 0),
          d = reverse ? route.length - distance : distance;
        let segment = 1;
        while (segment < route.lengths.length - 1 && route.lengths[segment] < d)
          segment++;
        const a = route.points[segment - 1],
          b = route.points[segment],
          fraction =
            (d - route.lengths[segment - 1]) /
            Math.max(
              0.001,
              route.lengths[segment] - route.lengths[segment - 1],
            ),
          direction = b
            .clone()
            .sub(a)
            .normalize()
            .multiplyScalar(reverse ? -1 : 1),
          pos = a.clone().lerp(b, fraction);
        const offset = 0.9;
        pos.x += direction.z * offset;
        pos.z -= direction.x * offset;
        const angle = Math.atan2(direction.x, direction.z),
          y = terrainHeight(w, pos.x, pos.z) + 0.8;
        // The center span must follow the bridge deck, not the sea below it.
        const road = w.city.roads.find(
          (r) =>
            r.enabled &&
            r.bridge &&
            ((w.city.nodes[r.a].x <= pos.x && w.city.nodes[r.b].x >= pos.x) ||
              (w.city.nodes[r.b].x <= pos.x && w.city.nodes[r.a].x >= pos.x)) &&
            Math.abs(pos.z - (w.city.nodes[r.a].y + w.city.nodes[r.b].y) / 2) <
              30,
        );
        const bridgeY = road
          ? this.roadHeight(
              w,
              road,
              clamp01(
                (pos.x - w.city.nodes[road.a].x) /
                  (w.city.nodes[road.b].x - w.city.nodes[road.a].x),
              ),
            ) + 0.65
          : y;
        const color = new THREE.Color(
          i % 5 === 0
            ? '#e4ba45'
            : i % 5 === 1
              ? '#e4e6db'
              : i % 5 === 2
                ? '#46575f'
                : i % 5 === 3
                  ? '#8b9494'
                  : '#aeaaa0',
        );
        this.instance(
          this.vehicles,
          cars,
          pos.x,
          bridgeY,
          pos.z,
          1,
          1,
          1,
          angle,
          color,
        );
        this.instance(
          this.lights,
          cars,
          pos.x + direction.x * 1.3,
          bridgeY + 0.03,
          pos.z + direction.z * 1.3,
          1,
          1,
          1,
          angle,
        );
        cars++;
      }
    this.vehicles.count = cars;
    this.lights.count = daylight < 0.6 ? cars : 0;
    this.vehicles.instanceMatrix.needsUpdate = true;
    if (this.vehicles.instanceColor)
      this.vehicles.instanceColor.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    let walkers = 0;
    if (this.routeData.length)
      for (let i = 0; i < Math.min(180, Math.round(90 * rush + 35)); i++) {
        const route = this.routeData[i % this.routeData.length],
          distance =
            (t * 0.7 + hash(i, 99, w.seed) * route.length) %
            Math.max(1, route.length);
        let segment = 1;
        while (
          segment < route.lengths.length - 1 &&
          route.lengths[segment] < distance
        )
          segment++;
        const a = route.points[segment - 1],
          b = route.points[segment],
          f =
            (distance - route.lengths[segment - 1]) /
            Math.max(
              0.001,
              route.lengths[segment] - route.lengths[segment - 1],
            ),
          direction = b.clone().sub(a).normalize(),
          point = a.clone().lerp(b, f);
        point.x += direction.z * 3.4;
        point.z -= direction.x * 3.4;
        if (terrainHeight(w, point.x, point.z) < 16) continue;
        const y = terrainHeight(w, point.x, point.z),
          angle = Math.atan2(direction.x, direction.z);
        this.instance(
          this.people,
          walkers,
          point.x,
          y + 0.46,
          point.z,
          1,
          1,
          1,
          angle,
          new THREE.Color(['#858e91', '#a8a190', '#555f69', '#8f795e'][i % 4]),
        );
        this.instance(
          this.heads,
          walkers++,
          point.x,
          y + 0.92,
          point.z,
          1,
          1,
          1,
          angle,
        );
      }
    this.people.count = walkers;
    this.heads.count = walkers;
    this.people.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    if (this.people.instanceColor) this.people.instanceColor.needsUpdate = true;
    let trains = 0;
    if (w.city.metro)
      for (let line = 0; line < 2; line++)
        for (let car = 0; car < 4; car++) {
          const period = 625,
            position = (t * 14 + line * period * 0.5 + car * 9) % (period * 2),
            z = position < period ? 155 + position : 780 - (position - period),
            forward = position < period;
          this.instance(
            this.train,
            trains++,
            570 + (forward ? 1.1 : -1.1),
            terrainHeight(w, 570, z) + 6.7,
            z,
            1,
            1,
            1,
            forward ? 0 : Math.PI,
          );
        }
    this.train.count = trains;
    this.train.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.clearDetail();
    for (const mesh of [
      this.bodies,
      this.roofs,
      this.roads,
      this.sidewalks,
      this.vehicles,
      this.lights,
      this.train,
      this.people,
      this.heads,
    ])
      mesh.dispose();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.focus.geometry.dispose();
    (this.focus.material as THREE.Material).dispose();
  }
}
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
