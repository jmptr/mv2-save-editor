# Phase 4: Electron Shell + Secure IPC + Non-Destructive Write - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

> **⚠️ PROVISIONAL — Claude-chosen defaults.** The four gray areas below were presented during
> discuss-phase; the user chose to proceed fast ("go") rather than debate each. Claude locked
> low-risk defaults consistent with the locked constraints (Electron hardening, fail-loud,
> non-destructive writes, offset-free boundary, in-place same-width edits). Each is safe to plan
> against; the user can confirm or override at the start of planning or execution. Mirrors the
> Phase 2 / Phase 3 provisional-defaults precedent.

<domain>
## Phase Boundary

A hardened Electron **main** process becomes the sole owner of `fs`, Brotli, and byte offsets. It
wraps the existing headless core (Phases 1–3) and exposes a **narrow preload IPC bridge**
(`load` / `getModel` / `preview` / `write`) to a locked-down renderer. Editing produces a **new**
`.sav` file (Brotli-recompressed); the original is never overwritten. Raw buffers and offsets never
cross the bridge; int64 values cross as strings.

**In scope:** the Electron app skeleton (main + preload + a minimal renderer host), a
`BrowserWindow` locked to `contextIsolation:true` / `nodeIntegration:false` / `sandbox:true`, a
`contextBridge`-exposed narrow IPC surface (load / getModel / preview / write), main-process
ownership of decompress→parse→patch→recompress, native file open + save dialogs, and the
non-destructive new-file write with its pre-recompress length-invariant assertion (IO-02).

**Out of scope (deferred):** the actual browse/search/edit/preview UI (Phase 5 — this phase ships
only enough renderer to prove the bridge works end-to-end), header/name editing, timestamped /
auto-named output & backup-on-write (v2 OUT-01), round-trip drift self-check warnings (v2 OUT-02),
friendly item/skill names (Phase 5), packaging/distribution (electron-builder, deferred).

**Locked (not re-opened):** Electron is fixed by the ROADMAP (phase title + `contextIsolation`/
`sandbox` success criteria) — the CLAUDE.md "confirm Electron vs Tauri" research question is
resolved in Electron's favor and not revisited here.

</domain>

<decisions>
## Implementation Decisions

### Build / scaffold strategy
- **D-01 (provisional → "keep Phase 4 lean; defer Vite/React to Phase 5"):** Add Electron plus a
  minimal main/preload build only. Do NOT introduce the electron-vite + Vite + React scaffold this
  phase. Keep the existing CommonJS + `tsx` test setup and the headless core undisturbed; compile
  main/preload with `tsc`/esbuild (whatever the researcher confirms integrates cleanest with the
  current `tsconfig.json` and `tsx --test`). The full electron-vite + React renderer scaffold with
  HMR lands in Phase 5, where the renderer UI actually needs it.
  - **Renderer for THIS phase:** ship only a minimal renderer host (a plain HTML/TS page or the
    smallest possible React entry) — just enough to exercise load→getModel→preview→write and prove
    the bridge is wired and hardened. Not a real UI.
  - Rationale: minimizes churn and corruption-adjacent risk during the security-sensitive phase;
    keeps the crown-jewel core (Phases 1–3) and its golden-file tests running unchanged; the heavy
    tooling decision is made once, in the phase that consumes it.

### Main-process session model
- **D-02 (provisional → "single in-memory active session"):** `load(path)` decompresses + parses
  once and main holds a single active session `{ path, decompressedBuffer, fieldTable, viewModel }`.
  `getModel` returns the offset-free `ViewModel` from that session. `preview` and `write` re-run
  `patchSave` against the **held FieldTable** (already the freshly-parsed one from load — "re-parse
  fresh" is enforced per load, not cached across loads).
  - `write` re-runs the patch and, per Phase 3 D-03, re-parses the patched buffer and asserts
    `output.length === input.length` **before** Brotli-recompressing to the new file.
  - Single active save at a time (loading a new file replaces the session) — sufficient for a
    single-tester tool; no handle/multi-session bookkeeping.
  - Main never trusts the renderer's view of state: SC-4 — it re-resolves every edit intent against
    its own FieldTable and re-validates before patching.

### Output path & save dialog
- **D-03 (provisional → "native Save-As dialog every write; …-edited.sav default; never overwrite
  source"):** On `write`, main opens Electron's native `dialog.showSaveDialog`, pre-filling the
  suggested filename as a `<basename>-edited.sav` sibling of the source. The native dialog handles
  overwrite confirmation. The source file's own path is rejected as a target (guard against
  overwriting the original — the non-destructive guarantee). If the user cancels the dialog, `write`
  is a no-op that returns a cancelled result (no file written, no error).
  - Timestamped / auto-generated names and backup-on-write stay deferred to v2 (OUT-01).

### IPC error & preview contract
- **D-04 (provisional → "structured discriminated results, never throw across the bridge"):** Every
  IPC handler catches core errors and returns a discriminated result, e.g.
  `{ ok: true, … }` / `{ ok: false, kind, message, violations?: Violation[] }`. Validation failures
  surface the FULL collect-all `Violation[]` (Phase 3 D-01) so the Phase 5 preview (SAFE-02) can
  show every problem at once. Parse/IO/version errors carry a `kind` discriminant + human message.
  - `preview(edits)` runs the full `patchSave` in memory and returns the `changeReport`
    (`{fieldKey, oldValue, newValue, offset?, width}`) — buffer discarded, nothing written.
    Offsets in the change report must NOT cross the bridge (strip/omit `offset` in the IPC-facing
    row; the internal `ChangeReportRow` keeps it). `write(edits)` re-runs and persists.
  - int64 values cross the bridge as **strings** in both directions (edits in, change report out) —
    the renderer parses/formats; main converts to `bigint` for `patchSave`. Matches the existing
    `Summary.gp` / `slayerCoins: string` convention.
  - IPC argument hardening (SC-4): validate the shape of every incoming IPC payload at the main
    boundary before touching the core (reject malformed `edits` arrays, non-string keys, bad number
    formats). Zod vs hand-rolled guards left to research/planning (see Claude's Discretion).

### Claude's Discretion (explicitly left to research/planning)
- **Main/preload build mechanism** — `tsc` project-refs vs esbuild vs `tsx` for compiling
  `main.ts` / `preload.ts`; how it coexists with the current `tsconfig.json` and `tsx --test`
  without forcing the core to ESM. Researcher confirms the least-churn integration.
- **IPC arg validation mechanism** — Zod schemas (CLAUDE.md lists Zod as available) vs hand-rolled
  type guards at the preload/main boundary. Either satisfies SC-4; pick the lighter option for a
  solo tool.
- **Exact channel names & preload API surface** — the four operations are fixed (load / getModel /
  preview / write); their precise `ipcRenderer.invoke` channel strings and the
  `contextBridge.exposeInMainWorld` method names are an implementation detail. Keep them narrow and
  purpose-specific (no generic `invoke(channel, …)` passthrough).
- **How the renderer references the loaded session** — since main holds a single active session
  (D-02), the renderer likely needs no session handle at all (load sets the active session; getModel
  / preview / write operate on it). Confirm during planning.
- **Electron version & Node/sandbox interplay** — CLAUDE.md targets Electron 43.x; confirm the exact
  pinned version and that `sandbox:true` + preload still allows `contextBridge` (it does) and that
  all fs/Brotli stays in main, never preload.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — **IO-02** (write edits to a NEW `.sav`, original untouched) and
  **IO-03** (no-op load→save byte-identical; every write enforces `output.length === input.length`).
- `.planning/ROADMAP.md` §"Phase 4" — the four success criteria (hardened `BrowserWindow`; narrow
  preload; new-file write with pre-recompress length assertion; main re-resolves + re-validates).

### Project constraints & stack
- `.claude/CLAUDE.md` — Electron 43.x + electron-vite/Vite/React stack recommendation; the "What
  NOT to Use" table (no `nodeIntegration:true` in renderer; do binary/Brotli/file work in **main**;
  expose narrow IPC via `contextBridge` + `contextIsolation`; use Node `zlib` Brotli, not
  `DecompressionStream`); Zod available for IPC/input validation.

### Core the shell wraps (Phases 1–3 artifacts)
- `src/codec.ts` — `decompress` / `compress` / `roundTrip` (Brotli); main calls these, never the
  renderer.
- `src/save-parser.ts` — `parseSave(buffer) → { fieldTable, viewModel }`; `projectViewModel`. Main
  parses; only the `viewModel` crosses the bridge.
- `src/field-table.ts` — `FieldTable` / `FieldEntry` (the sole home of byte offsets — must stay in
  main).
- `src/patcher.ts` — `patchSave(buffer, fieldTable, edits) → { buffer, changeReport }`; the typed
  error hierarchy (`ValidationError` with `Violation[]`, `ReadOnlyFieldError`, `UnknownFieldError`,
  `ConflictingEditError`, `UnintendedChangeError`) that D-04 maps onto IPC result kinds.
- `src/view-model.ts` — `ViewModel` / `Summary` (already offset-free; `gp`/`slayerCoins` as strings
  — the IPC-safe shape the bridge reuses).

### Save format (background)
- `docs/current-skill.md` — authoritative save-format spec (layout, primitives, Brotli). Main-side
  reference; the shell does not re-implement parsing.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Full headless pipeline exists** — `decompress → parseSave → patchSave → compress` are all
  implemented and golden-file tested. Phase 4 is orchestration + hardening around them, not new
  format logic.
- **`ViewModel` is already IPC-safe** — offset-free by construction (`assertNoOffsets` guard in
  tests), int64 currencies already serialized as strings. `getModel` returns it near-verbatim.
- **Typed patcher errors already carry structured data** — `ValidationError.violations` is the
  exact `Violation[]` D-04 forwards across the bridge; no new error modeling needed, just a
  catch→result mapping at the IPC boundary.

### Established Patterns
- **Fail-loud, atomic, non-destructive** (Phases 1–3): reject don't clamp; collect all violations,
  write nothing on any failure; return a fresh buffer, never mutate the input. The IPC layer must
  preserve these — surface failures as structured results, never a partial write.
- **Offset-free boundary (SC-4 spirit):** offsets live only in `FieldTable` and internal
  `ChangeReportRow`. The bridge must strip offsets from anything it sends to the renderer.
- **CommonJS + `tsx --test`** current setup — D-01 keeps it; main/preload build must not force the
  core to ESM.

### Integration Points
- **New:** `main` process (window creation + hardening + IPC handlers + session state + dialogs),
  `preload` (contextBridge narrow API), minimal `renderer` host (bridge smoke-test only this phase).
- **Boundary contract:** renderer ⇄ preload ⇄ main IPC channels for load / getModel / preview /
  write; int64 as strings; offsets never cross; core errors → discriminated results.

</code_context>

<specifics>
## Specific Ideas

- Suggested output filename default: `<source-basename>-edited.sav` sibling of the source (D-03).
- Source path must be rejected as a save target to protect the original (D-03).
- Cancelling the Save-As dialog is a clean no-op, not an error (D-03).
- IPC result shape: discriminated `{ ok, … }` / `{ ok:false, kind, message, violations? }` (D-04).

</specifics>

<deferred>
## Deferred Ideas

- **Full electron-vite + Vite + React renderer scaffold with HMR** — introduced in Phase 5 when the
  browse/search/edit/preview UI needs it (D-01).
- **Timestamped / auto-named output files + backup-on-write** — v2 OUT-01.
- **Round-trip drift self-check warning on load** (parser can't reproduce input byte-for-byte) —
  v2 OUT-02.
- **electron-builder packaging / distributable binary** — deferred; `electron-vite dev` (or the
  lean dev launch) covers day-to-day use.
- **Multi-save / handle-based sessions** — single active session is enough for a solo tester (D-02).

None of the above are in Phase 4 scope — discussion stayed within the phase boundary.

</deferred>

---

*Phase: 4-Electron Shell + Secure IPC + Non-Destructive Write*
*Context gathered: 2026-07-04*
