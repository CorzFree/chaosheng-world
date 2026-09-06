'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLACES, type TravelPlace } from '@/lib/travel';
import { assetPath } from '@/lib/paths';
import { geographicPoint, rotateForScreenDrag } from '@/lib/travel-geometry';
import {
  pointCoordinates,
  formatCoordinates,
  type Coordinates,
} from '@/lib/travel-play-math';
type PickMode = {
  coords: Coordinates | null;
  answer?: Coordinates;
  onPick?: (coords: Coordinates) => void;
};
export default function TravelGlobe({
  active,
  onChoose,
  pickMode,
}: {
  active: TravelPlace;
  onChoose?: (place: TravelPlace) => void;
  pickMode?: PickMode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    callback = useRef(onChoose),
    picking = useRef(pickMode);
  const update = useRef<((selection?: PickMode) => void) | null>(null);
  const [hover, setHover] = useState<string | null>(null),
    [failed, setFailed] = useState(false);
  callback.current = onChoose;
  picking.current = pickMode;
  useEffect(() => {
    const element = canvas.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: element,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(),
      group = new THREE.Group();
    scene.add(group);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
    camera.position.copy(
      pickMode
        ? geographicPoint(22, 12, 3.3)
        : geographicPoint(active.coords[0], active.coords[1], 3.3),
    );
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight('#d7e9ed', 1.9));
    const sunlight = new THREE.DirectionalLight('#fff5dd', 1.8);
    sunlight.position.set(3, 4, 5);
    scene.add(sunlight);
    const geometry = new THREE.SphereGeometry(1, 72, 48),
      material = new THREE.MeshPhongMaterial({
        color: '#adced2',
        shininess: 5,
      }),
      earth = new THREE.Mesh(geometry, material);
    group.add(earth);
    const atmosphereGeometry = new THREE.SphereGeometry(1.025, 64, 32),
      atmosphereMaterial = new THREE.MeshBasicMaterial({
        color: '#6aa9c0',
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
      });
    group.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial));
    const markerGeometry = new THREE.SphereGeometry(0.022, 12, 8),
      panoramaMaterial = new THREE.MeshBasicMaterial({ color: '#f4ce82' }),
      streetMaterial = new THREE.MeshBasicMaterial({ color: '#8fd4df' });
    const markers = pickMode
      ? []
      : PLACES.map((place) => {
          const marker = new THREE.Mesh(
            markerGeometry,
            place.mode === 'street' ? streetMaterial : panoramaMaterial,
          );
          marker.position.copy(geographicPoint(...place.coords, 1.035));
          if (place.id === active.id) marker.scale.setScalar(1.6);
          marker.userData.place = place;
          group.add(marker);
          return marker;
        });
    const guessPin = new THREE.Mesh(markerGeometry, panoramaMaterial),
      answerPin = new THREE.Mesh(markerGeometry, streetMaterial);
    guessPin.scale.setScalar(1.7);
    answerPin.scale.setScalar(1.7);
    guessPin.visible = false;
    answerPin.visible = false;
    group.add(guessPin, answerPin);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: '#f9ebbb',
      transparent: true,
      opacity: 0.8,
    });
    let route: THREE.Line | undefined,
      disposed = false,
      dirty = true,
      texture: THREE.Texture | null = null,
      frame = 0;
    update.current = (selection) => {
      guessPin.visible = !!selection?.coords;
      answerPin.visible = !!selection?.answer;
      if (selection?.coords)
        guessPin.position.copy(geographicPoint(...selection.coords, 1.04));
      if (selection?.answer)
        answerPin.position.copy(geographicPoint(...selection.answer, 1.04));
      if (route) {
        group.remove(route);
        route.geometry.dispose();
        route = undefined;
      }
      if (selection?.coords && selection.answer) {
        const a = geographicPoint(...selection.coords),
          b = geographicPoint(...selection.answer),
          omega = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
        const axis = new THREE.Vector3().crossVectors(a, b);
        if (axis.lengthSq() < 1e-10)
          axis.crossVectors(
            a,
            Math.abs(a.y) < 0.9
              ? new THREE.Vector3(0, 1, 0)
              : new THREE.Vector3(1, 0, 0),
          );
        axis.normalize();
        const points = Array.from({ length: 65 }, (_, i) =>
          a
            .clone()
            .applyAxisAngle(axis, (omega * i) / 64)
            .multiplyScalar(1.045),
        );
        route = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          lineMaterial,
        );
        group.add(route);
        group.quaternion.identity();
        const center = a.clone().add(b);
        if (center.lengthSq() < 0.03) center.copy(a);
        camera.position.copy(center.normalize().multiplyScalar(3.3));
        camera.lookAt(0, 0, 0);
      }
      dirty = true;
    };
    update.current(picking.current);
    new THREE.TextureLoader().load(
      assetPath('/travel/earth.webp'),
      (loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        material.map = loaded;
        material.color.set('#ffffff');
        material.needsUpdate = true;
        texture = loaded;
        dirty = true;
      },
      undefined,
      () => {
        if (!disposed) setFailed(true);
      },
    );
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry.contentRect.width),
        height = Math.max(1, entry.contentRect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      dirty = true;
    });
    observer.observe(element.parentElement!);
    const ray = new THREE.Raycaster();
    let down: {
      id: number;
      x: number;
      y: number;
      startX: number;
      startY: number;
    } | null = null;
    const rayAt = (x: number, y: number) => {
      const bounds = element.getBoundingClientRect();
      camera.updateMatrixWorld();
      group.updateMatrixWorld(true);
      ray.setFromCamera(
        new THREE.Vector2(
          ((x - bounds.left) / bounds.width) * 2 - 1,
          1 - ((y - bounds.top) / bounds.height) * 2,
        ),
        camera,
      );
    };
    const hit = (x: number, y: number) => {
      rayAt(x, y);
      return ray.intersectObjects([earth, ...markers], false)[0]?.object
        .userData.place as TravelPlace | undefined;
    };
    const pick = (x: number, y: number) => {
      rayAt(x, y);
      const surface = ray.intersectObject(earth, false)[0];
      if (surface && picking.current?.onPick)
        picking.current.onPick(
          pointCoordinates(earth.worldToLocal(surface.point.clone())),
        );
    };
    const rotate = (dx: number, dy: number) => {
      rotateForScreenDrag(group, camera, dx, dy);
      dirty = true;
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      element.setPointerCapture(event.pointerId);
      element.focus({ preventScroll: true });
      down = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
      };
    };
    const pointerMove = (event: PointerEvent) => {
      if (down) {
        if (event.pointerId !== down.id) return;
        rotate(
          (event.clientX - down.x) * 0.008,
          (event.clientY - down.y) * 0.008,
        );
        down.x = event.clientX;
        down.y = event.clientY;
      } else if (!picking.current) {
        const place = hit(event.clientX, event.clientY);
        setHover(place?.id ?? null);
        element.style.cursor = place ? 'pointer' : 'grab';
      }
    };
    const release = (event: PointerEvent) => {
      down = null;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
    };
    const pointerUp = (event: PointerEvent) => {
      if (!down || event.pointerId !== down.id) return;
      if (
        Math.hypot(event.clientX - down.startX, event.clientY - down.startY) < 5
      ) {
        if (picking.current) pick(event.clientX, event.clientY);
        else {
          const place = hit(event.clientX, event.clientY);
          if (place) callback.current?.(place);
        }
      }
      release(event);
    };
    const pointerCancel = (event: PointerEvent) => {
      if (down?.id === event.pointerId) release(event);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') rotate(-0.15, 0);
      else if (event.key === 'ArrowRight') rotate(0.15, 0);
      else if (event.key === 'ArrowUp') rotate(0, -0.1);
      else if (event.key === 'ArrowDown') rotate(0, 0.1);
      else if (event.key === 'Enter' && picking.current?.onPick) {
        const b = element.getBoundingClientRect();
        pick(b.left + b.width / 2, b.top + b.height / 2);
      } else return;
      event.preventDefault();
    };
    element.addEventListener('pointerdown', pointerDown);
    element.addEventListener('pointermove', pointerMove);
    element.addEventListener('pointerup', pointerUp);
    element.addEventListener('pointercancel', pointerCancel);
    element.addEventListener('keydown', key);
    const draw = () => {
      if (disposed) return;
      if (!document.hidden && dirty) {
        renderer.render(scene, camera);
        dirty = false;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      update.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('pointerdown', pointerDown);
      element.removeEventListener('pointermove', pointerMove);
      element.removeEventListener('pointerup', pointerUp);
      element.removeEventListener('pointercancel', pointerCancel);
      element.removeEventListener('keydown', key);
      texture?.dispose();
      geometry.dispose();
      material.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      markerGeometry.dispose();
      panoramaMaterial.dispose();
      streetMaterial.dispose();
      route?.geometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
    };
  }, []);
  useEffect(() => {
    update.current?.(pickMode);
  }, [
    pickMode?.coords?.[0],
    pickMode?.coords?.[1],
    pickMode?.answer?.[0],
    pickMode?.answer?.[1],
  ]);
  const hovered = PLACES.find((p) => p.id === hover);
  return (
    <div className={'travel-globe ' + (pickMode ? 'guess-globe' : '')}>
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label={
          pickMode
            ? '转动地球，点击地表放置猜测。方向键转动，Enter在中央落点。'
            : '目的地地球，拖动或方向键转动，点击光点前往。也可使用目的地列表。'
        }
      />
      {failed && (
        <img src={assetPath('/travel/earth.webp')} alt="NASA 全球地表影像" />
      )}
      {pickMode && !pickMode.answer && (
        <span className="globe-center" aria-hidden="true">
          +
        </span>
      )}
      <span className="globe-hint">
        {pickMode
          ? pickMode.answer
            ? '金色是你的猜测，蓝色是真实位置。'
            : pickMode.coords
              ? formatCoordinates(pickMode.coords)
              : '拖动地球，点击放置你的猜测。'
          : hovered
            ? hovered.name + ' · ' + hovered.country
            : '转动地球，点击一个光点。'}
      </span>
      <a
        href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/"
        target="_blank"
        rel="noreferrer"
        className="globe-credit"
      >
        地球影像：NASA Earth Observatory
      </a>
    </div>
  );
}
