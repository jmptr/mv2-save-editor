# Phase 2: Format Parser + FieldTable Model - Research

**Researched:** 2026-07-03
**Domain:** Binary format parsing (.NET `BinaryWriter` framed serialization) — deterministic structural walk into a fresh-offset FieldTable + offset-free JSON view model
**Confidence:** HIGH (every layout claim verified empirically against the real committed fixture)

## Summary

Phase 2 parses a decompressed Melvor Idle 2 `.sav` into (1) a **FieldTable** — the sole home of byte offsets, re-derived on every load — and (2) an offset-free **JSON view model**. The genuine unknown coming in was "structural byte-walk vs marker-search-with-context-validation." I resolved it empirically by decompressing the committed fixture (`test/fixtures/test-fixture.sav`, **version 20**, 2,284,747 bytes) and probing every layer.

**The decisive finding:** the save is **fully self-describing framed serialization**. Entity data is `[int32 componentCount][component × count]`, and every component is `[string name][int32 dataSize][dataSize bytes]`. A structural walk lands **exactly** (delta 0, walked-count == declared-count) on **all 33 entities** and on the top-level entity list (33 entities consuming precisely to the 36-byte trailing ActionManager/RNG tail). This means a deterministic structural descent is feasible and robust for: `int32 version → SaveHeader → entity list → per-entity component list → Wallet component → Experience component`. The framing (`[string name][int32 size]`) also gives free **skip-ability** for untouched components/entities — satisfying Phase 4's byte-intact requirement.

**The one place structural descent stops being clean is the Bank `Inventory` component's item stacks**, because the Inventory is nested into named **tabs** (`"Tab 1"`, …), each with its own header. A naive contiguous stack walk covers only tab 0 (296 stacks) and then hits a tab boundary. The pragmatic, spec-endorsed answer — a **bounded marker-search + "6-bytes-before-the-length-prefix" + context-validation**, scoped to the Inventory component's byte region `[710, 20496)` — cleanly recovers **all 689 stacks across all tabs**.

**Primary recommendation:** Build a **structural component-walk parser** (version → header → entity list → component list) as the spine, and use **region-scoped marker-search+context-validation only for the Bank Inventory item stacks**. Locate currencies by matching the currency-ID string (`MelvorBase:GoldPieces`, `MelvorBase:SlayerCoins`) inside the structurally-parsed `Wallet` component — not by byte order. Produce the FieldTable in one pass; **derive** the view model from it by projection so offsets are structurally absent from the view-model type.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

> ⚠️ **D-01…D-04 are PROVISIONAL** — the user stepped away during discussion; Claude chose low-risk defaults. Safe to plan against; user should confirm/override at planning start. None are contradicted by this research (see note under each).

### Locked Decisions
- **Currency: wallet is authoritative, header is a mirror.** Only the Bank wallet int64(s) are ever the write target; the SaveHeader GP/SlayerCoins are read-only cosmetic snapshots. Mark them as such in both the FieldTable and view model so Phase 3 can never target the header. *(Verified: header GP 953,063,625 == wallet GoldPieces 953,063,625; header SlayerCoins 6,511 == wallet SlayerCoins 6,511 — they mirror.)*
- **Offsets live only in the FieldTable.** The JSON view model is offset-free by contract (SC-4). Re-parsing the same buffer must yield identical offsets (deterministic walk).
- **Context-validation is the anti-false-match guard** (SC-3): a candidate stack is valid only when the 7-bit length prefix equals the item-ID byte length AND quantity ∈ [0, 2,147,483,647]; a candidate ExperienceComponent is valid only when LevelCap/Level are in sane ranges following the double.
- **Version tolerance** (SC-5): unknown/newer version must warn-but-parse, not hard-fail. Fixture is version **20** (not 17 as older docs say).
- **In-place same-width edits only** (PROJECT). Entities Phase 2 does not deeply model must remain byte-intact for Phase 4's round-trip — never mutate or reorder their bytes.
- **Fail-loud, never silently corrupt** (Phase 1, extends here): malformed length prefixes / entity counts throw or warn-and-bound, never OOB-read or over-allocate.

### Claude's Discretion (research resolves / recommends)
- **Parsing strategy** — RESOLVED: structural component-walk spine + bounded marker-search for Inventory stacks (see Architecture Patterns).
- **`Walleta` / entity-boundary / `Experience` heuristics** — RESOLVED empirically (see Code Examples & the pinned offsets).
- **FieldTable ⇄ view-model API shape** — RECOMMENDED: one parse pass builds the FieldTable; view model is a pure projection (offsets structurally absent). See Pattern 4.
- **Currency distinction (GP vs Slayer Coins)** — RESOLVED: match by currency-ID string inside the `Wallet` component, not by order.
- **Untouched-entity handling** — Framed `[string name][int32 size]` layout makes untouched entities/components trivially skippable and byte-intact. Recommend enumerating entity IDs + retaining `{start,size}` spans (opaque) so Phase 4 can round-trip.

### Deferred Ideas (OUT OF SCOPE)
- **Friendly item/skill display names + icons** — needs a game-data name/icon source (new dependency). Deferred to Phase 5. View model shaped so an optional `name` field can be added later without rework. (D-02)
- **Richer read-only context** (full item metadata, per-entity detail beyond Bank/skills) — deferred. (D-01)
- **Varied real-save fixture corpus** (gamemodes, name lengths incl. non-ASCII, bank sizes) — user assembles; recommended before/during planning. Structure tests as a fixture-parameterized suite so more saves drop in with no rework. (D-04)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IO-01 | Load a `.sav`: Brotli-decompress (Phase 1 `decompress`) and parse the documented layout (version → SaveHeader → entity list), re-parsing offsets fresh on every load | Full structural walk verified: version@0, SaveHeader ends @150, 33-entity list consumes exactly to byte 2,284,711. Component walk lands delta-0 on all 33 entities. `BinaryReader` (Phase 1) is the cursor; offsets are computed fresh from `reader.offset`, never persisted. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decompress `.sav` → buffer | Pure core (`src/codec.ts`) | — | Phase 1 asset; Phase 2 consumes its output |
| Structural walk (version/header/entities/components) | Pure core (new parser module) | — | No Electron, no UI; pure fn `(Buffer) → {FieldTable, ViewModel}` |
| Offset derivation (FieldTable) | Pure core | — | Offsets are a parse-time artifact; live only here |
| View-model projection | Pure core | — | Derived from FieldTable; offset-free by type |
| Bounds/version guards | Pure core | — | Reuses `BinaryReader`'s native OOB/prefix throws |
| Consuming FieldTable to patch | Phase 3 (out of scope) | — | Phase 2 never writes |
| Rendering view model | Phase 5 (out of scope) | — | Phase 2 stops at the model |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node `Buffer` / `BinaryReader` (in-repo `src/binary-reader.ts`) | built-in / Phase 1 | Sequential LE reads (int32/int64-BigInt/double/bool/7-bit string) with native OOB + malformed-prefix throws | Already built, tested, coverage-gated in Phase 1. The parser is a consumer, not a re-implementer. |
| TypeScript | `6.0.x` (installed) | Model `FieldEntry` as a discriminated union `{offset, kind, width, value,…}` | Type system catches width/kind mistakes before they corrupt a save (CLAUDE.md rationale) |
| `node:test` + `c8` | built-in / `11.x` | Fixture-parameterized parser tests + 100% gate on the corruption-critical core | Phase 1 convention (D-01/D-04); mirror it |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | `4.23.x` (installed) | Run TS tests with no build step | Existing `npm test` = `tsx --test test/**/*.test.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Structural component-walk (hand-rolled on `BinaryReader`) | `restructure` / `binary-parser` declarative schema | CLAUDE.md **rejects** these for v1: they force full parse⇄serialize; Phase 2 needs in-place offsets over the original buffer, not re-serialization. No new dep. |
| Bounded marker-search for Inventory stacks | Full structural tab-model of the Inventory | Full tab-model is more code + more version-fragile; marker-search+validation is spec-endorsed and recovered all 689 stacks. Revisit only if a future save needs per-tab grouping in the UI. |

**Installation:** None. **Zero new runtime dependencies** — this phase is pure Node + the Phase 1 core (consistent with CLAUDE.md "no `brotli`/`iltorb`", "native Node", and D-02 "raw IDs, no name table").

## Package Legitimacy Audit

**No external packages are installed by this phase.** The parser is built entirely on Node built-ins (`Buffer`) and the in-repo Phase 1 `BinaryReader`/`codec`. Audit table is therefore empty.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 .sav bytes
    │
    ▼
[ decompress ]  (Phase 1 codec)  ──►  decompressed Buffer (2,284,747 B for fixture)
    │
    ▼
[ BinaryReader cursor ]  (Phase 1, stateful LE, throws on OOB / bad 7-bit prefix)
    │
    ▼
┌───────────────────────── STRUCTURAL WALK (deterministic) ─────────────────────────┐
│  int32 version ──► SaveHeader (uuid,16B; name; gamemode; ts; 4 active strings;      │
│                     totalLevel; GP mirror; SlayerCoins mirror)                       │
│        │                                                                            │
│        ▼  entity list: int32 count, then N×[string id][int32 size][size bytes]       │
│   for each entity ─► component list: int32 compCount, then                          │
│                      compCount×[string name][int32 size][size bytes]                 │
│        │                                                                            │
│        ├─ entity "…:Bank" ─► component "Wallet"  ─► [int32 n][ (int64 amt + string  │
│        │                                              currencyID) × n ]  (structural)│
│        │                    └► component "Inventory" region ──┐                      │
│        │                                                      ▼                      │
│        │                          BOUNDED MARKER-SEARCH within [invStart,invEnd):    │
│        │                          find "MelvorBase:" → prefix==len? → back 6 bytes → │
│        │                          [int32 qty][bool ph][bool lk] validated stack      │
│        │                                                                            │
│        └─ entity with component "Experience" (a skill) ─► [double XP][int32 Cap]     │
│                                                            [int32 Level]  (structural)│
└─────────────────────────────────────────────────────────────────────────────────────┘
    │                                              │
    ▼                                              ▼
 FieldTable  (offset, kind, width, value,     ViewModel  (version, summary, bank items,
  readOnly/authoritative, candidates?)          skills) — DERIVED, no offsets
    │                                              │
    ▼ (Phase 3 patcher)                            ▼ (Phase 5 UI)
```

### Recommended Project Structure
```
src/
├── binary-reader.ts     # Phase 1 (existing) — the cursor
├── codec.ts             # Phase 1 (existing) — decompress
├── save-parser.ts       # NEW: structural walk → { fieldTable, viewModel }
├── field-table.ts       # NEW: FieldEntry types + builder (offsets live here ONLY)
└── view-model.ts        # NEW: types + projection from FieldTable (offset-free)
test/
└── save-parser.test.ts  # NEW: fixture-parameterized suite (D-04)
```
*(Exact file split is planner discretion; the load-bearing rule is that the view-model TYPE has no `offset` field so SC-4 holds structurally.)*

### Pattern 1: Framed structural component walk (the spine)
**What:** Every entity's data is `[int32 componentCount]` then `componentCount ×` `[string name][int32 dataSize][dataSize bytes]`. Walk it with the `BinaryReader`; to skip an unmodeled component, `reader.seek(dataStart + dataSize)`.
**When to use:** version, SaveHeader, entity list, component list, Wallet, Experience — everything except Inventory item stacks.
**Why it's safe:** verified delta-0 on all 33 entities; declared count == walked count for every one. Cross-check `walkedComponents === componentCount` and `cursor === regionEnd` as a per-region integrity assertion (fail loud on mismatch).

### Pattern 2: Locate currencies by ID string, not by order
**What:** Inside the structurally-parsed `Wallet` component (`[int32 n][ (int64 amount + string currencyID) × n ]`), match `currencyID === "MelvorBase:GoldPieces"` for GP and `"MelvorBase:SlayerCoins"` for Slayer Coins.
**When to use:** currency resolution.
**Why:** the fixture wallet has **3** currencies in order GoldPieces, **PrayerPoints**, SlayerCoins — order is not stable/assumable. String-keying is robust and makes GP a **required** field (fail loud if absent, per D-03).

### Pattern 3: Bounded marker-search + context-validation for Inventory stacks
**What:** Within the `Inventory` component byte region `[invStart, invEnd)`, scan for `"MelvorBase:"`; for each hit, verify the byte before is the 7-bit length prefix and equals the full item-ID byte length; then read the stack at `hit − 1 − 6` as `[int32 qty][bool placeholder][bool locked]`; validate `qty ∈ [0, 2^31−1]`, `placeholder,locked ∈ {0,1}`.
**When to use:** item stacks only (Inventory is nested into named tabs; structural descent would require modeling tab headers).
**Why:** recovered all **689** stacks across tabs; each valid hit is a distinct field keyed by its own offset (multiple stacks of different items are not "ambiguity" — ambiguity per D-03 is one *logical* field resolving to >1 offset).

### Pattern 4: One-pass FieldTable, derived view model
**What:** The parse pass emits `FieldEntry[]` (a discriminated union on `kind`: `int32|int64|double|bool|string`, each carrying `offset`, `width`, `value`, and flags `readOnly`/`authoritative`/`candidates`). The view model is a pure function of the FieldTable + a small amount of structural context (entity IDs), projecting values into UI shape and **omitting offsets**.
**Why:** guarantees SC-4 by construction (the view-model type literally cannot hold an offset) and gives Phase 3 exactly `{offset, kind, width, value}` per writable field.

### Anti-Patterns to Avoid
- **Hard-coding the entity list.** The fixture contains `MelvorBase:Layout` — an entity **not** in the docs' "Known Entity IDs." Walk generically; treat "any entity with an `Experience` component" as a skill.
- **Assuming currency order** (GP first). PrayerPoints sits between GP and SlayerCoins.
- **Assuming header GP == wallet GP is coincidence to exploit.** They mirror in the fixture but the wallet is authoritative; never write the header.
- **Persisting or caching offsets across loads** (CONTEXT lesson + SC-4). Always re-derive from the freshly decompressed buffer.
- **Reading version, then trusting a hard-coded per-version layout.** The format is self-describing; the structural walk works without version-specific offsets. Version is a *warning* signal, not a layout key.
- **Treating the `.sav` bytes as fully trusted.** Bound every count/length before allocating/reading (see Security Domain).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LE primitive reads + 7-bit string + OOB/prefix guards | A second reader | Phase 1 `BinaryReader` | Already coverage-gated; re-implementing risks a divergent bug in corruption-critical code |
| Brotli decompress | Anything | Phase 1 `decompress` | Done, bomb-capped |
| Declarative parse⇄serialize | `restructure`/`binary-parser` | Structural walk over original buffer | CLAUDE.md rejects for v1 (re-serialization = corruption risk); Phase 2 needs offsets, not re-encoding |
| BigInt for int64 currency | `Number` | `readInt64()` → `bigint` | GP/SC are int64 (quintillion-scale); `Number` loses precision > 2^53 |

**Key insight:** The single highest-leverage move is recognizing the save is **framed** (`[string name][int32 size]` everywhere). That turns "reverse-engineer offsets" into "walk a tree" and gives byte-intact skip for free.

## Runtime State Inventory

Not applicable — greenfield parsing feature, no rename/refactor/migration. No stored data, live-service config, OS-registered state, secrets, or build artifacts are touched. (Verified: this phase only reads a decompressed buffer in-memory.)

## Common Pitfalls

### Pitfall 1: Contiguous stack walk stops at a tab boundary
**What goes wrong:** Walking Inventory stacks as one flat contiguous array yields only tab-0 stacks (296 of 689 in the fixture), silently under-reporting the bank.
**Why:** the Inventory is `[tab header][stacks…][string "Tab 1"][tab header][stacks…]…`.
**How to avoid:** use bounded marker-search across the whole Inventory region (Pattern 3), or fully model tabs. Marker-search recovered all 689.
**Warning signs:** stack count suspiciously low; a walk that "ends early" but not at `invEnd`.

### Pitfall 2: `"Walleta"` is a phantom marker
**What goes wrong:** searching for the literal bytes `Walleta` (from the docs) as the anchor.
**Why:** the real component name is the 6-char string `"Wallet"`; the trailing `a` (0x61) the docs saw is the low byte of the **`int32 dataSize = 97`** (0x00000061) that frames the component. There is no `Walleta` string.
**How to avoid:** parse `Wallet` structurally as a framed component; don't byte-match `Walleta`.

### Pitfall 3: Over-allocating on a malformed count/length
**What goes wrong:** reading a corrupt `int32 componentCount` or entity count (e.g. 2^31) and looping/allocating on it → OOM/hang (SC-5).
**Why:** untrusted-ish file bytes drive loop bounds.
**How to avoid:** bound every count against the enclosing region (`count` iterations must not read past `regionEnd`; a component/entity `size` must satisfy `dataStart + size <= regionEnd`). The `BinaryReader` already throws on OOB reads and on 7-bit prefixes > 5 bytes; let those propagate and add explicit region-bound checks before trusting a count. Fail loud.

### Pitfall 4: Non-ASCII / variable-length header fields shifting offsets
**What goes wrong:** hard-coding SaveHeader field offsets (they depend on CharacterName/Gamemode/active-string lengths).
**Why:** fixture name "Bob" (3B) makes header end at 150; a longer/UTF-8 name moves everything.
**How to avoid:** never hard-code post-string offsets; always read strings with the `BinaryReader` and use the resulting cursor. (This is exactly why D-04's varied corpus — non-ASCII names — strengthens validation.)

### Pitfall 5: Writing LevelCap or targeting the wrong int
**What goes wrong:** in the `[double XP][int32 LevelCap][int32 Level]` triple, patching cap or confusing cap/level.
**Why:** two adjacent int32s.
**How to avoid:** record XP offset (double, +0), LevelCap offset (+8, mark `readOnly`), Level offset (+12) distinctly in the FieldTable. Context-validate `1 ≤ cap ≤ ~200` and `1 ≤ level ≤ cap` before accepting the triple.

## Code Examples

> All examples are TypeScript sketches over the Phase 1 `BinaryReader`. Offsets/values below are the **verified** fixture numbers.

### Structural component walk (verified delta-0 on all 33 entities)
```typescript
// Source: empirical (scratchpad probe8.mjs), fixture test-fixture.sav v20
interface Component { name: string; dataStart: number; size: number; }
function walkComponents(r: BinaryReader, entityStart: number, entitySize: number): Component[] {
  const end = entityStart + entitySize;
  r.seek(entityStart);
  const count = r.readInt32();            // e.g. Bank=8, Woodcutting=10, Attack=2
  const comps: Component[] = [];
  for (let i = 0; i < count; i++) {
    const name = r.readString();          // "Wallet", "Experience", "Inventory", …
    const size = r.readInt32();
    if (size < 0) throw new RangeError(`component ${name}: negative size`);
    const dataStart = r.offset;
    if (dataStart + size > end) throw new RangeError(`component ${name}: overflows entity region`);
    comps.push({ name, dataStart, size });
    r.seek(dataStart + size);             // skip payload — untouched components stay byte-intact
  }
  if (r.offset !== end) throw new RangeError('component walk did not consume entity region exactly');
  return comps;
}
```

### Wallet: currency-by-ID (fixture: GoldPieces@20511=953063625, SlayerCoins@20573=6511)
```typescript
// Wallet component dataStart=20507, size=97: [int32 count=3][ (int64 amount + string id) × 3 ]
function parseWallet(r: BinaryReader, dataStart: number): Map<string, {amountOffset: number; value: bigint}> {
  r.seek(dataStart);
  const n = r.readInt32();                        // 3
  const out = new Map<string, {amountOffset: number; value: bigint}>();
  for (let i = 0; i < n; i++) {
    const amountOffset = r.offset;               // FieldTable offset for this currency
    const value = r.readInt64();                 // bigint
    const currencyId = r.readString();           // "MelvorBase:GoldPieces" | "…:PrayerPoints" | "…:SlayerCoins"
    out.set(currencyId, { amountOffset, value });
  }
  return out;
}
// GP := out.get('MelvorBase:GoldPieces')  — REQUIRED; if absent → fail loud (D-03)
// SlayerCoins := out.get('MelvorBase:SlayerCoins') — authoritative write target
```

### Experience component (fixture Woodcutting: XP@47405=7,439,645.2, Cap@47413=120, Level@47417=93)
```typescript
// Experience component dataStart, size=16: [double XP][int32 LevelCap][int32 Level]
function parseExperience(r: BinaryReader, dataStart: number, size: number) {
  if (size < 16) throw new RangeError('Experience component too small');
  r.seek(dataStart);
  const xpOffset = r.offset;   const xp = r.readDouble();
  const capOffset = r.offset;  const levelCap = r.readInt32();
  const levelOffset = r.offset; const level = r.readInt32();
  if (!(levelCap >= 1 && levelCap <= 200 && level >= 1 && level <= levelCap && Number.isFinite(xp) && xp >= 0))
    throw new RangeError('Experience failed context-validation');
  return { xpOffset, xp, capOffset, levelCap, levelOffset, level };
  // FieldTable: xp(double,+0) writable; levelCap(int32,+8) readOnly; level(int32,+12) writable
}
```

### Bounded item-stack recovery (fixture: 689 valid stacks in Inventory [710,20496))
```typescript
// Inventory component: dataStart=710, size=19786 → region [710, 20496). Stacks nested in tabs.
function findStacks(buf: Buffer, invStart: number, invEnd: number) {
  const needle = Buffer.from('MelvorBase:', 'utf8');
  const stacks: { qtyOffset: number; itemId: string; qty: number; placeholder: boolean; locked: boolean }[] = [];
  let idx = invStart;
  while (true) {
    idx = buf.indexOf(needle, idx); if (idx === -1 || idx >= invEnd) break;
    const prefixByte = buf.readUInt8(idx - 1);
    // read the full 7-bit string starting at the prefix byte via a scoped BinaryReader
    const r = new BinaryReader(buf); r.seek(idx - 1);
    const itemId = r.readString();
    const idByteLen = Buffer.byteLength(itemId, 'utf8');
    if (prefixByte === idByteLen && r.offset <= invEnd) {          // 7-bit prefix == ID byte length (SC-3)
      const qtyOffset = idx - 1 - 6;                                // 4 qty + 1 placeholder + 1 locked
      if (qtyOffset >= invStart) {
        const qty = buf.readInt32LE(qtyOffset);
        const placeholder = buf.readUInt8(qtyOffset + 4);
        const locked = buf.readUInt8(qtyOffset + 5);
        if (qty >= 0 && placeholder <= 1 && locked <= 1)            // qty ∈ [0, 2^31-1], bools valid
          stacks.push({ qtyOffset, itemId, qty, placeholder: !!placeholder, locked: !!locked });
      }
    }
    idx += 1;
  }
  return stacks;   // 689 for the fixture
}
```

### Verified fixture reference values (for test assertions)
| Field | Offset | Value |
|-------|--------|-------|
| Save version (int32) | 0 | 20 |
| CharacterName | 20 (prefix) | "Bob" |
| Gamemode | — | "Test" |
| TotalLevel (int32) | — | 1366 |
| Header GP (int64, mirror) | — | 953,063,625 |
| Header SlayerCoins (int64, mirror) | — | 6,511 |
| Entity list start | 150 | count = 33 |
| Bank entity | start 692 | size 37,764 |
| Wallet component | dataStart 20,507 | size 97, count 3 |
| Wallet GoldPieces (int64) | 20,511 | 953,063,625 |
| Wallet SlayerCoins (int64) | 20,573 | 6,511 |
| Inventory component region | [710, 20,496) | 689 valid stacks |
| Woodcutting Experience | dataStart 47,405 | XP 7,439,645.2 / Cap 120 / Level 93 |
| Decompressed length | — | 2,284,747 |

## State of the Art

| Old Approach (docs `current-skill.md`) | Current Approach (this research) | Why |
|--------------|------------------|--------|
| Search for `Walleta` marker + `dec.index(gp_bytes)` on the GP value | Structurally parse the `Wallet` component; key currencies by ID string | `Walleta` is a phantom (it's `Wallet` + low byte of the int32 size). Value-search fails if two currencies share a value or the value is 0 |
| Version 17 (Alpha 0.9.1) | Version 20 (fixture) | Format bumped; structural walk is version-agnostic so it still parses |
| Docs "Known Entity IDs" list | Walk entities generically | Fixture has `MelvorBase:Layout`, not in the list |
| Item stack via global `dec.find(item_bytes)` | Region-scoped to Inventory component + validate | Bounds the search (SC-3/SC-5) and avoids matching item IDs elsewhere |

**Deprecated/outdated:** the `Walleta` literal and the version-17 assumption in `docs/current-skill.md` (kept as historical spec; superseded by the verified numbers above).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The framed structural walk holds across **other** gamemodes / name-lengths / bank sizes (only the single v20 fixture was available) | Architecture / Summary | LOW — the format is self-describing; the walk asserts count==walked and cursor==regionEnd and fails loud if a variant differs. D-04 corpus would upgrade this to VERIFIED. |
| A2 | `LevelCap ≤ 200` and `Level ≤ LevelCap` are safe context-validation bounds (fixture caps are 120) | Pitfall 5 / Experience | LOW — a future higher cap would need the bound raised; it only affects validation strictness, not offset derivation. |
| A3 | "Skill" == "entity containing an `Experience` component" (Combat also has one) | Anti-Patterns | LOW — worst case Combat surfaces as an XP-bearing entity in the view model; harmless and arguably correct. Planner may filter by an allow-list if undesired. |
| A4 | Header GP/SC are always mirrors of wallet values | Currency | LOW — even if they diverge, the locked decision is wallet-authoritative; header is never written regardless. |

**Note:** No package/version/security claims are assumed — this phase adds no dependencies.

## Open Questions

1. **Multi-currency wallets in other gamemodes**
   - What we know: fixture wallet = {GoldPieces, PrayerPoints, SlayerCoins}. Currency-by-ID handles any set.
   - What's unclear: whether some gamemode omits GoldPieces (making the "GP required → fail loud" rule fire on a legitimate save).
   - Recommendation: treat GP as required per D-03, but make the failure message actionable ("no GoldPieces currency in Wallet"); revisit if a real save legitimately lacks GP.

2. **Should the Bank Inventory be modeled per-tab now or later?**
   - What we know: tabs exist (`"Tab 1"`); marker-search recovers all stacks without modeling them.
   - What's unclear: whether Phase 5's browse UI wants tab grouping.
   - Recommendation: Phase 2 returns a flat validated stack list (sufficient for BROWSE-02/EDIT-02); defer tab grouping to Phase 5. Note it in the view model's shape so it can be layered later (mirrors the D-02 name-field approach).

3. **Duplicate item IDs across tabs**
   - What we know: each stack is a distinct offset; the same item can appear in two tabs.
   - Recommendation: key stacks by offset (not by item ID) in the FieldTable; the view model may list duplicates or the planner may decide a merge policy. This is NOT the D-03 ambiguity case (that's one logical field → many offsets).

## Environment Availability

Skipped — this phase has no external tool/service/runtime dependencies beyond Node (already present) and the in-repo Phase 1 core. No CLIs, databases, or network services are used.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` via `tsx` (Phase 1 convention D-01) |
| Config file | none — `package.json` script `tsx --test test/**/*.test.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` (add `npx c8 --100 npm test` for the coverage gate) |

### Phase Requirements → Test Map
| Req / SC | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IO-01 / SC-1 | Parsing fixture yields version 20, summary (name "Bob", gamemode "Test", GP 953063625, SC 6511, totalLevel 1366) | unit | `npm test` (save-parser.test.ts) | ❌ Wave 0 |
| SC-1 | Full bank item list: 689 stacks, spot-check NormalLog qty=48652 etc. | unit | `npm test` | ❌ Wave 0 |
| SC-1 | Every skill's XP+Level+LevelCap (Woodcutting XP 7439645.2 / cap120 / lvl93) | unit | `npm test` | ❌ Wave 0 |
| SC-2 | Wallet int64 authoritative; header GP/SC marked read-only mirror (never a write target) | unit (assert FieldTable flags) | `npm test` | ❌ Wave 0 |
| SC-3 | Context-validation: 7-bit prefix == ID byte length; qty ∈ [0,2^31-1]; level/cap sane; ambiguous match surfaced not auto-picked | unit (crafted buffers) | `npm test` | ❌ Wave 0 |
| SC-4 | Re-parse same buffer → identical offsets; view model contains **no** offsets (type-level + runtime scan) | unit | `npm test` | ❌ Wave 0 |
| SC-5 | Malformed/oversized length prefix + giant entity/component count → bounded throw (no OOB, no giant alloc); unknown version warns-but-parses | unit (crafted buffers + version bump) | `npm test` | ❌ Wave 0 |
| Determinism | Component walk consumes each entity region exactly (count==walked, cursor==end) for all 33 entities | unit | `npm test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npx c8 --100 npm test` (100% gate on the parser core, per D-04)
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/save-parser.test.ts` — fixture-parameterized suite (D-04) covering IO-01 + SC-1..SC-5
- [ ] Test helpers for **crafted malformed buffers** (oversized 7-bit prefix, giant count, truncated region) — SC-5 negative tests
- [ ] A "view model has no offsets" assertion helper (recursively scan for numeric `offset` keys) — SC-4
- [ ] Decide whether to add a second real fixture (D-04) before locking the suite shape

## Security Domain

`security_enforcement: true`, ASVS level 1. The `.sav` is user-supplied binary; even though it's the user's own file, malformed/crafted input must not crash-hang or OOB-read (SC-5 = the security control).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | local single-user tool, no auth |
| V3 Session Management | no | no sessions |
| V4 Access Control | no | no multi-user surface |
| V5 Input Validation | **yes** | Bound every parsed count/length before looping/allocating; context-validate stacks & experience; reject negative sizes. Reuse `BinaryReader`'s native OOB + 7-bit-prefix throws. Fail loud. |
| V6 Cryptography | no | format is Brotli-compressed, not encrypted (PROJECT: nothing to defeat) |

### Known Threat Patterns for `.sav` parsing
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Giant `int32` entity/component/currency count → unbounded loop/alloc | Denial of Service | Bound count so iterations cannot read past `regionEnd`; assert `dataStart+size ≤ regionEnd` before trusting a size |
| Malformed 7-bit length prefix (>5 bytes) → wrapped length / huge read | DoS / Tampering | `BinaryReader.readString` already throws on shift ≥ 35 and on declared-length > remaining buffer (Phase 1 T-1-02) — let it propagate |
| Region size that overruns the entity/buffer | Tampering | Explicit `dataStart + size > end` check → throw (Pattern 1) |
| Decompression bomb (upstream) | DoS | Phase 1 `decompress` cap (256 MiB) already mitigates |
| Silent under-parse (tab boundary, wrong offset) producing a wrong-but-plausible model | Tampering | Integrity asserts: count==walked, cursor==regionEnd; fail loud instead of emitting a silently-wrong model (D-03 zero-match rule) |

## Sources

### Primary (HIGH confidence)
- **Empirical fixture probes** (`scratchpad/probe*.mjs` against `test/fixtures/test-fixture.sav` v20) — decompressed via `node:zlib` (same params as Phase 1 `codec`); verified: version, SaveHeader walk, 33-entity list (delta-0), per-entity component walk (delta-0, count==walked for all 33), Wallet structure + currency-by-ID, Inventory 689-stack recovery + tab boundary, Experience `[double][int32][int32]` triple. `[VERIFIED: fixture probe]`
- `src/binary-reader.ts`, `src/codec.ts` (in-repo, Phase 1) — the reader/decompressor the parser consumes. `[VERIFIED: codebase]`
- `docs/current-skill.md` (in-repo authoritative spec) — layout, primitives, editing recipes. Cross-checked against the fixture; corrections noted in State of the Art. `[CITED: docs/current-skill.md]`

### Secondary (MEDIUM confidence)
- `.claude/CLAUDE.md`, `.planning/REQUIREMENTS.md`, `02-CONTEXT.md`, `01-CONTEXT.md` — constraints, requirement IO-01, provisional decisions. `[CITED]`

### Tertiary (LOW confidence)
- None — all layout claims are empirically verified against the real save.

## Project Constraints (from CLAUDE.md)
- Electron + TypeScript, but **Phase 2 is pure core** (no Electron yet) — parser must be portable TS (no Node-only APIs beyond `Buffer`, which is fine).
- **In-place same-byte-width edits only** — Phase 2 only reads, but must record offsets/widths that make same-width patching possible (Phase 3).
- **Native Node, zero new deps** — no `brotli`/`iltorb`, no schema libs (`restructure`/`binary-parser` explicitly rejected for v1), no name table (D-02).
- **`BigInt` for int64** GP/SlayerCoins — never `Number` (precision).
- **Strict TS + `noUncheckedIndexedAccess`** — prefer `BinaryReader` methods over raw `buf[i]` indexing; explicit bounds checks over relaxing the flag.
- **`node:test` + `c8` 100% gate** on corruption-critical core.
- **Fail loud, never silently corrupt.**
- **Offsets re-parsed fresh every load, never persisted.**

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all built on verified Phase 1 core.
- Architecture (structural walk + bounded stack search): HIGH — delta-0 verified on all 33 entities; 689 stacks recovered; single fixture (A1 caveat) is the only reason it's not "absolute."
- Pitfalls: HIGH — each pitfall was observed empirically (phantom `Walleta`, tab boundary at stack 296, version 20 vs 17, `Layout` entity).

**Research date:** 2026-07-03
**Valid until:** stable format assumptions ~30 days; re-verify offsets if a new game version (>20) save is introduced — the structural walk should still hold, but the verified reference numbers are fixture-specific.
