---
phase: 4
slug: electron-shell-secure-ipc-non-destructive-write
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` via `tsx` (`tsx --test`) + `c8` coverage; `node:assert/strict` |
| **Config file** | none — `tsconfig.json` only; test glob in `package.json` (`test/**/*.test.ts`) |
| **Quick run command** | `npx tsx --test test/ipc/*.test.ts` (new pure-module tests only) |
| **Full suite command** | `npm test` (`tsx --test test/**/*.test.ts` — includes the untouched golden-file core) |
| **Estimated runtime** | ~5–15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsx --test test/ipc/*.test.ts`
- **After every plan wave:** Run `npm test` (proves Phases 1–3 golden-file tests still pass unchanged)
- **Before `/gsd-verify-work`:** Full suite green + manual launch smoke test
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | IO-02 | T-4-SC | Supply-chain: install gated by blocking human decision (esbuild postinstall vs least-privilege) | manual/checkpoint | (blocking-human checkpoint) | N/A | ⬜ pending |
| 04-01-02 | 01 | 1 | IO-02 | T-4-SC | electron + esbuild resolvable (or tsc-fallback recorded) | integration | `node -e "require.resolve('electron')" && npm ls electron esbuild` | ✅ (cmd) | ⬜ pending |
| 04-02-01 | 02 | 1 | IO-02 | T-4-02 | Malformed IPC edits payload rejected with IpcArgError before the core; int64 string↔bigint by kind | unit | `npx tsx --test test/ipc/ipc-guards.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | IO-02 | T-4-03 | Change report crossing the bridge carries NO offset key; int64 as string | unit | `npx tsx --test test/ipc/wire-shape.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 1 | IO-02 | T-4-05 / T-4-10 | Single active session (D-02); getModel returns offset-free viewModel; reload replaces | unit | `npx tsx --test test/ipc/session.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 1 | IO-02 | T-4-04 / T-4-09 | Write to NEW path only; source-path rejected; length invariant asserted pre-recompress; cancel = no-op | unit | `npx tsx --test test/ipc/write-service.test.ts` | ❌ W0 | ⬜ pending |
| 04-04-01 | 04 | 2 | IO-02 | T-4-01 | Preload exposes only 4 narrow methods; no generic ipcRenderer passthrough | static/typecheck | `grep -c "ipcRenderer.invoke('save:" electron/preload.ts` (=4) + `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 04-04-02 | 04 | 2 | IO-02 | T-4-07 | CSP-locked local host; renderer has no Node/fs/Brotli/offsets | static/typecheck | `grep -c "Content-Security-Policy" electron/index.html` + `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 04-04-03 | 04 | 2 | IO-02 | — | electron/** typechecks with CommonJS config unchanged | typecheck | `npx tsc --noEmit` | ✅ (cmd) | ⬜ pending |
| 04-05-01 | 05 | 3 | IO-02 | T-4-01 / T-4-02 / T-4-11 | Hardened window; 4 handlers wire pure modules; every core error → discriminated result | typecheck | `npx tsc --noEmit` | ✅ (cmd) | ⬜ pending |
| 04-05-02 | 05 | 3 | IO-02 | T-4-04 | build:electron emits dist/{main,preload,renderer}.js + index.html; full suite green | integration | `npm run build:electron && npm test` | ✅ (cmd) | ⬜ pending |
| 04-05-03 | 05 | 3 | IO-02 | T-4-01 / T-4-04 | Window launches; window.saveEditor present, window.require undefined; write creates NEW .sav, original unchanged | manual/UAT | (blocking human-verify — WSL2 needs WSLg/X) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/ipc/ipc-guards.test.ts` — SC-4 shape rejection + int64-string bridging (created in Plan 04-02 Task 1)
- [ ] `test/ipc/wire-shape.test.ts` — SC-4 offset-stripping via `assertNoOffsets` (Plan 04-02 Task 2)
- [ ] `test/ipc/session.test.ts` — D-02 single active session (Plan 04-03 Task 1)
- [ ] `test/ipc/write-service.test.ts` — IO-02 length gate + D-03 source-path guard + cancel no-op (Plan 04-03 Task 2)
- [ ] Framework: none to install (tsx/c8 already present); `electron` + `esbuild` devDeps added in Plan 04-01

*Each test file is created by the task that owns it (TDD RED→GREEN); no pre-existing scaffold required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Window launches; `window.saveEditor` present; `window.require` undefined | SC-1 | WSL2 needs WSLg/X; no headless-Electron harness | `npm start`; DevTools console checks (Plan 04-05 Task 3) |
| End-to-end write produces a NEW `.sav`, original byte-unchanged; source-path guard refuses overwrite | IO-02 / D-03 | Requires the live native Save-As dialog | Plan 04-05 Task 3 steps 5–6 |
| Supply-chain install decision (esbuild postinstall vs least-privilege) | — | Human policy decision | Plan 04-01 Task 1 checkpoint |

*The electron/main.ts, preload.ts, renderer.ts wiring is verified by manual UAT — the real logic it invokes is unit-tested in the pure `src/ipc/*` modules.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoints are the only manual tasks)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-04
