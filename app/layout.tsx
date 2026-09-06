import type { Metadata } from 'next';
import './globals.css';
import { assetPath } from '@/lib/paths';
export const metadata: Metadata = {
  title: '远方 · 实景旅行',
  description: '从真实360度摄影与官方街景出发，看城市、山海和世界各地的风景。',
  icons: { icon: assetPath('/favicon.svg') },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
