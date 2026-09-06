import { CityLayer, type CityOverlay } from './city-renderer.ts';
import { isCity } from './city.ts';
import * as THREE from 'three';
import {
  WIDTH,
  HEIGHT,
  COLS,
  ROWS,
  CELL,
  hash,
  hour,
  seaLevel,
  getHarbors,
  type Entity,
  type World,
} from './world';
import type { View } from './renderer';

export { ELEVATION, terrainHeight, createTerrainGeometry } from './terrain3d';
import { ELEVATION, terrainHeight, createTerrainGeometry } from './terrain3d';
const waterVertex = `
uniform float uTime;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y += sin(world.x*.022 + uTime*.7)*.23 + sin(world.z*.034 + world.x*.01 - uTime*.9)*.17;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const waterFragment = `
uniform float uTime;
uniform float uSea;
uniform float uDay;
uniform float uRain;
uniform sampler2D uHeight;
uniform vec3 uSun;
uniform vec3 uSky;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vWorld;
float noise(vec2 p) {
  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
}
void main() {
  vec2 uv=(vWorld.xz+vec2(720.,480.))/vec2(1440.,960.);
  float h=-54.;
  if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))) {
    vec2 grid=clamp(uv*vec2(240.,160.),vec2(0.),vec2(239.,159.)),cell=floor(grid),f=fract(grid);
    vec2 size=vec2(240.,160.);
    float a=texture2D(uHeight,(cell+vec2(.5,.5))/size).r;
    float b=texture2D(uHeight,(cell+vec2(1.5,.5))/size).r;
    float c=texture2D(uHeight,(cell+vec2(.5,1.5))/size).r;
    float d=texture2D(uHeight,(cell+vec2(1.5,1.5))/size).r;
    float value=f.x+f.y<=1. ? a+(b-a)*f.x+(c-a)*f.y : d+(c-d)*(1.-f.x)+(b-d)*(1.-f.y);
    h=value*180.;
  }
  float depth=max(0.,uSea-h);
  if(h>vWorld.y+.2) discard;
  float waveA=vWorld.x*.045+uTime*.85;
  float waveB=vWorld.z*.057+vWorld.x*.02-uTime*1.1;
  float ripple=sin(vWorld.x*.8+uTime*5.)*cos(vWorld.z*.75-uTime*4.)*uRain;
  vec3 normal=normalize(vec3(-cos(waveA)*.065,1.,-cos(waveB)*.08+ripple*.035));
  vec3 viewDir=normalize(cameraPosition-vWorld);
  float fresnel=pow(1.-max(dot(viewDir,normal),0.),4.);
  vec3 shallow=vec3(.12,.37,.34),deep=vec3(.025,.15,.19);
  vec3 color=mix(shallow,deep,1.-exp(-depth*.065));
  color*=.2+.8*uDay;
  color=mix(color,uSky*.85,fresnel*.6);
  vec3 halfDir=normalize(normalize(uSun)+viewDir);
  float sparkle=pow(max(dot(normal,halfDir),0.),240.)*uDay;
  color+=vec3(1.,.88,.63)*sparkle*2.4*(1.-uRain*.65);
  float foamWave=sin(depth*2.1-uTime*1.4+sin(vWorld.x*.1)*.5);
  float foam=(1.-smoothstep(.1,4.5,depth))*smoothstep(.25,.8,foamWave)*.48;
  color=mix(color,vec3(.8,.85,.79)*(.35+.65*uDay),foam);
  float caustic=pow(.5+.5*sin(vWorld.x*.12+sin(vWorld.z*.15+uTime)*2.+uTime),12.);
  color+=vec3(.15,.23,.16)*caustic*exp(-depth*.24)*uDay*.23;
  float fog=smoothstep(uFogNear,uFogFar,distance(cameraPosition,vWorld));
  color=mix(color,uSky,fog*.8);
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

type BoatParts = { group: THREE.Group; sail: THREE.Mesh; wake: THREE.Mesh };
export class Renderer3D {
  readonly is3D = true;
  private cityLayer: CityLayer | null = null;
  private cityOverlay: CityOverlay = 'natural';
  private citySelection: number | null = null;
  setCityOverlay(overlay: CityOverlay) {
    this.cityOverlay = overlay;
    this.cityLayer?.setOverlay(overlay);
  }
  selectCity(id: number | null) {
    this.citySelection = id;
    this.cityLayer?.select(id);
  }
  pickCity(x: number, y: number, v: View) {
    this.updateCamera(v);
    this.raycaster.setFromCamera(
      new THREE.Vector2((x / v.width) * 2 - 1, 1 - (y / v.height) * 2),
      this.camera,
    );
    return this.cityLayer?.pick(this.raycaster) ?? null;
  }

  canvas: HTMLCanvasElement;
  gl: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 1, 10000);
  ground: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  heightTexture: THREE.DataTexture;
  overlay: HTMLCanvasElement;
  overlayContext: CanvasRenderingContext2D;
  revision = -1;
  private seed = -1;
  private world: World | null = null;
  private raycaster = new THREE.Raycaster();
  private seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private sun = new THREE.DirectionalLight(0xfff2d7, 3);
  private hemi = new THREE.HemisphereLight(0xcaddeb, 0x394b32, 1.4);
  private moon = new THREE.DirectionalLight(0xadc8f5, 0.12);
  private dummy = new THREE.Object3D();
  private trunks: THREE.InstancedMesh;
  private crowns: THREE.InstancedMesh;
  private rocks: THREE.InstancedMesh;
  private people: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private homes = new Map<number, THREE.Group>();
  private docks = new THREE.Group();
  private dockSignature = '';
  private boats = new Map<number, BoatParts>();
  private lanterns = new Map<number, THREE.Group>();
  private materials = new Set<THREE.Material>();
  private geometries = new Set<THREE.BufferGeometry>();
  private pointerRing: THREE.Mesh;
  private rain: THREE.LineSegments;
  private lastWidth = 0;
  private lastHeight = 0;
  private cameraDistance = 1700;
  private dayLight = 1;
  private labels: { text: string; point: THREE.Vector3 }[] = [];
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.gl.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.12;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.moon);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -1000;
    this.sun.shadow.camera.right = 1000;
    this.sun.shadow.camera.top = 1000;
    this.sun.shadow.camera.bottom = -1000;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 4000;
    this.sun.shadow.normalBias = 1.2;
    this.sun.shadow.bias = -0.0002;
    this.moon.position.set(-300, 800, 200);
    const groundMaterial = this.material({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
    this.ground = new THREE.Mesh(new THREE.BufferGeometry(), groundMaterial);
    this.ground.position.set(0, 0, 0);
    this.ground.receiveShadow = true;
    this.ground.castShadow = true;
    this.scene.add(this.ground, this.docks);
    this.heightTexture = new THREE.DataTexture(
      new Float32Array(COLS * ROWS),
      COLS,
      ROWS,
      THREE.RedFormat,
      THREE.FloatType,
    );
    this.heightTexture.minFilter = THREE.NearestFilter;
    this.heightTexture.magFilter = THREE.NearestFilter;
    this.heightTexture.needsUpdate = true;
    const waterMaterial = new THREE.ShaderMaterial({
      vertexShader: waterVertex,
      fragmentShader: waterFragment,
      uniforms: {
        uTime: { value: 0 },
        uSea: { value: 9 },
        uDay: { value: 1 },
        uRain: { value: 0 },
        uHeight: { value: this.heightTexture },
        uSun: { value: new THREE.Vector3() },
        uSky: { value: new THREE.Color('#9bb8c2') },
        uFogNear: { value: 1200 },
        uFogFar: { value: 3500 },
      },
    });
    const waterGeometry = new THREE.PlaneGeometry(9000, 9000, 120, 120);
    waterGeometry.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(waterGeometry, waterMaterial);
    this.scene.add(this.water);
    this.trunks = this.instances(
      new THREE.CylinderGeometry(0.45, 0.8, 1, 6),
      this.material({ color: '#554737', roughness: 1 }),
      700,
    );
    this.crowns = this.instances(
      new THREE.IcosahedronGeometry(1, 1),
      this.material({ color: '#ffffff', roughness: 0.98 }),
      3500,
    );
    this.rocks = this.instances(
      new THREE.IcosahedronGeometry(1, 1),
      this.material({ color: '#898f80', roughness: 1 }),
      220,
    );
    this.people = this.instances(
      new THREE.CylinderGeometry(0.28, 0.3, 1.1, 5),
      this.material({ color: '#9b7955', roughness: 1 }),
      700,
    );
    this.heads = this.instances(
      new THREE.SphereGeometry(0.3, 6, 4),
      this.material({ color: '#bfa685', roughness: 1 }),
      700,
    );
    const ringGeo = new THREE.RingGeometry(0.965, 1, 80);
    ringGeo.rotateX(-Math.PI / 2);
    this.pointerRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xf6e3ac,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.pointerRing.renderOrder = 3;
    this.pointerRing.frustumCulled = false;
    this.scene.add(this.pointerRing);
    const rainPositions = new Float32Array(600 * 2 * 3),
      rainGeometry = new THREE.BufferGeometry();
    for (let i = 0; i < 600; i++) {
      const x = hash(i, 81, 4) * WIDTH - WIDTH / 2,
        z = hash(i, 82, 4) * HEIGHT - HEIGHT / 2,
        y = hash(i, 83, 4) * 400;
      rainPositions.set([x, y, z, x + 2, y - 13, z + 1], i * 6);
    }
    rainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(rainPositions, 3),
    );
    this.rain = new THREE.LineSegments(
      rainGeometry,
      new THREE.LineBasicMaterial({
        color: 0xbbd0d4,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
    this.overlay = document.createElement('canvas');
    this.overlay.setAttribute('aria-hidden', 'true');
    Object.assign(this.overlay.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '1',
    });
    canvas.parentElement!.appendChild(this.overlay);
    this.overlayContext = this.overlay.getContext('2d')!;
  }
  private material(parameters: THREE.MeshStandardMaterialParameters) {
    const m = new THREE.MeshStandardMaterial(parameters);
    this.materials.add(m);
    return m;
  }
  private instances(g: THREE.BufferGeometry, m: THREE.Material, count: number) {
    this.geometries.add(g);
    const mesh = new THREE.InstancedMesh(g, m, count);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }
  private mesh(g: THREE.BufferGeometry, m: THREE.Material) {
    this.geometries.add(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  private updateCamera(v: View) {
    if (v.street && isCity(this.world)) {
      const w = this.world,
        x = v.streetX ?? 570,
        z = v.streetY ?? 600;
      let ground = terrainHeight(w, x, z);
      for (const r of w.city.roads) {
        if (!r.bridge || !(r.built ?? r.enabled)) continue;
        const a = w.city.nodes[r.a],
          b = w.city.nodes[r.b],
          dx = b.x - a.x,
          dz = b.y - a.y,
          t = Math.max(
            0,
            Math.min(
              1,
              ((x - a.x) * dx + (z - a.y) * dz) / (dx * dx + dz * dz),
            ),
          );
        if (Math.hypot(x - a.x - dx * t, z - a.y - dz * t) < 8)
          ground = Math.max(
            ground,
            terrainHeight(w, a.x, a.y) * (1 - t) +
              terrainHeight(w, b.x, b.y) * t +
              Math.sin(t * Math.PI) * 3.5 +
              1,
          );
      }
      this.camera.fov = Math.max(28, Math.min(80, (62 * 1.14) / v.zoom));
      this.camera.near = 0.4;
      this.camera.aspect = Math.max(0.2, v.width / Math.max(1, v.height));
      this.cameraDistance = 250;
      this.camera.position.set(x - WIDTH / 2, ground + 1, z - HEIGHT / 2);
      const yaw = v.yaw ?? 0,
        pitch = v.pitch ?? 0.08;
      this.camera.lookAt(
        this.camera.position
          .clone()
          .add(
            new THREE.Vector3(
              Math.sin(yaw) * Math.cos(pitch),
              Math.sin(pitch),
              -Math.cos(yaw) * Math.cos(pitch),
            ),
          ),
      );
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      return;
    }
    this.camera.fov = 42;
    this.camera.near = 1;
    const aspect = Math.max(0.2, v.width / Math.max(1, v.height)),
      span = Math.max(HEIGHT * 0.94, (WIDTH / aspect) * 1.07) / v.zoom;
    this.cameraDistance = span / (2 * Math.tan(THREE.MathUtils.degToRad(21)));
    const pitch = v.pitch ?? 0.91,
      yaw = v.yaw ?? 0.12,
      target = new THREE.Vector3(-v.x, 25, -v.y);
    this.camera.aspect = aspect;
    this.camera.position
      .copy(target)
      .add(
        new THREE.Vector3(
          Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          Math.cos(yaw) * Math.cos(pitch),
        ).multiplyScalar(this.cameraDistance),
      );
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
  scale(v: View) {
    return (
      v.height /
      (2 * this.cameraDistance * Math.tan(THREE.MathUtils.degToRad(21)))
    );
  }
  pan(dx: number, dy: number, v: View) {
    const s = this.scale(v),
      yaw = v.yaw ?? 0.12,
      pitch = v.pitch ?? 0.91;
    v.x +=
      (Math.cos(yaw) * dx) / s + (Math.sin(yaw) * dy) / (s * Math.sin(pitch));
    v.y +=
      (-Math.sin(yaw) * dx) / s + (Math.cos(yaw) * dy) / (s * Math.sin(pitch));
  }
  screenToWorld(x: number, y: number, v: View) {
    this.updateCamera(v);
    this.raycaster.setFromCamera(
      new THREE.Vector2((x / v.width) * 2 - 1, 1 - (y / v.height) * 2),
      this.camera,
    );
    const hits = this.raycaster.intersectObject(this.ground, false),
      sea = new THREE.Vector3();
    const seaHit = this.raycaster.ray.intersectPlane(this.seaPlane, sea);
    let p = seaHit ?? new THREE.Vector3();
    if (
      hits[0] &&
      (!seaHit || hits[0].distance < this.raycaster.ray.origin.distanceTo(sea))
    )
      p = hits[0].point;
    return { x: p.x + WIDTH / 2, y: p.z + HEIGHT / 2 };
  }
  private rebuild(w: World) {
    this.ground.geometry.dispose();
    this.ground.geometry = createTerrainGeometry(w);
    const data = this.heightTexture.image.data as Float32Array;
    data.set(w.terrain);
    this.heightTexture.needsUpdate = true;
    let rocks = 0;
    for (let i = 0; i < 1000 && rocks < 220; i++) {
      const x = hash(i, 29, w.seed) * WIDTH,
        y = hash(i, 39, w.seed) * HEIGHT,
        h = terrainHeight(w, x, y) / ELEVATION;
      if (h < 0.062 || h > 0.17) continue;
      const size = 1.2 + hash(i, 49, w.seed) * 3.2;
      this.dummy.position.set(
        x - WIDTH / 2,
        h * ELEVATION - 0.3,
        y - HEIGHT / 2,
      );
      this.dummy.rotation.set(
        hash(i, 51, 3),
        hash(i, 53, 2) * 6,
        hash(i, 55, 3),
      );
      this.dummy.scale.set(size * 1.4, size * 0.7, size);
      this.dummy.updateMatrix();
      this.rocks.setMatrixAt(rocks++, this.dummy.matrix);
    }
    this.rocks.count = rocks;
    this.rocks.instanceMatrix.needsUpdate = true;
    this.labels = w.islands.map((i) => ({
      text: i.name,
      point: new THREE.Vector3(
        i.x - WIDTH / 2,
        terrainHeight(w, i.x, i.y) + 20,
        i.y - HEIGHT / 2,
      ),
    }));
    this.revision = w.revision;
    this.seed = w.seed;
    this.ground.updateMatrixWorld(true);
  }
  private house(e: Entity) {
    const group = new THREE.Group(),
      wall = this.material({
        color: ['#c4b89c', '#bec1ad', '#b9a18a', '#c9c4b1'][e.variant],
        roughness: 1,
      }),
      roof = this.material({
        color: ['#665a4b', '#535d5b', '#6b5144', '#5e6253'][e.variant],
        roughness: 0.95,
      });
    const body = this.mesh(new THREE.BoxGeometry(11, 5.8, 8.5), wall);
    body.position.y = 2.9;
    group.add(body);
    const shape = new THREE.Shape();
    shape.moveTo(-6.3, 0);
    shape.lineTo(0, 3.9);
    shape.lineTo(6.3, 0);
    shape.closePath();
    const rg = new THREE.ExtrudeGeometry(shape, {
        depth: 10,
        bevelEnabled: false,
      }),
      top = this.mesh(rg, roof);
    top.position.set(0, 5.7, -5);
    group.add(top);
    const dark = this.material({ color: '#343933', roughness: 1 }),
      door = this.mesh(new THREE.BoxGeometry(1.8, 3.3, 0.15), dark);
    door.position.set(0.6, 1.65, 4.3);
    group.add(door);
    const windows = this.material({
      color: '#cbb780',
      emissive: '#f7bd65',
      emissiveIntensity: 0,
      roughness: 0.35,
    });
    for (const x of [-3.5, 3.4]) {
      const win = this.mesh(new THREE.BoxGeometry(1.8, 1.8, 0.18), windows);
      win.position.set(x, 3.5, 4.33);
      group.add(win);
    }
    const chimney = this.mesh(new THREE.BoxGeometry(1.1, 3.8, 1.4), wall);
    chimney.position.set(3.2, 7.4, -1.5);
    group.add(chimney);
    const step = this.mesh(
      new THREE.BoxGeometry(3.3, 0.35, 2.2),
      this.material({ color: '#939587', roughness: 1 }),
    );
    step.position.set(0.6, 0.2, 5.2);
    group.add(step);
    group.userData.windows = windows;
    if (this.homes.size < 10) {
      const light = new THREE.PointLight('#f6cf8c', 0, 24, 2);
      light.position.set(0, 3.2, 5.5);
      group.userData.light = light;
      group.add(light);
    }
    this.scene.add(group);
    return group;
  }
  private boat() {
    const group = new THREE.Group(),
      hullMaterial = this.material({ color: '#72664d', roughness: 0.78 }),
      hull = this.mesh(new THREE.SphereGeometry(1, 12, 7), hullMaterial);
    hull.scale.set(5.8, 1.1, 1.75);
    hull.position.y = 0.25;
    group.add(hull);
    const deck = this.mesh(
      new THREE.BoxGeometry(7.6, 0.25, 2.4),
      this.material({ color: '#b19b72', roughness: 1 }),
    );
    deck.position.y = 1;
    group.add(deck);
    const mast = this.mesh(
      new THREE.CylinderGeometry(0.1, 0.16, 9, 5),
      this.material({ color: '#6a5e46', roughness: 1 }),
    );
    mast.position.set(-0.3, 5, 0);
    group.add(mast);
    const sailGeometry = new THREE.BufferGeometry();
    sailGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [-0.3, 9.5, 0, -0.3, 1.5, 0, -4.7, 1.5, 0.5],
        3,
      ),
    );
    sailGeometry.computeVertexNormals();
    const sail = this.mesh(
      sailGeometry,
      this.material({ color: '#d3ccb8', roughness: 1, side: THREE.DoubleSide }),
    );
    group.add(sail);
    const wakeGeometry = new THREE.PlaneGeometry(20, 3),
      wake = new THREE.Mesh(
        wakeGeometry,
        new THREE.MeshBasicMaterial({
          color: '#bacdc2',
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        }),
      );
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(-15, 0.12, 0);
    group.add(wake);
    this.geometries.add(wakeGeometry);
    this.materials.add(wake.material);
    this.scene.add(group);
    return { group, sail, wake };
  }
  private lantern() {
    const group = new THREE.Group(),
      body = this.mesh(
        new THREE.SphereGeometry(1.4, 7, 6),
        this.material({
          color: '#d6a75a',
          emissive: '#ffb343',
          emissiveIntensity: 1.1,
          roughness: 1,
        }),
      );
    body.scale.y = 1.4;
    body.position.y = 2;
    group.add(body);
    if (this.lanterns.size < 8) {
      const light = new THREE.PointLight('#ffd58e', 10, 22, 2);
      light.position.y = 3;
      group.add(light);
    }
    this.scene.add(group);
    return group;
  }
  private removeGroup(group: THREE.Group) {
    this.scene.remove(group);
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (this.geometries.delete(object.geometry)) object.geometry.dispose();
        for (const m of Array.isArray(object.material)
          ? object.material
          : [object.material])
          if (this.materials.delete(m)) m.dispose();
      }
    });
  }
  private updateDocks(w: World) {
    const harbors = getHarbors(w),
      signature = w.revision + ':' + harbors.map((h) => h.homeId).join(',');
    if (signature === this.dockSignature) return;
    this.removeGroup(this.docks);
    this.docks = new THREE.Group();
    this.scene.add(this.docks);
    for (const h of harbors) {
      const dx = h.x - h.landX,
        dz = h.y - h.landY,
        length = Math.hypot(dx, dz),
        deckY = Math.max(terrainHeight(w, h.landX, h.landY), 14) + 0.5;
      const timber = this.material({ color: '#847b62', roughness: 1 }),
        deck = this.mesh(new THREE.BoxGeometry(2.8, 0.5, length + 4), timber);
      deck.position.set(
        (h.x + h.landX) / 2 - WIDTH / 2,
        deckY,
        (h.y + h.landY) / 2 - HEIGHT / 2,
      );
      deck.rotation.y = Math.atan2(dx, dz);
      this.docks.add(deck);
      for (let i = 0; i < 4; i++)
        for (const side of [-1, 1]) {
          const fraction = i / 3,
            x = h.landX + dx * fraction + (dz / length) * 1.4 * side,
            y = h.landY + dz * fraction - (dx / length) * 1.4 * side,
            ground = terrainHeight(w, x, y),
            postHeight = Math.max(1, deckY - ground + 1.2),
            post = this.mesh(
              new THREE.CylinderGeometry(0.22, 0.3, postHeight, 5),
              timber,
            );
          post.position.set(
            x - WIDTH / 2,
            ground + postHeight / 2,
            y - HEIGHT / 2,
          );
          this.docks.add(post);
        }
    }
    this.dockSignature = signature;
  }
  private updateEntities(w: World, t: number) {
    let treeIndex = 0,
      crownIndex = 0,
      personIndex = 0;
    const kinds = new Map(w.entities.map((e) => [e.id, e.kind]));
    for (const [id, g] of this.homes)
      if (kinds.get(id) !== 'home') {
        this.removeGroup(g);
        this.homes.delete(id);
      }
    for (const [id, b] of this.boats)
      if (kinds.get(id) !== 'boat') {
        this.removeGroup(b.group);
        this.boats.delete(id);
      }
    for (const [id, g] of this.lanterns)
      if (kinds.get(id) !== 'lantern') {
        this.removeGroup(g);
        this.lanterns.delete(id);
      }
    for (const e of w.entities) {
      const y = terrainHeight(w, e.x, e.y),
        x = e.x - WIDTH / 2,
        z = e.y - HEIGHT / 2;
      if (e.kind === 'tree') {
        const growth = Math.min(1, 0.15 + e.age / 120),
          height = (14 + hash(e.id, 11, w.seed) * 12) * growth;
        this.dummy.position.set(x, y + height * 0.43, z);
        this.dummy.rotation.set(0, e.angle, 0);
        this.dummy.scale.set(growth, height * 0.86, growth);
        this.dummy.updateMatrix();
        this.trunks.setMatrixAt(treeIndex++, this.dummy.matrix);
        for (let j = 0; j < 5; j++) {
          const a = hash(e.id, j, w.seed) * Math.PI * 2,
            offset = (j === 0 ? 0 : 3.3) * growth,
            r =
              (j === 0 ? 5.2 : 3.6) *
              growth *
              (0.8 + hash(e.id, j + 55, w.seed) * 0.4);
          this.dummy.position.set(
            x + Math.cos(a) * offset + Math.sin(t * 0.7 + e.id) * 0.2 * growth,
            y +
              height *
                (j === 0 ? 0.86 : 0.62 + hash(e.id, j + 6, w.seed) * 0.18),
            z + Math.sin(a) * offset,
          );
          this.dummy.rotation.set(hash(e.id, j + 3, w.seed) * 0.3, a, 0.12);
          this.dummy.scale.set(
            r,
            r * (e.variant === 0 ? 1.55 : 1.05),
            r * 0.85,
          );
          this.dummy.updateMatrix();
          this.crowns.setMatrixAt(crownIndex, this.dummy.matrix);
          this.crowns.setColorAt(
            crownIndex++,
            new THREE.Color().setHSL(
              0.2 + hash(e.id, 8, w.seed) * 0.055,
              0.2 + hash(e.id, 9, w.seed) * 0.13,
              0.24 + hash(e.id, j + 10, w.seed) * 0.14,
              THREE.SRGBColorSpace,
            ),
          );
        }
      } else if (e.kind === 'home') {
        let g = this.homes.get(e.id);
        if (!g) {
          g = this.house(e);
          this.homes.set(e.id, g);
        }
        g.position.set(x, y, z);
        g.rotation.y = e.variant * 0.37;
        (g.userData.windows as THREE.MeshStandardMaterial).emissiveIntensity =
          (1 - this.dayLight) * 2.6 + (w.weather === 'rain' ? 0.4 : 0);
        if (g.userData.light)
          (g.userData.light as THREE.PointLight).intensity =
            (1 - this.dayLight) * 12;
        if (
          e.activity !== 'indoors' &&
          Math.hypot(e.targetX - e.x, e.targetY - e.y) > 6
        ) {
          const py = terrainHeight(w, e.targetX, e.targetY),
            px = e.targetX - WIDTH / 2,
            pz = e.targetY - HEIGHT / 2;
          this.dummy.position.set(px, py + 0.7, pz);
          this.dummy.rotation.set(0, e.angle, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          this.people.setMatrixAt(personIndex, this.dummy.matrix);
          this.dummy.position.y = py + 1.55;
          this.dummy.updateMatrix();
          this.heads.setMatrixAt(personIndex++, this.dummy.matrix);
        }
      } else if (e.kind === 'boat') {
        let b = this.boats.get(e.id);
        if (!b) {
          b = this.boat();
          this.boats.set(e.id, b);
        }
        b.group.position.set(
          x,
          seaLevel(w) * ELEVATION + Math.sin(t * 0.9 + e.id) * 0.12,
          z,
        );
        b.group.rotation.set(
          Math.sin(t * 0.75 + e.id) * 0.025,
          -e.angle,
          Math.sin(t * 0.6 + e.id) * 0.018,
        );
        b.sail.visible = e.rest <= 0;
        b.wake.visible = e.rest <= 0 && (e.motion ?? 7) > 0;
        b.wake.scale.x = Math.max(0.25, (e.motion ?? 7) / 7);
      } else {
        let g = this.lanterns.get(e.id);
        if (!g) {
          g = this.lantern();
          this.lanterns.set(e.id, g);
        }
        g.position.set(
          x,
          Math.max(y, seaLevel(w) * ELEVATION) +
            Math.sin(t * 0.9 + e.id) * 0.15,
          z,
        );
      }
    }
    this.trunks.count = treeIndex;
    this.crowns.count = crownIndex;
    this.people.count = personIndex;
    this.heads.count = personIndex;
    for (const m of [this.trunks, this.crowns, this.people, this.heads])
      m.instanceMatrix.needsUpdate = true;
    if (this.crowns.instanceColor) this.crowns.instanceColor.needsUpdate = true;
  }
  draw(w: World, v: View, t: number) {
    if (this.world !== w) {
      for (const g of this.homes.values()) this.removeGroup(g);
      for (const b of this.boats.values()) this.removeGroup(b.group);
      for (const g of this.lanterns.values()) this.removeGroup(g);
      this.homes.clear();
      this.boats.clear();
      this.lanterns.clear();
      this.dockSignature = '';
      this.revision = -1;
      this.world = w;
    }
    if (v.width <= 0 || v.height <= 0) return;
    if (this.lastWidth !== v.width || this.lastHeight !== v.height) {
      this.gl.setSize(v.width, v.height, false);
      this.overlay.width = Math.round(v.width);
      this.overlay.height = Math.round(v.height);
      this.lastWidth = v.width;
      this.lastHeight = v.height;
    }
    this.updateCamera(v);
    if (this.revision !== w.revision || this.seed !== w.seed) this.rebuild(w);
    const sunAngle = ((hour(w) - 6) / 12) * Math.PI,
      alt = Math.sin(sunAngle);
    this.dayLight = THREE.MathUtils.smoothstep(alt, -0.13, 0.22);
    const sky = new THREE.Color('#a6bec5')
      .lerp(
        new THREE.Color('#d8b395'),
        (1 - THREE.MathUtils.smoothstep(alt, 0.02, 0.4)) * this.dayLight * 0.55,
      )
      .lerp(new THREE.Color('#111e31'), 1 - this.dayLight);
    if (w.weather === 'rain')
      sky.lerp(new THREE.Color('#718b94'), 0.5 * this.dayLight);
    if (w.weather === 'mist')
      sky.lerp(new THREE.Color('#bfcbc6'), 0.35 * this.dayLight);
    this.scene.background = sky;
    const far =
      w.weather === 'mist'
        ? this.cameraDistance + 1050
        : this.cameraDistance + 4200;
    this.scene.fog = new THREE.Fog(
      sky,
      v.street ? 180 : this.cameraDistance - 300,
      far,
    );
    this.sun.position.set(
      Math.cos(sunAngle) * 1500,
      Math.max(50, alt * 1500),
      -550,
    );
    this.sun.intensity =
      Math.max(0, alt) * 3.4 * (w.weather === 'rain' ? 0.3 : 1);
    this.sun.color.set(alt < 0.3 ? '#ffd19d' : '#fff3dc');
    this.hemi.intensity =
      0.15 + this.dayLight * (w.weather === 'rain' ? 0.95 : 1.6);
    this.moon.intensity = (1 - this.dayLight) * 0.28;
    this.water.position.y = seaLevel(w) * ELEVATION;
    this.seaPlane.constant = -this.water.position.y;
    const u = this.water.material.uniforms;
    u.uTime.value = t;
    u.uSea.value = this.water.position.y;
    u.uDay.value = this.dayLight;
    u.uRain.value = w.weather === 'rain' ? 1 : 0;
    u.uSun.value.copy(this.sun.position).normalize();
    u.uSky.value.copy(sky);
    u.uFogNear.value = v.street ? 180 : this.cameraDistance - 300;
    u.uFogFar.value = far;
    this.updateDocks(w);
    this.updateEntities(w, t);
    if (isCity(w)) {
      if (!this.cityLayer) {
        this.cityLayer = new CityLayer();
        this.scene.add(this.cityLayer.group);
      }
      this.cityLayer.setOverlay(this.cityOverlay);
      this.cityLayer.update(w, t, this.dayLight, this.citySelection);
    } else if (this.cityLayer) {
      this.scene.remove(this.cityLayer.group);
      this.cityLayer.dispose();
      this.cityLayer = null;
    }

    this.rain.visible = w.weather === 'rain';
    this.rain.position.y = -((t * 110) % 260);
    this.pointerRing.visible = !!v.pointer && !v.street;
    if (v.pointer) {
      const p = v.pointer;
      this.pointerRing.position.set(p.x - WIDTH / 2, 0, p.y - HEIGHT / 2);
      const r = ['land', 'water'].includes(v.tool)
        ? v.radius
        : v.tool === 'look'
          ? 8
          : 12;
      this.pointerRing.scale.set(r, 1, r);
      const vertices = this.pointerRing.geometry.getAttribute('position');
      for (let i = 0; i < vertices.count; i++)
        vertices.setY(
          i,
          Math.max(
            terrainHeight(
              w,
              p.x + vertices.getX(i) * r,
              p.y + vertices.getZ(i) * r,
            ),
            this.water.position.y,
          ) + 0.8,
        );
      vertices.needsUpdate = true;
    }
    this.gl.render(this.scene, this.camera);
    const c = this.overlayContext;
    c.clearRect(0, 0, v.width, v.height);
    if (v.labels) {
      c.font = '14px "Songti SC", SimSun, serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (const label of this.labels) {
        const p = label.point.clone().project(this.camera);
        if (p.z > 1 || p.z < 0) continue;
        const x = ((p.x + 1) * v.width) / 2,
          y = ((1 - p.y) * v.height) / 2;
        if (x < 70 || x > v.width - 30 || y < 115 || y > v.height - 110)
          continue;
        const width = c.measureText(label.text).width;
        c.fillStyle = 'rgba(24,45,42,.58)';
        c.beginPath();
        c.roundRect(x - width / 2 - 10, y - 12, width + 20, 25, 5);
        c.fill();
        c.fillStyle = '#e7eddf';
        c.fillText(label.text, x, y);
      }
    }
  }
  destroy() {
    this.cityLayer?.dispose();
    this.overlay.remove();
    this.ground.geometry.dispose();
    this.water.geometry.dispose();
    this.water.material.dispose();
    this.heightTexture.dispose();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.pointerRing.geometry.dispose();
    (this.pointerRing.material as THREE.Material).dispose();
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    for (const m of [
      this.trunks,
      this.crowns,
      this.rocks,
      this.people,
      this.heads,
    ])
      m.dispose();
    this.sun.shadow.dispose();
    this.gl.dispose();
  }
}
