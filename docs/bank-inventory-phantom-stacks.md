# Bank Inventory phantom stacks — diagnosis (open bug)

**Status:** root-caused, fix NOT yet implemented (unsafe to rush — corruption risk).
**Surfaced:** Phase 5 in-game acceptance. **Lives in:** Phase 2 core `src/inventory-parser.ts`.
**Fixtures:** `test/fixtures/MahoganyLog-in.sav` (tool edit → 100000), `test/fixtures/MahoganyLog-103.sav` (game truth → 103).

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

## Structure decoded so far
Inventory component region resolved via bank sub-component walk (`Inventory`).
- Tab 0 header (MahoganyLog save `@705`): `[int32 0][int32 2][int32 MAX][int32 0][int32 MAX][u16][int32 count=323]` then 323 stacks `@731`.
- Tab boundary (`@10280`, after last tab-0 stack): `[string name "Tab 1"][int32 0][int32 MAX][int32 0][int32 MAX][u16][int32 count=7]` then 7 stacks.
- Next boundary: name `"Chests"` + `[int32 count=427]` — but the region after it does NOT decode as
  427 contiguous stacks, so `count` may be capacity/not-populated, or the record format differs. **This
  is the unresolved gap.**
- Stack record: `[int32 qty][u8 placeholder][u8 locked][7-bit-varint len][utf8 itemId]`, records packed
  contiguously within a tab.

## Why the quick fixes are unsafe
- **Run-length filter (keep runs ≥3):** MahoganyLog → 330 (correct). `test-fixture.sav` → 301 of 689.
  Cannot prove the dropped 388 are all phantoms; would hide real stacks in small tabs (tabs of 7 exist).
- **Count-based tab walk:** not yet reliable — the trailing "Chests count=427" does not map to 427
  contiguous stacks, so a naive per-count read misaligns.

## Correct fix (planned)
Parse the tab list explicitly: read tab count + per-tab `[name][config][int32 stackCount][stacks]`,
reading exactly `stackCount` records per tab and stopping cleanly — never scanning the trailing zone.
Requires nailing: (a) inventory-level header vs per-tab header layout, (b) what the trailing
`Chests count=427` region actually is. **Verify against BOTH fixtures**: MahoganyLog-103 must yield
the real tab stacks incl. `@944`, exclude `@12548`; test-fixture count must match the game's real bank.
Add regression tests keyed on both fixtures. Ideally obtain 1–2 more game-exported saves with known
tab layouts to triangulate the header format.

## Interim guidance (until fixed)
Editing an item the editor shows **more than once** is unsafe — one instance may be a phantom whose
edit reverts the whole bank. Single-instance items are safe.
