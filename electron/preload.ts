// electron/preload.ts — the ONLY code that may touch `ipcRenderer` (RESEARCH §Pattern 2).
//
// Runs in the isolated world (contextIsolation + sandbox, wired by Plan 04-05). It exposes exactly
// four purpose-specific wrappers on `window.saveEditor` via `contextBridge`; the page never sees
// `ipcRenderer`, `ipcRenderer.on`, or any generic `invoke(channel, …)` passthrough. Each method
// binds one fixed `save:*` channel, so the renderer can reach only these four operations — the
// Elevation-of-Privilege boundary (T-4-01 / SC-2).
//
// `load()` takes NO path from the renderer — main owns `dialog.showOpenDialog` (D-02, no session
// handle). preview/write forward only an opaque `edits` payload; main re-validates it against its
// own FieldTable (SC-4). This file imports ONLY from `electron` — it must not pull `src/*` (the
// pure core) into the sandboxed bundle.

import { contextBridge, ipcRenderer } from 'electron';

/**
 * The narrow bridge surface exposed on `window.saveEditor`. Results are opaque here (`unknown`) —
 * the smoke-test renderer only JSON-dumps them, and Phase 5's real UI will import the discriminated
 * result types from the core. Keeping them `unknown` here avoids importing `src/*` into preload.
 */
export interface SaveEditorApi {
  /** Open the native file dialog (main owns the path) → load + parse a save. */
  load(): Promise<unknown>;
  /** Return main's held offset-free ViewModel (or a no-session result). */
  getModel(): Promise<unknown>;
  /** Dry-run the edits against main's FieldTable → offset-free change report. */
  preview(edits: unknown): Promise<unknown>;
  /** Apply the edits and non-destructively write a NEW .sav (IO-02). */
  write(edits: unknown): Promise<unknown>;
}

declare global {
  // Augments the DOM `Window` so the renderer (and Phase 5's UI) typechecks `window.saveEditor.*`.
  interface Window {
    saveEditor: SaveEditorApi;
  }
}

const api: SaveEditorApi = {
  load: () => ipcRenderer.invoke('save:load'),
  getModel: () => ipcRenderer.invoke('save:getModel'),
  preview: (edits: unknown) => ipcRenderer.invoke('save:preview', edits),
  write: (edits: unknown) => ipcRenderer.invoke('save:write', edits),
};

// contextBridge is the only safe way to cross the isolated-world boundary with contextIsolation on.
contextBridge.exposeInMainWorld('saveEditor', api);
