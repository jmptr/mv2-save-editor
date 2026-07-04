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

// The bridge surface + Window augmentation now live in the shared, type-only contract (Plan 05-02,
// src/ipc/results.ts) so preload, main, and the renderer agree on one discriminated shape. This is
// `import type` — esbuild erases it, so NO src/* runtime enters the sandboxed preload bundle (T-05-05).
import type { SaveEditorApi } from '../src/ipc/results';

const api: SaveEditorApi = {
  load: () => ipcRenderer.invoke('save:load'),
  getModel: () => ipcRenderer.invoke('save:getModel'),
  preview: (edits: unknown) => ipcRenderer.invoke('save:preview', edits),
  write: (edits: unknown) => ipcRenderer.invoke('save:write', edits),
};

// contextBridge is the only safe way to cross the isolated-world boundary with contextIsolation on.
contextBridge.exposeInMainWorld('saveEditor', api);
