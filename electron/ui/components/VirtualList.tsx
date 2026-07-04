// VirtualList.tsx — the generic windowed list every browse panel reuses (RESEARCH Pattern 3, D-05).
//
// A single `@tanstack/react-virtual` `useVirtualizer` wrapper backing BOTH side-by-side lists (Bank
// and Skills). Row height is FIXED at `--row-h` (32px) so `estimateSize` returns a constant — no
// `measureElement`, correct virtualization across 689 rows (RESEARCH Pitfall 4). Only the windowed
// rows mount. Each row is keyed by a STABLE item id from `getKey` (NOT `virtualItem.index`) so a
// filter/query change never leaves a row with a stale value or a jumped focus. The per-row
// `transform: translateY(...)` is the app's one dynamic style, set via React inline CSSOM — element
// inline style is not governed by `style-src`, so the strict CSP holds (all static styling lives in
// styles.css). Callers render save-derived strings as React text children (auto-escaped — XSS-safe).

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/** Props for the generic virtualized list. `T` is the row item shape (BankItem, Skill, …). */
export interface VirtualListProps<T> {
  /** The (already filtered) items to window. Only visible rows mount. */
  items: T[];
  /** Stable per-item id used as the React `key` (NOT the virtual index — Pitfall 4). */
  getKey: (item: T) => string;
  /** Render a single row's contents; the wrapper owns positioning + keying. */
  renderRow: (item: T) => React.ReactNode;
  /** Fixed row height in px; defaults to the `--row-h` 32px contract. */
  rowHeight?: number;
}

/**
 * Generic fixed-size virtualized list. Renders a scroll parent whose inner spacer is sized to the
 * full virtual height, then absolutely positions each windowed row via an inline transform.
 */
export function VirtualList<T>({
  items,
  getKey,
  renderRow,
  rowHeight,
}: VirtualListProps<T>): React.ReactElement {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight ?? 32, // --row-h constant → no measureElement
    overscan: 8,
  });

  return (
    <div ref={parentRef} className="list-container">
      <div className="list-inner" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((vi) => {
          // vi.index is always in [0, items.length) — the virtualizer never yields OOB indices.
          const item = items[vi.index]!;
          return (
            <div
              key={getKey(item)}
              className="list-row"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              {renderRow(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
