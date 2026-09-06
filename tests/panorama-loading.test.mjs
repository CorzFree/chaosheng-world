import test from 'node:test';
import assert from 'node:assert/strict';
import { PanoramaViewer } from '../lib/panorama-viewer.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
function fakeViewer() {
  const viewer = Object.create(PanoramaViewer.prototype);
  Object.assign(viewer, {
    sequence: 0,
    download: null,
    disposed: false,
    quality: 'none',
    texture: null,
    sphere: { material: {} },
    renderer: { capabilities: { getMaxAnisotropy: () => 4 } },
    pose: { yaw: 0, pitch: 0, fov: 76 },
    target: { yaw: 0, pitch: 0, fov: 76 },
    dirty: false,
  });
  return viewer;
}
function setup(t, responses) {
  const originalFetch = globalThis.fetch,
    originalWindow = globalThis.window,
    originalImage = globalThis.HTMLImageElement;
  class FakeImage {
    naturalWidth = 1536;
    naturalHeight = 768;
    src = '';
    decoding = '';
    async decode() {}
  }
  globalThis.window = { Image: FakeImage };
  globalThis.HTMLImageElement = FakeImage;
  globalThis.fetch = (url, { signal } = {}) => {
    const response = responses.get(url);
    if (!response)
      return Promise.resolve(new Response('missing', { status: 404 }));
    if (signal?.aborted)
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal?.addEventListener('abort', onAbort, { once: true });
      response.promise.then(
        (value) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error) => {
          signal?.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.HTMLImageElement = originalImage;
  });
}
test('lightweight panorama becomes usable before high-resolution download, preserving camera during upgrade', async (t) => {
  const preview = deferred(),
    full = deferred(),
    ready = deferred();
  setup(
    t,
    new Map([
      ['preview', preview],
      ['full', full],
    ]),
  );
  const viewer = fakeViewer(),
    loading = viewer.load(
      'full',
      { yaw: 20, pitch: 2, fov: 76 },
      'preview',
      () => ready.resolve(),
    );
  preview.resolve(new Response('photographic-preview'));
  await ready.promise;
  assert.equal(viewer.quality, 'preview');
  const previous = viewer.texture;
  let disposed = 0;
  previous.addEventListener('dispose', () => disposed++);
  viewer.setPose({ yaw: 88, pitch: 15, fov: 42 });
  viewer.pose = { yaw: 70, pitch: 12, fov: 48 };
  full.resolve(new Response('photographic-full'));
  assert.equal(await loading, true);
  assert.equal(viewer.quality, 'full');
  assert.deepEqual(viewer.pose, { yaw: 70, pitch: 12, fov: 48 });
  assert.deepEqual(viewer.target, { yaw: 88, pitch: 15, fov: 42 });
  assert.equal(disposed, 1);
  assert.equal(previous.image.src, '');
  viewer.texture.dispose();
});
test('a superseded panorama aborts its old download and cannot overwrite the new photograph', async (t) => {
  const old = deferred(),
    fresh = deferred();
  setup(
    t,
    new Map([
      ['old', old],
      ['new', fresh],
    ]),
  );
  const viewer = fakeViewer();
  const first = viewer.load('old', { yaw: 1 }),
    second = viewer.load('new', { yaw: 95 });
  fresh.resolve(new Response('new'));
  assert.equal(await second, true);
  assert.equal(await first, false);
  old.resolve(new Response('old'));
  assert.equal(viewer.pose.yaw, 95);
  assert.equal(viewer.quality, 'full');
  viewer.texture.dispose();
});
test('failed high resolution keeps the available real panorama interactive', async (t) => {
  const preview = deferred(),
    full = deferred();
  setup(
    t,
    new Map([
      ['preview', preview],
      ['full', full],
    ]),
  );
  const viewer = fakeViewer();
  const loading = viewer.load('full', { yaw: 30 }, 'preview');
  preview.resolve(new Response('preview'));
  full.resolve(new Response('unavailable', { status: 503 }));
  assert.equal(await loading, true);
  assert.equal(viewer.quality, 'preview');
  assert.equal(viewer.pose.yaw, 30);
  viewer.texture.dispose();
});
test('failure of both resolutions is reported instead of remaining in a loading state', async (t) => {
  const preview = deferred(),
    full = deferred();
  setup(
    t,
    new Map([
      ['preview', preview],
      ['full', full],
    ]),
  );
  const viewer = fakeViewer();
  const loading = viewer.load('full', {}, 'preview');
  preview.resolve(new Response('missing', { status: 404 }));
  full.resolve(new Response('missing', { status: 404 }));
  await assert.rejects(loading, /download failed/);
  assert.equal(viewer.download, null);
  assert.equal(viewer.quality, 'none');
});
