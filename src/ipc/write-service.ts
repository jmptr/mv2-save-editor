// write-service — the non-destructive new-file write (IO-02), the phase's crown-jewel behavior.
//
// performWrite reuses the exact invariant the codec/patcher already enforce, then adds the
// new-file/source-path safety on top:
//
//   patchSave (self-verifies internally: whole-buffer diff + re-parse)
//     → parseSave (re-parse the patched buffer FRESH — D-02)
//     → assert output.length === input.length (IO-02/IO-03 length gate, BEFORE compress)
//     → defaultOutputPath(session.path)  ("<dir>/<base>-edited.sav")
//     → showSaveDialog (native Save-As — INJECTED)
//     → reject resolve(picked) === resolve(source)  (D-03 source-path guard, T-4-04)
//     → compress (existing codec — standard-parameter Brotli .NET can decode)
//     → writeFile (INJECTED — the ONLY write, to the NEW path)
//
// The module is PURE: it imports only the existing core (`../patcher`, `../save-parser`, `../codec`),
// the `ActiveSession` type, and `node:path` — NEVER `electron`, NEVER `node:fs` directly. fs + dialog
// are injected via `deps`, so IO-02 runs headlessly under `tsx --test`. The original bytes are never
// touched (patchSave writes onto a copy); a cancel is a clean no-op.
//
// IMPORTANT (RESEARCH Pitfall 6): the invariant asserted is the DECOMPRESSED length only — Brotli is
// not canonical (Node and .NET emit different-but-equivalent compressed bytes), so we never compare
// compressed bytes. The length gate is on the patched decompressed buffer.
//
// Mitigates: T-4-04 (write only to a NEW path; source path rejected — the original file is never
// opened for write), T-4-09 (re-parse fresh + length invariant before compress).

import { resolve, dirname, basename, extname, join } from 'node:path';
import { patchSave, type Edit } from '../patcher';
import { parseSave } from '../save-parser';
import { compress } from '../codec';
import type { ActiveSession } from './session';

/**
 * Thrown when the write path's safety invariant is violated: either the patched decompressed length
 * changed (IO-02/IO-03 — should never happen given same-width edits, belt-and-suspenders over
 * patchSave's own self-verify) or the picked target resolves to the source file (D-03 — refusing to
 * overwrite the original). In both cases NOTHING is written.
 */
export class WriteInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WriteInvariantError';
  }
}

/**
 * The injected side-effect deps performWrite needs (so the core stays pure + headlessly testable).
 * In production main wires these to Electron's `dialog.showSaveDialog` and `fs.promises.writeFile`.
 */
export interface WriteDeps {
  /** Native Save-As dialog. Returns `{ canceled, filePath? }` (Electron's dialog shape). */
  showSaveDialog: (opts: { defaultPath: string }) => Promise<{ canceled: boolean; filePath?: string }>;
  /** Write bytes to a path (the ONLY write; production = fs.promises.writeFile). */
  writeFile: (path: string, data: Buffer) => Promise<void>;
}

/** The result of a {@link performWrite} that reached the dialog: either a write or a clean cancel. */
export type WriteResult = { ok: true; outputPath: string } | { ok: true; cancelled: true };

/**
 * Derive the default output path — a sibling `<base>-edited.sav` next to the source (D-03). E.g.
 * `/dir/save.sav` → `/dir/save-edited.sav`. The extension is normalized to `.sav` regardless of the
 * source extension (the output is always a `.sav`).
 *
 * @param sourcePath The loaded save's path.
 * @returns The default Save-As path (`<dir>/<basename-without-ext>-edited.sav`).
 */
export function defaultOutputPath(sourcePath: string): string {
  const dir = dirname(sourcePath);
  const base = basename(sourcePath, extname(sourcePath));
  return join(dir, `${base}-edited.sav`);
}

/**
 * Patch the held session, re-parse fresh, assert the length invariant, then Save-As to a NEW file
 * (never the source). See the module header for the full chain. fs + dialog are injected via
 * {@link WriteDeps}; the source buffer/path is never mutated; the injected `writeFile` is the ONLY
 * write, to the picked NEW path.
 *
 * @param session The held active session (its `decompressedBuffer` + `fieldTable` are the patch inputs).
 * @param edits The requested edits (resolved against the session's own FieldTable — SC-4).
 * @param deps Injected `{ showSaveDialog, writeFile }`.
 * @returns `{ ok: true, outputPath }` on a write, or `{ ok: true, cancelled: true }` on cancel.
 * @throws {WriteInvariantError} if the length invariant fails or the target resolves to the source.
 * @throws propagates patchSave's typed errors (UnknownFieldError / ValidationError / …) unchanged.
 */
export async function performWrite(
  session: ActiveSession,
  edits: Edit[],
  deps: WriteDeps,
): Promise<WriteResult> {
  // patchSave self-verifies internally (whole-buffer diff + re-parse); it never mutates the input.
  const { buffer } = patchSave(session.decompressedBuffer, session.fieldTable, edits);

  // Re-parse the patched buffer FRESH (D-02) — confirms it is still parseable before we recompress.
  parseSave(buffer);

  // IO-02/IO-03 length gate — the DECOMPRESSED length must be unchanged, asserted BEFORE compress
  // (Brotli is not canonical, so we never compare compressed bytes — RESEARCH Pitfall 6).
  if (buffer.length !== session.decompressedBuffer.length) {
    throw new WriteInvariantError(
      `length changed ${session.decompressedBuffer.length}→${buffer.length}`,
    );
  }

  // Native Save-As, pre-filled with the sibling <base>-edited.sav.
  const defaultPath = defaultOutputPath(session.path);
  const picked = await deps.showSaveDialog({ defaultPath });

  // Cancel (or an empty pick) is a clean no-op — no file, no error (D-03).
  if (picked.canceled || picked.filePath === undefined) {
    return { ok: true, cancelled: true };
  }

  // Source-path guard (D-03 / T-4-04) — refuse to overwrite the original; the source file is never
  // opened for write. Compare RESOLVED paths so `/a/../a/save.sav` cannot slip past a string match.
  if (resolve(picked.filePath) === resolve(session.path)) {
    throw new WriteInvariantError('refusing to overwrite the source file');
  }

  // Recompress (standard-parameter Brotli .NET can decode) and write the NEW file — the ONLY write.
  await deps.writeFile(picked.filePath, compress(buffer));
  return { ok: true, outputPath: picked.filePath };
}
