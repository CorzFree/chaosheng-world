import type { NextConfig } from 'next';

const githubPages = process.env.GITHUB_PAGES === 'true';
const publicPath = process.env.NEXT_PUBLIC_BASE_PATH || '/chaosheng-world';
const origin = process.env.PAGES_ORIGIN || 'https://corzfree.cn';

// vinext beta.5 prerenders the unprefixed root URL. For this single-page
// export, public URLs use assetPath while framework chunks use assetPrefix.
const nextConfig: NextConfig = githubPages
  ? {
      output: 'export',
      assetPrefix: origin.replace(/\/$/, '') + publicPath,
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
