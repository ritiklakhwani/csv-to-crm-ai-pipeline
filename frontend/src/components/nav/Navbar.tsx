'use client';

import { Moon, Sun } from 'lucide-react';
import { useRef, useState, type MouseEvent } from 'react';
import { AboutModal } from '@/components/nav/AboutModal';
import { DocsModal } from '@/components/nav/DocsModal';
import { useTheme } from '@/hooks/useTheme';

type OpenModal = 'docs' | 'about' | null;

export function Navbar() {
  const { theme, toggle } = useTheme();
  const [openModal, setOpenModal] = useState<OpenModal>(null);

  // A single glass "highlight" pill shared across the nav items: on hover it measures the hovered
  // button and glides (transform + width) behind it. `instant` places it without a slide the first
  // time it appears (or re-appears after leaving), so it fades in rather than sliding from a stale spot.
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0, shown: false, instant: true });

  const moveTo = (event: MouseEvent<HTMLButtonElement>) => {
    const nav = navRef.current;
    if (!nav) return;
    const navRect = nav.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    setPill((prev) => ({
      left: rect.left - navRect.left,
      width: rect.width,
      shown: true,
      instant: !prev.shown,
    }));
  };
  const hidePill = () => setPill((prev) => ({ ...prev, shown: false, instant: true }));

  return (
    <header className="navbar-3d mx-auto flex w-fit max-w-[1400px] items-center gap-8 rounded-full py-1.5 pr-4 pl-4 sm:gap-14">
      <div className="flex items-center gap-2">
        {/* Two marks toggled by the .dark class (set before paint), so there is no logo flash. */}
        <img
          src="/logo-light.svg"
          alt="GrowEasy"
          width={28}
          height={28}
          className="h-7 w-7 select-none dark:hidden"
        />
        <img
          src="/logo-dark.png"
          alt="GrowEasy"
          width={28}
          height={28}
          className="hidden h-7 w-7 select-none dark:block"
        />
        <p className="text-sm font-semibold text-[var(--text-strong)]">GrowEasy</p>
      </div>

      <nav ref={navRef} className="relative flex items-center gap-1" onMouseLeave={hidePill}>
        {/* One shared glass pill that glides behind the hovered item. */}
        <span
          aria-hidden
          data-instant={pill.instant ? 'true' : 'false'}
          className="nav-slide-pill pointer-events-none absolute top-0 bottom-0 left-0 rounded-full"
          style={{
            transform: `translateX(${pill.left}px)`,
            width: pill.width,
            opacity: pill.shown ? 1 : 0,
          }}
        />
        <button
          onMouseEnter={moveTo}
          onClick={() => setOpenModal('docs')}
          className="nav-pill rounded-full px-4 py-1.5 text-sm font-medium text-[var(--text-strong)]"
        >
          Docs
        </button>
        <button
          onMouseEnter={moveTo}
          onClick={() => setOpenModal('about')}
          className="nav-pill rounded-full px-4 py-1.5 text-sm font-medium text-[var(--text-strong)]"
        >
          About
        </button>
        <button
          onMouseEnter={moveTo}
          onClick={toggle}
          className="nav-pill flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200/80 bg-white text-zinc-500 shadow-[0_4px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_1px_rgba(0,0,0,0.05)] transition-all duration-200 hover:bg-[#f4f4f7] hover:text-zinc-900 hover:shadow-[0_6px_16px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_1px_rgba(0,0,0,0.05)] active:translate-y-[1px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.12)] dark:border-zinc-800/80 dark:bg-[#1c1d24] dark:text-zinc-400 dark:shadow-[0_4px_12px_rgba(0,0,0,0.6),0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_1px_rgba(0,0,0,0.4)] dark:hover:bg-[#22232c] dark:hover:text-zinc-100 dark:hover:shadow-[0_6px_16px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_1px_rgba(0,0,0,0.4)] dark:active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="flex h-4 w-4 items-center justify-center [view-transition-name:theme-toggle-icon]">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </span>
        </button>
      </nav>

      <DocsModal open={openModal === 'docs'} onClose={() => setOpenModal(null)} />
      <AboutModal open={openModal === 'about'} onClose={() => setOpenModal(null)} />
    </header>
  );
}
