import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'OctaPoint', template: '%s · OctaPoint' },
  description: 'Blockchain-backed loyalty points platform (academic MVP, Sui Testnet).',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
