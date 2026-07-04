---
phase: 04-electron-shell-secure-ipc-non-destructive-write
plan: 02
subsystem: ipc
tags: [ipc, trust-boundary, shape-guard, int64, offset-strip, security, sc-4]

requires:
  - phase: 03-patcher
    provides: patchSave Edit/ChangeReportRow types + PatchError this.name convention
  - phase: 02-parser
    provides: FieldTable.get + FieldEntry discriminated union (kind→value type)
  - phase: 02-parser
    provides: test/helpers/no-offset-scan.ts assertNoOffsets recursive guard
provides:
  - src/ipc/ipc-guards.ts (IpcArgError, WireEdit, assertEditsPayload, toEdits, WireChangeRow, toWireReport)
  - SHAPE guard rejecting malformed edits payloads before the core (T-4-02)
  - int64 string↔bigint bridge by resolved FieldEntry.kind (T-4-08)
  - offset-stripping change-report mapper (T-4-03)
affects: [04-03 preview/write services, 04-04 electron main IPC handlers, 04-05 build]

tech-stack:
  added: []
  patterns:
    - "Pure IPC-boundary module: no electron import → unit-testable under tsx --test"
    - "Hand-rolled SHAPE guard (RESEARCH §Pattern 3) — zero deps; core keeps range/kind/readOnly"
    - "int64 crosses the bridge as a decimal string both directions (never JSON number, never raw bigint)"
    - "Offset never crosses the bridge: WireChangeRow omits offset; assertNoOffsets asserts it at any depth"

key-files:
  created:
    - src/ipc/ipc-guards.ts
    - test/ipc/ipc-guards.test.ts
    - test/ipc/wire-shape.test.ts
  modified: []

key-decisions:
  - "Plan 04-02: toEdits does NOT throw on an unknown key — key resolution/range validation stays in patchSave (UnknownFieldError); toEdits only performs the int64 string→bigint bridge for keys it can resolve, coercing a string for a non-int64/unresolved key via Number(...) so the core validators reject it"
  - "Plan 04-02: assertEditsPayload is SHAPE-only (array / object element / non-empty fieldKey / finite number / integer-form int64 string) — defense in depth; the core re-validates ranges/kind/readOnly (D-01)"
  - "Plan 04-02: reused the parser-grade assertNoOffsets unweakened over toWireReport output — the same SC-4 invariant that protects the ViewModel protects the IPC change report"

patterns-established:
  - "IPC trust boundary lives in a pure, tsx-testable module (no electron) — malformed payload / offset leak caught in unit tests, not in thin electron wiring"

requirements-completed: [IO-02]

coverage:
  - id: D1
    description: "assertEditsPayload rejects every malformed edits shape with IpcArgError before the core runs (T-4-02)"
    requirement: "IO-02"
    verification:
      - kind: automated
        ref: "npx tsx --test test/ipc/ipc-guards.test.ts — non-array/non-object/bad-key/non-finite/non-integer-string all throw IpcArgError; well-formed mixed batch returns WireEdit[]"
        status: pass
    human_judgment: false
  - id: D2
    description: "toEdits bridges int64 string→bigint by resolved FieldEntry.kind; int32/double stay numbers; no throw on unknown key (T-4-08)"
    requirement: "IO-02"
    verification:
      - kind: automated
        ref: "npx tsx --test test/ipc/ipc-guards.test.ts — int64 string→9223372036854775807n bigint; int32/double stay number; unknown key coerced, not thrown"
        status: pass
    human_judgment: false
  - id: D3
    description: "toWireReport output carries no offset at any depth and serializes int64 old/new as BigInt-round-tripping strings (T-4-03 / T-4-08)"
    requirement: "IO-02"
    verification:
      - kind: automated
        ref: "npx tsx --test test/ipc/wire-shape.test.ts — assertNoOffsets does not throw; int64 values typeof 'string' round-trip via BigInt; int32/double stay numbers, width preserved"
        status: pass
    human_judgment: false
  - id: D4
    description: "ipc-guards.ts imports nothing from electron (module purity — tsx-testable trust boundary)"
    requirement: "IO-02"
    verification:
      - kind: automated
        ref: "grep -n \"from 'electron'\" src/ipc/ipc-guards.ts returns nothing"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-07-04
status: complete
---

# Phase 04 Plan 02: IPC Trust-Boundary Guards Summary

**A pure, electron-free `src/ipc/ipc-guards.ts` now sits between the untrusted renderer edits payload and the trusted core — SHAPE-rejecting malformed edits before `patchSave` runs (T-4-02), bridging int64 as strings↔bigint by resolved field kind (T-4-08), and stripping byte offsets from the change report that crosses the bridge (T-4-03).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-04T17:00:14Z
- **Completed:** 2026-07-04T17:02:49Z
- **Tasks:** 2 (both TDD: RED test → GREEN implementation)
- **Files created:** 3 (1 source, 2 test)

## Accomplishments

- **Task 1 — ipc-guards module (TDD).** Wrote failing tests first (`66675ce`), then implemented (`9baf126`):
  - `IpcArgError extends Error` (`this.name = 'IpcArgError'`, mirroring the patcher `PatchError` convention + `/* c8 ignore next */`).
  - `WireEdit { fieldKey: string; newValue: string | number }` — int64 arrives as a decimal string.
  - `assertEditsPayload(raw): WireEdit[]` — the RESEARCH §Pattern 3 SHAPE guard: array, each element a plain object, non-empty string `fieldKey`, finite number `newValue`, integer-form (`/^-?\d+$/`) int64 string. Rejects with `IpcArgError` naming the offending index. Accepts an empty array.
  - `toEdits(wireEdits, fieldTable): Edit[]` — resolves each key via `fieldTable.get` and converts a string `newValue` to `bigint` ONLY when the resolved kind is `int64`; numbers pass through; a string for a non-int64/unresolved key is coerced via `Number(...)` so the core rejects it. Does NOT throw on an unknown key.
  - `WireChangeRow { fieldKey, oldValue, newValue, width }` (NO offset) + `toWireReport(rows)` dropping `offset` and stringifying bigint int64 values.
- **Task 2 — wire-shape test (TDD).** Added `test/ipc/wire-shape.test.ts` (`aaf84d8`) that maps synthetic offset-bearing `ChangeReportRow[]` (int64 + int32 + double) through `toWireReport` and asserts via the **unweakened, parser-grade** `assertNoOffsets` that no `offset` key crosses at any depth, int64 values are BigInt-round-tripping strings, and int32/double stay numbers with `width` preserved (4/8).

## Task Commits

1. **Task 1 (RED):** `66675ce` — `test(04-02): add failing tests for ipc-guards shape guard + int64 bridge`
2. **Task 1 (GREEN):** `9baf126` — `feat(04-02): implement ipc-guards shape guard + int64/offset wire bridge`
3. **Task 2 (RED→GREEN):** `aaf84d8` — `test(04-02): prove toWireReport emits offset-free int64-as-string change report`

## Files Created/Modified

- `src/ipc/ipc-guards.ts` (created) — the pure IPC trust boundary. Imports only types from `../patcher` (`Edit`, `ChangeReportRow`) and `../field-table` (`FieldTable`) — never `electron`.
- `test/ipc/ipc-guards.test.ts` (created) — 15 tests: full shape-rejection matrix + int64-string bridging by resolved kind.
- `test/ipc/wire-shape.test.ts` (created) — 5 tests: offset-free bridge proof via `assertNoOffsets` + int64-as-string round-trip + width preservation.

## Decisions Made

- **`toEdits` never throws on an unknown key.** Key resolution and range validation stay in `patchSave` (it surfaces `UnknownFieldError`). `toEdits` performs ONLY the int64 string→bigint bridge for keys it can resolve; an unknown key with a string value is coerced via `Number(...)` and left for the core to reject. This keeps the boundary module SHAPE/wire-contract-only, avoiding a duplicated resolution path.
- **SHAPE-only guard (defense in depth).** `assertEditsPayload` checks structure, not semantics — the core (`validatePlain` / skill validators) re-validates ranges, kind, and readOnly (D-01). A hand-rolled guard is sufficient and adds zero deps (RESEARCH §Pattern 3; Zod remains the documented fallback if payloads grow).
- **Reused `assertNoOffsets` unweakened.** The wire-shape test calls the exact recursive guard the parser tests use — the same SC-4 invariant that protects the ViewModel now provably protects the IPC change report.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the TDD RED→GREEN flow; Task 2's `toWireReport` was already implemented in Task 1 (per the plan's own artifact split), so Task 2's test passed on first run against the completed implementation with no further code change.

## Threat Mitigations Verified

| Threat ID | Category | Mitigation | Proof |
|-----------|----------|------------|-------|
| T-4-02 | Tampering | `assertEditsPayload` SHAPE-rejects malformed edits before the core | `test/ipc/ipc-guards.test.ts` (full rejection matrix) |
| T-4-03 | Info Disclosure | `WireChangeRow` omits `offset`; `toWireReport` drops it | `test/ipc/wire-shape.test.ts` (`assertNoOffsets`) |
| T-4-08 | Info Disclosure / precision | int64 crosses as decimal string both directions | both tests (BigInt round-trip; string bridging) |

## Known Stubs

None — every exported function is fully implemented and exercised by a passing test.

## Issues Encountered

None. RED tests failed as expected (module absent), GREEN implementation passed 15/15, and the full suite (216 tests across top-level + ipc) is green. `npx tsc --noEmit` is clean and the module imports no `electron`.

## User Setup Required

None.

## Next Phase Readiness

- **Ready for 04-03/04-04:** `assertEditsPayload` → `toEdits(fieldTable)` → `patchSave` is the SC-4 shape gate the preview/write IPC handlers wire in; `toWireReport` is the only change-report shape the handlers may return to the renderer.
- No blockers.

## Verification

- `npx tsx --test test/ipc/ipc-guards.test.ts` → 15 pass.
- `npx tsx --test test/ipc/wire-shape.test.ts` → 5 pass.
- Full suite (`test/*.test.ts` + `test/ipc/*.test.ts`) → 216 pass, 0 fail.
- `npx tsc --noEmit` → clean.
- `grep -n "from 'electron'" src/ipc/ipc-guards.ts` → nothing (module purity).

## Self-Check: PASSED

- FOUND: src/ipc/ipc-guards.ts
- FOUND: test/ipc/ipc-guards.test.ts
- FOUND: test/ipc/wire-shape.test.ts
- FOUND: commit 66675ce (RED)
- FOUND: commit 9baf126 (GREEN)
- FOUND: commit aaf84d8 (wire-shape)

---
*Phase: 04-electron-shell-secure-ipc-non-destructive-write*
*Completed: 2026-07-04*
