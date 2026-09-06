import type { Metadata } from 'next';
import './globals.css';
import { assetPath } from '@/lib/paths';
export const metadata: Metadata = {
  title: '荒岛上的纽约 · 潮生',
  description:
    '在荒岛上建设一座纽约般密集的海岛大都会。观察楼宇、路网、通勤与水电如何共同组成一座城市。',
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
