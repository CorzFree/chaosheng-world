import type { NextConfig } from 'next';

const githubPages = process.env.GITHUB_PAGES === 'true';
const publicPath = process.env.NEXT_PUBLIC_BASE_PATH || '/chaosheng-world';
const origin = process.env.PAGES_ORIGIN || 'https://corzfree.cn';

// vinext beta.5 prerenders route patterns without trailing slashes.
// The Pages script adds directory entrypoints after successful static export.
const nextConfig: NextConfig = githubPages
  ? {
      output: 'export',
      assetPrefix: origin.replace(/\/$/, '') + publicPath,
      trailingSlash: false,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
