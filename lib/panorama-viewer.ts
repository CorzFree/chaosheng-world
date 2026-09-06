import * as THREE from 'three';

export type PanoramaPose = { yaw: number; pitch: number; fov: number };
export const DEFAULT_POSE: PanoramaPose = { yaw: 0, pitch: 0, fov: 76 };
export function viewDirection(yaw: number, pitch: number) {
  const longitude = THREE.MathUtils.degToRad(yaw),
    latitude = THREE.MathUtils.degToRad(pitch);
  return new THREE.Vector3(
    -Math.cos(latitude) * Math.cos(longitude),
    Math.sin(latitude),
    -Math.cos(latitude) * Math.sin(longitude),
  );
}
export function constrainPose(pose: PanoramaPose): PanoramaPose {
  return {
    yaw: ((pose.yaw % 360) + 360) % 360,
    pitch: THREE.MathUtils.clamp(pose.pitch, -80, 80),
    fov: THREE.MathUtils.clamp(pose.fov, 35, 100),
  };
}
export class PanoramaViewer {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(76, 1, 0.1, 500);
  readonly scene = new THREE.Scene();
  private sphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private observer: ResizeObserver;
  private texture: THREE.Texture | null = null;
  private frame = 0;
  private sequence = 0;
  private download: AbortController | null = null;
  private disposed = false;
  private dirty = true;
  private auto = false;
  private last = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private previous: { x: number; y: number } | null = null;
  private pinch: { distance: number; fov: number } | null = null;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  pose: PanoramaPose = { ...DEFAULT_POSE };
  private target = { ...DEFAULT_POSE };
  private width = 1;
  private height = 1;
  private onPose: (pose: PanoramaPose) => void;
  constructor(
    canvas: HTMLCanvasElement,
    onPose: (pose: PanoramaPose) => void = () => {},
  ) {
    this.onPose = onPose;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor('#15212b');
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(100, 96, 64).scale(-1, 1, 1),
      new THREE.MeshBasicMaterial({
        side: THREE.FrontSide,
        color: '#ffffff',
        toneMapped: false,
      }),
    );
    this.scene.add(this.sphere);
    this.observer = new ResizeObserver(([entry]) => {
      this.width = Math.max(1, entry.contentRect.width);
      this.height = Math.max(1, entry.contentRect.height);
      this.renderer.setSize(this.width, this.height, false);
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.dirty = true;
    });
    this.observer.observe(canvas.parentElement!);
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('keydown', this.key);
    const loop = (now: number) => {
      if (this.disposed) return;
      const delta = Math.min(0.05, (now - (this.last || now)) / 1000);
      this.last = now;
      if (!document.hidden) {
        if (this.auto && !this.pointers.size) {
          this.target.yaw += delta * 1.6;
          this.dirty = true;
        }
        const ease = this.reduced ? 1 : 0.22;
        const difference =
          Math.abs(this.target.yaw - this.pose.yaw) +
          Math.abs(this.target.pitch - this.pose.pitch) +
          Math.abs(this.target.fov - this.pose.fov);
        if (difference > 0.015) {
          this.pose.yaw += (this.target.yaw - this.pose.yaw) * ease;
          this.pose.pitch += (this.target.pitch - this.pose.pitch) * ease;
          this.pose.fov += (this.target.fov - this.pose.fov) * ease;
          this.dirty = true;
        }
        if (this.dirty) {
          this.camera.fov = this.pose.fov;
          this.camera.updateProjectionMatrix();
          this.camera.lookAt(viewDirection(this.pose.yaw, this.pose.pitch));
          this.renderer.render(this.scene, this.camera);
          this.dirty = false;
          this.onPose({ ...this.pose });
        }
      }
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  quality: 'none' | 'preview' | 'full' = 'none';
  async load(
    url: string,
    initial: Partial<PanoramaPose> = {},
    preview?: string,
    onPreview?: () => void,
  ) {
    const sequence = ++this.sequence;
    this.download?.abort();
    const controller = new AbortController();
    this.download = controller;
    let previewReady = false,
      timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60000);
    const current = () =>
      !this.disposed &&
      sequence === this.sequence &&
      !controller.signal.aborted;
    const decode = async (source: string) => {
      const response = await fetch(source, { signal: controller.signal });
      if (!response.ok) throw new Error('Panorama download failed.');
      const blob = await response.blob();
      if (!current()) throw new Error('Panorama superseded.');
      const objectUrl = URL.createObjectURL(blob);
      const image = new window.Image();
      image.decoding = 'async';
      const abortDecode = () => {
        image.src = '';
      };
      controller.signal.addEventListener('abort', abortDecode, { once: true });
      try {
        image.src = objectUrl;
        await image.decode();
        if (!current()) {
          image.src = '';
          throw new Error('Panorama superseded.');
        }
        if (image.naturalWidth !== image.naturalHeight * 2) {
          image.src = '';
          throw new Error('The image is not a full spherical panorama.');
        }
        return image;
      } catch (error) {
        image.src = '';
        throw error;
      } finally {
        controller.signal.removeEventListener('abort', abortDecode);
        URL.revokeObjectURL(objectUrl);
      }
    };
    const display = (
      image: HTMLImageElement,
      quality: 'preview' | 'full',
      resetPose: boolean,
    ) => {
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.anisotropy = Math.min(
        4,
        this.renderer.capabilities.getMaxAnisotropy(),
      );
      texture.needsUpdate = true;
      const previous = this.texture;
      this.texture = texture;
      this.sphere.material.map = texture;
      this.sphere.material.needsUpdate = true;
      if (resetPose) {
        this.target = { ...DEFAULT_POSE, ...initial };
        this.pose = { ...this.target };
      }
      this.quality = quality;
      this.dirty = true;
      if (previous) {
        previous.dispose();
        if (previous.image instanceof HTMLImageElement) previous.image.src = '';
      }
    };
    try {
      if (preview && preview !== url) {
        try {
          const image = await decode(preview);
          display(image, 'preview', true);
          previewReady = true;
          onPreview?.();
        } catch (error) {
          if (!current()) throw error;
        }
      }
      const image = await decode(url);
      display(image, 'full', !previewReady);
      return true;
    } catch (error) {
      if (
        this.disposed ||
        sequence !== this.sequence ||
        (controller.signal.aborted && !timedOut)
      )
        return false;
      if (previewReady) return true;
      throw error;
    } finally {
      clearTimeout(timeout);
      if (this.download === controller) this.download = null;
    }
  }
  setAuto(value: boolean) {
    this.auto = value;
    this.dirty = true;
  }
  setPose(next: Partial<PanoramaPose>) {
    const yaw =
      next.yaw === undefined
        ? this.target.yaw
        : this.target.yaw +
          ((((next.yaw - this.target.yaw) % 360) + 540) % 360) -
          180;
    this.target = { ...this.target, ...next, yaw };
    this.target.pitch = THREE.MathUtils.clamp(this.target.pitch, -80, 80);
    this.target.fov = THREE.MathUtils.clamp(this.target.fov, 35, 100);
    this.dirty = true;
  }
  zoom(amount: number) {
    this.setPose({ fov: this.target.fov + amount });
  }
  turn(degrees: number) {
    this.setPose({ yaw: this.target.yaw + degrees });
  }
  reset() {
    this.setPose({ pitch: 0, fov: 76 });
  }
  private down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.previous = { x: event.clientX, y: event.clientY };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        fov: this.target.fov,
      };
    }
    this.canvas.style.cursor = 'grabbing';
  };
  private move = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      this.setPose({
        fov:
          (this.pinch.fov * this.pinch.distance) /
          Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      });
    } else if (this.previous)
      this.setPose({
        yaw:
          this.target.yaw -
          ((event.clientX - this.previous.x) * this.target.fov) /
            Math.max(400, this.width),
        pitch:
          this.target.pitch +
          ((event.clientY - this.previous.y) * this.target.fov) /
            Math.max(300, this.height),
      });
    this.previous = { x: event.clientX, y: event.clientY };
  };
  private up = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.pinch = null;
    this.previous = this.pointers.size ? [...this.pointers.values()][0] : null;
    this.canvas.style.cursor = 'grab';
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
  };
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoom(event.deltaY * 0.035);
  };
  private key = (event: KeyboardEvent) => {
    let handled = true;
    if (event.key === 'ArrowLeft') this.turn(-8);
    else if (event.key === 'ArrowRight') this.turn(8);
    else if (event.key === 'ArrowUp')
      this.setPose({ pitch: this.target.pitch + 5 });
    else if (event.key === 'ArrowDown')
      this.setPose({ pitch: this.target.pitch - 5 });
    else if (event.key === '+' || event.key === '=') this.zoom(-5);
    else if (event.key === '-') this.zoom(5);
    else if (event.key === 'Home') this.reset();
    else handled = false;
    if (handled) event.preventDefault();
  };
  capture() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }
  destroy() {
    this.disposed = true;
    this.sequence++;
    this.download?.abort();
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
    this.canvas.removeEventListener('wheel', this.wheel);
    this.canvas.removeEventListener('keydown', this.key);
    this.texture?.dispose();
    if (this.texture?.image instanceof HTMLImageElement)
      this.texture.image.src = '';
    this.sphere.geometry.dispose();
    this.sphere.material.dispose();
    this.renderer.dispose();
  }
}
