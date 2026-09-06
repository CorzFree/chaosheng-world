import type { Metadata } from 'next';
import './globals.css';
import { assetPath } from '@/lib/paths';
export const metadata: Metadata = {
  title: '潮生 · 一座会呼吸的群岛',
  description:
    '造一座岛，种一棵树，放一盏灯。在潮汐、天气与昼夜之间，陪一个小世界慢慢生长。',
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
