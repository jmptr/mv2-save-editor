// BankPanel.tsx — the bank browse + filter + inline quantity-edit panel (BROWSE-02/04, EDIT-02).
//
// Lists every bank stack virtualized (BROWSE-02), filters as-you-type by itemId (BROWSE-04), and
// edits each stack's quantity inline (EDIT-02). The filter text is LOCAL `useState` — keystrokes are
// NOT routed through the top reducer (RESEARCH Pattern 2); the filtered slice is memoised. Rows are
// keyed by the offset-free `BankItem.fieldKey` (Pitfall 4 — never the virtual index, so a filter
// change never leaves a stale value / jumped focus), and the list is remounted on query change (a
// changing `key` gives a fresh scroll element → scroll resets to top, Pitfall 4). Each quantity is an
// EditableCell over `validateInt32`: a valid value dispatches SET_EDIT with the item's `fieldKey`, an
// invalid one dispatches CLEAR_EDIT so it contributes no edit (D-04 — main re-validates). The filter
// uses `matches` (String.includes, never a compiled pattern — T-05-06). All save-derived strings
// (itemId, metadata) render as React text children (auto-escaped) — no raw-HTML API (T-05-09).

import { useMemo, useState } from 'react';
import type { BankItem } from '../../../src/view-model';
import type { Action, EditEntry } from '../state/reducer';
import { matches } from '../lib/filter';
import { validateInt32 } from '../lib/validation';
import { EditableCell } from './EditableCell';
import { VirtualList } from './VirtualList';

/** Props for the bank panel. Receives the stacks, the accumulator (to seed edits), and dispatch. */
export interface BankPanelProps {
  /** The bank item stacks to browse/filter/edit (flat list across all tabs). */
  items: BankItem[];
  /** The D-02 edit accumulator (fieldKey → entry); used to seed a row's in-progress quantity. */
  edits: Record<string, EditEntry>;
  /** The top reducer's dispatch — a valid quantity edit dispatches SET_EDIT, an invalid one CLEAR_EDIT. */
  dispatch: React.Dispatch<Action>;
}

/**
 * The bank browse panel: a heading, an as-you-type filter input, and a virtualized list of stacks
 * with inline int32 quantity editing. When the filter matches nothing, shows the UI-SPEC empty copy.
 */
export function BankPanel({ items, edits, dispatch }: BankPanelProps): React.ReactElement {
  // Filter text stays LOCAL — keystrokes never route through the top reducer (RESEARCH Pattern 2).
  const [q, setQ] = useState('');
  const filtered = useMemo(() => items.filter((i) => matches(q, i.itemId)), [items, q]);

  const renderRow = (item: BankItem): React.ReactNode => {
    // Seed from the pending edit's raw text when present, else the loaded quantity.
    const entry = edits[item.fieldKey];
    const seed = entry?.raw ?? String(item.quantity);
    return (
      <>
        <span className="mono">{item.itemId}</span>
        {item.isPlaceholder && <span className="column-header">placeholder</span>}
        {item.isLocked && <span className="column-header">locked</span>}
        <EditableCell
          value={seed}
          validate={validateInt32}
          mono
          onValid={(value, raw): void => {
            const nextEntry: EditEntry = { raw, value, valid: true };
            dispatch({ t: 'SET_EDIT', fieldKey: item.fieldKey, entry: nextEntry });
          }}
          onInvalid={(): void => {
            // Invalid contributes no edit (D-04) — drop any prior valid entry for this key.
            dispatch({ t: 'CLEAR_EDIT', fieldKey: item.fieldKey });
          }}
        />
      </>
    );
  };

  const isFilteredEmpty = filtered.length === 0 && q !== '';

  return (
    <div className="panel">
      <h2 className="panel-title">Bank</h2>
      <input
        className="input"
        type="text"
        value={q}
        placeholder="Filter items…"
        aria-label="Filter bank items"
        onChange={(e): void => setQ(e.target.value)}
      />
      {isFilteredEmpty ? (
        <div className="empty-state">
          <p className="panel-title">No matches</p>
          <p className="column-header">No items match &quot;{q}&quot;. Clear the filter to see all items.</p>
        </div>
      ) : (
        // Remount on query change (`key={q}`) → fresh scroll element resets scroll to top (Pitfall 4).
        <VirtualList<BankItem>
          key={q}
          items={filtered}
          getKey={(i): string => i.fieldKey}
          renderRow={renderRow}
        />
      )}
    </div>
  );
}
