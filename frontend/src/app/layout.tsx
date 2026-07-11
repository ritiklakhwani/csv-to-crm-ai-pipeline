import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

// Poppins is the geometric sans the spec calls for. Loaded through next/font so it self-hosts and
// works on Vercel and in networked Docker builds; exposed as a CSS variable that globals.css maps to
// Tailwind's --font-sans.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GrowEasy — AI CSV Importer',
  description: 'Upload any lead CSV and get clean, validated GrowEasy CRM records.',
};

/**
 * Runs before the first paint so the page never flashes the wrong theme: it reads the saved choice
 * (or the OS preference) and sets the `.dark` class that the dark variant keys off. useTheme then
 * reads back whatever this script decided.
 */
const themeBootScript = `
(function () {
  try {
    var saved = localStorage.getItem('groweasy-theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={poppins.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
