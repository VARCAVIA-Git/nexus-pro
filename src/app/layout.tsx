import type { Metadata } from 'next';
import './globals.css';
import { ModeProvider } from '@/components/mode-provider';

export const metadata: Metadata = {
  title: 'NEXUS PRO v5',
  description: 'Trading Analytics Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" data-mode="demo">
      <body className="antialiased">
        <ModeProvider>{children}</ModeProvider>
      </body>
    </html>
  );
}
