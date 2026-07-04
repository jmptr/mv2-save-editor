/* c8 ignore start */
// Bank Inventory parser — the one place structural descent doesn't suffice.
//
// Item stacks are nested into named tabs inside the Bank entity's Inventory component.
// A naive contiguous walk stops at the first tab boundary (~296 of 689 stacks — RESEARCH
// §Pitfall 1); the bounded marker-search + "6-bytes-before-the-length-prefix" recipe +
// SC-3 context-validation recovers ALL 689 across every tab (RESEARCH §Pattern 3).
//
// Layout at each stack (the recipe — RESEARCH §Code Examples):
//   [int32 qty]    (4 bytes)   at qtyOffset
//   [bool placeholder] (1 byte) at qtyOffset + 4
//   [bool locked]      (1 byte) at qtyOffset + 5
//   [7-bit length prefix] (1 byte) at qtyOffset + 6   (= hit - 1, where hit is the
//                                                     offset of the item-ID body)
//   [item-ID UTF-8 body]           at qtyOffset + 7   (= hit)
//
// The marker search finds 'MelvorBase:' (the namespaced item-ID prefix) at `hit`; the
// 7-bit prefix at `hit - 1` must equal the item-ID byte length; the stack header is then
// at `(hit - 1) - 6`. Each candidate is context-validated before becoming a stack: the
// prefix must match the ID length, qty must be in [0, 2^31-1], placeholder/locked bytes
// must be in {0,1}, and the whole stack must lie within [invStart, invEnd). False matches
// are rejected, never silently injected (T-02-05); reads never escape the region (T-02-03).
//
// Implements: D-01 (offset-keyed stacks — duplicate item IDs across tabs are DISTINCT
// fields, NOT D-03 ambiguity), D-03 (a single logical field resolving to >1 offset is
// surfaced as candidates, never auto-picked), D-04 (coverage-gated core), D-08
// (noUncheckedIndexedAccess — uses readUInt8 not buf[i]). Mitigates T-02-01 (contiguous
// under-parse → bounded marker-search recovers all 689), T-02-03 (read past invEnd →
// every read bounded to [invStart, invEnd)), T-02-05 (false marker match → context-
// validation rejects), T-02-08 (ambiguous logical field auto-picked → candidates surfaced).
/* c8 ignore end */

import { BinaryReader } from './binary-reader';
import type { FieldCandidate } from './field-table';

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

const MARKER = 'MelvorBase:';
const MARKER_BYTES = Buffer.from(MARKER, 'utf8');
const MARKER_LEN = MARKER_BYTES.length;
const INT32_MAX = 2147483647;
const STACK_HEADER_WIDTH = 6; // [int32 qty][bool placeholder][bool locked]

/**
 * Recover every valid item stack in the Bank Inventory component region [invStart, invEnd)
 * via the bounded marker-search + "6-bytes-before-the-length-prefix" recipe (RESEARCH
 * §Pattern 3). A contiguous walk would stop at the first tab boundary (~296 of 689
 * stacks — RESEARCH §Pitfall 1); the marker search finds every `MelvorBase:` hit and
 * context-validates each, recovering all 689 across every tab.
 *
 * Every read is bounded to [invStart, invEnd): a candidate whose stack header would fall
 * before `invStart` is skipped (SC-5), and a candidate whose item-ID body would overrun
 * `invEnd` is skipped. False marker matches are rejected by the SC-3 context-validation
 * (prefix == ID byte length, qty in [0, 2^31-1], placeholder/locked raw bytes in {0,1}).
 *
 * @param buf      The decompressed save buffer (read-only — never mutated).
 * @param invStart Inclusive start byte offset of the Inventory component region.
 * @param invEnd   Exclusive end byte offset of the Inventory component region.
 * @returns An array of {@link InventoryStack}, each keyed by a distinct `qtyOffset`.
 *          Duplicate item IDs across tabs appear as separate entries (D-01).
 */
export function findStacks(buf: Buffer, invStart: number, invEnd: number): InventoryStack[] {
  const stacks: InventoryStack[] = [];
  let searchFrom = invStart;

  while (searchFrom < invEnd) {
    // Find the next 'MelvorBase:' marker within [searchFrom, invEnd). buf.indexOf returns
    // -1 when no more matches; a hit at or past invEnd is out of region (SC-5).
    const hit = buf.indexOf(MARKER_BYTES, searchFrom);
    if (hit === -1 || hit >= invEnd) break;

    // The 7-bit length prefix sits one byte before the item-ID body. It must be in region.
    const prefixOffset = hit - 1;
    if (prefixOffset < invStart) {
      searchFrom = hit + 1;
      continue;
    }
    const prefixByte = buf.readUInt8(prefixOffset); // throws ERR_OUT_OF_RANGE if OOB (T-1-04)

    // SC-3 false-match guard: the prefix must equal the item-ID byte length. Since we found
    // 'MelvorBase:' (10 bytes) at `hit`, the declared body must be at least 10 bytes. A
    // prefix shorter than the marker itself means the "match" is a coincidental byte
    // pattern, not a real item ID (T-02-05).
    if (prefixByte < MARKER_LEN) {
      searchFrom = hit + 1;
      continue;
    }

    // SC-5: the item-ID body [hit, hit + prefixByte) must lie within [invStart, invEnd).
    if (hit + prefixByte > invEnd) {
      searchFrom = hit + 1;
      continue;
    }

    // The stack header sits 6 bytes before the 7-bit prefix: (hit - 1) - 6 = hit - 7.
    // [int32 qty][bool placeholder][bool locked] = 6 bytes.
    const stackStart = prefixOffset - STACK_HEADER_WIDTH;
    // SC-5: a stack header before invStart is out of region — skip (T-02-03).
    if (stackStart < invStart) {
      searchFrom = hit + 1;
      continue;
    }
    // The 6-byte stack header must also lie within the region.
    if (stackStart + STACK_HEADER_WIDTH > invEnd) {
      searchFrom = hit + 1;
      continue;
    }

    // Read the item-ID body and the stack header via a scoped BinaryReader. Constructing
    // the reader on buf.subarray(stackStart, hit + prefixByte) scopes every read to the
    // region; BinaryReader.readInt32 / readBool throw ERR_OUT_OF_RANGE on OOB (T-1-04).
    const itemId = buf.subarray(hit, hit + prefixByte).toString('utf8');

    // Read the raw placeholder/locked bytes BEFORE readBool so we can validate {0,1}
    // (readBool returns `b !== 0` — it would swallow a byte like 0x05 as `true`, which
    // is a false-match signal we must reject per SC-3).
    const placeholderRaw = buf.readUInt8(stackStart + 4);
    const lockedRaw = buf.readUInt8(stackStart + 5);

    // SC-3 context-validation: placeholder/locked must be genuine booleans (raw byte 0 or 1).
    // A byte > 1 indicates a non-stack byte pattern (T-02-05 false match).
    if (placeholderRaw !== 0 && placeholderRaw !== 1) {
      searchFrom = hit + 1;
      continue;
    }
    if (lockedRaw !== 0 && lockedRaw !== 1) {
      searchFrom = hit + 1;
      continue;
    }

    // Read the int32 qty. readInt32LE returns a signed 32-bit value; SC-3 requires [0, 2^31-1].
    const reader = new BinaryReader(buf.subarray(stackStart, stackStart + STACK_HEADER_WIDTH));
    const qty = reader.readInt32();
    // SC-3: a negative qty is a false-match / corrupted-byte signal, not a real stack.
    if (qty < 0 || qty > INT32_MAX) {
      searchFrom = hit + 1;
      continue;
    }

    stacks.push({
      qtyOffset: stackStart,
      itemId,
      qty,
      placeholder: placeholderRaw === 1,
      locked: lockedRaw === 1,
    });

    // Advance past this marker to find the next one. Multiple stacks of the same item ID
    // across tabs are distinct entries (D-01 — each gets its own qtyOffset).
    searchFrom = hit + 1;
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
