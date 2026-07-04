/* c8 ignore start */
// Patcher — same-width, in-place patch engine (SC-1..SC-4, SAFE-01, EDIT-04, D-01..D-04).
//
// patchSave(buffer, fieldTable, edits) -> { buffer, changeReport } resolves each edit to its
// FieldEntry by key (never re-deriving an offset — offsets live only in the FieldTable, SC-4),
// validates every value against its kind/range (SAFE-01, rejecting rather than clamping),
// expands skill level/xp edits into their coupled pair via the StandardExperienceTable (EDIT-04),
// writes onto a Buffer.from(input) copy with writeBigInt64LE / writeInt32LE / writeDoubleLE at the
// FieldEntry offset (SC-1 length-neutral by construction), then self-verifies by re-parsing and
// whole-buffer-diffing so only intended byte ranges can have changed (SC-4, D-03).
//
// Collect-all-then-write (D-01, the INVERSE of the parsers' throw-on-first style): the whole batch
// is validated first; if any edit fails, a typed error enumerating the violations is thrown and
// NOTHING is written (atomic). LevelCap and header GP/SC mirrors are readOnly and rejected as
// targets (SC-2). Currency is bigint end-to-end (writeBigInt64LE — never Number, never
// writeDoubleLE for int64; precision above 2^53, CLAUDE.md / T-03-04).
//
// Write mechanism (RESEARCH §Pattern 1): Buffer.from(input) + writeXxxLE(value, offset). NOT the
// append-only BinaryWriter (03-PATTERNS Anti-pattern — it cannot target an arbitrary offset without
// re-serializing the whole 2.28 MB save, the byte-insertion risk CLAUDE.md forbids).
//
// Implements: SC-1 (declared-width, length-neutral), SC-2/SAFE-01/D-01 (validate-all-reject-none),
// SC-3/EDIT-04/D-02 (XP<->Level coupling, cap never written), SC-4/D-03 (self-verify diff),
// D-04 (new buffer + change report, input never mutated).
// Mitigates: T-03-02 (pre-write range/type validation), T-03-03 (same-width write + self-verify
// diff), T-03-04 (int64 as bigint), T-03-05 (readOnly targets rejected), T-03-06 (non-finite XP).
/* c8 ignore end */

import { type FieldEntry, type FieldTable } from './field-table';
import { xpForLevel, levelForXp } from './experience-table';
import { parseSave } from './save-parser';

/** Inclusive upper bound for a signed 32-bit integer (bank stack qty). */
const INT32_MAX = 2_147_483_647;
/** Inclusive upper bound for a signed 64-bit integer (wallet currency). */
const INT64_MAX = 9_223_372_036_854_775_807n;

/**
 * A single requested edit: target a field by its FieldTable key and supply the new value. int64
 * currency edits carry a `bigint`; int32 (qty/level) and double (xp) edits carry a `number`.
 */
export interface Edit {
  /** The FieldTable key to write (e.g. `wallet.GoldPieces`, `skill.<id>.level`). */
  fieldKey: string;
  /** The new value. `bigint` for int64 currency; `number` for int32/double. */
  newValue: bigint | number;
}

/**
 * One row of the change report — a single field write actually applied. A skill level/xp edit
 * expands to TWO rows (the edited field plus its coupled counterpart). Never includes LevelCap.
 */
export interface ChangeReportRow {
  /** The FieldTable key written. */
  fieldKey: string;
  /** The value before the write (the FieldEntry's parsed value). */
  oldValue: bigint | number;
  /** The value written. */
  newValue: bigint | number;
  /** The byte offset written (from the FieldEntry — SC-4). */
  offset: number;
  /** The byte width written (int32=4, int64=8, double=8). */
  width: number;
}

/**
 * Result of {@link patchSave}: a NEW buffer (the input is never mutated — D-04) plus the change
 * report describing every field write applied.
 */
export interface PatchResult {
  /** A fresh Buffer with the edits applied (same length as the input — SC-1). */
  buffer: Buffer;
  /** One row per field write (a skill edit yields two rows; LevelCap never appears). */
  changeReport: ChangeReportRow[];
}

/** A single collected validation failure (D-01 — the batch collects ALL of these). */
export interface Violation {
  /** The edit's target key. */
  fieldKey: string;
  /** Human-readable reason the value was rejected. */
  reason: string;
}

/**
 * Base class for all patcher errors (mirrors the {@link import('./field-table').ParseError}
 * pattern — constructor sets `this.name`). A sibling hierarchy to ParseError, not a subclass:
 * patch failures are a distinct concern from parse failures.
 */
export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchError';
  }
  /* c8 ignore next */
}

/**
 * Aggregate validation failure (D-01 collect-all): carries the FULL list of violations, not just
 * the first. Thrown after the whole batch is checked — nothing is written when this fires (atomic).
 */
export class ValidationError extends PatchError {
  /** Every collected violation (one per failing edit). */
  readonly violations: Violation[];

  constructor(violations: Violation[]) {
    super(
      `patch rejected: ${violations.length} invalid edit(s) — ` +
        violations.map((v) => `${v.fieldKey}: ${v.reason}`).join('; ') +
        ` (SAFE-01 / D-01 — nothing written)`,
    );
    this.name = 'ValidationError';
    this.violations = violations;
  }
  /* c8 ignore next */
}

/**
 * An edit targeted a readOnly field (LevelCap or a header GP/SC mirror — SC-2). These are never
 * write targets; only the authoritative wallet currency and skill xp/level are editable.
 */
export class ReadOnlyFieldError extends PatchError {
  /** The readOnly key the edit tried to target. */
  readonly fieldKey: string;

  constructor(fieldKey: string) {
    super(
      `field "${fieldKey}" is readOnly and can never be a write target ` +
        `(SC-2 — LevelCap and header GP/SC mirrors are not editable)`,
    );
    this.name = 'ReadOnlyFieldError';
    this.fieldKey = fieldKey;
  }
  /* c8 ignore next */
}

/**
 * An edit key was not present in the FieldTable (the field does not exist in this save).
 */
export class UnknownFieldError extends PatchError {
  /** The unresolved key. */
  readonly fieldKey: string;

  constructor(fieldKey: string) {
    super(`field "${fieldKey}" is not present in the FieldTable (unknown edit target)`);
    this.name = 'UnknownFieldError';
    this.fieldKey = fieldKey;
  }
  /* c8 ignore next */
}

/**
 * A batch set BOTH `skill.<id>.level` AND `skill.<id>.xp` for the same skill (A2). The two edits
 * would each compute the other via the experience-table, so the batch is ambiguous — reject it and
 * let the caller pick exactly one.
 */
export class ConflictingEditError extends PatchError {
  /** The skill whose level and xp were both edited. */
  readonly skillId: string;

  constructor(skillId: string) {
    super(
      `conflicting edits for skill "${skillId}": a batch may set EITHER level OR xp, not both ` +
        `(each derives the other via the experience-table — pick one)`,
    );
    this.name = 'ConflictingEditError';
    this.skillId = skillId;
  }
  /* c8 ignore next */
}

/**
 * The self-verify diff (D-03) found a changed byte outside every intended [offset, offset+width)
 * range, or the re-parse did not read an edited value back. This is the corruption backstop — it
 * should never fire for a correct FieldTable; if it does, patchSave throws instead of returning a
 * possibly-corrupt buffer.
 */
export class UnintendedChangeError extends PatchError {
  constructor(message: string) {
    super(`self-verify failed (D-03): ${message}`);
    this.name = 'UnintendedChangeError';
  }
  /* c8 ignore next */
}

/** A concrete write to apply: the resolved FieldEntry plus the validated value. */
interface PlannedWrite {
  fieldKey: string;
  entry: FieldEntry;
  value: bigint | number;
}

/** Parsed shape of a `skill.<id>.<suffix>` key, or `null` if the key is not a skill field. */
interface SkillKey {
  skillId: string;
  suffix: string;
}

/**
 * Split a `skill.<id>.<suffix>` key into its skillId and suffix. Skill entity IDs are namespaced
 * with `:` (e.g. `MelvorBase:Woodcutting`) and never contain `.`, so the last `.` separates the
 * suffix. Returns `null` for any key not starting with `skill.`.
 */
function parseSkillKey(key: string): SkillKey | null {
  if (!key.startsWith('skill.')) return null;
  const rest = key.slice('skill.'.length);
  const lastDot = rest.lastIndexOf('.');
  if (lastDot < 0) return null;
  return { skillId: rest.slice(0, lastDot), suffix: rest.slice(lastDot + 1) };
}

/**
 * Validate a plain (non-skill) field value by kind. Returns a rejection reason string, or `null`
 * if the value is acceptable. int64 currency must be a `bigint` in 0n..INT64_MAX; int32 qty must
 * be a finite integer in 0..INT32_MAX; double must be finite and >= 0.
 */
function validatePlain(entry: FieldEntry, value: bigint | number): string | null {
  switch (entry.kind) {
    case 'int64':
      if (typeof value !== 'bigint') return 'currency must be a bigint (int64)';
      if (value < 0n || value > INT64_MAX) return `currency out of range 0..${INT64_MAX}`;
      return null;
    case 'int32':
      if (typeof value !== 'number' || !Number.isInteger(value)) return 'value must be an integer';
      if (value < 0 || value > INT32_MAX) return `value out of range 0..${INT32_MAX}`;
      return null;
    case 'double':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'value must be finite';
      if (value < 0) return 'value must be >= 0';
      return null;
    /* c8 ignore next 2 */
    default:
      return `unsupported kind for write: ${entry.kind}`;
  }
}

/**
 * Apply a single same-width write onto the output buffer at the FieldEntry's offset. The LE APIs
 * are exactly those {@link import('./binary-writer').BinaryWriter} delegates to, applied at an
 * arbitrary offset on a copy (SC-1 — width is fixed by kind, so length is preserved).
 */
function applyWrite(out: Buffer, entry: FieldEntry, value: bigint | number): void {
  switch (entry.kind) {
    case 'int64':
      out.writeBigInt64LE(value as bigint, entry.offset); // 8B GP/SC — bigint, never Number
      break;
    case 'int32':
      out.writeInt32LE(value as number, entry.offset); // 4B qty/level
      break;
    case 'double':
      out.writeDoubleLE(value as number, entry.offset); // 8B XP
      break;
    /* c8 ignore next 2 */
    default:
      throw new PatchError(`unsupported kind for write: ${entry.kind}`);
  }
}

/**
 * Self-verify the patched buffer (D-03). Asserts length is unchanged (SC-1), whole-buffer-diffs
 * `out` against `input` so every differing byte lies inside an intended [offset, offset+width)
 * range (else {@link UnintendedChangeError}), then re-parses `out` with the SAME {@link parseSave}
 * to confirm it is still parseable and each edited field reads back the intended value.
 */
function selfVerify(input: Buffer, out: Buffer, changeReport: ChangeReportRow[]): void {
  if (out.length !== input.length) {
    throw new UnintendedChangeError(`length changed ${input.length} -> ${out.length}`);
  }
  const ranges: Array<[number, number]> = changeReport.map((r) => [r.offset, r.offset + r.width]);
  for (let i = 0; i < input.length; i++) {
    if (out[i] !== input[i]) {
      const covered = ranges.some(([s, e]) => i >= s && i < e);
      if (!covered) {
        throw new UnintendedChangeError(
          `byte ${i} changed outside any intended [offset,offset+width) range`,
        );
      }
    }
  }
  // Re-parse with the same parser (never a second reader) — confirms still-parseable and that the
  // edited entries read back the intended values.
  const reparsed = parseSave(out).fieldTable;
  for (const row of changeReport) {
    const entry = reparsed.get(row.fieldKey);
    if (entry === undefined) {
      throw new UnintendedChangeError(`re-parse no longer resolves edited field "${row.fieldKey}"`);
    }
    if (entry.value !== row.newValue) {
      throw new UnintendedChangeError(
        `re-parse mismatch for "${row.fieldKey}": read ${String(entry.value)}, expected ${String(row.newValue)}`,
      );
    }
  }
}

/**
 * Apply a batch of same-width, in-place edits to a decompressed save buffer.
 *
 * Resolves each edit to its {@link FieldEntry} by key (unknown key → {@link UnknownFieldError};
 * readOnly target → {@link ReadOnlyFieldError}), rejects a batch that sets both level and xp for
 * one skill ({@link ConflictingEditError}), validates every resolved write against its kind/range
 * and collects ALL violations ({@link ValidationError} — nothing written on any failure, D-01),
 * expands skill level/xp edits to their coupled pair via the StandardExperienceTable (EDIT-04),
 * writes onto a `Buffer.from(buffer)` copy (input never mutated — D-04), then self-verifies by
 * whole-buffer diff + re-parse (SC-4, D-03).
 *
 * @param buffer The decompressed save buffer to patch (never mutated — a copy is returned).
 * @param fieldTable The FieldTable from {@link parseSave} — the sole home of offsets (SC-4).
 * @param edits The requested edits.
 * @returns `{ buffer, changeReport }` — a fresh patched buffer plus the applied change rows.
 * @throws {UnknownFieldError} an edit key is not in the FieldTable.
 * @throws {ReadOnlyFieldError} an edit targets a readOnly field (LevelCap / header mirror).
 * @throws {ConflictingEditError} a batch sets both `skill.<id>.level` and `skill.<id>.xp`.
 * @throws {ValidationError} one or more values are out of range/type (carries all violations).
 * @throws {UnintendedChangeError} the self-verify diff found an unintended change (D-03 backstop).
 */
export function patchSave(buffer: Buffer, fieldTable: FieldTable, edits: Edit[]): PatchResult {
  // 1. Resolve every key up front (unknown / readOnly are fail-loud typed errors, not violations),
  //    and record which skill suffixes appear so a level+xp conflict can be rejected (A2).
  const skillSuffixes = new Map<string, Set<string>>();
  for (const edit of edits) {
    const entry = fieldTable.get(edit.fieldKey);
    if (entry === undefined) throw new UnknownFieldError(edit.fieldKey);
    if (entry.readOnly === true) throw new ReadOnlyFieldError(edit.fieldKey);

    const skill = parseSkillKey(edit.fieldKey);
    if (skill && (skill.suffix === 'level' || skill.suffix === 'xp')) {
      const set = skillSuffixes.get(skill.skillId) ?? new Set<string>();
      set.add(skill.suffix);
      skillSuffixes.set(skill.skillId, set);
    }
  }
  for (const [skillId, suffixes] of skillSuffixes) {
    if (suffixes.has('level') && suffixes.has('xp')) {
      throw new ConflictingEditError(skillId);
    }
  }

  // 2. Validate + expand into concrete writes; COLLECT all violations (D-01 collect-all).
  const violations: Violation[] = [];
  const writes: PlannedWrite[] = [];
  for (const edit of edits) {
    const entry = fieldTable.get(edit.fieldKey)!; // resolved in step 1
    const skill = parseSkillKey(edit.fieldKey);

    if (skill && skill.suffix === 'level') {
      // Skill level: validate 1..cap BEFORE deriving XP (xpForLevel is undefined past the table).
      const cap = fieldTable.getRequired(`skill.${skill.skillId}.levelCap`).value as number;
      const L = edit.newValue;
      if (typeof L !== 'number' || !Number.isInteger(L) || L < 1 || L > cap) {
        violations.push({ fieldKey: edit.fieldKey, reason: `level must be an integer in 1..${cap}` });
        continue;
      }
      const xpEntry = fieldTable.getRequired(`skill.${skill.skillId}.xp`);
      writes.push({ fieldKey: edit.fieldKey, entry, value: L });
      writes.push({ fieldKey: xpEntry.key, entry: xpEntry, value: xpForLevel(L) }); // EDIT-04 coupling
      continue;
    }

    if (skill && skill.suffix === 'xp') {
      // Skill xp: reject non-finite / negative / over-cap (A1 — reject, never clamp).
      const cap = fieldTable.getRequired(`skill.${skill.skillId}.levelCap`).value as number;
      const X = edit.newValue;
      const maxXp = xpForLevel(cap);
      if (typeof X !== 'number' || !Number.isFinite(X) || X < 0 || X > maxXp) {
        violations.push({
          fieldKey: edit.fieldKey,
          reason: `xp must be a finite number in 0..${maxXp}`,
        });
        continue;
      }
      const levelEntry = fieldTable.getRequired(`skill.${skill.skillId}.level`);
      writes.push({ fieldKey: edit.fieldKey, entry, value: X });
      writes.push({ fieldKey: levelEntry.key, entry: levelEntry, value: levelForXp(X, cap) }); // coupling
      continue;
    }

    // Plain field (wallet currency int64 / bank qty int32).
    const reason = validatePlain(entry, edit.newValue);
    if (reason !== null) {
      violations.push({ fieldKey: edit.fieldKey, reason });
      continue;
    }
    writes.push({ fieldKey: edit.fieldKey, entry, value: edit.newValue });
  }

  // 3. Any violation → throw with the FULL list; write NOTHING (atomic, D-01).
  if (violations.length > 0) throw new ValidationError(violations);

  // 4. Write onto a length-exact copy (input never mutated — D-04; same width → SC-1).
  const out = Buffer.from(buffer);
  const changeReport: ChangeReportRow[] = [];
  for (const w of writes) {
    const oldValue = w.entry.value as bigint | number;
    applyWrite(out, w.entry, w.value);
    changeReport.push({
      fieldKey: w.fieldKey,
      oldValue,
      newValue: w.value,
      offset: w.entry.offset,
      width: w.entry.width,
    });
  }

  // 5. Self-verify: whole-buffer diff + re-parse (SC-4, D-03) — throws on any unintended change.
  selfVerify(buffer, out, changeReport);

  return { buffer: out, changeReport };
}
