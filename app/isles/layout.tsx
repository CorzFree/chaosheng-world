import type { Metadata } from 'next';
export const metadata: Metadata = { title: '潮生 · 原野群岛' };
export default function IslesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
