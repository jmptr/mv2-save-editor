# Phase 3: Patcher + Validation + XP Table - Research

**Researched:** 2026-07-04
**Domain:** Same-width in-place binary patching, pre-write range validation, StandardExperienceTable (XP↔Level), self-verifying re-parse/diff
**Confidence:** HIGH (pure-core phase; every claim grounded in in-repo code + the in-repo authoritative spec, verified by executing the XP algorithm)

<user_constraints>
## User Constraints (from CONTEXT.md)

> **NOTE:** The four decisions below are **provisional** ("you decide" — user proceeded straight to planning). They are safe to plan against; the user can confirm/override at the start of planning or execution. Where a provisional default is technically problematic, this research flags it explicitly (see D-02 clamp and D-04 conflict notes below and the Assumptions Log).

### Locked Decisions

- **D-01 — collect-all-then-write, atomic:** Validate **every** edit first; if any fail, throw a typed error enumerating **all** violations (fieldKey + reason) and write **nothing**. The input buffer is never partially patched. All-or-nothing.
- **D-02 — Level is the primary knob; snap XP to table minimum; direct XP allowed:**
  - Setting **Level = L** writes Level=L and XP = `StandardExperienceTable[L]` (exact minimum XP for L; no partial-level XP preserved).
  - Direct **XP edits allowed**: writing raw XP recomputes Level = highest L where `table[L] <= XP` (clamped to LevelCap).
  - **LevelCap is readOnly** — never patched. Level clamped `1..LevelCap`; XP clamped to `table[LevelCap]` max.
- **D-03 — engine self-verifies by default:** After writing, re-parse the patched buffer and diff against the pre-patch parse; assert only intended FieldTable offset ranges changed and `output.length === input.length`. Any unintended change → throw (return the error, not the buffer). Also exercised at test level (SC-4), but production correctness does not depend on tests.
- **D-04 — batch of `{fieldKey, newValue}` → `{buffer, changeReport}`:** Input is the parsed FieldTable + edits keyed by resolved field keys (`wallet.GoldPieces`, `skill.<id>.level`, `bank.inventory.<itemId>@<offset>`) with new values in the field's native runtime type (bigint for int64, number for int32/double). Returns a **new Buffer** (never mutates input) plus a **change report** (per-edit: fieldKey, old→new, offset, width).

### Claude's Discretion

- **StandardExperienceTable implementation** — precompute 1..120 array at module load vs compute-on-demand; float handling to hit the milestones. (Resolved below: precompute; see §XP Table.)
- **Where the patcher reads field metadata** — reuse Phase 2 `FieldTable {offset, kind, width, value, readOnly, authoritative, mirrors}` directly; map edits to entries by key. (Resolved: reuse verbatim.)
- **BinaryWriter reuse** — how the patch engine drives same-width LE writes. (Resolved below: do **NOT** use BinaryWriter; use a Buffer copy + `writeXxxLE(value, offset)`. See §Same-Width Write Mechanics.)
- **Diff mechanism for SC-4** — whole-buffer byte diff vs asserting declared offset ranges. (Resolved: whole-buffer byte diff, stronger; see §SC-4 Self-Verify.)

### Deferred Ideas (OUT OF SCOPE)

- Byte-width-changing edits / region-size-prefix recomputation / byte insertion (v2 per CLAUDE.md).
- Any editing UI, preview rendering, item/skill name resolution (Phase 5).
- Editing LevelCap; adding new skills/items.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAFE-01 | Validate every edited value against its type/range before writing (int32 ≤ 2,147,483,647 and ≥ 0; int64 currency within range; Level 1..LevelCap; finite non-negative XP) | §Pre-Write Validation defines exact bounds per FieldKind, the collect-all-then-write batch contract (D-01), and a typed error hierarchy carrying all violations |
| EDIT-04 | Set a skill by target Level; auto-compute XP from StandardExperienceTable; keep XP and Level consistent | §XP Table gives the verified reference algorithm (executed — reproduces L50/L99/L120 exactly), and §XP↔Level Coupling defines Level→XP snap and XP→Level derivation |
</phase_requirements>

## Summary

This is a **pure-core, headless** phase that adds a patch engine on top of Phase 1/2. There is **no new dependency** and **no UI**. Everything the phase needs already exists in-repo: the `FieldTable` (offset/kind/width/value + readOnly/authoritative/mirrors flags) is the patcher's input metadata, `parseSave` is reused verbatim for the self-verifying re-parse, and Node's `Buffer.writeInt32LE / writeBigInt64LE / writeDoubleLE` cover every write primitive. The three highest-value findings are: (1) the StandardExperienceTable algorithm in `docs/current-skill.md` is **verified correct** — executed in this session it reproduces the SC-locked milestones L50=101,331, L99=13,034,427, L120=104,273,162 exactly; (2) `BinaryWriter` is the **wrong tool** for this phase — it is an append-only growable cursor, not an at-offset patcher, so same-width in-place writes must go through a `Buffer.from(input)` copy plus `writeXxxLE(value, offset)`, which makes `output.length === input.length` (SC-1) hold by construction; (3) the self-verifying write (D-03) is best implemented as a **whole-buffer byte diff** between the pre-patch copy and post-patch buffer, asserting every differing byte falls inside an intended field's `[offset, offset+width)` range.

Two provisional defaults have technical wrinkles worth surfacing to the planner. D-02's "clamp XP to `table[LevelCap]` max" silently modifies user input, which conflicts with the project-wide fail-loud stance — recommend **rejecting** an over-cap XP with a typed range error (or clamp-and-record-in-changeReport) rather than a silent clamp. D-04's batch is keyed at field granularity, but a "set skill by Level" edit writes **two** fields (level + xp); if a single batch sets both `skill.<id>.level` and `skill.<id>.xp` for the same skill, that is a conflicting intent and should be **rejected fail-loud**, not silently resolved.

**Primary recommendation:** Build `patchSave(buffer, fieldTable, edits) → { buffer, changeReport }` as a pure function: (1) resolve each edit to its FieldEntry by key, rejecting unknown keys and readOnly targets; (2) validate every value against its FieldKind bounds, collecting all violations (D-01); (3) if clean, `Buffer.from(buffer)` and write each field with `writeXxxLE(value, offset)`, expanding skill level/xp edits into their coupled pair via a precomputed 120-entry XP table; (4) self-verify via whole-buffer diff + re-parse (D-03); (5) return the new buffer + change report. Use hand-rolled typed errors extending the existing fail-loud pattern — **not** Zod (no runtime deps in the core).

## Architectural Responsibility Map

This phase is a single pure-TS module in the format core; there are no client/server/CDN tiers. "Tier" here means the correctness layer that owns each capability.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Resolve edit key → FieldEntry (offset/kind/width) | Patch engine (new) | Phase 2 FieldTable | FieldTable is the sole home of offsets (SC-4); patcher never re-derives offsets, only reads them by key |
| Pre-write range/type validation | Patch engine (new) | — | SAFE-01; belongs at the write boundary, before any byte changes |
| int64/int32/double LE at-offset write | Node `Buffer` (built-in) | — | `writeBigInt64LE/writeInt32LE/writeDoubleLE` are LE and length-neutral; no library needed |
| XP↔Level computation | StandardExperienceTable (new) | — | EDIT-04; pure numeric module, precomputed at load |
| Self-verify (re-parse + diff) | Patch engine (new) | Phase 2 `parseSave`, Phase 1 `codec` | Reuses the parser verbatim; the buffer→loadable-`.sav` round-trip closes via codec |
| Loadable-`.sav` emission | Phase 4 (out of scope) | Phase 1 `codec` | This phase emits a decompressed buffer; recompress/file-write is Phase 4 |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node `Buffer` (built-in) | Node 22/24 core | `Buffer.from(input)` copy + `writeInt32LE / writeBigInt64LE / writeDoubleLE(value, offset)` for at-offset same-width writes | `[VERIFIED: in-repo src/binary-writer.ts uses these exact LE APIs]` Length-neutral, LE, zero deps — copying then overwriting fixed-width fields cannot change buffer length (SC-1 by construction) |
| Existing `src/field-table.ts` | in-repo | `FieldTable` / `FieldEntry {offset, kind, width, value, readOnly?, authoritative?, mirrors?}` — the patcher's input metadata; `ParseError` / `RequiredFieldMissingError` base classes | `[VERIFIED: read src/field-table.ts]` Already carries everything the patcher needs; no new model |
| Existing `src/save-parser.ts` | in-repo | `parseSave(buffer) → {fieldTable, viewModel}` reused verbatim for the D-03 self-verifying re-parse | `[VERIFIED: read src/save-parser.ts]` Deterministic re-parse (SC-4 in Phase 2) is exactly the self-verify primitive |
| Existing `src/codec.ts` | in-repo | Brotli decompress/recompress for the round-trip test (buffer → loadable `.sav`) | `[VERIFIED: referenced by test/helpers/fixture.ts]` Closes the loop in tests; production recompress is Phase 4 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| New `src/experience-table.ts` (module) | in-repo (to build) | Precomputed 1..120 StandardExperienceTable + `xpForLevel(L)` + `levelForXp(xp, cap)` | EDIT-04; the single verified source of the XP↔Level mapping |
| New `src/patcher.ts` (module) | in-repo (to build) | The `patchSave` engine + typed patch errors | The deliverable |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Buffer.from(copy)` + `writeXxxLE(v, offset)` | `BinaryWriter` (src/binary-writer.ts) | **Rejected.** `BinaryWriter` is append-only from cursor 0 and grows on demand — it builds a buffer sequentially, it does **not** write at an arbitrary offset. Using it for in-place patching would require re-serializing the whole 2.28 MB save (the very byte-insertion risk CLAUDE.md forbids). Direct at-offset `Buffer` writes are simpler, LE, and length-preserving. |
| Hand-rolled typed validation | Zod (`3.x`/`4.x`, listed in CLAUDE.md as *optional*) | **Rejected for this phase.** The core has zero runtime deps (Phase 1/2 established `T-02-SC: no packages installed`). The collect-all-then-write batch contract (D-01) with domain-specific typed errors is cleanly hand-rolled and stays consistent with the existing `ParseError` fail-loud pattern. Reconsider Zod in Phase 5 for renderer input parsing. |
| Precompute XP table at load | Compute-on-demand per call | Precompute chosen — 120 doubles, computed once, O(1) lookups; the table is a closed input set (1..120) so caching is trivially correct. |

**Installation:**
```bash
# None. This phase adds no dependencies — pure Node core + existing in-repo modules.
```

**Version verification:** N/A — no external packages. Node core `Buffer.writeBigInt64LE/writeInt32LE/writeDoubleLE` are long-stable and already in use in `src/binary-writer.ts`.

## Package Legitimacy Audit

**No external packages are installed in this phase.** It is pure Node core (`Buffer`) plus existing in-repo modules (`field-table.ts`, `save-parser.ts`, `codec.ts`, `binary-reader.ts`). The legitimacy gate is therefore not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    caller (Phase 4 main process, later)
                              │
     decompressed Buffer ─────┤────── edits: [{ fieldKey, newValue }]  (D-04)
                              ▼
                     ┌──────────────────┐
                     │   patchSave(...)  │
                     └──────────────────┘
                              │
        1. RESOLVE  ──────────┤   for each edit → fieldTable.get(key)
                              │      • unknown key      → PatchError (collected)
                              │      • readOnly target  → PatchError (collected)   (LevelCap, header mirrors)
                              │      • skill.level edit  → expand to {level, xp} pair via experience-table
                              │      • skill.xp edit     → expand to {xp, level} pair via experience-table
                              ▼
        2. VALIDATE ──────────┤   per resolved write, check bounds by kind (SAFE-01)
                              │      collect ALL violations
                              │      any violation? → throw ValidationError{ violations[] }  (D-01: write nothing)
                              ▼
        3. WRITE  ────────────┤   out = Buffer.from(input)          (copy — never mutate input)
                              │      out.writeInt32LE / writeBigInt64LE / writeDoubleLE(value, offset)
                              │      (same width → out.length === in.length, SC-1)
                              ▼
        4. SELF-VERIFY ───────┤   whole-buffer diff(in, out): every differing byte ∈ an intended
              (D-03)          │      field's [offset, offset+width)?  else → UnintendedChangeError
                              │      re-parse(out) via parseSave → confirms still-parseable + values read back
                              ▼
                     { buffer: out, changeReport: [{ fieldKey, old, new, offset, width }] }
                              │
                              └───────→ (Phase 4) codec.compress → new .sav file
```

### Recommended Project Structure
```
src/
├── experience-table.ts   # StandardExperienceTable: precomputed 1..120, xpForLevel, levelForXp
├── patcher.ts            # patchSave engine + typed patch/validation errors + change report types
├── field-table.ts        # (existing) FieldEntry metadata + ParseError base — consumed, not modified
├── save-parser.ts        # (existing) parseSave — reused verbatim for self-verify
├── binary-writer.ts      # (existing) NOT used for at-offset patching (see Anti-Patterns)
└── codec.ts              # (existing) Brotli round-trip — used by tests
test/
├── experience-table.test.ts   # milestone fixtures (L50/L99/L120) + full-table snapshot + monotonic
└── patcher.test.ts            # SC-1..SC-4 against the committed fixture
```

### Pattern 1: Same-width at-offset patch on a buffer copy
**What:** Copy the input buffer, overwrite fixed-width fields in place at their FieldEntry offset.
**When to use:** Every write in this phase.
**Example:**
```typescript
// Source: in-repo src/binary-writer.ts uses the same LE Buffer APIs (writeBigInt64LE etc.)
function applyWrite(out: Buffer, entry: FieldEntry, value: bigint | number): void {
  switch (entry.kind) {
    case 'int64':  out.writeBigInt64LE(value as bigint, entry.offset); break; // 8B, GP/SC
    case 'int32':  out.writeInt32LE(value as number, entry.offset);    break; // 4B, qty/level
    case 'double': out.writeDoubleLE(value as number, entry.offset);   break; // 8B, XP
    default: throw new PatchError(`unsupported kind for write: ${entry.kind}`);
  }
  // width never changes → out.length is untouched (SC-1 holds by construction)
}
// out = Buffer.from(input) BEFORE any applyWrite; input is never mutated (D-04).
```

### Pattern 2: StandardExperienceTable (precomputed, verified)
**What:** The exact algorithm from `docs/current-skill.md` §XP Table, ported 1:1 to JS. Executed in this session — reproduces L50/L99/L120 exactly.
**When to use:** All XP↔Level conversion (EDIT-04).
**Example:**
```typescript
// Source: docs/current-skill.md §"XP Table (StandardExperienceTable)" (lines 183-201)
// VERIFIED by execution this session: L50=101331, L99=13034427, L110=38737657, L120=104273162
function buildXpTable(maxLevel = 120): number[] {
  const base = Math.pow(2.0, 1.0 / 7.0); // 2^(1/7)
  let xpSum = 0.0;
  const table = [0.0];                    // level 1 = 0 XP; table[L-1] = min XP for level L
  for (let i = 1; i < maxLevel; i++) {
    xpSum += Math.floor(i + 300.0 * Math.pow(base, i)); // exponent_scaling=300.0
    table.push(Math.floor(0.25 * xpSum));               // scaling=0.25
  }
  return table;
}
const XP_TABLE = buildXpTable(120);        // precompute once at module load

// EDIT-04: target Level → min XP (snap). Level is 1..cap.
export function xpForLevel(level: number): number { return XP_TABLE[level - 1]!; }

// EDIT-04: raw XP → highest level whose min XP ≤ xp, clamped to cap.
export function levelForXp(xp: number, levelCap: number): number {
  let lvl = 1;
  for (let L = 1; L <= levelCap && L <= XP_TABLE.length; L++) {
    if (XP_TABLE[L - 1]! <= xp) lvl = L; else break; // table is monotonic
  }
  return lvl;
}
```
**Float note:** JS `number` **is** IEEE-754 double, identical to the Python `float` in the spec — no BigInt needed (max value ~104M ≪ 2^53). The two `Math.floor` calls and the **cumulative** `xpSum` (never a closed form) are load-bearing: floor at each step, then floor `0.25 * xpSum`. Reproduce the loop exactly; do not "optimize" into a closed form.

### Anti-Patterns to Avoid
- **Driving `BinaryWriter` to patch at an offset:** It writes sequentially from cursor 0 and grows — it cannot target `entry.offset` without re-serializing the whole save (byte-insertion risk CLAUDE.md forbids). Use `Buffer.from(copy)` + `writeXxxLE(v, offset)`.
- **Using `Number` for int64 currency:** Precision loss above 2^53 (CLAUDE.md, threat T-02-06). Currency edits take/return `bigint`; write with `writeBigInt64LE`.
- **Closed-form XP formula:** The spec is an accumulated sum with per-step flooring; a closed form drifts from the milestones.
- **Silent clamp of out-of-range input:** D-02 says clamp XP to `table[cap]`; this contradicts the fail-loud project stance. Prefer rejecting (see Assumptions Log A1).
- **Partial write on validation failure:** D-01 requires all-or-nothing; never write field 1 then discover field 2 is invalid. Validate the whole batch first.
- **Mutating the input buffer:** D-04 requires a fresh buffer; the input (and the FieldTable offsets that index it) must stay byte-stable so the re-parse diff is meaningful.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LE fixed-width writes | Manual byte shifting / DataView bit math | `Buffer.writeInt32LE / writeBigInt64LE / writeDoubleLE` | Node core, LE, already used in `binary-writer.ts`; matches .NET `BinaryWriter` output |
| Re-parse for self-verify | A second bespoke parser | `parseSave` (existing) | Deterministic, already SC-4-proven in Phase 2; a second parser would drift |
| Buffer copy | `Buffer.alloc` + manual `.copy` | `Buffer.from(input)` | One call, exact-length copy |
| Input validation schema | Zod / joi | Hand-rolled typed guards extending `ParseError` | Zero-dep core; batch collect-all contract is domain-specific |
| Byte diff | Third-party diff lib | A `for` loop over the two buffers comparing bytes | 2.28 MB linear scan is microseconds; ranges are trivial to coalesce |

**Key insight:** The entire phase is achievable with Node core `Buffer` plus two small new pure modules. Any library here adds supply-chain surface to a core whose whole point is byte-exact determinism.

## Same-Width Write Mechanics (addresses research question 2)

- **Copy first:** `const out = Buffer.from(input)`. `Buffer.from(buffer)` allocates a new buffer of identical length and copies bytes — `out.length === input.length` immediately, and stays so because every subsequent write is fixed-width at an existing offset.
- **Per-kind write:** int64 GP/SC → `out.writeBigInt64LE(bigintValue, offset)` (8B); int32 quantity/level → `out.writeInt32LE(numberValue, offset)` (4B); double XP → `out.writeDoubleLE(numberValue, offset)` (8B). Offsets and widths come straight from the FieldEntry (`entry.offset`, `entry.width`).
- **BigInt path:** currency values are `bigint` end-to-end (never `Number`). `writeBigInt64LE` throws `ERR_OUT_OF_RANGE` if the value exceeds int64 — but validation (below) catches it first with a typed error, so the native throw is a backstop, not the primary guard.
- **SC-1 guarantee:** because writes are same-width and the buffer is a length-exact copy, `output.length === input.length` is structural, not something to assert-and-hope. The self-verify still asserts it (D-03) as a cheap invariant check.

## Pre-Write Validation (addresses research question 3, SAFE-01)

Exact bounds per FieldKind / field role:

| Field | Kind | Lower bound | Upper bound | Extra |
|-------|------|-------------|-------------|-------|
| Bank item quantity (`bank.inventory.*`) | int32 | `0` | `2147483647` (INT32_MAX) | integer, finite |
| Currency GP/SC (`wallet.*`) | int64 | `0n` | `9223372036854775807n` (INT64_MAX) | value is `bigint`; SAFE-01 "≤ ~9.2e18" |
| Skill Level (`skill.*.level`) | int32 | `1` | `levelCap` (read from `skill.<id>.levelCap`, readOnly) | integer |
| Skill XP (`skill.*.xp`) | double | `0` | `xpForLevel(levelCap)` (see A1) | `Number.isFinite`, `>= 0` — reject NaN/±Infinity |
| LevelCap (`skill.*.levelCap`) | int32 | — | — | **readOnly — reject any edit targeting it** |

**Batch contract (D-01, collect-all-then-write):**
1. Resolve each edit's key → FieldEntry (`fieldTable.get(key)`); unknown key or `readOnly` target is a violation.
2. Range-check each resolved write; **collect every violation** rather than throwing on the first.
3. If `violations.length > 0` → throw the aggregate error carrying **all** `{ fieldKey, reason }`; write nothing.
4. Only if zero violations → proceed to the write phase.

**Typed error hierarchy (extends the Phase 1/2 fail-loud pattern):** `ParseError` lives in `field-table.ts` and semantically means "parse failed," so a sibling patch hierarchy reads more clearly than reusing `ParseError`. Recommended:
```
Error
 └─ PatchError                 (base for the patch domain; name + message)
     ├─ ValidationError        (aggregate; carries violations: { fieldKey, reason }[])  — D-01
     ├─ ReadOnlyFieldError      (edit targeted a readOnly field: LevelCap / header mirror)
     ├─ UnknownFieldError       (edit key not in the FieldTable)
     ├─ ConflictingEditError    (batch sets both skill.<id>.level and .xp — see A2)
     └─ UnintendedChangeError   (self-verify diff found a byte outside intended ranges — D-03)
```
The planner may instead extend `ParseError` if a single flat surface is preferred; either satisfies "consistent typed-error surface." The load-bearing requirement is that `ValidationError` carries the **full list** of violations (D-01), not just the first.

## XP↔Level Coupling (addresses research question 4, D-02, EDIT-04)

- **Level→XP (snap):** editing `skill.<id>.level = L` (after clamping `L` to `1..levelCap`) writes Level=L (int32 at level offset) **and** XP=`xpForLevel(L)` (double at xp offset). Both writes land in the change report. No partial-level XP is preserved.
- **XP→Level (derive):** editing `skill.<id>.xp = X` writes XP=X (double) **and** Level=`levelForXp(X, levelCap)` (int32). `levelForXp` returns the highest L in `1..levelCap` with `XP_TABLE[L-1] <= X` (table is monotonic — verified).
- **LevelCap:** never written. It is read (from the readOnly `skill.<id>.levelCap` FieldEntry) to bound both Level and XP.
- **One logical edit → two field writes.** The change report therefore contains two rows for a skill edit (the field the user set, plus its coupled partner). This is intentional and feeds the Phase 5 preview.

## SC-4 Self-Verify (addresses research question 5, D-03)

**Recommended: whole-buffer byte diff (stronger than asserting declared ranges).**
1. Compute the set of intended byte ranges: for each written field, `[offset, offset + width)`.
2. Linear-scan `input` vs `output` (2.28 MB — microseconds). Every index where bytes differ **must** be covered by an intended range; the first uncovered differing byte → throw `UnintendedChangeError` (return the error, not the buffer).
3. Assert `output.length === input.length` (cheap invariant; structurally guaranteed but checked anyway).
4. **Re-parse** `output` via `parseSave` — this proves the patched buffer is still parseable (loadable-shaped) and lets the engine confirm each edited FieldEntry now reads back the intended value (write round-trip). Because Phase 2 re-parse is deterministic and edits are same-width, non-edited offsets are unchanged.

Why whole-buffer diff over "assert only declared ranges": it catches a write that accidentally lands **outside** a declared range (e.g. an off-by-one offset or a wrong-width write clobbering an adjacent field) — exactly the corruption class this phase exists to prevent. Asserting only declared ranges would miss stray writes elsewhere.

**On an unintended change:** per D-03, throw and do not return the buffer. This makes the safety check intrinsic to production, not test-only.

## Runtime State Inventory

Not applicable — this is a greenfield pure-code phase (new modules `experience-table.ts` + `patcher.ts`). No rename/refactor/migration; no stored data, live service config, OS-registered state, secrets, or build artifacts are affected. **None — verified: the phase only adds two files and tests, consuming existing modules unchanged.**

## Common Pitfalls

### Pitfall 1: Trusting the doc's L75 milestone row
**What goes wrong:** `docs/current-skill.md` lists L75 = 3,576,425, but its own reference algorithm (and this session's execution) yields **L75 = 1,210,418**. Four of five doc rows (L50, L99, L110, L120) and all three SC-locked milestones match the algorithm; only L75 disagrees.
**Why it happens:** The L75 table row is a doc typo; the algorithm is authoritative.
**How to avoid:** Test the XP table against the **SC-locked** milestones only — L50=101,331; L99=13,034,427; L120=104,273,162 (ROADMAP SC-3). Do **not** add L75=3,576,425 as a test fixture. Optionally add L110=38,737,657 (matches).
**Warning signs:** A milestone test failing at exactly L75 while L50/L99/L120 pass → it's the doc, not your code.

### Pitfall 2: Using `BinaryWriter` for in-place patching
**What goes wrong:** `BinaryWriter` appends from cursor 0 and grows; targeting `entry.offset` is impossible without rebuilding the entire buffer, risking length drift and adjacent-byte corruption.
**How to avoid:** `Buffer.from(input)` + `writeXxxLE(value, offset)`. (See §Same-Width Write Mechanics.)
**Warning signs:** `output.length !== input.length`, or the self-verify diff lighting up ranges you never edited.

### Pitfall 3: `Number` for currency
**What goes wrong:** GP/SC can exceed 2^53; `Number` loses precision, corrupting the value.
**How to avoid:** `bigint` end-to-end; `writeBigInt64LE`. The FieldTable already types `int64` value as `bigint` (compile-time enforced).

### Pitfall 4: Non-finite XP slipping through
**What goes wrong:** `NaN`/`Infinity` written as a double produces a save the game may reject or misread.
**How to avoid:** Validate `Number.isFinite(xp) && xp >= 0` before writing.

### Pitfall 5: Confusing LevelCap and Level (two adjacent int32s)
**What goes wrong:** Experience layout is `[double XP][int32 LevelCap][int32 Level]`; patching the wrong int32 either edits the cap (forbidden) or writes the level into the cap slot.
**How to avoid:** Address strictly by FieldEntry key (`skill.<id>.level` vs `skill.<id>.levelCap`); the Phase 2 parser already records these at distinct offsets (+8 vs +12) with `levelCap` flagged readOnly.

### Pitfall 6: Silent clamp masking bad input (D-02)
**What goes wrong:** Clamping an over-cap XP or out-of-range level silently changes what the user asked for — inconsistent with fail-loud, and hides mistakes.
**How to avoid:** Prefer rejecting out-of-range values with a `ValidationError`. If clamping is kept per D-02, record the clamp in the change report so it is never silent. (Assumptions Log A1.)

## Code Examples

### patchSave signature and flow
```typescript
// Source: derived from D-04 + in-repo save-parser.ts / field-table.ts contracts
export interface Edit { fieldKey: string; newValue: bigint | number; }
export interface ChangeReportRow {
  fieldKey: string; oldValue: bigint | number; newValue: bigint | number;
  offset: number; width: number;
}
export interface PatchResult { buffer: Buffer; changeReport: ChangeReportRow[]; }

// FieldTable offsets index THIS buffer, so the caller passes the same decompressed buffer
// it parsed. parseSave returns { fieldTable, viewModel } but not the buffer — the caller
// already holds it.
export function patchSave(
  buffer: Buffer,
  fieldTable: FieldTable,
  edits: Edit[],
): PatchResult { /* resolve → validate(collect-all) → copy+write → self-verify → return */ }
```

### Milestone test fixtures
```typescript
// Source: ROADMAP SC-3 (SC-locked milestones) + verified algorithm execution
const MILESTONES: Array<[number, number]> = [
  [50, 101_331],
  [99, 13_034_427],
  [120, 104_273_162],
  // [110, 38_737_657],  // optional; matches. Do NOT use [75, 3_576_425] — doc typo.
];
for (const [level, xp] of MILESTONES) {
  assert.equal(xpForLevel(level), xp, `L${level}`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| (n/a — greenfield module) | `Buffer.writeBigInt64LE` for int64 (Node ≥ 12) | long stable | No third-party BigInt/int64 lib needed |

**Deprecated/outdated:**
- `brotli`/`iltorb` npm, `Number` for int64, closed-form XP — all avoided per CLAUDE.md and the verified algorithm.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Out-of-range XP (above `xpForLevel(levelCap)`) should be **rejected** with a `ValidationError`, not silently clamped — despite D-02 saying "clamp". Recommend reject, or clamp-and-record-in-changeReport. | XP↔Level Coupling / Pitfall 6 | If user actually wants silent clamp, rejecting is stricter but never corrupts; low risk, needs a one-line confirm. |
| A2 | A single batch that sets **both** `skill.<id>.level` and `skill.<id>.xp` for the same skill is a **conflicting intent** and should be rejected (`ConflictingEditError`), since each expands to write the other field. | Architecture / Validation | If the intended semantics were "last one wins" or "level takes precedence," the reject is safer but may annoy; low risk, needs confirm. |
| A3 | Currency lower bound is `0` (no negative GP/SC). SAFE-01 states an upper bound only; a save cannot hold negative currency in practice. | Pre-Write Validation | If negative currency is a legitimate edit (unlikely), the bound is too tight; trivially relaxed. |
| A4 | The L75 doc row (3,576,425) is a typo; the algorithm's 1,210,418 is correct. Based on 4/5 doc rows + all 3 SC milestones matching the algorithm. | Pitfall 1 | If the game actually uses 3,576,425 at L75, the whole formula would be wrong — but L50/L99/L110/L120 all matching makes this near-certain. In-game load is the ultimate acceptance (ROADMAP). |
| A5 | `writeBigInt64LE`/`writeInt32LE`/`writeDoubleLE` at a FieldEntry offset produce bytes the game reads identically to the originals (same LE encoding `parseSave` reads back). Grounded in `binary-writer.ts` using these exact APIs and Phase 1 round-trip proof. | Same-Width Write Mechanics | Low — Phase 1 already proved LE read/write round-trips against .NET bytes. |

**If confirmed:** A1 and A2 are the two decisions worth a one-line check with the user before planning locks; the rest are low-risk.

## Open Questions (RESOLVED)

1. **Clamp vs reject for out-of-range XP/level (A1/A2).**
   - **RESOLVED → reject (fail-loud), not clamp.** Locked in `03-CONTEXT.md` D-02 ("Out-of-range
     is REJECTED, not clamped") and the dual level+xp-for-one-skill conflict (A2) as a
     `ConflictingEditError`. Both plans (03-01/03-02) implement reject; no clamp path exists.

2. **Does the change report serialize int64 as bigint or string?**
   - **RESOLVED → keep `bigint` in-core.** 03-02 keeps the change report's int64 values as native
     `bigint`; Phase 4 stringifies at the IPC boundary (mirrors the Phase 2 ViewModel decision).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + `Buffer` core | all writes | ✓ | Node 24 (per @types/node ^24) | — |
| tsx (test runner) | tests | ✓ | ^4.23 (devDep) | — |
| typescript (`tsc --noEmit`) | typecheck gate | ✓ | ^6.0.3 (devDep) | — |
| c8 (coverage) | coverage gate | ✓ | ^11 (devDep) | — |
| Committed fixture `test/fixtures/test-fixture.sav` | SC-1..SC-4 tests | ✓ | 151,993→2,284,747 bytes | — |

No external dependencies. Step 2.6 audit: all required tooling already installed from Phase 1/2.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` via `tsx` (Node built-in test runner) |
| Config file | none — `package.json` script: `"test": "tsx --test test/**/*.test.ts"` |
| Quick run command | `npx tsx --test test/patcher.test.ts test/experience-table.test.ts` |
| Full suite command | `npm test` (all `test/**/*.test.ts`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | Each field written at declared width; `output.length === input.length` after every patch | unit/property | `npx tsx --test test/patcher.test.ts` | ❌ Wave 0 |
| SAFE-01 (SC-2) | Out-of-range edits rejected before writing (int32 0..2147483647; int64 0..INT64_MAX; Level 1..cap; finite XP≥0) | unit (negatives) | `npx tsx --test test/patcher.test.ts` | ❌ Wave 0 |
| EDIT-04 (SC-3) | `xpForLevel`/`levelForXp` reproduce L50/L99/L120; level edit writes consistent XP+Level; cap unchanged | unit | `npx tsx --test test/experience-table.test.ts` | ❌ Wave 0 |
| SC-4 | Re-parse + whole-buffer diff shows only intended byte ranges changed | integration | `npx tsx --test test/patcher.test.ts` | ❌ Wave 0 |
| SC-4 (round-trip) | patch → `codec.compress` → `decompress` → `parseSave` yields the edited value | integration | `npx tsx --test test/patcher.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsx --test test/patcher.test.ts test/experience-table.test.ts`
- **Per wave merge:** `npm test` (full suite — must stay green; Phase 1/2 tests must not regress)
- **Phase gate:** full suite green + `tsc --noEmit` clean before `/gsd-verify-work`; note the project's `--100` coverage gate (c8) established in Phase 1/2 — new modules should meet it or carry justified `/* c8 ignore */` for esbuild interop only.

### Wave 0 Gaps
- [ ] `test/experience-table.test.ts` — covers EDIT-04 (milestones L50/L99/L120, monotonicity, `levelForXp` inverse, clamp-to-cap)
- [ ] `test/patcher.test.ts` — covers SC-1 (length invariant, per-kind width), SAFE-01 (range negatives incl. NaN/Infinity/readOnly-target/unknown-key), SC-4 (diff + re-parse + codec round-trip) against the committed fixture
- [ ] No new fixtures needed — reuse `test/helpers/fixture.ts` (`loadFixtureBuffer`); build edit batches from `parseSave(fixture).fieldTable` keys

## Security Domain

`security_enforcement` treated as enabled (not `false` in config). This phase consumes a decompressed save buffer (the user's own file) and applies edits; the primary attack surface is **malformed values entering the write path**.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | local single-user tool, no auth |
| V3 Session Management | no | no sessions |
| V4 Access Control | no | no multi-user surface |
| V5 Input Validation | **yes** | Pre-write range/type validation (SAFE-01): every edit bounds-checked by FieldKind; readOnly targets rejected; NaN/Infinity rejected; collect-all-then-write (D-01) |
| V6 Cryptography | no | format is Brotli-compressed, not encrypted (nothing to defeat, per REQUIREMENTS Out-of-Scope) |

### Known Threat Patterns for a binary patch engine

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Out-of-range value corrupts the save / crashes the game | Tampering / DoS | Pre-write validation with typed errors; write nothing on any violation (D-01) |
| Wrong-offset / wrong-width write clobbers an adjacent field | Tampering | Same-width at-offset writes + whole-buffer self-verify diff (D-03) throws on any byte outside intended ranges |
| int64 precision loss silently mangling currency | Tampering | `bigint` end-to-end; `writeBigInt64LE`; type-level enforcement in FieldTable |
| Editing an immutable field (LevelCap / header mirror) | Tampering | `readOnly` flag on FieldEntry; patcher rejects readOnly targets |
| Non-finite double (NaN/Infinity) written as XP | Tampering | `Number.isFinite && >= 0` guard before write |

## Sources

### Primary (HIGH confidence)
- `docs/current-skill.md` §"XP Table (StandardExperienceTable)" (lines 183-210) + §"ExperienceComponent format" (lines 173-182) — authoritative formula, parameters, layout. Algorithm **executed this session** — reproduces L50/L99/L110/L120.
- `src/field-table.ts` — FieldEntry metadata, flags, `ParseError`/`RequiredFieldMissingError` hierarchy (read in full).
- `src/binary-writer.ts` — confirms LE `writeInt32LE/writeBigInt64LE/writeDoubleLE` are the project's write primitives; confirms BinaryWriter is append-only/growable (not an at-offset patcher).
- `src/save-parser.ts` — `parseSave` contract, FieldTable keys (`wallet.*`, `bank.inventory.<itemId>@<offset>`, `skill.<id>.{xp,levelCap,level}`), deterministic re-parse.
- `src/experience-parser.ts` — Experience layout `[double XP][int32 LevelCap][int32 Level]`, distinct offsets, cap readOnly.
- `.planning/REQUIREMENTS.md` (SAFE-01, EDIT-04), `.planning/ROADMAP.md` §Phase 3 (SC-1..SC-4, milestones), `03-CONTEXT.md` (D-01..D-04).

### Secondary (MEDIUM confidence)
- `.claude/CLAUDE.md` Technology Stack — Buffer/zlib guidance, "don't use Number for int64", in-place same-width edits only.

### Tertiary (LOW confidence)
- none — all findings grounded in in-repo authoritative sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external deps; every API already in use in-repo.
- Architecture: HIGH — patch flow derived directly from D-01..D-04 + existing FieldTable/parseSave contracts.
- XP table: HIGH — algorithm executed this session; SC milestones reproduced exactly (L75 doc typo flagged).
- Pitfalls: HIGH — grounded in read code (BinaryWriter append-only, cap/level adjacency, int64 typing).
- Open items: two provisional-default wrinkles (clamp vs reject; level+xp conflict) flagged for a one-line user confirm.

**Research date:** 2026-07-04
**Valid until:** stable — pure Node core + in-repo spec; re-check only if `docs/current-skill.md` or the FieldTable shape changes (~90 days).

## Project Constraints (from CLAUDE.md)

- In-place **same-byte-width edits only** for v1 — no region-size-prefix rewrites, no byte insertion.
- Validate ranges before writing; **write a new file, never overwrite** the original (file write is Phase 4; this phase emits a new buffer, never mutates input).
- Output `.sav` must **round-trip and load in-game** — same-width writes preserve region-size prefixes; in-game load is the ultimate acceptance.
- **int64 as `bigint`, never `Number`** (precision).
- Hand-rolled Buffer read/write (no schema/parse-serialize lib); Node core Brotli/`Buffer` only — zero new deps.
- Fail-loud with typed errors, consistent with the Phase 1/2 `ParseError` hierarchy.
- No `nodeIntegration`, secure IPC — n/a this phase (headless core; relevant in Phase 4).
