# Phase 3: Patcher + Validation + XP Table - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 4 (2 new source modules + 2 new test files)
**Analogs found:** 4 / 4 (every new file has a strong in-repo analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/experience-table.ts` (new) | utility (pure numeric module) | transform (Level↔XP) | `src/experience-parser.ts` (inverse: reads XP/Cap/Level) | role-match (inverse transform) |
| `src/patcher.ts` (new) | service (patch engine) | batch / transform (buffer→buffer) | `src/wallet-parser.ts` + `src/field-table.ts` (FieldEntry consumer + typed-error hierarchy) + `src/binary-writer.ts` (LE write APIs, but see Anti-Pattern) | role-match |
| `test/experience-table.test.ts` (new) | test | unit (milestone fixtures) | `test/experience-parser.test.ts` | exact (node:test + boundary cases) |
| `test/patcher.test.ts` (new) | test | integration (fixture round-trip) | `test/wallet-parser.test.ts` + `test/helpers/fixture.ts` | exact (committed-fixture + negative-craft) |

**Key structural note the planner must carry into every plan:** the FieldEntry model
(`{ key, offset, kind, width, value, readOnly?, authoritative?, mirrors? }`), the `ParseError`
hierarchy, and the write primitives already exist and are consumed verbatim — this phase adds
NO new model. See `src/field-table.ts` lines 53-129 (FieldEntry union) and 136-160 (error base).

---

## Pattern Assignments

### `src/experience-table.ts` (utility, Level↔XP transform)

**Analog:** `src/experience-parser.ts` (the inverse — it reads the XP/Cap/Level triple; this
module computes the XP↔Level mapping the parser's values must stay consistent with).

**Authoritative algorithm — port 1:1 from `docs/current-skill.md` §XP Table (lines ~183-201).**
RESEARCH executed this in-session and it reproduces the SC-locked milestones exactly. Do NOT
optimize into a closed form (per-step `Math.floor` + cumulative `xpSum` are load-bearing):

```typescript
// Source: docs/current-skill.md §"XP Table" — VERIFIED: L50=101331, L99=13034427, L120=104273162
function buildXpTable(maxLevel = 120): number[] {
  const base = Math.pow(2.0, 1.0 / 7.0);   // 2^(1/7)
  let xpSum = 0.0;
  const table = [0.0];                      // level 1 = 0 XP; table[L-1] = min XP for level L
  for (let i = 1; i < maxLevel; i++) {
    xpSum += Math.floor(i + 300.0 * Math.pow(base, i)); // exponent_scaling=300.0
    table.push(Math.floor(0.25 * xpSum));               // scaling=0.25
  }
  return table;
}
const XP_TABLE = buildXpTable(120);         // precompute once at module load (Claude's Discretion → precompute)

export function xpForLevel(level: number): number { return XP_TABLE[level - 1]!; }

export function levelForXp(xp: number, levelCap: number): number {
  let lvl = 1;
  for (let L = 1; L <= levelCap && L <= XP_TABLE.length; L++) {
    if (XP_TABLE[L - 1]! <= xp) lvl = L; else break;    // monotonic table
  }
  return lvl;
}
```

**Module-header doc-comment pattern** (copy the `/* c8 ignore start */ … /* c8 ignore end */`
prose-header convention from `src/experience-parser.ts` lines 1-29): a top block naming the
layout/algorithm source, the SC/requirement IDs implemented, and the threats mitigated. Every
`src/*.ts` in this repo opens this way.

**Float note (RESEARCH §Pattern 2):** JS `number` IS IEEE-754 double; max ~104M ≪ 2^53, so
NO BigInt here (XP is a `double` FieldEntry — `kind: 'double'`, `value: number`; see
`experience-parser.ts` line 83 and field-table.ts line 100-104).

---

### `src/patcher.ts` (service, batch buffer→buffer)

**Analogs:** `src/wallet-parser.ts` (FieldEntry emission + fail-loud typed error + `bigint`
discipline), `src/field-table.ts` (the error-class hierarchy to extend, and the `.get(key)` /
`.getRequired(key)` resolution API), `src/binary-writer.ts` (the LE write APIs — but driven
directly on a Buffer copy, NOT via the BinaryWriter class; see Anti-Pattern below).

**Public API shape** (from CONTEXT D-04 / RESEARCH §Code Examples):

```typescript
export interface Edit { fieldKey: string; newValue: bigint | number; }
export interface ChangeReportRow {
  fieldKey: string; oldValue: bigint | number; newValue: bigint | number;
  offset: number; width: number;
}
export interface PatchResult { buffer: Buffer; changeReport: ChangeReportRow[]; }

export function patchSave(buffer: Buffer, fieldTable: FieldTable, edits: Edit[]): PatchResult;
```

**Field resolution pattern** — reuse the FieldTable API verbatim (`src/field-table.ts`
lines 208-232). `fieldTable.get(key)` returns `FieldEntry | undefined` (undefined key →
`UnknownFieldError`); read `entry.readOnly` to reject cap/header-mirror targets; read
`entry.offset` / `entry.kind` / `entry.width` for the write. The patcher NEVER re-derives an
offset — offsets live only in the FieldTable (SC-4).

**Same-width at-offset write pattern** (RESEARCH §Pattern 1 — the LE APIs are exactly those
`BinaryWriter` delegates to at `src/binary-writer.ts` lines 79, 89, 99, but applied at an
arbitrary offset on a copy):

```typescript
const out = Buffer.from(input);            // length-exact copy — SC-1 holds by construction
function applyWrite(out: Buffer, entry: FieldEntry, value: bigint | number): void {
  switch (entry.kind) {
    case 'int64':  out.writeBigInt64LE(value as bigint, entry.offset); break; // 8B GP/SC — bigint, never Number
    case 'int32':  out.writeInt32LE(value as number, entry.offset);    break; // 4B qty/level
    case 'double': out.writeDoubleLE(value as number, entry.offset);   break; // 8B XP
    default: throw new PatchError(`unsupported kind for write: ${entry.kind}`);
  }
}
```

**Typed error hierarchy** — mirror the `ParseError` extends-Error pattern in
`src/field-table.ts` lines 136-160 (a base class that sets `this.name`, plus subclasses that
carry actionable fields like `RequiredFieldMissingError.fieldKey`). RESEARCH §Pre-Write
Validation recommends a sibling `PatchError` base rather than reusing `ParseError`:

```
Error
 └─ PatchError                 (base; sets this.name — mirror field-table.ts:136-141)
     ├─ ValidationError        (aggregate; carries violations: { fieldKey, reason }[]) — D-01
     ├─ ReadOnlyFieldError     (edit targeted a readOnly field: LevelCap / header mirror)
     ├─ UnknownFieldError      (edit key not in the FieldTable)
     ├─ ConflictingEditError   (batch sets both skill.<id>.level AND .xp — A2)
     └─ UnintendedChangeError  (self-verify diff found a byte outside intended ranges) — D-03
```
Load-bearing: `ValidationError` must carry the **full** list of violations (D-01 collect-all),
not just the first. Copy the "carry an actionable field on the subclass" move from
`RequiredFieldMissingError` (field-table.ts lines 148-160).

**Collect-all-then-write batch contract** (D-01, RESEARCH §Pre-Write Validation) — this is
the INVERSE of the parser's throw-on-first-problem style; the patcher must accumulate. Flow:
1. Resolve every edit key → FieldEntry (unknown key / readOnly target → collected violation).
2. Expand skill edits to their coupled pair (level→{level,xp}, xp→{xp,level}) via
   `experience-table`; reject a batch setting both level+xp for one skill (`ConflictingEditError`).
3. Range-check every resolved write by kind (bounds table below); collect ALL violations.
4. If `violations.length > 0` → throw `ValidationError{ violations }`; write NOTHING.
5. Only if clean → `Buffer.from(input)` + `applyWrite` per field → self-verify → return.

**Pre-write validation bounds** (SAFE-01, RESEARCH §Pre-Write Validation):

| Field key pattern | Kind | Lower | Upper | Extra |
|-------------------|------|-------|-------|-------|
| `bank.inventory.*` (qty) | int32 | `0` | `2147483647` | integer, finite |
| `wallet.*` (GP/SC) | int64 | `0n` | `9223372036854775807n` | value is `bigint` |
| `skill.*.level` | int32 | `1` | `levelCap` (read from readOnly `skill.<id>.levelCap`) | integer |
| `skill.*.xp` | double | `0` | `xpForLevel(levelCap)` (A1: reject over-cap, don't clamp) | `Number.isFinite && >= 0` |
| `skill.*.levelCap` | int32 | — | — | **readOnly — reject any edit** |

**Self-verify pattern** (D-03, RESEARCH §SC-4) — reuse `parseSave` verbatim (do NOT write a
second parser). After writing: (1) whole-buffer byte diff `input` vs `out`, every differing
index must fall inside an intended `[offset, offset+width)` range else `UnintendedChangeError`;
(2) assert `out.length === input.length`; (3) `parseSave(out)` re-parse confirms still-parseable
and edited entries read back the intended value.

**Anti-pattern (do NOT do):** driving `BinaryWriter` (`src/binary-writer.ts`) to patch — it is
an append-only growable cursor from offset 0 (see its `cursor`/`ensure`/`toBuffer` at lines
34-74); it cannot target `entry.offset` without re-serializing the whole 2.28 MB save (the
byte-insertion risk CLAUDE.md forbids). Use `Buffer.from(input)` + `writeXxxLE(value, offset)`.

---

### `test/experience-table.test.ts` (test, unit)

**Analog:** `test/experience-parser.test.ts` (lines 22-40 imports/setup; 42-212 the
describe/test + boundary structure; 218-232 the craft-a-buffer helper).

**Framework pattern** (copy header imports from experience-parser.test.ts lines 22-28):
```typescript
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
```

**Milestone fixtures** (RESEARCH §Milestone test fixtures — use ONLY the SC-locked milestones;
do NOT add L75=3,576,425, it is a doc typo per Pitfall 1):
```typescript
const MILESTONES: Array<[number, number]> = [
  [50, 101_331], [99, 13_034_427], [120, 104_273_162],
  // [110, 38_737_657], // optional, matches. NEVER [75, 3_576_425] — doc typo.
];
for (const [level, xp] of MILESTONES) assert.equal(xpForLevel(level), xp, `L${level}`);
```

**Boundary-case pattern** — mirror the `describe(...boundary...)` blocks in
experience-parser.test.ts lines 191-211 (lower edge cap=1/level=1/xp=0, upper edge). Add:
monotonicity of the full table, `levelForXp` inverse (round-trips `xpForLevel(L)` back to `L`),
and clamp-to-cap for `levelForXp`.

---

### `test/patcher.test.ts` (test, integration)

**Analogs:** `test/wallet-parser.test.ts` (committed-fixture consumption lines 22-32; negative
tests via crafted buffers lines 120-172; the `buildWalletBuffer` helper lines 186-201) +
`test/helpers/fixture.ts` (the `loadFixtureBuffer()` cached-decompress harness).

**Fixture harness pattern** (copy verbatim from wallet-parser.test.ts lines 27-32):
```typescript
import { loadFixtureBuffer } from './helpers/fixture';
const FIXTURE = loadFixtureBuffer();  // decompressed 2,284,747-byte committed fixture, cached
```
Build edit batches from `parseSave(FIXTURE).fieldTable` keys — no new fixture needed
(RESEARCH §Wave 0 Gaps). Note the fixture buffer is shared/read-only; the patcher must copy,
so `patchSave` returning a fresh buffer keeps the fixture byte-stable across tests.

**Negative-test pattern** (mirror wallet-parser.test.ts lines 128-133 `assert.throws` with an
instanceof predicate, and the "error carries actionable field" assertion lines 139-157):
```typescript
assert.throws(
  () => patchSave(FIXTURE, ft, [{ fieldKey: 'skill.X.level', newValue: 999 }]),
  (err: unknown) => err instanceof ValidationError,
);
```
Cover SAFE-01 negatives: int32 > INT32_MAX, negative qty, int64 out of range, level > cap,
NaN/Infinity XP, readOnly (levelCap/header-mirror) target, unknown key, and the level+xp
conflict (`ConflictingEditError`).

**Round-trip integration pattern** — reuse `codec` (`compress`/`decompress`/`roundTrip` at
`src/codec.ts` lines 64/86/117): patch → `compress(out)` → `decompress(...)` → `parseSave(...)`
yields the edited value. SC-4 test: assert whole-buffer diff shows only intended ranges changed
and `out.length === input.length`.

---

## Shared Patterns

### Fail-loud typed errors
**Source:** `src/field-table.ts` lines 136-160 (`ParseError` base + `RequiredFieldMissingError`
subclass carrying `fieldKey`).
**Apply to:** `src/patcher.ts` — the new `PatchError` hierarchy extends `Error` the same way
(constructor sets `this.name`; subclasses add actionable fields). D-01 requires `ValidationError`
to carry the full violations list.
```typescript
export class ParseError extends Error {
  constructor(message: string) { super(message); this.name = 'ParseError'; }
}
export class RequiredFieldMissingError extends ParseError {
  readonly fieldKey: string;
  constructor(fieldKey: string) { super(`...${fieldKey}...`); this.name = '...'; this.fieldKey = fieldKey; }
}
```

### FieldEntry consumption (offset/kind/width/value)
**Source:** `src/field-table.ts` lines 53-129 (the discriminated union) + lines 208-232 (`get`/
`getRequired`). `int64 → bigint` is compile-time enforced (lines 95-98); `tsc --noEmit` is the proof.
**Apply to:** `src/patcher.ts` reads entries by key and writes same-width in place; NEVER
re-derives an offset. `readOnly` (line 64) blocks cap/mirror writes; `authoritative` (line 69)
marks the true currency write target (wallet, not header).

### int64 as bigint end-to-end
**Source:** `src/wallet-parser.ts` lines 80, 87-93 (reads `readInt64()` → bigint into a
`kind:'int64'` FieldEntry). CLAUDE.md constraint, threat T-02-06.
**Apply to:** currency edits/validation take & write `bigint`; `writeBigInt64LE` (never Number,
never `writeDoubleLE` for currency).

### Module doc-header convention
**Source:** every `src/*.ts` opens with a `/* c8 ignore start */ … /* c8 ignore end */` prose
block naming layout source, SC/requirement IDs implemented, and threats mitigated (e.g.
`experience-parser.ts` lines 1-29, `wallet-parser.ts` lines 1-30).
**Apply to:** both new source modules — plus the `/* c8 ignore next */` on the closing brace of
any `export class` (field-table.ts line 238; binary-writer.ts line 142) for esbuild interop.

### Coverage + typecheck gate
**Source:** RESEARCH §Sampling Rate — project runs c8 `--100` and `tsc --noEmit`; tests via
`tsx --test`. Test files carry `Implements: D-04 (c8 gate — 100% lines+branches)` in headers
(wallet-parser.test.ts lines 18-20).
**Apply to:** both new modules must hit 100% (or carry justified `/* c8 ignore */` for esbuild
interop only). Per-task: `npx tsx --test test/patcher.test.ts test/experience-table.test.ts`.

---

## No Analog Found

None. Every new file has a strong in-repo analog. The only partial gap is that no existing
module performs *at-offset in-place writes* (the parsers only read; `BinaryWriter` only appends)
— so the write mechanism itself (RESEARCH §Pattern 1: `Buffer.from` + `writeXxxLE(v, offset)`)
comes from RESEARCH/Node core, not from copying an existing writer. The LE write *APIs* are
still the same ones `binary-writer.ts` uses (lines 79/89/99).

## Metadata

**Analog search scope:** `src/` (experience-parser, field-table, binary-writer, wallet-parser,
save-parser, codec), `test/` (wallet-parser.test, experience-parser.test, helpers/fixture),
`docs/current-skill.md` §XP Table.
**Files scanned:** 10
**Pattern extraction date:** 2026-07-04
