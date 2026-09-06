import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = {
  ...process.env,
  GITHUB_PAGES: 'true',
  NEXT_PUBLIC_BASE_PATH:
    process.env.NEXT_PUBLIC_BASE_PATH || '/chaosheng-world',
  PAGES_ORIGIN: process.env.PAGES_ORIGIN || 'https://corzfree.cn',
};
if (!/^\/[A-Za-z0-9._-]+$/.test(env.NEXT_PUBLIC_BASE_PATH)) {
  throw new Error('NEXT_PUBLIC_BASE_PATH must be one repository path.');
}
if (new URL(env.PAGES_ORIGIN).protocol !== 'https:') {
  throw new Error('PAGES_ORIGIN must use HTTPS.');
}
const result = spawnSync(
  process.execPath,
  ['node_modules/vinext/dist/cli.js', 'build'],
  { cwd: root, env, stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const output = new URL('../dist/client/', import.meta.url);
for (const required of [
  'index.html',
  'index.rsc',
  'isles.html',
  'isles.rsc',
  'island-metropolis.webp',
  'archipelago.webp',
]) {
  if (!existsSync(new URL(required, output))) {
    throw new Error('Static export is incomplete: missing ' + required);
  }
}
// GitHub Pages serves directory indexes; vinext's slash redirects must remain
// disabled during prerendering so nested routes are not silently skipped.
mkdirSync(new URL('isles/', output), { recursive: true });
copyFileSync(
  new URL('isles.html', output),
  new URL('isles/index.html', output),
);
copyFileSync(new URL('isles.rsc', output), new URL('isles/index.rsc', output));
writeFileSync(new URL('.nojekyll', output), '');
console.log('GitHub Pages static files are ready in dist/client.');
