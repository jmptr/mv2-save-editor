// reducer.ts — the single PURE store that drives all renderer state (RESEARCH Pattern 2, D-02).
//
// A DOM-free, React-free module (unit-testable under `tsx --test`, mirroring src/patcher.ts's
// pure-module + typed-discriminated-union convention). It owns the D-02 edit accumulator: a
// `Record<fieldKey, EditEntry>` where DIRTINESS IS DERIVED (an entry equal to its loaded
// ViewModel value contributes no edit — computed by selectors.ts, never stored here).
//
// All ViewModel / wire / core types cross in via `import type` ONLY (esbuild-erased) so the
// renderer bundle (platform:browser) never pulls Node-only core code across the trust boundary.
//
// Pitfall 5 (verified against patcher.ts `ConflictingEditError`): SET_EDIT of a `skill.<id>.xp`
// or `skill.<id>.level` key CLEARS the sibling key so level+xp are NEVER both present — else the
// main-process patcher returns `kind:'conflict'`. This is the D-02 mutual exclusion, enforced here
// so a bad payload can never leave the renderer.

import type { ViewModel } from '../../../src/view-model';
import type { WireChangeRow } from '../../../src/ipc/ipc-guards';
import type { Violation } from '../../../src/patcher';

/**
 * One accumulator entry (D-02). `raw` is the exact input text the user typed; `value` is the
 * parsed value to send (int64 currency as a decimal string, int32/double/level as a number);
 * `valid` gates whether the entry is eligible to become an edit (an invalid entry emits nothing).
 * Dirtiness is DERIVED (selectors.ts) — an entry equal to its loaded value contributes no edit.
 */
export interface EditEntry {
  /** The raw input text the user typed (kept for round-tripping the field's display). */
  raw: string;
  /** The parsed value to send: int64 currency as a decimal string; int32/double/level as a number. */
  value: string | number;
  /** Whether this entry passed client-side validation (an invalid entry never becomes an edit). */
  valid: boolean;
}

/**
 * The single top-level app state (RESEARCH Pattern 2). Held by one `useReducer` at App; there is
 * no external store (CLAUDE.md). Optional keys are OMITTED rather than set to `undefined`
 * (exactOptionalPropertyTypes).
 */
export interface AppState {
  /** Lifecycle of the loaded save. */
  status: 'empty' | 'loading' | 'populated' | 'load-error';
  /** Present only in the 'load-error' status: the typed error kind from main. */
  errorKind?: string;
  /** Present only in the 'load-error' status: the human-readable error message from main. */
  errorMessage?: string;
  /** The offset-free view model (null until a save loads). */
  viewModel: ViewModel | null;
  /** The D-02 edit accumulator, keyed by fieldKey. Dirtiness is derived, not stored. */
  edits: Record<string, EditEntry>;
  /** The open preview (change rows + collected violations), or null when the preview is closed. */
  preview: { rows: WireChangeRow[]; violations: Violation[] } | null;
  /** The write sub-state (idle until a write is requested). */
  write: { status: 'idle' | 'writing' | 'success' | 'error'; outputPath?: string; message?: string };
}

/**
 * The discriminated action union (`t` = tag). The LOAD and WRITE actions mirror the four bridge
 * results (main.ts toErrorResult kinds); SET_EDIT/CLEAR_EDIT mutate the accumulator; the PREVIEW
 * actions toggle the preview.
 */
export type Action =
  | { t: 'LOAD_START' }
  | { t: 'LOAD_OK'; viewModel: ViewModel }
  | { t: 'LOAD_CANCELLED' }
  | { t: 'LOAD_ERR'; kind: string; message: string }
  | { t: 'SET_EDIT'; fieldKey: string; entry: EditEntry }
  | { t: 'CLEAR_EDIT'; fieldKey: string }
  | { t: 'PREVIEW_OK'; rows: WireChangeRow[]; violations: Violation[] }
  | { t: 'PREVIEW_CLOSE' }
  | { t: 'WRITE_START' }
  | { t: 'WRITE_OK'; outputPath: string }
  | { t: 'WRITE_CANCELLED' }
  | { t: 'WRITE_ERR'; message: string };

/** The initial (empty) app state. */
export const initialState: AppState = {
  status: 'empty',
  viewModel: null,
  edits: {},
  preview: null,
  write: { status: 'idle' },
};

/** Matches a skill accumulator key and captures the skill id + the xp|level suffix (Pitfall 5). */
const SKILL_KEY = /^skill\.(.+)\.(xp|level)$/;

/**
 * The single PURE reducer (no mutation — always returns a NEW state; never writes through
 * `state.edits`). Enforces the Pitfall 5 mutual exclusion on SET_EDIT.
 *
 * @param state The current state.
 * @param action The action to apply.
 * @returns A new {@link AppState}.
 */
export function appReducer(state: AppState, action: Action): AppState {
  switch (action.t) {
    case 'LOAD_START':
      // Enter loading; drop any prior error (omit the optional keys — exactOptionalPropertyTypes).
      return { ...state, status: 'loading', viewModel: state.viewModel, edits: state.edits };

    case 'LOAD_OK':
      // A fresh save wipes the accumulator, preview, and write sub-state (offsets re-parsed fresh).
      return {
        status: 'populated',
        viewModel: action.viewModel,
        edits: {},
        preview: null,
        write: { status: 'idle' },
      };

    case 'LOAD_ERR':
      return {
        ...state,
        status: 'load-error',
        errorKind: action.kind,
        errorMessage: action.message,
      };

    case 'LOAD_CANCELLED':
      // Return to the prior surface without an error: 'populated' if a save is loaded, else 'empty'.
      return {
        ...state,
        status: state.viewModel ? 'populated' : 'empty',
      };

    case 'SET_EDIT': {
      const edits: Record<string, EditEntry> = { ...state.edits, [action.fieldKey]: action.entry };
      // Pitfall 5: setting one of a skill's xp/level pair CLEARS the sibling so both never cross.
      const m = SKILL_KEY.exec(action.fieldKey);
      if (m) {
        const sibling = `skill.${m[1]}.${m[2] === 'xp' ? 'level' : 'xp'}`;
        delete edits[sibling];
      }
      return { ...state, edits };
    }

    case 'CLEAR_EDIT': {
      const edits: Record<string, EditEntry> = { ...state.edits };
      delete edits[action.fieldKey];
      return { ...state, edits };
    }

    case 'PREVIEW_OK':
      return { ...state, preview: { rows: action.rows, violations: action.violations } };

    case 'PREVIEW_CLOSE':
      return { ...state, preview: null };

    case 'WRITE_START':
      return { ...state, write: { status: 'writing' } };

    case 'WRITE_OK':
      return { ...state, write: { status: 'success', outputPath: action.outputPath } };

    case 'WRITE_CANCELLED':
      return { ...state, write: { status: 'idle' } };

    case 'WRITE_ERR':
      return { ...state, write: { status: 'error', message: action.message } };

    default: {
      // Exhaustiveness guard: a new Action variant without a case is a compile error.
      const _never: never = action;
      return state;
    }
  }
}
