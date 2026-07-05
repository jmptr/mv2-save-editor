# Bank Inventory phantom stacks — diagnosis (RESOLVED)

**Status:** RESOLVED — `findStacks` rewritten as an explicit structural tab-walk
(byte-exact against 3 fixtures; patcher round-trip verified; in-game persistence confirmed).
**Surfaced:** Phase 5 in-game acceptance. **Lives in:** Phase 2 core `src/inventory-parser.ts`.
**Fixtures:** `test/fixtures/MahoganyLog-in.sav` (tool edit → 100000), `test/fixtures/MahoganyLog-103.sav` (game truth → 103), `test/fixtures/save_35a…sav` (header triangulation), `test/fixtures/test-fixture.sav` (301 real stacks).

## Byte-exact Inventory layout (decoded this session, version 20)
```
[int32 reserved = 0]
[int32 tabCount]                          number of bank tabs (drives the walk)
tab[0]  (unnamed default tab):
  [int32 a][int32 b][int32 c]             3-int32 config (a,c = INT32_MAX)
  [uint16 sentinel = 1]
  [int32 stackCount]
  stack × stackCount
tab[1..tabCount-1]  (named tabs):
  [string name]                           e.g. "Tab 1"
  [int32 a][int32 b][int32 c][int32 d]    4-int32 config (b,d = INT32_MAX)
  [uint16 sentinel = 1]
  [int32 stackCount]
  stack × stackCount
-- trailing "Chests" registry (NOT stacks — the phantom source) --
[string "Chests"][int32 0][int32 0][int32 N][int32 0]
N × ( [string itemId][int32] )            item→count registry (N=427 / 388 in fixtures)

stack record = [int32 qty][uint8 placeholder][uint8 locked][7bit-len][utf8 itemId]
```
Walking exactly `tabCount` (=2 in all fixtures) tabs lands byte-exactly on the "Chests"
string boundary in all three saves despite differing stack counts (323/7, 296/5) —
confirming the walk arithmetic. The trailing registry is never scanned, so phantoms are
structurally impossible (not heuristically filtered). Anomaly resolved: "Chests count=N" is
the registry entry count, NOT a stack count — its entries are variable-width `[string][int32]`
pairs, which is why per-stack reads misaligned and why loose marker-search leaked them.

## Fix (implemented)
`src/inventory-parser.ts` `findStacks` now walks the tab list explicitly (reads bounded to
`[0,invEnd)`; tabCount/stackCount bounded against the region; a misaligned record throws
`ParseError` — fail-loud, never a bad write offset). `src/patcher.ts` unchanged
(`FieldEntry.offset` still holds the real `qtyOffset`). Regression tests keyed on all four
fixtures in `test/inventory-parser.test.ts`; `test/save-parser.test.ts` updated 689 → 301.

## Verified
- MahoganyLog-103 → 330 stacks incl. real `@944=103`, excludes phantom `@12548`.
- test-fixture → 301 real stacks (old 689 = 301 real + 388 phantom Chests-registry ids).
- save_35a → 330 stacks. Zero genuine cross-tab duplicate items in any fixture.
- Patcher: editing MahoganyLog resolves to the single `@944`; `patchSave` self-verify +
  brotli round-trip pass; re-parse reads back the edit. Suite 272/272; parser 100% coverage.
- **In-game confirmed:** user edited a previously-duplicated bank item (now shows once), wrote
  the `.sav`, loaded in Melvor Idle 2 → quantity persisted with no bank revert.

## Symptom
User edits an item that appears twice in the editor (e.g. MahoganyLog), sets both to 100000,
loads in-game → value is unchanged (still 103). Duplicate items where BOTH instances are real
(HarpyFeather) DO work; MahoganyLog does not.

## Root cause (confirmed)
The Bank `Inventory` component is a **multi-tab** structure. Real stacks live in contiguous
per-tab runs; the component also contains a trailing non-stack zone (item-id registry / lists)
where `MelvorBase:<Item>` strings appear.

`findStacks` uses a **marker-search**: it accepts any `MelvorBase:` string whose preceding 6 bytes
loosely validate as `[int32 qty][u8 placeholder∈{0,1}][u8 locked∈{0,1}]`. Strings in the trailing
zone coincidentally pass this and become **phantom editable stacks**.

- `MahoganyLog-103.sav`: real MahoganyLog stack = `@944 = 103` (in the first tab run, `@731..10280`,
  323 stacks). Phantom = `@12548 = 29797`, an isolated match in the trailing zone (its "next record"
  decodes to garbage: `ph=27 lk=77`, run-together ids).
- Editing the phantom writes into non-stack data → the game finds the bank inconsistent on load and
  **reverts all edits**, including the legitimate `@944` edit. Proven: patching ONLY `@944` (leaving
  `@12548`) works in-game.

## Why the earlier quick fixes were rejected (kept for the record)
- **Run-length filter (keep runs ≥3):** MahoganyLog → 330 (correct). `test-fixture.sav` → 301 of 689.
  Could not prove the dropped 388 are all phantoms; would hide real stacks in small tabs (tabs of 7 exist).
  The explicit tab-walk supersedes this — it drops exactly the 388 registry entries by structure, keeping
  all real stacks (301) including small tabs.
- **Naive "read the Chests count as stacks" walk:** the trailing "Chests count=427" is a REGISTRY entry
  count, not a stack count, so reading 427 stack records misaligns. The implemented walk stops after
  `tabCount` tabs and never reads the registry at all.

## Interim guidance — NO LONGER NEEDED
Previously: "editing an item shown more than once is unsafe." With phantoms structurally excluded, the
editor now surfaces only real stacks, and every displayed item is a genuine, safely-editable stack. (A
real item genuinely stored in two tabs would still appear twice as two distinct, independently-editable
offsets — correct per D-01 — but no current fixture exhibits this.)
