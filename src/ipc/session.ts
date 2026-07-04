// SessionStore — the single in-memory active session (D-02).
//
// The crown jewel of the write path's state: main holds ONE freshly-parsed active session
// { path, decompressedBuffer, fieldTable, viewModel }. `open()` decompresses (Phase 1 codec) +
// parses (Phase 2 orchestrator) its RAW file bytes ONCE and stores the result; a second `open()`
// simply reassigns the single field — no handle bookkeeping, the old buffer is dropped (D-02).
//
// The store is PURE: it imports only the existing core (`../codec` decompress, `../save-parser`
// parseSave) and the FieldTable/ViewModel types — NEVER `electron`, NEVER `node:fs`. Reading the
// file is the caller's job (main reads the file, then calls `open(path, bytes)`), so the store runs
// headlessly under `tsx --test` with no Electron runtime — this is where D-02 is proven.
//
// preview/write operate on the held FRESHLY-PARSED fieldTable + buffer (the SAME references
// parseSave produced — `requireActive()` never re-derives state per call). Main never trusts a
// renderer view of the session (SC-4 / T-4-10): every edit resolves against main's own FieldTable.
//
// Mitigates: T-4-05 (open() → decompress enforces MAX_DECOMPRESSED_BYTES — a crafted bomb .sav
// throws rather than exhausting memory), T-4-10 (main holds its own parsed FieldTable, never a
// renderer-supplied model).

import { decompress } from '../codec';
import { parseSave } from '../save-parser';
import type { FieldTable } from '../field-table';
import type { ViewModel, Summary } from '../view-model';

/**
 * The single active session main holds after {@link SessionStore.open}. Bundles the source path
 * (used by the write path's source-path guard, D-03), the decompressed buffer (the patch target),
 * the offset-bearing {@link FieldTable} (Phase 3's patcher reads this — the SOLE home of offsets,
 * SC-4), and the offset-free {@link ViewModel} (Phase 5's UI projection). preview/write read the
 * SAME `decompressedBuffer` + `fieldTable` references parseSave produced (never re-derived).
 */
export interface ActiveSession {
  /** The source file's path — the write path rejects it as a write target (D-03). */
  path: string;
  /** The decompressed save buffer (the patch target; never mutated in place). */
  decompressedBuffer: Buffer;
  /** The offset-bearing FieldTable (the sole home of offsets — SC-4; Phase 3 reads this). */
  fieldTable: FieldTable;
  /** The offset-free ViewModel (Phase 5's UI projection — assertNoOffsets passes). */
  viewModel: ViewModel;
}

/**
 * Thrown by {@link SessionStore.requireActive} when no save has been loaded yet. The main IPC
 * handler maps this to a structured `{ ok: false, kind: 'no-session' }` result rather than
 * crashing — a getModel/preview/write before any load is a clean, typed no-session condition.
 */
export class NoActiveSessionError extends Error {
  constructor() {
    super('no active session — load a save before getModel/preview/write');
    this.name = 'NoActiveSessionError';
  }
}

/**
 * Holds exactly ONE active session (D-02). `open()` replaces whatever was held; `getModel()`
 * returns the held offset-free viewModel (or `undefined` before any load); `requireActive()`
 * returns the held session (or throws {@link NoActiveSessionError}).
 */
export class SessionStore {
  private active: ActiveSession | null = null;

  /**
   * Decompress + parse the RAW file bytes ONCE and hold the result as the single active session
   * (replacing any prior session — D-02). The caller (main) reads the file and passes its raw
   * bytes; this store never touches `fs`. `decompress` enforces the bomb cap (T-4-05).
   *
   * @param path The source file's path (held for the write path's source-path guard, D-03).
   * @param rawFileBytes The RAW Brotli-compressed `.sav` bytes (decompressed here).
   * @returns The parsed {@link Summary} (the caller returns it to the renderer for display).
   */
  open(path: string, rawFileBytes: Buffer): Summary {
    const decompressedBuffer = decompress(rawFileBytes);
    const { fieldTable, viewModel } = parseSave(decompressedBuffer);
    this.active = { path, decompressedBuffer, fieldTable, viewModel };
    return viewModel.summary;
  }

  /**
   * Return the held offset-free viewModel, or `undefined` if no save is loaded yet. The main
   * handler maps `undefined` to a no-session result (SC-4 — the renderer only ever sees the
   * offset-free projection).
   */
  getModel(): ViewModel | undefined {
    return this.active?.viewModel;
  }

  /**
   * Return the held {@link ActiveSession} (the SAME references each call — preview/write resolve
   * every edit against main's own FieldTable, never a re-derived one, SC-4 / T-4-10).
   *
   * @throws {NoActiveSessionError} if no save has been loaded yet.
   */
  requireActive(): ActiveSession {
    if (this.active === null) {
      throw new NoActiveSessionError();
    }
    return this.active;
  }
}
