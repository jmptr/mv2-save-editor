/* c8 ignore start */
// Experience parser — XP/Cap/Level triple, context-validated, cap readOnly (SC-3, Pitfall 5).
//
// Parses a skill entity's Experience component, located by 02-02's walkComponents at its
// dataStart boundary. The Experience layout is (RESEARCH §Code Examples, §Pitfall 5):
//   [double XP (8B)][int32 LevelCap (4B)][int32 Level (4B)]   = 16 bytes
//
// The three values are recorded at DISTINCT offsets — xp(+0), levelCap(+8), level(+12) —
// so Phase 3's patcher never confuses cap and level (Pitfall 5: two adjacent int32s). The
// LevelCap FieldEntry is marked readOnly:true (Phase 3 NEVER patches the cap); XP and Level
// are writable (Phase 3's edit targets). A size < 16 is rejected before any read.
//
// SC-3 context-validation: the parser rejects any triple where 1<=levelCap<=200,
// 1<=level<=levelCap, and XP is finite & >= 0 — throwing a typed ParseError (fail-loud)
// so a malformed/crafted Experience never enters the model. The fixture caps are 120, so
// 200 is a conservative upper bound (A2 — a future higher cap would need the bound raised;
// it only affects validation strictness, not offset derivation).
//
// FieldEntry keys are component-relative (`experience.xp`, `experience.levelCap`,
// `experience.level`) — the 02-05 parseSave orchestrator re-keys them per skill
// (`skill.<skillId>.xp` etc.) when populating the FieldTable, since multiple skills each
// carry an Experience component and the FieldTable requires unique keys. The parser itself
// is a pure structural parser over the component bytes (no skill-ID context); the
// orchestrator owns the entity-level namespacing.
//
// Implements: D-04 (coverage-gated). Mitigates: T-02-05 (wrong int / invalid triple →
// distinct offsets + context-validation throws before model entry; cap readOnly).
// Wave 3's parseSave orchestrator (02-05) calls this at each skill's Experience dataStart.
/* c8 ignore end */

import { BinaryReader } from './binary-reader';
import { type FieldEntry, ParseError } from './field-table';

/**
 * The minimum byte size of a valid Experience component: [double XP (8B)][int32 LevelCap
 * (4B)][int32 Level (4B)] = 16 bytes. A component smaller than this is rejected before any
 * read (the triple cannot fit).
 */
const EXPERIENCE_MIN_SIZE = 16;

/** Upper bound for LevelCap context-validation (RESEARCH A2 — fixture caps are 120). */
const LEVEL_CAP_MAX = 200;

/**
 * Parse the Experience component at {@link dataStart} into xp/levelCap/level FieldEntries
 * at distinct offsets, with levelCap readOnly (SC-3, Pitfall 5).
 *
 * Reads `[double XP][int32 LevelCap][int32 Level]`, recording the absolute byte offset of
 * each value (xp at dataStart+0, levelCap at dataStart+8, level at dataStart+12) so Phase
 * 3's patcher addresses each field unambiguously — never confusing cap and level (Pitfall 5:
 * two adjacent int32s).
 *
 * SC-3 context-validation: rejects the triple unless 1<=levelCap<=200, 1<=level<=levelCap,
 * and XP is finite & >= 0 — throwing a typed {@link ParseError} (fail-loud, never emit a
 * silently-wrong model). A `size < 16` is rejected before any read (the triple cannot fit).
 *
 * FieldEntry flags: levelCap is `readOnly: true` (Phase 3 NEVER patches the cap); XP and
 * Level are writable (Phase 3's edit targets — no readOnly flag). Keys are component-relative
 * (`experience.xp`, `experience.levelCap`, `experience.level`); the 02-05 orchestrator
 * re-keys them per skill (`skill.<skillId>.xp` etc.) for the FieldTable.
 *
 * @param reader The BinaryReader over the decompressed save buffer.
 * @param dataStart The Experience component's dataStart (located by 02-02's walkComponents).
 *   Fixture Woodcutting: 47405.
 * @param size The Experience component's declared byte size (from walkComponents). Must be
 *   >= 16 (the triple's width). Fixture: 16.
 * @returns FieldEntry[] — xp (double, writable), levelCap (int32, readOnly), level (int32,
 *   writable) at distinct offsets.
 * @throws {ParseError} if `size < 16` or the triple fails context-validation (SC-3 fail-loud).
 */
export function parseExperience(
  reader: BinaryReader,
  dataStart: number,
  size: number,
): FieldEntry[] {
  if (size < EXPERIENCE_MIN_SIZE) {
    throw new ParseError(
      `Experience component too small (size=${size}, need >=${EXPERIENCE_MIN_SIZE})`,
    );
  }
  reader.seek(dataStart);
  const xpOffset = reader.offset;
  const xp = reader.readDouble(); // double, 8B
  const capOffset = reader.offset;
  const levelCap = reader.readInt32(); // int32, 4B — Phase 3 NEVER patches this
  const levelOffset = reader.offset;
  const level = reader.readInt32(); // int32, 4B — Phase 3 edit target

  // SC-3 context-validation: reject before the triple enters the model (fail-loud).
  // 1<=levelCap<=200, 1<=level<=levelCap, XP finite & >= 0.
  if (
    !(
      levelCap >= 1 &&
      levelCap <= LEVEL_CAP_MAX &&
      level >= 1 &&
      level <= levelCap &&
      Number.isFinite(xp) &&
      xp >= 0
    )
  ) {
    throw new ParseError(
      `Experience failed context-validation (xp=${xp}, levelCap=${levelCap}, level=${level})`,
    );
  }

  const entries: FieldEntry[] = [
    {
      key: 'experience.xp',
      offset: xpOffset,
      kind: 'double',
      width: 8,
      value: xp,
    },
    {
      key: 'experience.levelCap',
      offset: capOffset,
      kind: 'int32',
      width: 4,
      value: levelCap,
      readOnly: true, // Pitfall 5 — Phase 3 NEVER patches the cap
    },
    {
      key: 'experience.level',
      offset: levelOffset,
      kind: 'int32',
      width: 4,
      value: level,
    },
  ];
  return entries;
}
