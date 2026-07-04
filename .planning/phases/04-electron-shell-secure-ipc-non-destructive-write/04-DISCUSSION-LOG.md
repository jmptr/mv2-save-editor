# Phase 4: Electron Shell + Secure IPC + Non-Destructive Write - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 4-Electron Shell + Secure IPC + Non-Destructive Write
**Areas discussed:** Build/scaffold strategy, Main-process session model, Output path & save dialog, IPC error & preview contract

> The four gray areas were presented via multiSelect; the user declined to select individual
> areas and replied **"go"** to proceed with Claude's proposed low-risk defaults (Phase 2/3
> provisional-defaults precedent). Defaults were presented in plain text before the user's "go".

---

## Build/scaffold strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Full electron-vite + Vite + React scaffold now | Reshapes clean CommonJS/tsx repo toward ESM this phase | |
| Keep Phase 4 lean; defer Vite/React to Phase 5 | Electron + tsc/esbuild, main+preload only, minimal renderer host | ✓ |

**User's choice:** Provisional default (D-01) — keep Phase 4 lean.
**Notes:** Minimizes churn during the security-sensitive phase; keeps the crown-jewel core and its
golden-file tests undisturbed; the heavy tooling decision is made once, in Phase 5 where the
renderer UI consumes it.

---

## Main-process session model

| Option | Description | Selected |
|--------|-------------|----------|
| Single in-memory active session | main holds `{path, buffer, fieldTable, viewModel}`; preview/write use held FieldTable | ✓ |
| Stateless / path-keyed re-parse per call | Re-read + re-parse from disk on every IPC call | |

**User's choice:** Provisional default (D-02) — single in-memory active session.
**Notes:** "Re-parse fresh" enforced per load, not cached across loads. write re-parses the patched
buffer and asserts the length invariant before recompress (Phase 3 D-03). Single active save is
sufficient for a solo tester.

---

## Output path & save dialog

| Option | Description | Selected |
|--------|-------------|----------|
| Native Save-As dialog every write | Default filename `<basename>-edited.sav`; native overwrite confirm; source path rejected | ✓ |
| Auto-derived sibling name, no dialog | Silently write `name.edited.sav` next to source | |

**User's choice:** Provisional default (D-03) — native Save-As dialog every write.
**Notes:** Source path rejected as a target to protect the original. Cancel = clean no-op.
Timestamped/auto-naming stays deferred to v2 (OUT-01).

---

## IPC error & preview contract

| Option | Description | Selected |
|--------|-------------|----------|
| Structured discriminated results | `{ok:true,…}` / `{ok:false,kind,message,violations?}`; never throw across bridge | ✓ |
| Throw core errors across the bridge | Let IPC serialize/reject with raw errors | |

**User's choice:** Provisional default (D-04) — structured discriminated results.
**Notes:** Full collect-all `Violation[]` forwarded for SAFE-02 preview. `preview` runs full
`patchSave` in memory, returns change report (offsets stripped), buffer discarded; `write` re-runs
and persists. int64 crosses as strings both directions.

---

## Claude's Discretion

- Main/preload build mechanism (tsc project-refs vs esbuild vs tsx) — least-churn integration with
  current tsconfig/tsx-test, without forcing the core to ESM.
- IPC arg validation mechanism (Zod vs hand-rolled guards) at the main boundary (SC-4).
- Exact IPC channel strings + preload API method names (operations fixed: load/getModel/preview/write).
- Whether the renderer needs any session handle (likely none given single active session).
- Exact pinned Electron version + sandbox/preload/contextBridge interplay.

## Deferred Ideas

- Full electron-vite + Vite + React renderer scaffold with HMR → Phase 5.
- Timestamped/auto-named output + backup-on-write → v2 OUT-01.
- Round-trip drift self-check warning on load → v2 OUT-02.
- electron-builder packaging/distributable → deferred.
- Multi-save / handle-based sessions → not needed for a solo tester.
