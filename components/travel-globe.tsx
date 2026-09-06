'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLACES, type TravelPlace } from '@/lib/travel';
import { assetPath } from '@/lib/paths';
import { geographicPoint, rotateForScreenDrag } from '@/lib/travel-geometry';
export default function TravelGlobe({
  active,
  onChoose,
}: {
  active: TravelPlace;
  onChoose: (place: TravelPlace) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    callback = useRef(onChoose);
  const [hover, setHover] = useState<string | null>(null),
    [failed, setFailed] = useState(false);
  callback.current = onChoose;
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
      geographicPoint(active.coords[0], active.coords[1], 3.3),
    );
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight('#d7e9ed', 1.5));
    const sunlight = new THREE.DirectionalLight('#fff5dd', 2.2);
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
      }),
      atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    group.add(atmosphere);
    const markerGeometry = new THREE.SphereGeometry(0.022, 12, 8),
      panoramaMaterial = new THREE.MeshBasicMaterial({ color: '#f4ce82' }),
      streetMaterial = new THREE.MeshBasicMaterial({ color: '#8fd4df' });
    const markers = PLACES.map((place) => {
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
    let disposed = false,
      dirty = true,
      texture: THREE.Texture | null = null;
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
      } | null = null,
      frame = 0;
    const hit = (x: number, y: number) => {
      const bounds = element.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((x - bounds.left) / bounds.width) * 2 - 1,
          1 - ((y - bounds.top) / bounds.height) * 2,
        ),
        camera,
      );
      const nearest = ray.intersectObjects([earth, ...markers], false)[0];
      return nearest?.object.userData.place as TravelPlace | undefined;
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
    const rotate = (dx: number, dy: number) => {
      rotateForScreenDrag(group, camera, dx, dy);
      dirty = true;
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
      } else {
        const place = hit(event.clientX, event.clientY);
        setHover(place?.id ?? null);
        element.style.cursor = place ? 'pointer' : 'grab';
      }
    };
    const pointerUp = (event: PointerEvent) => {
      if (down && event.pointerId !== down.id) return;
      if (
        down &&
        Math.hypot(event.clientX - down.startX, event.clientY - down.startY) < 5
      ) {
        const place = hit(event.clientX, event.clientY);
        if (place) callback.current(place);
      }
      down = null;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') rotate(-0.15, 0);
      else if (event.key === 'ArrowRight') rotate(0.15, 0);
      else if (event.key === 'ArrowUp') rotate(0, -0.1);
      else if (event.key === 'ArrowDown') rotate(0, 0.1);
      else return;
      event.preventDefault();
    };
    element.addEventListener('pointerdown', pointerDown);
    element.addEventListener('pointermove', pointerMove);
    element.addEventListener('pointerup', pointerUp);
    element.addEventListener('pointercancel', pointerUp);
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
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('pointerdown', pointerDown);
      element.removeEventListener('pointermove', pointerMove);
      element.removeEventListener('pointerup', pointerUp);
      element.removeEventListener('pointercancel', pointerUp);
      element.removeEventListener('keydown', key);
      texture?.dispose();
      geometry.dispose();
      material.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      markerGeometry.dispose();
      panoramaMaterial.dispose();
      streetMaterial.dispose();
      renderer.dispose();
    };
  }, []);
  const hovered = PLACES.find((p) => p.id === hover);
  return (
    <div className="travel-globe">
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label="目的地地球，拖动或方向键转动，点击光点前往。也可在下方目的地列表选择。"
      />
      {failed && (
        <img src={assetPath('/travel/earth.webp')} alt="NASA 全球地表影像" />
      )}
      <span className="globe-hint">
        {hovered
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
