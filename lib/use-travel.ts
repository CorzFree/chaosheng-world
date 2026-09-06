'use client';
import { useEffect, useRef, useState } from 'react';
import { PLACES, PANORAMAS, getPlace, type TravelPlace } from './travel';
import { PanoramaViewer, type PanoramaPose } from './panorama-viewer';
import { assetPath } from './paths';
import { parseMemory, type TravelMemory } from './travel-state';
const KEY = 'chaosheng.travel.v1';
const INITIAL = PANORAMAS[0];
export function useTravel() {
  const canvas = useRef<HTMLCanvasElement>(null),
    viewer = useRef<PanoramaViewer | null>(null),
    sequence = useRef(0),
    pendingRef = useRef<string | null>(INITIAL.id),
    activeRef = useRef<TravelPlace>(INITIAL),
    poseTick = useRef(0),
    poseListeners = useRef(new Set<(pose: PanoramaPose) => void>()),
    statusRef = useRef<'loading' | 'ready' | 'error'>('loading'),
    errorRef = useRef('');
  const [active, setActive] = useState<TravelPlace>(INITIAL),
    [loading, setLoading] = useState<string | null>(INITIAL.id),
    [error, setError] = useState(''),
    [fallback, setFallback] = useState(false),
    [auto, setAuto] = useState(false),
    [immersive, setImmersive] = useState(false),
    [pose, setPose] = useState<PanoramaPose>({ yaw: 25, pitch: 2, fov: 76 });
  const [atlas, setAtlas] = useState(false),
    [journal, setJournal] = useState(false),
    [credits, setCredits] = useState(false),
    [help, setHelp] = useState(false);
  const [memory, setMemory] = useState<TravelMemory>({
      saved: [],
      visits: [],
      last: INITIAL.id,
    }),
    memoryRef = useRef<TravelMemory>({
      saved: [],
      visits: [],
      last: INITIAL.id,
    });
  const [message, setMessage] = useState(''),
    [frameKey, setFrameKey] = useState(0),
    [frameSlow, setFrameSlow] = useState(false);
  const isStreet = active.mode === 'street';
  function writeMemory(next: TravelMemory) {
    memoryRef.current = next;
    setMemory(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      setMessage('浏览器暂时不能保存足迹，本次旅行仍可继续。');
    }
  }
  function record(place: TravelPlace) {
    const current = memoryRef.current;
    writeMemory({
      ...current,
      last: place.id,
      visits: [
        { id: place.id, at: new Date().toISOString() },
        ...current.visits.filter((v) => v.id !== place.id),
      ].slice(0, 60),
    });
  }
  function ensureViewer() {
    if (viewer.current) return viewer.current;
    try {
      viewer.current = new PanoramaViewer(canvas.current!, (next) => {
        for (const listener of poseListeners.current) listener(next);
        const now = performance.now();
        if (now - poseTick.current > 80) {
          setPose(next);
          poseTick.current = now;
        }
      });
      setFallback(false);
      return viewer.current;
    } catch {
      setFallback(true);
      return null;
    }
  }
  async function travelTo(place: TravelPlace, updateHash = true) {
    const token = ++sequence.current;
    statusRef.current = 'loading';
    errorRef.current = '';
    pendingRef.current = place.id;
    setLoading(place.id);
    setError('');
    setFrameSlow(false);
    setAuto(false);
    viewer.current?.setAuto(false);
    setAtlas(false);
    setJournal(false);
    if (updateHash)
      history.replaceState(
        history.state,
        '',
        '#' + encodeURIComponent(place.id),
      );
    if (place.mode === 'street') {
      viewer.current?.destroy();
      viewer.current = null;
      activeRef.current = place;
      setActive(place);
      setFrameKey((k) => k + 1);
      return;
    }
    const renderer = ensureViewer();
    try {
      let done = true,
        previewCommitted = false;
      const commitPreview = () => {
        if (token !== sequence.current) return;
        previewCommitted = true;
        activeRef.current = place;
        setActive(place);
        pendingRef.current = null;
        statusRef.current = 'ready';
        setLoading(null);
        record(place);
      };
      if (renderer)
        done = await renderer.load(
          assetPath(place.image!),
          {
            yaw: place.initialYaw ?? 0,
            pitch: place.initialPitch ?? 0,
            fov: 76,
          },
          place.preview ? assetPath(place.preview) : undefined,
          commitPreview,
        );
      else
        await new Promise<void>((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('image'));
          img.src = assetPath(place.image!);
        });
      if (token !== sequence.current || !done) return;
      activeRef.current = place;
      setActive(place);
      pendingRef.current = null;
      statusRef.current = 'ready';
      setLoading(null);
      if (!previewCommitted) record(place);
      setMessage(
        renderer?.quality === 'preview'
          ? '高清细节暂未载入，仍可继续环顾这张实拍全景。'
          : '',
      );
    } catch {
      if (token !== sequence.current) return;
      statusRef.current = 'error';
      errorRef.current = '这处风景暂时没能加载。可以重试，或先去另一个地方。';
      setError(errorRef.current);
      setLoading(null);
    }
  }
  useEffect(() => {
    let first = INITIAL;
    try {
      const memory = parseMemory(localStorage.getItem(KEY));
      memoryRef.current = memory;
      setMemory(memory);
      first = getPlace(memory.last)!;
    } catch {}
    try {
      first = getPlace(decodeURIComponent(location.hash.slice(1))) ?? first;
    } catch {}
    void travelTo(first, false);
    const onHash = () => {
      try {
        const p = getPlace(decodeURIComponent(location.hash.slice(1)));
        if (p && p.id !== activeRef.current.id) void travelTo(p, false);
      } catch {}
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImmersive(false);
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      sequence.current++;
      viewer.current?.destroy();
      viewer.current = null;
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, []);
  useEffect(() => {
    if (!loading || !isStreet) return;
    const timer = setTimeout(() => setFrameSlow(true), 12000);
    return () => clearTimeout(timer);
  }, [loading, isStreet, frameKey]);
  function subscribePose(listener: (pose: PanoramaPose) => void) {
    poseListeners.current.add(listener);
    if (viewer.current) listener({ ...viewer.current.pose });
    return () => {
      poseListeners.current.delete(listener);
    };
  }
  function getState() {
    const place = activeRef.current;
    return {
      id: place.id,
      name: place.name,
      country: place.country,
      mode: place.mode,
      navigable: !!place.navigable,
      loading: statusRef.current === 'loading',
      error: errorRef.current,
      view: viewer.current ? { ...viewer.current.pose } : null,
      saved: memoryRef.current.saved.includes(place.id),
      quality: viewer.current?.quality ?? null,
      viewport: {
        width: canvas.current?.clientWidth ?? 1,
        height: canvas.current?.clientHeight ?? 1,
      },
    };
  }
  function lookAround(next: Partial<PanoramaPose>) {
    if (!viewer.current || activeRef.current.mode !== 'panorama')
      throw new Error('This place uses the provider’s own street controls.');
    viewer.current.setPose(next);
  }
  function frameLoaded() {
    if (pendingRef.current !== active.id) return;
    pendingRef.current = null;
    statusRef.current = 'ready';
    setLoading(null);
    setFrameSlow(false);
    record(active);
  }
  function retry() {
    const place = getPlace(pendingRef.current ?? active.id);
    if (place) void travelTo(place);
  }
  function retryFrame() {
    statusRef.current = 'loading';
    setFrameKey((k) => k + 1);
    setFrameSlow(false);
    setLoading(active.id);
    pendingRef.current = active.id;
  }
  function toggleSaved() {
    const current = memoryRef.current;
    writeMemory({
      ...current,
      saved: current.saved.includes(active.id)
        ? current.saved.filter((id) => id !== active.id)
        : [...current.saved, active.id],
    });
  }
  function surprise() {
    const pool = PLACES.filter((p) => p.id !== active.id);
    void travelTo(pool[Math.floor(Math.random() * pool.length)]);
  }
  function nextPlace(direction: number) {
    const index = PLACES.findIndex((p) => p.id === active.id);
    void travelTo(PLACES[(index + direction + PLACES.length) % PLACES.length]);
  }
  async function toggleImmersive() {
    if (immersive) {
      setImmersive(false);
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => {});
    } else {
      setImmersive(true);
      await document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }
  function toggleAuto() {
    viewer.current?.setAuto(!auto);
    setAuto(!auto);
  }
  function zoom(delta: number) {
    viewer.current?.zoom(delta);
  }
  function postcard() {
    if (active.mode !== 'panorama' || !viewer.current) {
      setMessage('这处街景可以通过画面里的 Google 分享按钮留存链接。');
      return;
    }
    const capture = viewer.current.capture(),
      image = new window.Image();
    image.onload = () => {
      const out = document.createElement('canvas');
      out.width = 1600;
      out.height = 1160;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#f3efe4';
      ctx.fillRect(0, 0, 1600, 1160);
      const scale = Math.min(1520 / image.width, 880 / image.height),
        width = image.width * scale,
        height = image.height * scale;
      ctx.fillStyle = '#172933';
      ctx.fillRect(40, 40, 1520, 880);
      ctx.drawImage(
        image,
        40 + (1520 - width) / 2,
        40 + (880 - height) / 2,
        width,
        height,
      );
      ctx.fillStyle = '#263d43';
      ctx.font = '42px SimSun,serif';
      ctx.fillText(active.name + ' · ' + active.country, 52, 982);
      ctx.font = '17px sans-serif';
      ctx.fillText(
        '线上旅行 · ' + new Date().toLocaleDateString('zh-CN'),
        52,
        1018,
      );
      ctx.font = '15px sans-serif';
      ctx.fillText(
        '摄影 ' +
          active.photographer +
          ' / ' +
          active.provider +
          ' / ' +
          active.license,
        52,
        1050,
      );
      ctx.fillText(active.licenseUrl, 52, 1077);
      ctx.fillText(active.source, 52, 1104);
      ctx.fillText('全景视角截取与排版；照片衍生版本沿用原图许可。', 52, 1131);
      out.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob),
          a = document.createElement('a');
        a.href = url;
        a.download = '远方-' + active.name + '.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        setMessage('这一眼风景，已收进明信片。');
      }, 'image/png');
    };
    image.src = capture;
  }
  return {
    getState,
    subscribePose,
    lookAround,
    canvas,
    active,
    loading,
    error,
    fallback,
    auto,
    immersive,
    pose,
    atlas,
    setAtlas,
    journal,
    setJournal,
    credits,
    setCredits,
    help,
    setHelp,
    memory,
    message,
    setMessage,
    frameKey,
    frameSlow,
    isStreet,
    travelTo,
    frameLoaded,
    retry,
    retryFrame,
    toggleSaved,
    surprise,
    nextPlace,
    toggleImmersive,
    toggleAuto,
    zoom,
    postcard,
    saved: memory.saved.includes(active.id),
  };
}
