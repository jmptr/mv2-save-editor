// src/ipc/results.ts — the shared, TYPE-ONLY IPC result contract (Plan 05-02, RESEARCH Pattern 4).
//
// This module owns the discriminated result shapes that every `save:*` handler in electron/main.ts
// returns and that the Phase 5 renderer consumes. It is the single source of truth for the bridge's
// return surface: preload re-exports `SaveEditorApi` (via `import type`) and the renderer switches on
// `result.kind` against the exhaustive `ErrorKind` union.
//
// TYPE-ONLY by construction — every import is `import type` and this file declares zero runtime
// values. esbuild erases it entirely, so importing it into the sandboxed preload/renderer bundle
// pulls NO `src/*` runtime across the trust boundary (T-05-05). The offset-free `ViewModel` /
// `WireChangeRow` shapes (offsets and bigints already stripped in main) are what actually cross.

import type { ViewModel, Summary } from '../view-model';
import type { WireChangeRow, WireEdit } from './ipc-guards';
import type { Violation } from '../patcher';

/**
 * The exhaustive set of failure `kind`s produced by main's `toErrorResult` (electron/main.ts). The
 * renderer's `switch (result.kind)` is exhaustively checked against this union, so a new kind added
 * in main without updating the UI is a compile error.
 */
export type ErrorKind =
  | 'validation'
  | 'readonly'
  | 'unknown-field'
  | 'conflict'
  | 'bad-args'
  | 'write-invariant'
  | 'no-session'
  | 'internal';

/**
 * The discriminated failure result common to all four channels (`ok:false`). `violations` is present
 * only for `kind:'validation'` (forwarded from `ValidationError.violations`); all other kinds carry
 * `message` only. No stack, no byte offset, no bigint ever appears here (T-4-11 / T-4-03).
 */
export interface ErrResult {
  ok: false;
  kind: ErrorKind;
  message: string;
  violations?: Violation[];
}

/** `save:load` result: an opened save's summary, a user-cancelled dialog, or a typed failure. */
export type LoadResult = { ok: true; summary: Summary } | { ok: true; cancelled: true } | ErrResult;

/** `save:getModel` result: the held offset-free ViewModel, or a typed failure (usually no-session). */
export type GetModelResult = { ok: true; viewModel: ViewModel } | ErrResult;

/** `save:preview` result: the offset-free dry-run change report, or a typed failure. */
export type PreviewResult = { ok: true; changeReport: WireChangeRow[] } | ErrResult;

/** `save:write` result: the written new-file path, a user-cancelled save dialog, or a typed failure. */
export type WriteResult =
  | { ok: true; outputPath: string }
  | { ok: true; cancelled: true }
  | ErrResult;

/**
 * The narrow bridge surface exposed on `window.saveEditor`. Every method resolves to a discriminated
 * result above — the renderer never sees a thrown exception, a byte offset, or a raw bigint. `load`
 * takes no path (main owns `dialog.showOpenDialog`, D-02); preview/write forward only the opaque
 * {@link WireEdit}[] payload that main re-validates against its own FieldTable (SC-4).
 */
export interface SaveEditorApi {
  /** Open the native file dialog (main owns the path) → load + parse a save. */
  load(): Promise<LoadResult>;
  /** Return main's held offset-free ViewModel (or a no-session result). */
  getModel(): Promise<GetModelResult>;
  /** Dry-run the edits against main's FieldTable → offset-free change report. */
  preview(edits: WireEdit[]): Promise<PreviewResult>;
  /** Apply the edits and non-destructively write a NEW .sav (IO-02). */
  write(edits: WireEdit[]): Promise<WriteResult>;
}

declare global {
  // Augments the DOM `Window` so the renderer typechecks `window.saveEditor.*` against the contract.
  interface Window {
    saveEditor: SaveEditorApi;
  }
}
