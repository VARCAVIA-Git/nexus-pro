import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'NEXUS PRO', description: 'Trading Analytics' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="it" className="dark"><body className="antialiased">{children}</body></html>);
}
