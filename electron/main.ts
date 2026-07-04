// electron/main.ts — the trusted main process: hardened BrowserWindow + the four `save:*` IPC
// handlers, THIN wiring over the already-tested pure core (SessionStore, ipc-guards, write-service).
//
// This is the phase's integration seam. Main owns the trust boundary (renderer → main IPC → fs /
// Brotli / offsets): the renderer can reach ONLY the four narrow channels exposed by preload, and
// every handler catches core errors and returns a discriminated `{ ok:false, kind, message,
// violations? }` result — a raw exception (or a byte offset, or a bigint) NEVER crosses the bridge
// (D-04, T-4-11 / T-4-03 / T-4-08). All real logic lives in `src/ipc/*`; main only wires + maps.
//
// Mitigates:
//   T-4-01 — contextIsolation:true + nodeIntegration:false + sandbox:true + compiled preload.
//   T-4-07 — loadFile (local only) + setWindowOpenHandler(deny) + will-navigate denied; no remote.
//   T-4-04 — save:write delegates to performWrite (new-path-only; source path rejected; IO-02).
//   T-4-11 — toErrorResult maps every typed core error to a discriminated result; no rethrow.

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SessionStore, NoActiveSessionError } from '../src/ipc/session';
import { assertEditsPayload, toEdits, toWireReport, IpcArgError } from '../src/ipc/ipc-guards';
import { performWrite, WriteInvariantError } from '../src/ipc/write-service';
import {
  ValidationError,
  ReadOnlyFieldError,
  UnknownFieldError,
  ConflictingEditError,
  patchSave,
} from '../src/patcher';

/** The single active session (D-02) — `open()` replaces whatever was held; a load swaps the file. */
const store = new SessionStore();

/**
 * Map any thrown value into the discriminated IPC failure result (D-04). Each typed core error →
 * a distinct `kind`; `ValidationError` additionally forwards its full `violations[]`. A
 * {@link NoActiveSessionError} (getModel/preview/write before a load) becomes `'no-session'`.
 * Anything else collapses to `'internal'` with the message only — no stack, no offsets ever leave
 * main (T-4-11 / T-4-03).
 */
function toErrorResult(e: unknown): {
  ok: false;
  kind: string;
  message: string;
  violations?: unknown;
} {
  if (e instanceof ValidationError) {
    return { ok: false, kind: 'validation', message: e.message, violations: e.violations };
  }
  if (e instanceof ReadOnlyFieldError) {
    return { ok: false, kind: 'readonly', message: e.message };
  }
  if (e instanceof UnknownFieldError) {
    return { ok: false, kind: 'unknown-field', message: e.message };
  }
  if (e instanceof ConflictingEditError) {
    return { ok: false, kind: 'conflict', message: e.message };
  }
  if (e instanceof IpcArgError) {
    return { ok: false, kind: 'bad-args', message: e.message };
  }
  if (e instanceof WriteInvariantError) {
    return { ok: false, kind: 'write-invariant', message: e.message };
  }
  if (e instanceof NoActiveSessionError) {
    return { ok: false, kind: 'no-session', message: e.message };
  }
  return { ok: false, kind: 'internal', message: e instanceof Error ? e.message : String(e) };
}

/**
 * Register the four `save:*` handlers. Each is thin: it composes the pure modules and funnels every
 * throw through {@link toErrorResult} so no exception crosses the bridge.
 */
function registerIpcHandlers(): void {
  // save:load — main owns the path (D-02): showOpenDialog → readFile → store.open. Cancel is a
  // clean no-op result (no session change).
  ipcMain.handle('save:load', async () => {
    const pick = await dialog.showOpenDialog({
      filters: [{ name: 'Save', extensions: ['sav'] }],
      properties: ['openFile'],
    });
    const chosen = pick.filePaths[0];
    if (pick.canceled || chosen === undefined) {
      return { ok: true, cancelled: true };
    }
    try {
      const bytes = await readFile(chosen);
      const summary = store.open(chosen, bytes);
      return { ok: true, summary };
    } catch (e) {
      return toErrorResult(e);
    }
  });

  // save:getModel — return the held offset-free ViewModel, or a typed no-session result.
  ipcMain.handle('save:getModel', () => {
    const viewModel = store.getModel();
    if (viewModel === undefined) {
      return { ok: false, kind: 'no-session', message: 'load a save first' };
    }
    return { ok: true, viewModel };
  });

  // save:preview — SHAPE-guard → int64→bigint bridge → patchSave (dry run) → offset-free wire report.
  ipcMain.handle('save:preview', (_event, raw: unknown) => {
    try {
      const session = store.requireActive();
      const edits = toEdits(assertEditsPayload(raw), session.fieldTable);
      const { changeReport } = patchSave(session.decompressedBuffer, session.fieldTable, edits);
      return { ok: true, changeReport: toWireReport(changeReport) };
    } catch (e) {
      return toErrorResult(e);
    }
  });

  // save:write — same guard/bridge, then the non-destructive new-file write (IO-02, D-03).
  ipcMain.handle('save:write', async (_event, raw: unknown) => {
    try {
      const session = store.requireActive();
      const edits = toEdits(assertEditsPayload(raw), session.fieldTable);
      return await performWrite(session, edits, {
        showSaveDialog: (opts) => dialog.showSaveDialog(opts),
        writeFile: (path, data) => writeFile(path, data),
      });
    } catch (e) {
      return toErrorResult(e);
    }
  });
}

/**
 * Create the hardened window: isolated + sandboxed renderer with a compiled preload, loading the
 * local CSP-locked page only, with navigation and new-window creation denied (T-4-01 / T-4-07).
 */
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Local file only — never loadURL to remote content.
  void win.loadFile(join(__dirname, 'index.html'));

  // Deny new windows and any navigation away from the loaded local page (defense in depth).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS, per platform convention).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
