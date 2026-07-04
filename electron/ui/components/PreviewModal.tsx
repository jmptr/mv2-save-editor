// PreviewModal.tsx — the SAFE-02 pending-changes review + write-confirm gate (SAFE-02, D-07/D-08).
//
// The explicit in-app review modal that stands between an edit and a write. It renders main's
// AUTHORITATIVE `preview()` output — the `WireChangeRow[]` change report (old→new) plus any
// `violations[]` — NOT a locally computed diff (D-07: main's FieldTable is the single source of
// truth). Each row's oldValue/newValue is rendered as a React text child exactly as it crossed the
// bridge: int64 values are already decimal STRINGS from main and are NEVER reformatted through
// `Number` (D-06 — precision above 2^53), and every field key / value auto-escapes (no
// `dangerouslySetInnerHTML` — T-05-09). The primary CTA `Write New Save File` (accent fill) calls
// `onConfirm`, which the container wires to `write(edits)` → the native Save-As dialog owned by main
// (D-08). No write can occur without this confirm (SAFE-02, T-05-10).

import type { WireChangeRow } from '../../../src/ipc/ipc-guards';
import type { Violation } from '../../../src/patcher';

/** Props for the preview/confirm modal. `rows`/`violations` are main's authoritative preview() output. */
export interface PreviewModalProps {
  /** The authoritative old→new change report from main's `preview()` (NOT a local diff — D-07). */
  rows: WireChangeRow[];
  /** Any validation violations collected by main (rendered alongside the rows; blocks a clean write). */
  violations: Violation[];
  /** The pending-change count (drives the confirmation copy — `Write {n} pending change(s)?`). */
  count: number;
  /** Confirm the write — the container wires this to `write(edits)` → native Save-As (D-08). */
  onConfirm: () => void;
  /** Dismiss the modal without writing (SAFE-02 — no write without explicit confirm). */
  onClose: () => void;
}

/**
 * The pending-changes preview modal. Lists every `WireChangeRow` as `fieldKey: oldValue → newValue`
 * (mono, int64 as string) plus any violations, then offers the `Write New Save File` confirm CTA and
 * a Cancel affordance. The rendered rows are main's authoritative report, never a locally recomputed diff.
 */
export function PreviewModal({
  rows,
  violations,
  count,
  onConfirm,
  onClose,
}: PreviewModalProps): React.ReactElement {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Preview pending changes">
      <div className="modal">
        <h2 className="panel-title">Preview Changes</h2>

        {rows.length === 0 ? (
          <p className="column-header">No pending changes.</p>
        ) : (
          <ul className="preview-list">
            {rows.map((row) => (
              <li key={row.fieldKey} className="list-row">
                <span className="mono">{row.fieldKey}</span>
                {/* int64 old/new arrive as decimal strings from main — rendered as-is, never Number (D-06). */}
                <span className="mono">
                  {row.oldValue} → {row.newValue}
                </span>
              </li>
            ))}
          </ul>
        )}

        {violations.length > 0 && (
          <ul className="preview-violations" role="alert">
            {violations.map((v) => (
              <li key={v.fieldKey} className="inline-error">
                <span className="mono">{v.fieldKey}</span>: {v.reason}
              </li>
            ))}
          </ul>
        )}

        {/* Confirmation copy verbatim from the UI-SPEC Copywriting Contract (non-destructive framing). */}
        <p className="column-header">
          Creates a new .sav next to the original — your original file is never changed. Write {count}{' '}
          pending change(s)?
        </p>

        <div className="write-bar">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirm}
            disabled={rows.length === 0 || violations.length > 0}
          >
            Write New Save File
          </button>
        </div>
      </div>
    </div>
  );
}
