---
phase: 03-patcher-validation-xp-table
verified: 2026-07-04T15:19:46Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "Apply a GP/quantity/skill edit via patchSave, recompress with codec.compress, write the bytes to a new .sav, and load it in Melvor Idle 2."
    expected: "The game loads the save without corruption/rejection and the edited value (GP, item quantity, or skill XP/Level) is reflected in-game."
    why_human: "Requires the actual Melvor Idle 2 client and a real save slot — the ultimate SAFE-01 acceptance that no automated check can exercise. The codec round-trip (compress→decompress→parseSave) is proven in-suite, but real in-game load is out-of-process. Declared as MANUAL-load-in-game (pending) in 03-02-SUMMARY.md and 03-VALIDATION.md §Manual-Only Verifications."
---

# Phase 3: Patcher + Validation + XP Table Verification Report

**Phase Goal:** A same-width patch engine applies GP, item-quantity, and skill edits onto a buffer copy, validates every value against type/range before writing, keeps skill XP and Level consistent via a verified StandardExperienceTable, and re-parses to prove nothing else moved.
**Verified:** 2026-07-04T15:19:46Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Every observable truth is behaviorally proven by a passing test run (not by SUMMARY claims). Both test suites were executed in-process during verification: `experience-table.test.ts` 10/10 pass, `patcher.test.ts` 22/22 pass, full suite 196/196 pass, `tsc --noEmit` exit 0.

### Observable Truths

| #   | Truth (source) | Status | Evidence |
| --- | -------------- | ------ | -------- |
| 1 | Patcher writes each field at its declared width (int64=8B, int32=4B, double=8B); `output.length === input.length`; input never mutated (SC-1, D-04) | ✓ VERIFIED | `src/patcher.ts` `applyWrite` uses `writeBigInt64LE`/`writeInt32LE`/`writeDoubleLE` at `entry.offset` on `Buffer.from(buffer)` (line 391); `selfVerify` asserts length equality (line 266). Tests at test/patcher.test.ts:78-123 assert `out.length===FIXTURE.length`, per-kind widths 8/4/8, and `FIXTURE.equals(FIXTURE_SNAPSHOT)` after each call — all pass. |
| 2 | Out-of-range, readOnly-target, unknown-key, and same-skill level+xp-conflict edits are all REJECTED before any byte is written, all violations collected (SC-2, SAFE-01, D-01) | ✓ VERIFIED | `validatePlain` (int32 0..2147483647, int64 0n..INT64_MAX, double finite ≥0) + skill level 1..cap + xp 0..xpForLevel(cap); resolution errors thrown pre-validation (lines 322-337); `if (violations.length>0) throw ValidationError` before any write (line 388). 11 SAFE-01 negative tests + D-01 collect-all (3 violations, nothing written) all pass. |
| 3 | Setting `skill.<id>.level=L` writes Level=L AND XP=xpForLevel(L); `skill.<id>.xp=X` writes XP=X AND Level=levelForXp(X,cap); LevelCap never written (SC-3, EDIT-04, D-02) | ✓ VERIFIED | Coupling expansion at patcher.ts:346-376 pushes both writes; cap read from readOnly `levelCap` entry, never written. Tests at patcher.test.ts:243-288 assert both change-report rows, XP===xpForLevel(L), Level===levelForXp(X,cap), and `changeReport.every(r => r.offset!==capOffset)` — pass. |
| 4 | Self-verify re-parses the patched buffer and whole-buffer-diffs it against input; any byte outside an intended [offset,offset+width) throws UnintendedChangeError (SC-4, D-03) | ✓ VERIFIED | `selfVerify` runs on EVERY patchSave (line 406): length check, byte-by-byte diff against `changeReport` ranges, then `parseSave(out)` readback comparing each edited entry's value. Positive path exercised by all 22 passing tests; SC-4 test (patcher.test.ts:295-316) independently byte-scans out-vs-FIXTURE and asserts every diff is range-covered + re-parse reads back intended values. See note below on the defensive throw-branch. |
| 5 | `xpForLevel` reproduces SC-3 milestones L50=101331, L99=13034427, L120=104273162 exactly (EDIT-04) | ✓ VERIFIED | `buildXpTable` ports the algorithm 1:1 (base=2^(1/7), 300·base^i, 0.25 scaling, per-step Math.floor) at experience-table.ts:43-52. Milestone tests pass (experience-table.test.ts, "SC-locked milestones reproduce the spec exactly"). |
| 6 | `levelForXp` is the monotonic, cap-clamped inverse of `xpForLevel` (EDIT-04) | ✓ VERIFIED | Linear scan up to cap breaking on first miss (experience-table.ts:79-86). Inverse round-trip test `levelForXp(xpForLevel(L),120)===L` for all 1..120, boundary derivation, and clamp-to-cap all pass. |
| 7 | The table is NEVER validated against L75=3,576,425 (docs typo; reference yields 1,210,418) | ✓ VERIFIED | Grep confirms the literal `3_?576_?425` appears nowhere in `test/experience-table.test.ts` (plan's negative guard); only L50/L99/L110/L120 gate correctness. |
| 8 | `patchSave` returns a NEW Buffer plus a change report (fieldKey, old→new, offset, width) and never mutates the input (D-04) | ✓ VERIFIED | Returns `{ buffer: out, changeReport }` where `out = Buffer.from(buffer)`; one row per write. Tests assert `out !== FIXTURE`, row fields populated, and input snapshot unchanged — pass. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

**Note on truth #4 (self-verify throw-branch):** The self-verify diff + re-parse runs on every patch and is behaviorally proven on the positive path (re-parse readback asserted; the SC-4 test independently re-scans the whole buffer). The *negative* throw path — a byte changing outside an intended range → `UnintendedChangeError` — cannot be triggered without deliberately supplying a corrupt FieldTable, so no test forces the throw; the test constructs the error type directly (patcher.test.ts:326-335). This is a defensive corruption backstop, not a goal-critical behavior; the invariant it guards ("only intended ranges changed") IS independently asserted and passes. Classified VERIFIED, with this branch noted as defensive-only.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/experience-table.ts` | StandardExperienceTable: buildXpTable/xpForLevel/levelForXp | ✓ VERIFIED | 87 lines, substantive, imported by patcher.ts:30 and test. Precomputes 120-entry table at load. |
| `test/experience-table.test.ts` | RED-first milestone/inverse/clamp suite | ✓ VERIFIED | 10 assertions, all pass. No L75 typo value present. |
| `src/patcher.ts` | patchSave engine + PatchError hierarchy | ✓ VERIFIED | 409 lines, substantive. Full resolve→validate→write→self-verify flow; 5-class error hierarchy. |
| `test/patcher.test.ts` | SC-1..SC-4 + SAFE-01 negatives suite | ✓ VERIFIED | 22 assertions over committed fixture, all pass. Substantive instanceof + value assertions. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| src/patcher.ts | src/field-table.ts | `fieldTable.get(key)` / `getRequired` by key, reads `{offset,kind,width,value,readOnly}` — never re-derives offset | ✓ WIRED | import line 29; `.get()`/`.getRequired()` used at lines 322-372. tsc passes (FieldEntry.key/offset/width/value present). |
| src/patcher.ts | src/save-parser.ts | `parseSave(out)` verbatim in self-verify | ✓ WIRED | import line 31; called at selfVerify line 282. SC-4 test confirms re-parse readback. |
| src/patcher.ts | src/experience-table.ts | `xpForLevel`/`levelForXp` for XP↔Level coupling | ✓ WIRED | import line 30; used at lines 356/374. Coupling tests assert derived values match. |
| test | src/codec.ts | `compress`/`decompress` round-trip | ✓ WIRED | Round-trip test (patcher.test.ts:318-324) passes: edited GP survives compress→decompress→parseSave. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| XP-table milestones + inverse | `npx tsx --test test/experience-table.test.ts` | 10/10 pass | ✓ PASS |
| Patch engine SC-1..SC-4 + SAFE-01 | `npx tsx --test test/patcher.test.ts` | 22/22 pass | ✓ PASS |
| No Phase 1/2 regression | `npx tsx --test test/**/*.test.ts` | 196/196 pass, 0 fail | ✓ PASS |
| Type safety (strict + noUncheckedIndexedAccess) | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| L75 doc-typo absent from fixtures | `grep '3_?576_?425' test/experience-table.test.ts` | no match | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| EDIT-04 | 03-01, 03-02 | Set skill by target Level; auto-compute XP from StandardExperienceTable, keep XP+Level consistent | ✓ SATISFIED | Milestone-exact table + XP↔Level coupling in patcher, tests pass. Mapped to Phase 3 in REQUIREMENTS.md. |
| SAFE-01 | 03-02 | Validate every edited value against type/range before writing | ✓ SATISFIED | Collect-all validation rejects all out-of-range/readOnly/unknown/conflict edits before any write, tests pass. Mapped to Phase 3 in REQUIREMENTS.md. Real-world in-game acceptance is the pending manual item below. |

Both declared requirement IDs (EDIT-04, SAFE-01) are accounted for: each is present in PLAN frontmatter and mapped to Phase 3 in REQUIREMENTS.md. No orphaned requirements — REQUIREMENTS.md maps only EDIT-04 and SAFE-01 to Phase 3, both claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TODO/FIXME/TBD/XXX/HACK/PLACEHOLDER/stub markers in either source file | ℹ️ Info | Clean. The `/* c8 ignore */` comments are on unreachable `default:` arms and export-interop braces only (justified esbuild-interop coverage exclusions, not hidden logic). |

### Human Verification Required

#### 1. In-game load of a patched save (SAFE-01 ultimate acceptance)

**Test:** Apply a GP / item-quantity / skill edit via `patchSave`, recompress with `codec.compress`, write the bytes to a NEW `.sav`, and load it in Melvor Idle 2.
**Expected:** The game loads the save without corruption or rejection, and the edited value is reflected in-game.
**Why human:** Requires the actual Melvor Idle 2 client and a real save slot. The in-suite codec round-trip (compress→decompress→parseSave) proves the output is loadable-*shaped*, but the true "the game accepts it" confirmation is out-of-process and cannot be automated. Declared as `MANUAL-load-in-game` (status: pending) in 03-02-SUMMARY.md and 03-VALIDATION.md §Manual-Only Verifications.

### Gaps Summary

No gaps. All 8 observable truths are behaviorally verified by a passing test suite (196/196), `tsc --noEmit` is clean, all artifacts exist/are substantive/are wired, all key links connect, both requirement IDs are satisfied, and no debt markers or stubs are present. The phase's automated goal — a same-width patch engine that validates, couples XP↔Level via a verified table, and re-parses to prove nothing else moved — is fully achieved in the codebase.

Status is `human_needed` (not `passed`) solely because the plan itself declares one out-of-process manual acceptance (loading a patched `.sav` in Melvor Idle 2) that no automated check can exercise. This does not block correctness of the patch engine; it is the real-world confirmation of SAFE-01's core-value promise.

---

_Verified: 2026-07-04T15:19:46Z_
_Verifier: Claude (gsd-verifier)_
