/* c8 ignore start */
// FieldTable — the sole home of byte offsets in the save editor (SC-4 boundary).
//
// Every editable field in the parsed save is a FieldEntry: { offset, kind, width, value }
// plus the SC-2/SC-3 flags (readOnly / authoritative / mirrors / candidates) that let
// Phase 3's patcher distinguish the wallet-authoritative currency from the header-mirror
// snapshots (so it can never target the header) and that surface ambiguous matches for
// a higher layer instead of silently picking one (D-03).
//
// The discriminated union on `kind` types `value` per primitive: int64 → bigint (NEVER
// number — CLAUDE.md precision constraint, threat T-02-06). This is enforced at compile
// time by the union; `npx tsc --noEmit` is the type-level proof.
//
// D-03 contract (resolve-one / candidates-when-many / fail-loud-when-zero):
//   - Exactly one context-validated match → add() the resolved entry.
//   - More than one context-validated candidate → addCandidates(); retrieve intact
//     via getCandidates(); NEVER auto-pick.
//   - Zero matches for a required field → getRequired() throws RequiredFieldMissingError.
//
// Implements: D-03 (ambiguous-match contract), D-04 (coverage-gated core),
// D-07/D-08 (strict + noUncheckedIndexedAccess). Mitigates T-02-06 (int64 as Number).
// Wave 2 parsers consume this; Wave 3's patcher reads { offset, kind, width, value }.
/* c8 ignore end */

/**
 * The primitive kind of a {@link FieldEntry}. Discriminates the value's runtime type:
 * `int32`/`double` → number, `int64` → bigint (never number), `bool` → boolean,
 * `string` → string. Mirrors the .NET `BinaryReader` primitive set the save format is
 * encoded in (RESEARCH Architecture Pattern 4).
 */
export type FieldKind = 'int32' | 'int64' | 'double' | 'bool' | 'string';

/**
 * A candidate offset for an unresolved field, with evidence describing why it validated
 * (D-03). When a logical field has more than one context-validated match, the parser
 * stores all candidates rather than auto-picking one (SC-3); a higher layer (or the user)
 * disambiguates. The evidence string is human-readable and JSON-safe so the view model
 * can surface it in Phase 5's browse UI.
 */
export interface FieldCandidate {
  /** Candidate byte offset within the decompressed save buffer. */
  offset: number;
  /** Human-readable description of the context-validation that accepted this candidate. */
  evidence: string;
}

/**
 * Shared shape for every {@link FieldEntry} variant. The `key` uniquely identifies the
 * logical field (e.g. `wallet.GoldPieces`, `skill.Woodcutting.level`); `offset` is the
 * byte position in the decompressed buffer (the FieldTable is the sole home of offsets —
 * SC-4); `width` is the byte width Phase 3's patcher writes (same-width in-place edits).
 */
interface FieldEntryBase {
  /** Logical field key. Unique among resolved entries (see {@link FieldTable.add}). */
  key: string;
  /** Byte offset in the decompressed save buffer. Lives ONLY in the FieldTable (SC-4). */
  offset: number;
  /** Byte width (int32=4, int64=8, double=8, bool=1, string=variable). */
  width: number;
  /**
   * True if this field must never be a write target. Used to lock the SaveHeader GP /
   * SlayerCoins mirrors (SC-2) — only the Bank wallet is authoritative for currency.
   */
  readOnly?: boolean;
  /**
   * True if this field IS the authoritative write target for its value (SC-2). Set on
   * the Bank wallet int64 currencies; absent on header mirrors.
   */
  authoritative?: boolean;
  /**
   * Key of the authoritative field this one mirrors (SC-2). E.g. `header.GP.mirrors =
   * 'wallet.GoldPieces'` — the header is a read-only snapshot of the wallet, never written.
   */
  mirrors?: string;
  /**
   * Optional alternates attached to a resolved entry (e.g. when the parser picked one
   * candidate but notes the others). For unresolved fields (no entry, just candidates),
   * use {@link FieldTable.addCandidates}.
   */
  candidates?: FieldCandidate[];
}

/** A signed 32-bit LE integer field (qty, level, levelCap). value: number. width: 4. */
interface Int32FieldEntry extends FieldEntryBase {
  kind: 'int32';
  value: number;
}

/**
 * A signed 64-bit LE integer field (GP, Slayer Coins). value: bigint — NEVER number
 * (CLAUDE.md precision constraint, threat T-02-06). The discriminated union on `kind`
 * enforces this at compile time; `npx tsc --noEmit` rejects `value: number` here.
 * width: 8.
 */
interface Int64FieldEntry extends FieldEntryBase {
  kind: 'int64';
  value: bigint;
}

/** An 8-byte IEEE 754 LE double field (skill XP). value: number. width: 8. */
interface DoubleFieldEntry extends FieldEntryBase {
  kind: 'double';
  value: number;
}

/** A 1-byte boolean field (stack placeholder / locked). value: boolean. width: 1. */
interface BoolFieldEntry extends FieldEntryBase {
  kind: 'bool';
  value: boolean;
}

/** A 7-bit-length-prefixed UTF-8 string field (item ID, entity ID). value: string. */
interface StringFieldEntry extends FieldEntryBase {
  kind: 'string';
  value: string;
}

/**
 * Discriminated union over {@link FieldKind}. TypeScript narrows `value` per `kind`, so
 * `entry.value` is `bigint` when `entry.kind === 'int64'` and `number` for `int32`/`double`.
 * Phase 3's patcher consumes `{ offset, kind, width, value }` directly for same-width
 * in-place writes.
 */
export type FieldEntry =
  | Int32FieldEntry
  | Int64FieldEntry
  | DoubleFieldEntry
  | BoolFieldEntry
  | StringFieldEntry;

/**
 * Base class for all parser-level errors. Wave 2 parsers throw this (or a subclass)
 * for fail-loud parse failures; `RangeError` (built-in) is used for bounds violations.
 * Never silently corrupts — a malformed save throws, never emits a wrong-but-plausible model.
 */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Thrown by {@link FieldTable.getRequired} when a required field has zero matches (D-03
 * zero-match rule: fail loud, never emit a silently-wrong model). Carries the missing
 * field's key so the caller can report which required field was unlocatable.
 */
export class RequiredFieldMissingError extends ParseError {
  /** The logical field key that was required but absent from the FieldTable. */
  readonly fieldKey: string;

  constructor(fieldKey: string) {
    super(
      `required field "${fieldKey}" was not added to the FieldTable ` +
        `(D-03 zero-match rule — fail loud, never emit a silently-wrong model)`,
    );
    this.name = 'RequiredFieldMissingError';
    this.fieldKey = fieldKey;
  }
}

/**
 * The sole home of byte offsets in the save editor (SC-4 boundary). A parser populates
 * one FieldTable per parse pass (re-derived fresh on every load — never persisted); Phase 3's
 * patcher reads entries by key to apply same-width in-place edits.
 *
 * Two storage maps:
 *   - resolved entries (Map<key, FieldEntry>) — exactly one context-validated match
 *   - unresolved candidates (Map<key, FieldCandidate[]>) — more than one validated match
 *     (D-03 candidates-when-many); retrievable intact via getCandidates(), NEVER auto-picked.
 *
 * Keys are unique within each map (add / addCandidates throw on duplicates); a logical
 * field is EITHER resolved OR unresolved, never both (the parser decides which before
 * populating).
 */
export class FieldTable {
  private readonly entries = new Map<string, FieldEntry>();
  private readonly unresolved = new Map<string, FieldCandidate[]>();

  /**
   * Add a resolved {@link FieldEntry}. Keys are unique for resolved fields — a duplicate
   * add throws (the parser has a bug if it resolves the same key twice).
   */
  add(entry: FieldEntry): void {
    if (this.entries.has(entry.key)) {
      throw new Error(`duplicate resolved field key: "${entry.key}"`);
    }
    this.entries.set(entry.key, entry);
  }

  /**
   * Attach candidates for an unresolved field (D-03 candidates-when-many). The list is
   * retrievable intact via {@link getCandidates} — never collapsed to one (no auto-pick).
   * Throws on a duplicate unresolved key (the parser has a bug if it surfaces candidates
   * for the same key twice).
   */
  addCandidates(key: string, candidates: FieldCandidate[]): void {
    if (this.unresolved.has(key)) {
      throw new Error(`duplicate unresolved field key: "${key}"`);
    }
    this.unresolved.set(key, candidates);
  }

  /**
   * Look up a resolved entry by key. Returns `undefined` if the key was never added (use
   * {@link getRequired} for required fields that must fail loud on absence).
   */
  get(key: string): FieldEntry | undefined {
    return this.entries.get(key);
  }

  /**
   * Look up the candidate list for an unresolved field (D-03). Returns `undefined` if the
   * key was never surfaced. The returned list is the same array passed to
   * {@link addCandidates} — intact, not collapsed.
   */
  getCandidates(key: string): FieldCandidate[] | undefined {
    return this.unresolved.get(key);
  }

  /**
   * Look up a required resolved entry by key. Throws {@link RequiredFieldMissingError}
   * (D-03 zero-match rule — fail loud) if the field was never added. Use this for fields
   * whose absence makes the model wrong (e.g. `wallet.GoldPieces`).
   */
  getRequired(key: string): FieldEntry {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      throw new RequiredFieldMissingError(key);
    }
    return entry;
  }

  /**
   * Return every resolved entry whose {@link FieldEntry.mirrors} points at {@link authoritativeKey}
   * — i.e. the cosmetic snapshots that shadow an authoritative field (SC-2). The Bank wallet's
   * `GoldPieces`/`SlayerCoins` each have one header mirror (`header.GP`/`header.SlayerCoins`); the
   * GAME reads those header snapshots on load, so the patcher must write them in lock-step with the
   * authoritative wallet value or the edit is invisible in-game until the next in-game save. Returns
   * an empty array for a key with no mirror. Read-only for callers — never mutate the entries.
   */
  mirrorsOf(authoritativeKey: string): FieldEntry[] {
    const out: FieldEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.mirrors === authoritativeKey) out.push(entry);
    }
    return out;
  }
  // The closing brace of an `export class` is where esbuild source-maps the
  // __export/__toCommonJS/__copyProps interop helper's defensive "key already on target"
  // arm — it never fires for a real require'd module (NOT FieldTable logic). Ignoring
  // this line's coverage excludes only that injected artifact; the class body is fully
  // covered. (Same pattern as src/binary-reader.ts — proven via a pure-CJS probe in 01-02.)
  /* c8 ignore next */
}
