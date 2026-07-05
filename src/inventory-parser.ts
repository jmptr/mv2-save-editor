/* c8 ignore start */
// Bank Inventory parser — an explicit structural tab-walk (the one place structural
// descent doesn't suffice from the generic component walk, so it is decoded here).
//
// HISTORY: the original parser used a loose 'MelvorBase:' marker-search over the whole
// Inventory region. That recovered the real stacks BUT also leaked PHANTOM stacks from
// the component's trailing "Chests" registry (item-id strings whose preceding 6 bytes
// coincidentally validated as a stack header). Editing a phantom wrote into non-stack
// data → the game rejected the bank on load and reverted ALL edits
// (docs/bank-inventory-phantom-stacks.md). This parser replaces the marker-search with a
// byte-exact walk of the tab list, so phantoms are STRUCTURALLY impossible, not filtered.
//
// INVENTORY COMPONENT LAYOUT (decoded byte-exact against MahoganyLog-103.sav,
// test-fixture.sav, and save_35a…sav — all version 20):
//
//   [int32 reserved]          inventory-level field (0 in all observed saves)
//   [int32 tabCount]          number of bank tabs (drives the walk length)
//   tab[0]  (the unnamed default tab):
//     [int32 a][int32 b][int32 c]         tab config (capacity/lock flags; a,c = INT32_MAX)
//     [uint16 sentinel]                   (1 in all observed saves)
//     [int32 stackCount]
//     stack × stackCount
//   tab[1 .. tabCount-1]  (named tabs):
//     [string name]                       7-bit-length-prefixed UTF-8 (e.g. "Tab 1")
//     [int32 a][int32 b][int32 c][int32 d]   tab config (b,d = INT32_MAX)
//     [uint16 sentinel]
//     [int32 stackCount]
//     stack × stackCount
//
//   Each stack record (packed contiguously within a tab):
//     [int32 qty]           at qtyOffset            (the Phase 3 patcher write target)
//     [uint8 placeholder]   at qtyOffset + 4        (0/1)
//     [uint8 locked]        at qtyOffset + 5        (0/1)
//     [7-bit length prefix] at qtyOffset + 6
//     [item-ID UTF-8 body]  at qtyOffset + 7
//
// After the last tab comes the trailing "Chests" registry —
//   [string "Chests"][int32 0][int32 0][int32 N][int32 0] then N × [string itemId][int32]
// — an item→count registry, NOT stacks. The walk STOPS after tabCount tabs and never
// reads it (that was the phantom source). Reads are additionally bounded to [0, invEnd):
// a corrupt count throws ERR_OUT_OF_RANGE instead of escaping into the trailing zone.
//
// FAIL-LOUD (correctness invariant, PROJECT.md): a walk that misaligns onto non-stack
// bytes would read placeholder/locked > 1 or a negative qty; that throws {@link ParseError}
// rather than emitting a bad offset. tabCount/stackCount are bounded against the region
// before looping (anti-DoS, mirrors structural-walk). The editor refuses a save it cannot
// decode cleanly — never a silently-wrong or phantom-bearing model.
//
// Implements: D-01 (offset-keyed stacks — a real duplicate item ID across tabs would be a
// DISTINCT field, NOT D-03 ambiguity; no fixture exhibits one), D-03 (resolveOne surfaces
// >1 match as candidates, never auto-picks), D-04 (coverage-gated core), D-08
// (noUncheckedIndexedAccess — uses readUInt8 not buf[i]). Mitigates the phantom-stack
// corruption bug (explicit tab-walk, trailing zone never scanned), T-02-03 (read past
// invEnd → every read bounded to [0, invEnd)), T-02-08 (ambiguous logical field →
// candidates surfaced via resolveOne).
/* c8 ignore end */

import { BinaryReader } from './binary-reader';
import { ParseError, type FieldCandidate } from './field-table';

/**
 * A recovered Bank Inventory item stack. Each stack is a distinct editable field keyed
 * by its `qtyOffset` (the byte offset of the int32 quantity in the decompressed save —
 * the Phase 3 patcher's same-width in-place write target). Duplicate item IDs across
 * tabs produce DISTINCT stacks at different offsets (D-01 — NOT D-03 ambiguity; each is
 * independently editable).
 */
export interface InventoryStack {
  /** Byte offset of the int32 quantity in the decompressed save buffer (the write target). */
  qtyOffset: number;
  /** Raw namespaced item ID (e.g. `MelvorBase:NormalLog` — D-02, never trimmed). */
  itemId: string;
  /** Signed 32-bit quantity. Validated to be in [0, 2147483647] (SC-3). */
  qty: number;
  /** Placeholder flag (D-01 free metadata). Validated to be a real boolean (raw byte in {0,1}). */
  placeholder: boolean;
  /** Locked flag (D-01 free metadata). Validated to be a real boolean (raw byte in {0,1}). */
  locked: boolean;
}

/**
 * Result of {@link resolveOne} — the D-03 ambiguity contract for a single logical field
 * that may resolve to one, many, or zero validated offsets. NEVER auto-picks: when a
 * logical field matches >1 offset, the matches are surfaced as candidates for a higher
 * layer (or the user) to disambiguate (T-02-08).
 */
export type ResolveResult =
  | { kind: 'resolved'; stack: InventoryStack }
  | { kind: 'candidates'; candidates: FieldCandidate[] }
  | { kind: 'notFound' };

/**
 * Minimum bytes a single tab occupies even with zero stacks — used only to bound
 * `tabCount` against the region before looping (anti-DoS, mirrors structural-walk). The
 * smallest tab is the unnamed default tab: `[3×int32 config][uint16][int32 stackCount]`
 * = 12 + 2 + 4 = 18 bytes. A conservative floor of 14 never rejects a valid save.
 */
const MIN_TAB_FRAMING = 14;

/**
 * Minimum bytes a single stack record occupies — `[int32 qty][uint8][uint8][1-byte
 * 7-bit prefix]` = 7 bytes (an empty item ID is impossible but the floor is safe). Used
 * to bound a tab's `stackCount` against the region before reading its stacks.
 */
const MIN_STACK_FRAMING = 7;

/**
 * Recover every item stack in the Bank Inventory component region [invStart, invEnd) by
 * an EXPLICIT structural tab-walk. Reads the inventory header
 * `[int32 reserved][int32 tabCount]`, then walks exactly `tabCount` tabs, reading exactly
 * each tab's declared `stackCount` records — and STOPS. The trailing "Chests" registry
 * (the old marker-search's phantom source) is never scanned, so phantom stacks are
 * structurally impossible rather than heuristically filtered.
 *
 * Every read is bounded to [0, invEnd): the walk operates on `buf.subarray(0, invEnd)`, so
 * a corrupt `tabCount`/`stackCount` throws `ERR_OUT_OF_RANGE` instead of escaping into the
 * trailing zone. `tabCount` and each `stackCount` are additionally bounded against the
 * remaining region before looping (anti-DoS, mirrors structural-walk). A record whose
 * placeholder/locked byte is not in {0,1} or whose qty is negative signals a misaligned
 * walk and throws {@link ParseError} (fail-loud — the editor refuses rather than emitting a
 * bad write offset, per the PROJECT.md corruption invariant).
 *
 * @param buf      The decompressed save buffer (read-only — never mutated).
 * @param invStart Inclusive start byte offset of the Inventory component payload (the
 *                 `[int32 reserved]` field — i.e. the component's dataStart).
 * @param invEnd   Exclusive end byte offset of the Inventory component region.
 * @returns An array of {@link InventoryStack}, each keyed by a distinct `qtyOffset` (the
 *          int32 quantity's byte offset — the patcher's write target). A real item ID
 *          appearing in >1 tab yields separate entries (D-01).
 * @throws {ParseError} the tab list is structurally inconsistent (count overruns the region
 *          or a record fails the stack-shape tripwire).
 * @throws {RangeError} a declared length/count reads past the region (bounded reader, T-1-04).
 */
export function findStacks(buf: Buffer, invStart: number, invEnd: number): InventoryStack[] {
  // Scope every read to [0, invEnd): offsets stay absolute (subarray shares byte indices
  // with buf for [0, invEnd)), but any read at or past invEnd throws ERR_OUT_OF_RANGE —
  // a corrupt count can never walk into the trailing "Chests" registry or past the region.
  const view = buf.subarray(0, invEnd);
  const reader = new BinaryReader(view);
  reader.seek(invStart);

  // Inventory header: [int32 reserved][int32 tabCount]. `reserved` is 0 in every observed
  // save and is not an edit target; `tabCount` drives the walk length.
  reader.readInt32(); // reserved inventory-level flag (unused)
  const tabCount = reader.readInt32();
  // Bound tabCount against the region BEFORE looping (T-02-01 — a giant count must not
  // drive an unbounded loop). Each tab needs at least MIN_TAB_FRAMING bytes.
  if (tabCount < 0 || tabCount * MIN_TAB_FRAMING > invEnd - reader.offset) {
    throw new ParseError(
      `inventory tabCount ${tabCount} exceeds region capacity (remaining ${invEnd - reader.offset} bytes, min ${MIN_TAB_FRAMING}/tab)`,
    );
  }

  const stacks: InventoryStack[] = [];
  for (let t = 0; t < tabCount; t++) {
    // Tab 0 is the unnamed default tab (3-int32 config); tabs 1+ carry a [string name]
    // and a 4-int32 config. Both end with [uint16 sentinel][int32 stackCount].
    if (t > 0) {
      reader.readString(); // tab display name (e.g. "Tab 1") — not an edit target
    }
    const configInts = t === 0 ? 3 : 4;
    for (let k = 0; k < configInts; k++) {
      reader.readInt32(); // tab config (capacity / lock flags) — opaque, not edited
    }
    reader.seek(reader.offset + 2); // uint16 sentinel (1 in all observed saves)
    const stackCount = reader.readInt32();
    // Bound stackCount against the remaining region before reading its records.
    if (stackCount < 0 || stackCount * MIN_STACK_FRAMING > invEnd - reader.offset) {
      throw new ParseError(
        `inventory tab ${t} stackCount ${stackCount} exceeds region capacity (remaining ${invEnd - reader.offset} bytes, min ${MIN_STACK_FRAMING}/stack)`,
      );
    }

    for (let i = 0; i < stackCount; i++) {
      const qtyOffset = reader.offset; // the int32 quantity offset — the patcher write target
      const qty = reader.readInt32();
      // Raw placeholder/locked bytes (read directly so we can validate {0,1} — readBool
      // would swallow a stray byte like 0x05 as `true` and hide a misaligned walk).
      const placeholderRaw = view.readUInt8(reader.offset);
      const lockedRaw = view.readUInt8(reader.offset + 1);
      reader.seek(reader.offset + 2);
      const itemId = reader.readString();

      // Fail-loud tripwire: in a correctly aligned tab-walk these are always genuine
      // booleans and qty >= 0. A violation means the walk drifted onto non-stack bytes —
      // throw rather than emit a bad qtyOffset the patcher would write to (corruption
      // invariant: refuse, never silently misalign).
      if (placeholderRaw > 1 || lockedRaw > 1 || qty < 0) {
        throw new ParseError(
          `inventory tab ${t} stack ${i} @${qtyOffset}: malformed record ` +
            `(qty=${qty} placeholder=${placeholderRaw} locked=${lockedRaw}) — tab walk misaligned`,
        );
      }

      stacks.push({
        qtyOffset,
        itemId,
        qty,
        placeholder: placeholderRaw === 1,
        locked: lockedRaw === 1,
      });
    }
  }

  return stacks;
}

/**
 * Resolve a single logical field against the recovered stacks, honoring the D-03
 * ambiguity contract (resolve-one / candidates-when-many / fail-loud-when-zero). Used by
 * a higher layer that wants ONE stack matching a predicate (e.g. "the stack at a known
 * item ID") — when >1 validated stack matches, this surfaces ALL matches as candidates
 * with evidence rather than silently picking one (T-02-08).
 *
 * NOTE on duplicate item IDs across tabs: {@link findStacks} returns each duplicate as a
 * distinct offset-keyed field (D-01). `resolveOne` is for the DIFFERENT case — a single
 * logical field that a caller expected to resolve to exactly one offset but found many.
 * The caller's predicate defines "logical field"; the ambiguity is surfaced, not hidden.
 *
 * @param stacks  The recovered stacks (e.g. from {@link findStacks}).
 * @param matchFn Predicate identifying the logical field (returns true for matching stacks).
 * @returns `{kind:'resolved', stack}` if exactly one match; `{kind:'candidates', candidates}`
 *          if >1 match (D-03 — never auto-picked); `{kind:'notFound'}` if zero matches.
 */
export function resolveOne(
  stacks: readonly InventoryStack[],
  matchFn: (s: InventoryStack) => boolean,
): ResolveResult {
  const matches = stacks.filter(matchFn);
  if (matches.length === 0) return { kind: 'notFound' };
  if (matches.length === 1) return { kind: 'resolved', stack: matches[0]! };
  // D-03 candidates-when-many: surface every match with evidence (offset + why it matched).
  // Never collapse to one — a higher layer (or the user) disambiguates (T-02-08).
  const candidates: FieldCandidate[] = matches.map((s) => ({
    offset: s.qtyOffset,
    evidence: `itemId=${s.itemId} qty=${s.qty} placeholder=${s.placeholder} locked=${s.locked}`,
  }));
  return { kind: 'candidates', candidates };
}
// The closing brace of an `export`-bearing module is where esbuild source-maps the
// __export/__toCommonJS/__copyProps interop helper's defensive "key already on target"
// arm — it never fires for a real require'd module (NOT inventory-parser logic). Ignoring
// this line's coverage excludes only that injected artifact; the function bodies are
// fully covered. (Same pattern as src/binary-reader.ts / src/codec.ts — proven via a
// pure-CJS probe in 01-02.)
/* c8 ignore next */
