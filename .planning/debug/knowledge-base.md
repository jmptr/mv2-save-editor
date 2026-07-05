# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## bank-phantom-stacks — Editing a duplicated bank item reverts ALL edits on in-game load
- **Date:** 2026-07-05
- **Error patterns:** phantom stacks, bank inventory, duplicate item, MahoganyLog, edit reverts, marker-search, MelvorBase, silent corruption, findStacks, multi-tab inventory, Chests registry
- **Root cause:** Bank `Inventory` component is `[int32 reserved][int32 tabCount]` + tabCount stack-tabs + a trailing "Chests" item→count registry (`[string itemId][int32]` pairs). `findStacks` used a loose `MelvorBase:` marker-search over the whole region, so registry item-id strings whose preceding 6 bytes coincidentally validated as a stack header (`[int32 qty][u8 ph∈{0,1}][u8 lk∈{0,1}]`) surfaced as phantom editable stacks (e.g. MahoganyLog @12548). Editing a phantom wrote into non-stack registry data → the game rejected the bank on load and reverted ALL edits.
- **Fix:** Rewrote `findStacks` as an explicit structural tab-walk: read `[int32 reserved][int32 tabCount]`, walk exactly tabCount tabs (tab 0 unnamed 3-int32 config; named tabs `[string name]` + 4-int32 config; each ends `[u16 sentinel][int32 stackCount]` + stackCount records `[int32 qty][u8 ph][u8 lk][7bit-len][utf8 id]`), stopping after tabCount tabs so the trailing registry is never scanned — phantoms are structurally impossible. Reads bounded to [0,invEnd); misaligned record (ph/lk>1 or qty<0) throws ParseError (fail-loud). Patcher unchanged.
- **Files changed:** src/inventory-parser.ts, src/save-parser.ts, test/inventory-parser.test.ts, test/helpers/fixture.ts, test/save-parser.test.ts
---
