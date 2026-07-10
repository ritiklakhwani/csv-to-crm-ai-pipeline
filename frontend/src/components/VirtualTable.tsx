'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  label: string;
  /** Fixed pixel width. Fixed widths let the header and the rows share one horizontal scroll. */
  width?: number;
  render?: (row: T) => ReactNode;
  mono?: boolean;
}

interface VirtualTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowHeight?: number;
  maxHeight?: number;
  getCell: (row: T, key: string) => string;
  emptyMessage?: string;
}

const DEFAULT_COL_WIDTH = 170;
const DEFAULT_ROW_HEIGHT = 44;
const HEADER_HEIGHT = 40;

/**
 * A windowed table: only the rows in view exist in the DOM, so a 5,000-row file scrolls smoothly.
 *
 * Columns are fixed-width so the sticky header and the absolutely-positioned rows line up under a
 * single horizontal scrollbar — the header pins vertically but travels with the body sideways.
 */
export function VirtualTable<T>({
  columns,
  rows,
  rowHeight = DEFAULT_ROW_HEIGHT,
  maxHeight = 460,
  getCell,
  emptyMessage = 'Nothing to show.',
}: VirtualTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const totalWidth = columns.reduce((sum, col) => sum + (col.width ?? DEFAULT_COL_WIDTH), 0);
  const gridTemplate = columns.map((col) => `${col.width ?? DEFAULT_COL_WIDTH}px`).join(' ');

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="thin-scrollbar relative overflow-auto" style={{ maxHeight }}>
      <div style={{ width: totalWidth, minWidth: '100%' }}>
        {/* Sticky header: pinned to the top of the scroll container, scrolls sideways with rows. */}
        <div
          className="sticky top-0 z-10 grid border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
          style={{ gridTemplateColumns: gridTemplate, height: HEADER_HEIGHT }}
        >
          {columns.map((col) => (
            <div
              key={col.key}
              className="flex items-center truncate px-3 text-xs font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400"
              title={col.label}
            >
              {col.label}
            </div>
          ))}
        </div>

        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const zebra = item.index % 2 === 1;

            return (
              <div
                key={item.key}
                className={cn(
                  'absolute top-0 left-0 grid border-b border-neutral-100 dark:border-neutral-800/60',
                  zebra && 'bg-neutral-50/60 dark:bg-neutral-800/20',
                )}
                style={{
                  gridTemplateColumns: gridTemplate,
                  width: totalWidth,
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className={cn(
                      'flex items-center truncate px-3 text-sm text-neutral-700 dark:text-neutral-200',
                      col.mono && 'font-mono text-[13px]',
                    )}
                    title={col.render ? undefined : getCell(row, col.key)}
                  >
                    {col.render
                      ? col.render(row)
                      : getCell(row, col.key) || (
                          <span className="text-neutral-300 dark:text-neutral-600">—</span>
                        )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
