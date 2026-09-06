// Public assets need the project prefix when hosted on GitHub Pages.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export function assetPath(path: string) {
  return basePath + (path.startsWith('/') ? path : '/' + path);
}
