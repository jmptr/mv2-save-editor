---
phase: 02-format-parser-fieldtable-model
verified: 2026-07-04T00:00:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Format Parser + FieldTable Model Verification Report

**Phase Goal:** The core parses a real decompressed save — version → SaveHeader → entity list → Bank (wallet + item stacks) and skill ExperienceComponents — into a fresh-offset FieldTable and a JSON view model, with offsets re-derived on every load and never persisted.
**Verified:** 2026-07-04T00:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths are the 5 ROADMAP Success Criteria (the roadmap contract), each proven by a passing behavioral test against the real committed fixture (`test/fixtures/test-fixture.sav`, 2,284,747 bytes decompressed). Behavior-dependent invariants (determinism re-parse, delta-0 walk, bounds guards) are marked VERIFIED because a named test exercises the invariant, not merely symbol presence.

| # | Truth (ROADMAP SC) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Parsing the fixture yields correct version, character summary (name, gamemode, GP, Slayer Coins, total level), full bank item list with quantities, and every skill's XP + Level + LevelCap | ✓ VERIFIED | `save-parser.test.ts`: version 20; summary Bob/Test/1366/gp 953063625/sc 6511; `bankItems.length === 689`; Woodcutting xp 7439645.20000645 / cap 120 / level 93. `parseSave` in `src/save-parser.ts` wires spine + all three region parsers. All 164 tests pass. |
| 2 | Bank wallet int64 located + authoritative; SaveHeader GP/Slayer Coins read-only mirrors, never the write target | ✓ VERIFIED | `wallet.GoldPieces` @20511 and `wallet.SlayerCoins` @20573 marked `authoritative:true` (`src/wallet-parser.ts:86,94`); `header.GP`/`header.SlayerCoins` `readOnly:true` + `mirrors` pointing at wallet keys (structural-walk). Asserted in `save-parser.test.ts:78-119`. |
| 3 | Item-stack + skill matches region-scoped and context-validated (7-bit prefix == ID byte length, qty/level sane ranges); ambiguous unique match surfaced, never auto-picked | ✓ VERIFIED | `findStacks` bounds every read to `[invStart,invEnd)`, validates prefix==ID length, qty in [0,2^31-1], placeholder/locked in {0,1} (`src/inventory-parser.ts`); `parseExperience` validates 1≤cap≤200, 1≤level≤cap, finite XP≥0 (`src/experience-parser.ts`); `resolveOne` returns candidates (never auto-picks) on >1 match. Negative tests in `inventory-parser.test.ts` / `experience-parser.test.ts`. |
| 4 | Re-parsing the same buffer produces identical offsets; offsets exist only in the FieldTable — JSON view model contains no byte offsets | ✓ VERIFIED | Determinism test `save-parser.test.ts:247-291` deep-equals 10 representative FieldEntries across two `parseSave` calls (fresh `BinaryReader` per call, nothing cached). `assertNoOffsets(viewModel)` passes (`:238-243`); ViewModel type is offset-free by construction (`src/view-model.ts`). |
| 5 | Malformed/oversized length prefixes + entity counts bounds-checked (no OOB read, no giant allocation); unknown version warns-but-parses | ✓ VERIFIED | `structural-walk.test.ts:237+` — oversized/negative counts and region overruns throw typed `ParseError` before looping; malformed 7-bit prefix / truncation propagate `RangeError`. Version-bumped fixture → `unknownVersion:true` with rest of model intact (`save-parser.test.ts:296-311`). Guards implemented in `src/structural-walk.ts`. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/field-table.ts` | FieldEntry union + FieldTable + typed errors + D-03 candidate model | ✓ VERIFIED | Discriminated union (int64→bigint), `add`/`get`/`getRequired`/`addCandidates`/`getCandidates`, `ParseError`/`RequiredFieldMissingError`. Imported by all parsers + orchestrator. |
| `src/view-model.ts` | Offset-free ViewModel type (int64 as string) | ✓ VERIFIED | No `offset` key at any depth; gp/slayerCoins typed `string`. Consumed by `save-parser.ts`. |
| `src/structural-walk.ts` | version → SaveHeader → entity/component walk + SC-5 guards | ✓ VERIFIED | `readVersion`/`parseSaveHeader`/`walkEntities`/`walkComponents`; delta-0 asserts + bounds guards. Wired into `parseSave`. |
| `src/wallet-parser.ts` | Currency-by-ID, authoritative, fail-loud on missing GP | ✓ VERIFIED | Keys `wallet.<shortName>` match projection lookups; bigint amounts; `RequiredFieldMissingError` on missing GP. |
| `src/experience-parser.ts` | XP/Cap/Level triple, context-validated, cap readOnly | ✓ VERIFIED | Distinct offsets +0/+8/+12; levelCap `readOnly:true`; range validation throws `ParseError`. |
| `src/inventory-parser.ts` | Bounded marker-search (689 stacks) + D-03 `resolveOne` | ✓ VERIFIED | Region-scoped marker search; 689 stacks; `resolveOne` surfaces candidates. |
| `src/save-parser.ts` | `parseSave` orchestrator → {fieldTable, viewModel} + `projectViewModel` | ✓ VERIFIED | Locates Bank by component names (not hard-coded ID); dispatches to all region parsers; derives offset-free ViewModel. |
| `test/helpers/{fixture,no-offset-scan,malformed}.ts` | Shared harness | ✓ VERIFIED | `loadFixtureBuffer`, `assertNoOffsets`, malformed-buffer crafters all present and used. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `save-parser.ts` | `structural-walk.ts` | `readVersion`/`parseSaveHeader`/`walkEntities`/`walkComponents` imports + calls | ✓ WIRED | Called in `parseSave` steps 1-3. |
| `save-parser.ts` | `wallet-parser.ts` / `experience-parser.ts` / `inventory-parser.ts` | region-parser dispatch at component boundaries | ✓ WIRED | `parseWallet`/`findStacks` at Bank; `parseExperience` per Experience-bearing entity. |
| `projectViewModel` | `field-table.ts` | `getRequired('wallet.GoldPieces')` / `get('wallet.SlayerCoins')` | ✓ WIRED | Wallet keys emitted by `parseWallet` match the projection lookups exactly; summary derived from authoritative wallet, not header mirrors (SC-2). |
| `save-parser.ts` | `view-model.ts` | offset-free projection | ✓ WIRED | `assertNoOffsets(viewModel)` passes at runtime. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `viewModel.summary` | gp/slayerCoins/name/... | FieldTable authoritative wallet + header summary from real fixture bytes | Yes (953063625/6511/Bob/Test/1366) | ✓ FLOWING |
| `viewModel.bankItems` | 689 stacks | `findStacks` over real Inventory region [710,20496) | Yes (NormalLog qty 48652 spot-checked) | ✓ FLOWING |
| `viewModel.skills` | xp/level/levelCap | `parseExperience` over real Experience components | Yes (Woodcutting 7439645.2/93/120) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full parser test suite | `npx tsx --test test/**/*.test.ts` | 164 pass / 0 fail / 45 suites | ✓ PASS |
| Type contract (strict + noUncheckedIndexedAccess) | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Determinism invariant (re-parse identical offsets) | determinism test (deepEqual of 10 FieldEntries) | pass | ✓ PASS |
| Delta-0 walk invariant (33 entities, cursor==regionEnd) | walkComponents test | pass | ✓ PASS |
| SC-5 bounds guards (oversized/negative counts, overrun, truncation) | malformed-buffer tests | throw typed errors | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| IO-01 | 02-01 – 02-05 | Load a `.sav`: Brotli-decompress + parse documented binary layout (version → SaveHeader → entity list), re-parsing offsets fresh on every load | ✓ SATISFIED | Delivered end-to-end via `parseSave`; determinism test proves fresh re-derived offsets; REQUIREMENTS.md line 78 maps IO-01 → Phase 2 → Complete. No orphaned requirement IDs for this phase. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | No TODO/FIXME/XXX/HACK/PLACEHOLDER markers in `src/` | ℹ️ Info | None — clean. `/* c8 ignore */` blocks are documented coverage exclusions for esbuild interop artifacts, not stubs. |

### Human Verification Required

None. Human UAT already completed (`02-UAT.md`, status: complete, 20/20 passed, 0 issues). All behavior-dependent invariants are additionally covered by passing automated tests, so no invariant was left present-but-unverified.

### Gaps Summary

No gaps. All 5 ROADMAP Success Criteria are proven by passing behavioral tests against the real committed fixture. The single phase requirement (IO-01) is satisfied and accounted for in REQUIREMENTS.md. Type check is clean, 164/164 tests pass, no debt markers, no unwired artifacts. The phase goal — parsing a real save into a fresh-offset FieldTable + offset-free JSON view model with offsets re-derived every load and never persisted — is achieved in the codebase.

---

_Verified: 2026-07-04T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
