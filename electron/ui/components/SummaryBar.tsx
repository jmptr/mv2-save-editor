// SummaryBar.tsx — the read-only save summary + click-to-edit int64 currencies (BROWSE-01, EDIT-01, D-06).
//
// Renders the offset-free `Summary` projection: name / gamemode / totalLevel are strictly READ-ONLY
// (header editing is out of scope for v1 — PROJECT.md), while GP and Slayer Coins are click-to-edit
// int64 fields. The int64 values are `string` end-to-end and are NEVER coerced through `Number`
// (D-06 — precision above 2^53): the display string, the EditableCell seed, and the SET_EDIT payload
// are all decimal strings. A valid edit dispatches SET_EDIT with fieldKey `wallet.GoldPieces` /
// `wallet.SlayerCoins` (validated by validateInt64); an invalid edit dispatches CLEAR_EDIT so it
// contributes no edit (D-04 — main re-validates authoritatively). An edited currency shows the
// accent left-bar (reserved list #3). All save-derived strings render as React text children
// (auto-escaped) — no `dangerouslySetInnerHTML` anywhere (T-05-09, XSS from a crafted save).

import { useState } from 'react';
import type { Summary } from '../../../src/view-model';
import type { Action, EditEntry } from '../state/reducer';
import { validateInt64 } from '../lib/validation';
import { EditableCell } from './EditableCell';

/** The two int64 wallet currency fields the summary can edit, keyed by their SET_EDIT fieldKey. */
const GP_KEY = 'wallet.GoldPieces';
const SC_KEY = 'wallet.SlayerCoins';

/** Props for the summary bar. Receives the accumulator + dispatch so it can mark edited currencies. */
export interface SummaryBarProps {
  /** The offset-free save summary to render (name, gamemode, totalLevel, gp:string, slayerCoins:string). */
  summary: Summary;
  /** The D-02 edit accumulator (fieldKey → entry); used to seed + mark edited currencies. */
  edits: Record<string, EditEntry>;
  /** The top reducer's dispatch — a valid currency edit dispatches SET_EDIT, an invalid one CLEAR_EDIT. */
  dispatch: React.Dispatch<Action>;
}

/** Props for a single click-to-edit int64 currency field. */
interface CurrencyFieldProps {
  /** Field label (e.g. "GP"). */
  label: string;
  /** The SET_EDIT/CLEAR_EDIT fieldKey (`wallet.GoldPieces` / `wallet.SlayerCoins`). */
  fieldKey: string;
  /** The loaded int64 value as a decimal string (NEVER a number — D-06). */
  loaded: string;
  /** The current accumulator entry for this key, if any (seeds the display + edited state). */
  entry: EditEntry | undefined;
  /** The top reducer's dispatch. */
  dispatch: React.Dispatch<Action>;
}

/**
 * One int64 currency: read-only mono value with a ✎ affordance that swaps in an inline EditableCell.
 * The value is always a decimal string; a pending edit shows the accent left-bar (reserved list #3).
 */
function CurrencyField({ label, fieldKey, loaded, entry, dispatch }: CurrencyFieldProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  // Seed from the pending edit's raw text when present, else the loaded string — never Number (D-06).
  const seed = entry?.raw ?? loaded;
  const edited = entry !== undefined;

  return (
    <div className={`summary-item${edited ? ' list-row--edited' : ''}`}>
      <span className="column-header">{label}</span>
      {editing ? (
        <EditableCell
          value={seed}
          validate={validateInt64}
          mono
          onValid={(value, raw): void => {
            // int64 stays a decimal string end-to-end (validateInt64 returns the string) — never Number.
            const nextEntry: EditEntry = { raw, value, valid: true };
            dispatch({ t: 'SET_EDIT', fieldKey, entry: nextEntry });
          }}
          onInvalid={(): void => {
            // Invalid contributes no edit (D-04) — drop any prior valid entry for this key.
            dispatch({ t: 'CLEAR_EDIT', fieldKey });
          }}
        />
      ) : (
        <span className="summary-value">
          {seed}
          <button
            type="button"
            className="btn"
            aria-label={`Edit ${label}`}
            onClick={(): void => setEditing(true)}
          >
            {'✎'}
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * The full-width summary bar. Read-only name / gamemode / total level anchor the view (BROWSE-01);
 * GP and Slayer Coins are click-to-edit int64 strings (EDIT-01, D-06).
 */
export function SummaryBar({ summary, edits, dispatch }: SummaryBarProps): React.ReactElement {
  return (
    <div className="summary-bar">
      <div className="summary-item">
        <span className="column-header">Name</span>
        <span className="summary-value">{summary.name}</span>
      </div>
      <div className="summary-item">
        <span className="column-header">Gamemode</span>
        <span className="summary-value">{summary.gamemode}</span>
      </div>
      <div className="summary-item">
        <span className="column-header">Total Level</span>
        <span className="summary-value">{summary.totalLevel}</span>
      </div>
      <CurrencyField
        label="GP"
        fieldKey={GP_KEY}
        loaded={summary.gp}
        entry={edits[GP_KEY]}
        dispatch={dispatch}
      />
      <CurrencyField
        label="Slayer Coins"
        fieldKey={SC_KEY}
        loaded={summary.slayerCoins}
        entry={edits[SC_KEY]}
        dispatch={dispatch}
      />
    </div>
  );
}
