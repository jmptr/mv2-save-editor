---
phase: 02-format-parser-fieldtable-model
plan: 04
subsystem: parser
tags: [inventory, marker-search, bank, item-stacks, fieldtable, bounded-scan, context-validation, d03-ambiguity, node-test, typescript, strict-ts, c8]

# Dependency graph
requires:
  - phase: 02-01 (FieldTable + ViewModel type contracts + test helpers)
    provides: "FieldEntry/FieldCandidate discriminated union + FieldTable.add/addCandidates/getRequired + ParseError/RequiredFieldMissingError (src/field-table.ts); loadFixtureBuffer() cached decompressed fixture (test/helpers/fixture.ts); assertNoOffsets SC-4 guard (test/helpers/no-offset-scan.ts)"
  - phase: 02-02 (structural-walk spine)
    provides: "walkComponents locates the Bank entity's Inventory component dataStart (710) + size (19786) → region [710, 20496) that findStacks scans; readVersion/parseSaveHeader/walkEntities for the structural spine"
  - phase: 01-03 (BinaryReader/BinaryWriter LE primitives)
    provides: "BinaryReader.readInt32LE/readUInt8 (throws ERR_OUT_OF_RANGE on OOB — T-1-04) consumed for the scoped stack-header reads"
provides:
  - "src/inventory-parser.ts: findStacks(buf, invStart, invEnd) — bounded marker-search recovering ALL 689 valid Bank Inventory item stacks across every tab (a contiguous walk stops at ~296 at the first tab boundary — RESEARCH §Pitfall 1)"
  - "InventoryStack type: { qtyOffset, itemId, raw qty (int32), placeholder, locked } — each stack keyed by its distinct qtyOffset (the Phase 3 same-width write target); duplicate item IDs across tabs are DISTINCT offset-keyed fields (D-01, NOT D-03 ambiguity — RESEARCH Open Q 3)"
  - "SC-3 context-validation: prefix >= marker length, qty in [0, 2^31-1], placeholder/locked raw bytes in {0,1} (readBool would swallow byte>1 as true — validate the raw byte); SC-5 region bounds: stackStart < invStart or body overrun invEnd → skip (T-02-03, T-02-05)"
  - "resolveOne(stacks, matchFn): D-03 ambiguity contract — resolved when 1 match, candidates when >1 (never auto-picked — T-02-08), notFound when 0"
  - "test/inventory-parser.test.ts: 16 tests (7 Task 1 fixture happy-path + 9 Task 2 SC-3/SC-5 negatives + D-03 candidates/resolved/notFound)"
  - "100% line + statement + function + branch coverage on src/inventory-parser.ts (D-04 gate); wave-merge gate 144 tests pass, 100% on all 9 src files"
affects:
  - "02-save-parser (Plan 05, Wave 3): wires findStacks into parseSave — the Inventory stacks become bank.inventory.{itemId}@{qtyOffset} fields in the FieldTable + ViewModel"
  - "03-patch (Phase 3): consumes each stack's { qtyOffset, kind:'int32', width:4 } for same-width in-place qty edits; the offset-keyed design lets Phase 3 patch each duplicate item stack independently"
  - "05-browse (Phase 5): resolveOne surfaces ambiguous logical fields (a single field matching >1 offset) to the browse UI as candidate lists with evidence — never auto-picks"

# Tech tracking
tech-stack:
  added: []  # zero new deps — uses Node built-ins + Phase 1 BinaryReader only
  patterns:
    - "Bounded marker-search (NOT contiguous walk): Buffer.indexOf the namespaced item-ID prefix 'MelvorBase:' across the whole Inventory region, then context-validate each hit. A contiguous walk stops at the first tab boundary (~296 of 689 stacks — RESEARCH §Pitfall 1); the marker-search recovers all 689 across every tab (T-02-01)."
    - "'6-bytes-before-the-length-prefix' recipe: marker hit → 7-bit length prefix at hit-1 → stack header [int32 qty][bool placeholder][bool locked] at (hit-1)-6 = hit-7. The 6-byte header immediately precedes the 7-bit-prefixed item ID (RESEARCH §Pattern 3, §Code Examples)."
    - "Raw-byte boolean validation (NOT readBool): readBool returns `b !== 0` — it would mask a non-boolean byte (e.g. 0x05) as `true`. SC-3 requires placeholder/locked to be GENUINE booleans (raw byte in {0,1}); validate the raw byte via readUInt8 BEFORE readBool, reject if outside {0,1} (T-02-05 false-match guard)."
    - "Offset-keyed stacks for duplicates (D-01 — NOT D-03): NormalLog appearing in 2 tabs produces 2 distinct InventoryStack entries at different qtyOffsets. Each is independently editable in Phase 3. D-03 candidates-when-many is reserved for a DIFFERENT case — a single logical field that a caller expected to resolve to one offset but found many (surfaced via resolveOne, never auto-picked)."
    - "Scoped BinaryReader on buf.subarray(stackStart, stackStart+6): every read bounded to the region; BinaryReader.readInt32 throws ERR_OUT_OF_RANGE natively on OOB (T-1-04). No buf[i] indexing (D-08 noUncheckedIndexedAccess)."
    - "Carried esbuild-interop /* c8 ignore */ pattern from 01-02/01-03/02-01/02-02: header block + class/module closing brace. 100% coverage on all metrics without lowering the --100 threshold."

key-files:
  created:
    - "src/inventory-parser.ts — findStacks (bounded marker-search, 689 stacks, SC-3/SC-5 validated) + InventoryStack type + resolveOne (D-03 ambiguity contract)"
  modified:
    - "test/inventory-parser.test.ts — extended from the pre-existing 7-test RED (commit 7bcc502, originally committed by the 02-03 executor that crossed plan boundaries) to 16 tests: 7 Task 1 fixture happy-path + 9 Task 2 SC-3/SC-5 negatives + D-03 candidates/resolved/notFound"

key-decisions:
  - "Bounded marker-search over the whole Inventory region [invStart, invEnd) — NOT a contiguous walk. A contiguous walk stops at the first tab boundary (~296 of 689 stacks — RESEARCH §Pitfall 1); the marker-search finds every 'MelvorBase:' hit and context-validates each, recovering all 689 across every tab (T-02-01)."
  - "'6-bytes-before-the-length-prefix' recipe: marker hit at offset H → 7-bit length prefix at H-1 → stack header [int32 qty][bool placeholder][bool locked] at (H-1)-6 = H-7. The 6-byte header immediately precedes the 7-bit-prefixed item ID (RESEARCH §Pattern 3)."
  - "Raw-byte boolean validation (NOT readBool): placeholder/locked must be genuine booleans (raw byte 0 or 1). readBool returns `b !== 0` and would swallow byte 0x05 as `true` — masking a false match. Validate the raw byte via readUInt8; reject if outside {0,1} (SC-3, T-02-05)."
  - "SC-3 false-match guard: prefix byte must be >= MARKER_LEN (10, the length of 'MelvorBase:'). A prefix shorter than the namespace itself means the 'match' is a coincidental byte pattern, not a real item ID (T-02-05)."
  - "SC-3 qty range: int32 qty must be in [0, 2147483647]. readInt32LE returns a signed 32-bit value; a negative qty is a false-match / corrupted-byte signal, rejected (not a real stack)."
  - "SC-5 region bounds: stackStart < invStart → skip (the stack header would be outside the Inventory region); item-ID body overrun invEnd → skip (T-02-03). Every read bounded to [invStart, invEnd)."
  - "Duplicate item IDs across tabs are DISTINCT offset-keyed fields (D-01, NOT D-03 ambiguity — RESEARCH Open Q 3). NormalLog in 2 tabs → 2 InventoryStack entries at different qtyOffsets, each independently editable in Phase 3. D-03 candidates-when-many is reserved for a DIFFERENT case (a single logical field resolving to >1 offset, surfaced via resolveOne)."
  - "resolveOne(stacks, matchFn) implements the D-03 contract: resolved (1 match) / candidates ( >1 match, each with offset + evidence, never auto-picked — T-02-08) / notFound (0 matches). A higher layer (Phase 5 browse UI) disambiguates candidates."
  - "Did NOT mark IO-01 complete — 02-04 delivers the bank-item-stack half of IO-01 (SC-1 all 689 stacks + SC-3 context-validation), but the full IO-01 (orchestrator wiring structural spine + bank + skills into parseSave) ships in 02-05. requirements-completed: []; 02-05 will mark IO-01 complete."

patterns-established:
  - "Bounded marker-search recipe: for nested-framing regions where structural descent stops at a boundary (tab, page, section), scan the namespaced-ID prefix across the whole region and context-validate each hit. Don't assume contiguous layout."
  - "Raw-byte validation for typed-boolean fields: when a format spec requires a genuine boolean (byte 0 or 1), validate the raw byte — don't rely on readBool which masks non-boolean bytes as true. This is the SC-3 false-match guard."
  - "Offset-keyed duplicates vs D-03 ambiguity: duplicate format records (same item in different tabs) are distinct offset-keyed fields, each independently editable. D-03 candidates-when-many is for a single logical field that a caller expected to resolve to one offset but found many — a different case, surfaced via a dedicated resolveOne helper, never auto-picked."

requirements-completed: []  # IO-01 (parse the layout) is owned by 02-05 (the save-parser orchestrator). 02-04 delivers the bank-item-stack half of IO-01 (SC-1 all 689 stacks + SC-3 context-validation), but marking IO-01 complete here would be a false claim — 02-05 wires the structural spine + bank + skills together. 02-05 will mark IO-01 complete when parseSave(buffer) → { fieldTable, viewModel } ships.

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "findStacks(buf, invStart, invEnd) — bounded marker-search recovering all 689 valid Bank Inventory item stacks across every tab (SC-1, T-02-01 — a contiguous walk stops at ~296 at the first tab boundary)"
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/inventory-parser.test.ts#recovers exactly 689 valid stacks across all tabs (not ~296 — bounded marker-search)"
        status: pass
      - kind: unit
        ref: "test/inventory-parser.test.ts#NormalLog spot-check: qty 48652 @ qtyOffset 736, not placeholder/locked"
        status: pass
      - kind: unit
        ref: "test/inventory-parser.test.ts#stacks are keyed by DISTINCT qtyOffsets (689 unique offsets — SC-1)"
        status: pass
      - kind: unit
        ref: "test/inventory-parser.test.ts#duplicate item IDs across tabs are DISTINCT entries (not D-03 ambiguity)"
        status: pass
      - kind: automated
        ref: "npx c8 --100 --include 'src/inventory-parser.ts' --exclude 'test/**' tsx --test test/inventory-parser.test.ts → 100% lines/statements/functions/branches (D-04 gate)"
        status: pass
      - kind: automated
        ref: "npx tsc --noEmit → exit 0 (strict + noUncheckedIndexedAccess, D-07/D-08)"
        status: pass
    human_judgment: false
  - id: D2
    description: "SC-3 context-validation: prefix >= marker length, qty in [0, 2^31-1], placeholder/locked raw bytes in {0,1} — false marker matches rejected (T-02-05)"
    verification:
      - kind: unit
        ref: "test/inventory-parser.test.ts#a prefix byte shorter than the marker length is rejected (false match)"
        status: pass
      - kind: unit
        ref: "test/inventory-parser.test.ts#a negative int32 qty is rejected (out of [0, 2^31-1] range)"
        status: pass
      - kind: unit
        ref: "test/inventory-parser.test.ts#a placeholder byte > 1 is rejected (not a genuine boolean)"
        status: pass
      - kind: unit
        ref: "test/inventory-parser.test.ts#a locked byte > 1 is rejected (not a genuine boolean)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SC-5 region bounds: stackStart < invStart skipped, item-ID body overrun invEnd skipped — every read bounded to [invStart, invEnd) (T-02-03)"
    verification:
      - kind: unit
        ref: "test/inventory-parser.test.ts#every stack's qtyOffset is within [invStart, invEnd) (SC-5 region-scoped)"
        status: pass
      - kind: unit
        ref: "test/inventory-parser.test.ts#a candidate whose stack start precedes invStart is skipped (bounds)"
        status: pass
      - kind: unit
        ref: "test/inventory-parser.test.ts#a candidate whose item-ID body overruns invEnd is skipped (bounds)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-03 ambiguity contract via resolveOne(stacks, matchFn): resolved (1 match) / candidates (>1, never auto-picked — T-02-08) / notFound (0)"
    verification:
      - kind: unit
        ref: "test/inventory-parser.test.ts#a single logical field matching TWO validated offsets returns candidates (no auto-pick)"
        status: pass
      - kind: unit
        ref: "test/inventory-parser.test.ts#a single logical field matching exactly ONE offset is resolved"
        status: pass
      - kind: unit
        ref: "test/inventory-parser.test.ts#a single logical field matching ZERO offsets returns notFound (D-03 fail-loud-when-zero)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-04
status: complete
---

# Phase 2 Plan 04: Bank Inventory Parser Summary

**Bounded marker-search recovering ALL 689 Bank Inventory item stacks across every tab (not ~296 — a contiguous walk stops at the first tab boundary), with SC-3 context-validation (prefix/qty/boolean-range false-match guards), SC-5 region bounds, and D-03 ambiguity surfacing via resolveOne — 100% line+branch coverage gated under strict TS.**

## Performance

- **Duration:** ~15 min (inline execution — see Deviations)
- **Started:** 2026-07-04T03:18Z (after user confirmed inline execution fallback)
- **Completed:** 2026-07-04T03:34Z
- **Tasks:** 2 (Task 1: bounded marker-search stack recovery; Task 2: SC-3 negatives + D-03 ambiguity surfacing)
- **Files modified:** 2 (src/inventory-parser.ts [created], test/inventory-parser.test.ts [extended from pre-existing RED])

## Accomplishments

- **src/inventory-parser.ts** — `findStacks(buf, invStart, invEnd)`: bounded marker-search for 'MelvorBase:' across the whole Inventory component region, recovering all 689 valid item stacks across every tab. The '6-bytes-before-the-length-prefix' recipe locates each stack header at `(markerHit - 1) - 6` = `[int32 qty][bool placeholder][bool locked]`. Each stack is an `InventoryStack` keyed by its distinct `qtyOffset` (the Phase 3 same-width write target).
- **SC-1 proven**: the committed fixture's Inventory region [710, 20496) yields exactly 689 stacks (verified via a probe + the test); NormalLog spot-checked at qty=48652, qtyOffset=736, not placeholder/locked. A naive contiguous walk stops at ~296 at the first tab boundary — the bounded marker-search recovers all 689 (T-02-01 mitigated).
- **SC-3 context-validation**: each marker hit is validated — prefix byte >= marker length (10), qty in [0, 2147483647], placeholder/locked raw bytes in {0,1} (NOT readBool, which would mask byte>1 as `true`). False matches are rejected, never silently injected (T-02-05 mitigated).
- **SC-5 region bounds**: stackStart < invStart skipped, item-ID body overrun invEnd skipped. Every read bounded to [invStart, invEnd) (T-02-03 mitigated).
- **D-03 ambiguity surfacing** via `resolveOne(stacks, matchFn)`: resolved (1 match) / candidates (>1, each with offset + evidence, never auto-picked — T-02-08) / notFound (0). Duplicate item IDs across tabs are DISTINCT offset-keyed fields (D-01 — NOT D-03 ambiguity, RESEARCH Open Q 3); D-03 candidates-when-many is for a different case (a single logical field resolving to >1 offset).
- **D-04 coverage gate satisfied**: `npx c8 --100 --include 'src/inventory-parser.ts' --exclude 'test/**'` → 100% lines/statements/functions/branches.
- **D-07/D-08 typecheck gate satisfied**: `npx tsc --noEmit` → exit 0 (strict + noUncheckedIndexedAccess, no buf[i] indexing).
- **Wave-merge gate green**: `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` → 144 tests pass, 100% coverage on all 9 src files (no regressions in Phase 1 codec/primitives or Wave 1/2 sibling parsers).

## Task Commits

Each task was committed atomically (TDD: RED → GREEN). The RED test was committed by a prior executor (02-03) that crossed plan boundaries — kept per user decision ("keep-fix"); the tsc errors it introduced were resolved by writing the GREEN implementation.

1. **Task 1 RED: add failing inventory-parser test suite** — `7bcc502` (test) — test/inventory-parser.test.ts (7 tests; src/inventory-parser.ts absent → MODULE_NOT_FOUND, the expected RED state). Originally committed by the 02-03 executor that crossed plan boundaries; had tsc TS7006/TS2307 errors (resolved by Task 1 GREEN).
2. **Task 1 GREEN: implement bounded marker-search inventory parser** — `88bb525` (feat) — src/inventory-parser.ts (findStacks + InventoryStack + resolveOne + SC-3/SC-5 validation); 7/7 Task 1 tests green; tsc clean.
3. **Task 2: add SC-3 negatives + SC-5 bounds + D-03 ambiguity tests** — `7544397` (test) — extended test/inventory-parser.test.ts to 16 tests (7 Task 1 + 9 Task 2 negatives/D-03); 16/16 green; c8 100% on src/inventory-parser.ts; wave-merge 144 tests pass.

## Files Created/Modified

- `src/inventory-parser.ts` (created) — findStacks (bounded marker-search, 689 stacks, SC-3/SC-5 validated) + InventoryStack type + resolveOne (D-03 ambiguity contract). Named import of BinaryReader; targeted `/* c8 ignore */` for esbuild __copyProps interop arm.
- `test/inventory-parser.test.ts` (extended from the pre-existing RED at commit 7bcc502) — 16 node:test cases: 7 Task 1 fixture happy-path (689 stacks, NormalLog spot-check, distinct offsets, duplicate items as distinct entries, region-scoped, qty range) + 9 Task 2 (SC-3 false-match rejection: prefix/qty/placeholder/locked; SC-5 bounds: stackStart<invStart, body overrun; D-03: candidates/resolved/notFound via resolveOne).

## Decisions Made

- **Bounded marker-search, NOT contiguous walk** — a contiguous walk stops at the first tab boundary (~296 of 689 stacks — RESEARCH §Pitfall 1); the bounded marker-search finds every 'MelvorBase:' hit across the whole Inventory region and context-validates each, recovering all 689 (T-02-01).
- **'6-bytes-before-the-length-prefix' recipe** — marker hit at H → 7-bit prefix at H-1 → stack header [int32 qty][bool placeholder][bool locked] at H-7. The 6-byte header immediately precedes the 7-bit-prefixed item ID (RESEARCH §Pattern 3, §Code Examples).
- **Raw-byte boolean validation (NOT readBool)** — placeholder/locked must be genuine booleans (raw byte 0 or 1). readBool returns `b !== 0` and would swallow byte 0x05 as `true` — masking a false match. Validate the raw byte via readUInt8; reject if outside {0,1} (SC-3, T-02-05).
- **SC-3 false-match guard: prefix >= MARKER_LEN (10)** — a prefix shorter than the namespace itself ('MelvorBase:' is 10 bytes) means the 'match' is a coincidental byte pattern, not a real item ID.
- **SC-3 qty range: [0, 2147483647]** — readInt32LE returns a signed 32-bit value; a negative qty is a false-match / corrupted-byte signal, rejected.
- **SC-5 region bounds** — stackStart < invStart → skip; item-ID body overrun invEnd → skip. Every read bounded to [invStart, invEnd).
- **Duplicate item IDs across tabs are DISTINCT offset-keyed fields (D-01 — NOT D-03 ambiguity — RESEARCH Open Q 3)** — NormalLog in 2 tabs → 2 InventoryStack entries at different qtyOffsets, each independently editable in Phase 3. D-03 candidates-when-many is reserved for a DIFFERENT case (a single logical field resolving to >1 offset, surfaced via resolveOne).
- **resolveOne(stacks, matchFn) implements D-03** — resolved (1 match) / candidates (>1, each with offset + evidence, never auto-picked — T-02-08) / notFound (0). A higher layer (Phase 5 browse UI) disambiguates candidates.
- **Did NOT mark IO-01 complete** — 02-04 delivers the bank-item-stack half of IO-01 (SC-1 all 689 stacks + SC-3 context-validation), but the full IO-01 (orchestrator wiring structural spine + bank + skills into parseSave) ships in 02-05. `requirements-completed: []`; 02-05 will mark IO-01 complete.
- **Carried esbuild-interop /* c8 ignore */ pattern** — header block + module closing brace. 100% coverage on all metrics without lowering the --100 threshold (same pattern as 01-02/01-03/02-01/02-02).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing RED test (commit 7bcc502) had tsc errors — resolved by writing the GREEN implementation**
- **Found during:** Task 1 GREEN (writing src/inventory-parser.ts)
- **Issue:** A prior executor (intended for 02-03) crossed plan boundaries and committed `7bcc502 test(02-04): add failing inventory-parser test suite` — a partial RED test file with tsc TS7006 (implicit any on `(s) => s.itemId` callbacks, because the imported module didn't exist yet) and TS2307 (Cannot find module '../src/inventory-parser'). The project-wide `npx tsc --noEmit` gate was broken.
- **Fix:** The user chose "keep-fix" (keep the rogue commit, let the next executor fix it). I wrote src/inventory-parser.ts exporting `findStacks` + `type InventoryStack` + `resolveOne` per the plan — the TS2307 resolved (module now exists) and the TS7006 resolved (`s` infers as `InventoryStack` from the now-typed array). No content loss; the RED test's intent (7 Task 1 fixture tests) was already correct and aligned with the plan.
- **Files modified:** src/inventory-parser.ts (created)
- **Verification:** `npx tsc --noEmit` exit 0 (project-wide); `npx tsx --test test/inventory-parser.test.ts` 7/7 pass (Task 1).
- **Committed in:** 88bb525 (Task 1 GREEN).

**2. [Rule 3 - Blocking] Inline execution fallback (subagent no-op'd twice)**
- **Found during:** Plan execution dispatch
- **Issue:** The gsd-executor Task tool returned empty messages twice in a row for 02-04 — zero work done (no commits, no files, no fixes). The subagent path was unreliable for 02-04 specifically (02-01/02-02 worked on first try; 02-03 crossed plans; 02-04 no-op'd).
- **Fix:** The user confirmed inline execution per the workflow's runtime_compatibility fallback policy ("If `Agent`/`agent` tool is genuinely unavailable... use sequential inline execution as the fallback"). I executed the plan inline (read 02-04-PLAN.md + execute-plan workflow, wrote the GREEN impl, ran gates, committed atomically, wrote SUMMARY). This is the prescribed fallback when subagent spawning doesn't reliably complete.
- **Files modified:** src/inventory-parser.ts, test/inventory-parser.test.ts, .planning/STATE.md, .planning/ROADMAP.md, .planning/phases/02-format-parser-fieldtable-model/02-04-SUMMARY.md
- **Verification:** All gates green (16 tests, tsc clean, c8 100%, wave-merge 144 tests).
- **Committed in:** 88bb525 (Task 1 GREEN), 7544397 (Task 2 tests), and this docs commit.

---

**Total deviations:** 2 auto-fixed (2 blocking — both Rule 3, both necessary: (a) resolve the rogue RED commit's tsc breakage per user "keep-fix" choice, (b) inline execution fallback per workflow policy when the subagent no-op'd twice)
**Impact on plan:** Both auto-fixes necessary to complete 02-04 under the actual runtime conditions. No scope creep — the implementation matches the plan's intent (findStacks + resolveOne + SC-3/SC-5 validation + D-03 ambiguity); the fixes address (a) a cross-plan contamination from a prior executor and (b) a runtime-reliability issue. The --100 c8 threshold was NOT lowered.

## Issues Encountered

- **gsd-executor Task tool no-op'd twice for 02-04** — returned empty messages with zero work done (no commits, no files, no fixes). The opencode runtime's Task tool has been unreliable today (01-03 premature return, 02-03 cross-plan contamination, 02-04 no-op). Resolved by falling back to inline execution per the workflow's runtime_compatibility policy, with explicit user confirmation. The inline path is lower-token and pair-programming-style; it produced a clean, fully-gated implementation. Future 02-05 dispatch may hit the same issue — if so, inline execution is the proven fallback.

## Authentication Gates

None — Phase 2 is a pure local parser library with no auth/session/network surface. No secrets, no logins, no external services.

## User Setup Required

None — no external service configuration required. The parser uses Node built-ins (node:buffer Buffer.indexOf, node:test, node:assert/strict) + Phase 1 BinaryReader; the fixture is committed at test/fixtures/test-fixture.sav (D-10).

## Next Phase Readiness

- **Wave 2 is now complete (02-02 + 02-03 + 02-04 all green)** — the structural spine (02-02), Wallet + Experience parsers (02-03), and Bank Inventory parser (02-04) are all in place with 100% coverage on each src file and 144 tests passing project-wide.
- **Wave 3 (Plan 02-05)** can now wire the spine + three region parsers into the phase deliverable: `parseSave(buffer) → { fieldTable, viewModel }`. It walks version → SaveHeader → entity list → per-entity component list, dispatches to the region parsers at each component boundary, and projects the FieldTable into the offset-free ViewModel. 02-05 marks IO-01 complete when the full parseSave + round-trip-ability ships.
- **No blockers.** The 2 deviations (rogue RED fix, inline execution fallback) are stable and don't affect 02-05. If the 02-05 subagent no-ops, inline execution is the proven fallback.

---
*Phase: 02-format-parser-fieldtable-model*
*Completed: 2026-07-04*

## Self-Check: PASSED

- src/inventory-parser.ts — FOUND
- test/inventory-parser.test.ts — FOUND (16 tests)
- .planning/phases/02-format-parser-fieldtable-model/02-04-SUMMARY.md — FOUND
- Commit 7bcc502 (RED, pre-existing) — FOUND in git log
- Commit 88bb525 (Task 1 GREEN) — FOUND in git log
- Commit 7544397 (Task 2 tests) — FOUND in git log
- SUMMARY frontmatter status: complete — FOUND
- Gates re-verified green: `npx tsx --test test/inventory-parser.test.ts` (16 pass, 0 fail); `npx tsc --noEmit` (exit 0); `npx c8 --100 --include 'src/inventory-parser.ts' --exclude 'test/**'` (100% lines/statements/functions/branches, exit 0); wave-merge `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` (144 tests pass, 100% on all 9 src files)
- SC-1 (all 689 fixture stacks), SC-3 (context-validation false-match guards), SC-5 (region bounds), and D-03 (resolveOne ambiguity surfacing) all proven and gated
