import type { Metadata } from 'next';
export const metadata: Metadata = { title: '荒岛上的纽约 · 潮生' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
