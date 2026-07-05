---
status: resolved
slug: bank-phantom-stacks
trigger: "Bank Inventory phantom stacks: src/inventory-parser.ts findStacks uses a loose marker-search that surfaces phantom editable item stacks from the Inventory component's trailing non-stack zone (item-id registry). Editing a phantom (e.g. MahoganyLog @12548) corrupts the bank so the game reverts ALL edits on load."
created: 2026-07-05
updated: 2026-07-05
---

# Debug Session: Bank Inventory Phantom Stacks

## Symptoms

- **Expected behavior:** Editing a bank item's quantity (e.g. MahoganyLog → 100000) and writing a new `.sav` persists that quantity when loaded in-game.
- **Actual behavior:** For items that appear MORE THAN ONCE in the editor (e.g. MahoganyLog shows twice), editing them → game loads with the value unchanged (still 103). The game finds the bank inconsistent and **reverts ALL edits**, including legitimate ones. Items where both instances are real (HarpyFeather) DO work.
- **Error messages:** None — silent corruption; the game reverts rather than erroring.
- **Timeline:** Surfaced during Phase 5 in-game acceptance testing. Bug lives in Phase 2 core `src/inventory-parser.ts` (marker-search parsing).
- **Reproduction:** Load `test/fixtures/MahoganyLog-in.sav` (or a real save), edit MahoganyLog to a large value, write, load in-game → edit reverts. Root-cause proven: patching ONLY `@944` (the real stack) while leaving phantom `@12548` untouched works in-game.

## Root Cause (already confirmed — see docs/bank-inventory-phantom-stacks.md)

The Bank `Inventory` component is a **multi-tab** structure. Real stacks live in contiguous per-tab runs; the component also has a **trailing non-stack zone** (item-id registry / lists) where `MelvorBase:<Item>` strings appear. `findStacks` accepts any `MelvorBase:` string whose preceding 6 bytes loosely validate as `[int32 qty][u8 placeholder∈{0,1}][u8 locked∈{0,1}]`. Strings in the trailing zone coincidentally pass → **phantom editable stacks**.

- `MahoganyLog-103.sav`: real MahoganyLog stack = `@944 = 103` (first tab run `@731..10280`, 323 stacks). Phantom = `@12548 = 29797` (isolated match in trailing zone; its "next record" decodes to garbage: `ph=27 lk=77`).
- Editing the phantom writes into non-stack data → game reverts all edits.

## Planned Fix

Parse the tab list explicitly: read tab count + per-tab `[name][config][int32 stackCount][stacks]`, reading exactly `stackCount` records per tab and stopping cleanly — never scanning the trailing zone.

**Unresolved gap:** what the trailing `"Chests" count=427` region actually is (it does NOT decode as 427 contiguous stacks). Header layout must be nailed: (a) inventory-level header vs per-tab header layout, (b) the trailing-zone format.

**Verify against BOTH fixtures:** MahoganyLog-103 must yield real tab stacks incl. `@944`, exclude `@12548`; test-fixture stack count must match the game's real bank. Third fixture `test/fixtures/save_35a73127-3468-47a8-b69d-a5952afaac1b.sav` available to triangulate the header format. Add regression tests keyed on the fixtures.

## Current Focus

reasoning_checkpoint:
  hypothesis: "The Inventory component payload is `[int32 reserved][int32 tabCount]` followed by exactly tabCount stack-tabs; walking exactly tabCount tabs and reading exactly stackCount records per tab recovers all real stacks and stops precisely at the trailing 'Chests' registry — never entering it. The phantoms are `[string itemId][int32]` pairs in that trailing registry."
  confirming_evidence:
    - "Byte-exact decode of all 3 fixtures: header [int32 0][int32 tabCount=2]; tab0 (unnamed) = [3×int32 cfg][u16=1][int32 stackCount][stacks]; named tabs = [string name][4×int32 cfg][u16=1][int32 stackCount][stacks]. stack = [int32 qty][u8 ph][u8 lk][7bit-len][utf8 id]."
    - "Walking exactly tabCount(=2) tabs lands byte-exactly on the 'Chests\\0' string boundary in ALL 3 fixtures despite DIFFERENT stack counts (323/7 vs 296/5) — proves the arithmetic is correct, not coincidental."
    - "MahoganyLog-103: tab-walk yields 330 stacks incl. real MahoganyLog @944=103; phantom @12548 is NOT among them (it lives in the Chests registry @10541+)."
    - "test-fixture: tab-walk yields 301 stacks = 296(tab0)+5(tab1). Old marker-search returned 689 = 301 real + 388 Chests-registry phantoms (689-388=301, exact)."
    - "Trailing 'Chests' zone = [string 'Chests'][int32 0][int32 0][int32 N][int32 0] then N × ([7bit-len][utf8 itemId][int32]) — decodes as EXACTLY N=427 (MahoganyLog) / N=388 (test-fixture) [string][int32] pairs, ending at invEnd-10. It is NOT N contiguous stacks; each entry is a variable-width string+int, which is why per-stack reads misalign and why loose marker-search leaks these ids as phantoms."
    - "Zero genuine cross-tab duplicate items in any fixture — every 'duplicate' the old parser surfaced was a Chests-registry phantom."
  falsification_test: "If tabCount(offset+4) were NOT the tab count, walking that many tabs would land mid-structure, not on a clean 'Chests\\0' string — it lands clean in all 3 fixtures with differing stack counts. Additionally, the parser fail-loud tripwire (placeholder/locked must be {0,1}, qty>=0) would throw if the walk ever misaligned onto non-stack bytes."
  fix_rationale: "Replace loose marker-scan in findStacks with an explicit structural tab-walk driven by the file's own tabCount + per-tab stackCount fields. Reads are bounded to [0,invEnd) and the walk stops after tabCount tabs, so the trailing registry is never scanned — phantoms are structurally impossible, not filtered heuristically. qtyOffset (patcher write target) is unchanged for real stacks."
  blind_spots: "All 3 fixtures have exactly 2 tabs (offset+4=2); no 3+ tab save available to confirm tabCount generalizes. Mitigated: the field demonstrably controls the walk length (clean landing), and fail-loud ParseError + bounded reads mean an unexpected layout REFUSES (throws) rather than emitting phantoms or misaligned offsets — safe per the correctness invariant."

## Evidence

- timestamp: 2026-07-05 — Root cause confirmed in prior session (docs/bank-inventory-phantom-stacks.md): patching only @944 (excluding phantom @12548) persists in-game; editing phantom reverts all edits.
- timestamp: 2026-07-05 — Byte-exact Inventory layout decoded (scratch decoders over 3 fixtures). Header `[int32 reserved=0][int32 tabCount=2]`. Tab0 unnamed 3-int32 cfg; named tabs `[string name][4-int32 cfg]`; both `[u16=1][int32 stackCount][stacks]`. Stack `[int32 qty][u8 ph][u8 lk][7bit-len][utf8 id]`. Explicit tabCount walk lands EXACTLY on trailing "Chests" in all 3 fixtures.
- timestamp: 2026-07-05 — ANOMALY RESOLVED: trailing "Chests count=N" = `[string "Chests"][int32 0][int32 0][int32 N][int32 0]` + N×`[string itemId][int32]` (item→count registry; N=427 MahoganyLog / 388 test-fixture, exact). NOT stacks. This registry is the phantom source.
- timestamp: 2026-07-05 — Acceptance verified via decoder: MahoganyLog-103 → 330 stacks incl @944=103, excl @12548; test-fixture → 301 stacks (689 old = 301 real + 388 phantoms); save_35a → 330 stacks (@944=100000). Zero genuine cross-tab duplicates in any fixture.

## Eliminated

- hypothesis: Run-length filter (keep runs ≥3) — REJECTED as unsafe: MahoganyLog→330 (correct) but test-fixture→301 of 689; cannot prove dropped 388 are all phantoms, would hide real stacks in small tabs (tabs of 7 exist).
- hypothesis: Naive count-based tab walk — REJECTED as not-yet-reliable: trailing "Chests count=427" does not map to 427 contiguous stacks, so a per-count read misaligns. SUPERSEDED: the correct walk is driven by `[int32 tabCount]` + per-tab `[int32 stackCount]` (NOT the Chests count, which is a separate registry) and stops after tabCount tabs — never reaching Chests.

## Resolution

root_cause: >
  Bank `Inventory` component is `[int32 reserved][int32 tabCount]` + tabCount stack-tabs +
  a trailing "Chests" item→count registry (`[string itemId][int32]` pairs). The old
  findStacks used a loose `MelvorBase:` marker-search over the WHOLE region, so item-id
  strings in the trailing registry whose preceding 6 bytes coincidentally validated as a
  stack header were surfaced as PHANTOM editable stacks (e.g. MahoganyLog @12548). Editing
  a phantom wrote into non-stack registry data → the game rejected the bank on load and
  reverted ALL edits.
fix: >
  Rewrote findStacks (src/inventory-parser.ts) as an EXPLICIT structural tab-walk: read
  `[int32 reserved][int32 tabCount]`, then walk exactly tabCount tabs (tab 0 unnamed with a
  3-int32 config; named tabs carry `[string name]` + 4-int32 config; each ends
  `[u16 sentinel][int32 stackCount]` + stackCount records), reading exactly stackCount
  `[int32 qty][u8 ph][u8 lk][7bit-len][utf8 id]` records per tab and STOPPING — the trailing
  registry is never scanned, so phantoms are structurally impossible. Reads bounded to
  [0,invEnd); tabCount/stackCount bounded against the region; a misaligned record
  (placeholder/locked>1 or qty<0) throws ParseError (fail-loud, never a bad write offset).
  patcher.ts unchanged — FieldEntry.offset still holds the real qtyOffset.
verification: >
  Byte-exact against 3 fixtures: MahoganyLog-103 → 330 stacks incl real @944=103, excl
  phantom @12548; test-fixture → 301 stacks (was 689 = 301 real + 388 phantom); save_35a →
  330 stacks. Patcher end-to-end: editing MahoganyLog now resolves to the SINGLE offset @944
  (no phantom #1), patchSave self-verify (re-parse + whole-buffer diff) passes, brotli
  round-trip byte-identical, re-parse reads back 100000 with 330 bankItems stable. Full
  suite 272/272 pass; inventory-parser core 100% line/branch/function coverage; tsc clean.
  IN-GAME CONFIRMED (human-verify): user edited a previously-duplicated bank item (now shows
  once), wrote the .sav, loaded in Melvor Idle 2 → quantity persisted with no bank revert.
files_changed:
  - src/inventory-parser.ts (findStacks rewritten as explicit tab-walk)
  - src/save-parser.ts (comment updates only — behavior unchanged)
  - test/inventory-parser.test.ts (tab-walk + 3-fixture regression + fail-loud + resolveOne)
  - test/helpers/fixture.ts (loadFixtureFile + locateInventoryRegion helpers)
  - test/save-parser.test.ts (689→301, phantom-duplicate assertions reworked)
