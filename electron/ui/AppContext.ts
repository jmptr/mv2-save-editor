// AppContext.ts — the renderer's single dispatch context (RESEARCH Pattern 2, D-02).
//
// Pattern 2 keeps ALL app state in one `useReducer` at App (no external store — CLAUDE.md) and shares
// only the reducer's `dispatch` through React context so deeply-nested rows can raise SET_EDIT /
// CLEAR_EDIT without prop-drilling. The current `edits` accumulator is carried alongside `dispatch`
// so a consumer can seed an in-progress cell from the pending entry (the panels also receive these as
// explicit props today; the context is the ambient fallback / future-proofing per Pattern 2).
//
// This module is DOM-light and touches NO Node/fs/offset surface — it only re-exports the reducer's
// pure `Action`/`EditEntry` types (via `import type`, esbuild-erased) so nothing from `src/*` crosses
// the trust boundary into the browser bundle.

import { createContext, type Dispatch } from 'react';
import type { Action, EditEntry } from './state/reducer';

/** The value carried by {@link AppContext}: the reducer's dispatch + the current edit accumulator. */
export interface AppContextValue {
  /** The single top-level reducer's dispatch — the ONLY way a row mutates the accumulator (D-02). */
  dispatch: Dispatch<Action>;
  /** The current D-02 edit accumulator (fieldKey → entry); used to seed an in-progress cell. */
  edits: Record<string, EditEntry>;
}

/**
 * The dispatch context. The default `dispatch` is a no-op so a component rendered OUTSIDE the provider
 * (only in tests / mistakes) fails safe rather than throwing; App always supplies the real value.
 */
export const AppContext = createContext<AppContextValue>({
  dispatch: () => undefined,
  edits: {},
});
