// Experience parser test suite — XP/Cap/Level triple, context-validated, cap readOnly (SC-1, SC-3, Pitfall 5).
//
// Proves parseExperience over the decompressed committed fixture's Woodcutting
// Experience component (dataStart 47405, size 16): the triple
//   [double XP][int32 LevelCap][int32 Level]
// records DISTINCT offsets xp(+0), levelCap(+8, readOnly), level(+12) so Phase 3's
// patcher never patches the cap (RESEARCH §Pitfall 5 — two adjacent int32s, confusing
// cap/level would corrupt the save).
//
// SC-3 context-validation: the parser rejects any triple where 1<=levelCap<=200,
// 1<=level<=levelCap, and XP is finite & >= 0 — throwing a typed ParseError (fail-loud)
// so a malformed/crafted Experience never enters the model. A size < 16 is also rejected.
//
// Fixture Woodcutting (RESEARCH §Code Examples): dataStart 47405 → XP 7439645.20000645
// / cap 120 / level 93. The XP double's shortest round-tripping decimal is
// 7439645.20000645 (the literal round-trips bit-faithfully — verified in the probe).
//
// Implements: D-04 (c8 gate — 100% lines+branches on src/experience-parser.ts).
// Mitigates T-02-05 (wrong int / invalid triple → distinct offsets + context-validation
// throws before model entry; cap readOnly).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { BinaryReader } from '../src/binary-reader';
import { ParseError } from '../src/field-table';
import { loadFixtureBuffer } from './helpers/fixture';
import { parseExperience } from '../src/experience-parser';

// The decompressed committed fixture (2,284,747 bytes, version 20). Cached at module
// load. Consumed read-only via BinaryReader (never mutated).
const FIXTURE = loadFixtureBuffer();

// Woodcutting Experience component — verified fixture offsets (RESEARCH §Code Examples
// + the structural-walk spine from 02-02): dataStart 47405, size 16.
//   xp       @ 47405 (+0)  = 7439645.20000645  (double, writable)
//   levelCap @ 47413 (+8)  = 120              (int32, readOnly — Phase 3 never patches)
//   level    @ 47417 (+12) = 93               (int32, writable)
const WOODCUTTING_DATA_START = 47405;
const WOODCUTTING_SIZE = 16;

// ---------------------------------------------------------------------------
// Fixture Woodcutting Experience — XP/Cap/Level at distinct offsets (SC-1, Pitfall 5)
// ---------------------------------------------------------------------------

describe('parseExperience — fixture Woodcutting (dataStart 47405, size 16) (SC-1, Pitfall 5)', () => {
  test('returns 3 FieldEntries for the XP/Cap/Level triple', () => {
    const reader = new BinaryReader(FIXTURE);
    const entries = parseExperience(reader, WOODCUTTING_DATA_START, WOODCUTTING_SIZE);
    assert.equal(entries.length, 3);
  });

  test('XP is a double at offset +0 (47405), writable — Phase 3 target (SC-1)', () => {
    const reader = new BinaryReader(FIXTURE);
    const entries = parseExperience(reader, WOODCUTTING_DATA_START, WOODCUTTING_SIZE);
    const xp = entries.find((e) => e.key === 'experience.xp');
    assert.ok(xp, 'experience.xp entry emitted');
    assert.equal(xp!.kind, 'double');
    assert.equal(xp!.width, 8);
    assert.equal(xp!.offset, 47405, 'xp at dataStart+0');
    // Exact double value (the literal round-trips bit-faithfully — verified in the probe).
    assert.equal(xp!.value, 7439645.20000645);
    assert.equal(xp!.readOnly, undefined, 'XP is writable (Phase 3 target — not readOnly)');
    assert.equal(typeof xp!.value, 'number');
  });

  test('LevelCap is an int32 at offset +8 (47413), readOnly — Phase 3 never patches (Pitfall 5)', () => {
    const reader = new BinaryReader(FIXTURE);
    const entries = parseExperience(reader, WOODCUTTING_DATA_START, WOODCUTTING_SIZE);
    const cap = entries.find((e) => e.key === 'experience.levelCap');
    assert.ok(cap, 'experience.levelCap entry emitted');
    assert.equal(cap!.kind, 'int32');
    assert.equal(cap!.width, 4);
    assert.equal(cap!.offset, 47413, 'levelCap at dataStart+8');
    assert.equal(cap!.value, 120);
    assert.equal(cap!.readOnly, true, 'LevelCap is readOnly (Pitfall 5 — Phase 3 never patches the cap)');
  });

  test('Level is an int32 at offset +12 (47417), writable — Phase 3 target (SC-1)', () => {
    const reader = new BinaryReader(FIXTURE);
    const entries = parseExperience(reader, WOODCUTTING_DATA_START, WOODCUTTING_SIZE);
    const level = entries.find((e) => e.key === 'experience.level');
    assert.ok(level, 'experience.level entry emitted');
    assert.equal(level!.kind, 'int32');
    assert.equal(level!.width, 4);
    assert.equal(level!.offset, 47417, 'level at dataStart+12');
    assert.equal(level!.value, 93);
    assert.equal(level!.readOnly, undefined, 'Level is writable (Phase 3 target — not readOnly)');
  });

  test('the three offsets are DISTINCT (xp < levelCap < level) — Pitfall 5', () => {
    const reader = new BinaryReader(FIXTURE);
    const entries = parseExperience(reader, WOODCUTTING_DATA_START, WOODCUTTING_SIZE);
    const xp = entries.find((e) => e.key === 'experience.xp')!;
    const cap = entries.find((e) => e.key === 'experience.levelCap')!;
    const level = entries.find((e) => e.key === 'experience.level')!;
    assert.ok(xp.offset < cap.offset && cap.offset < level.offset, 'three distinct offsets');
    // Relative to dataStart: xp +0, levelCap +8, level +12.
    assert.equal(xp.offset - WOODCUTTING_DATA_START, 0);
    assert.equal(cap.offset - WOODCUTTING_DATA_START, 8);
    assert.equal(level.offset - WOODCUTTING_DATA_START, 12);
  });
});

// ---------------------------------------------------------------------------
// SC-3 context-validation — out-of-range / undersized triples throw typed ParseError
// ---------------------------------------------------------------------------

describe('parseExperience — SC-3 context-validation rejects invalid triples (T-02-05)', () => {
  test('level > cap throws ParseError', () => {
    const buf = buildExperienceBuffer(100.0, 10, 50); // level 50 > cap 10
    const reader = new BinaryReader(buf);
    assert.throws(
      () => parseExperience(reader, 0, 16),
      (err: unknown) => err instanceof ParseError,
      'level > cap throws typed ParseError (fail-loud, never enters the model)',
    );
  });

  test('cap > 200 throws ParseError', () => {
    const buf = buildExperienceBuffer(100.0, 250, 10); // cap 250 > 200
    const reader = new BinaryReader(buf);
    assert.throws(
      () => parseExperience(reader, 0, 16),
      (err: unknown) => err instanceof ParseError,
      'cap > 200 throws typed ParseError',
    );
  });

  test('cap < 1 throws ParseError', () => {
    const buf = buildExperienceBuffer(100.0, 0, 0); // cap 0 < 1
    const reader = new BinaryReader(buf);
    assert.throws(
      () => parseExperience(reader, 0, 16),
      (err: unknown) => err instanceof ParseError,
      'cap < 1 throws typed ParseError',
    );
  });

  test('level < 1 throws ParseError', () => {
    const buf = buildExperienceBuffer(100.0, 120, 0); // level 0 < 1
    const reader = new BinaryReader(buf);
    assert.throws(
      () => parseExperience(reader, 0, 16),
      (err: unknown) => err instanceof ParseError,
      'level < 1 throws typed ParseError',
    );
  });

  test('negative XP throws ParseError', () => {
    const buf = buildExperienceBuffer(-1.0, 120, 93); // xp < 0
    const reader = new BinaryReader(buf);
    assert.throws(
      () => parseExperience(reader, 0, 16),
      (err: unknown) => err instanceof ParseError,
      'negative XP throws typed ParseError',
    );
  });

  test('NaN XP throws ParseError (finite required)', () => {
    const buf = buildExperienceBuffer(NaN, 120, 93); // !Number.isFinite(NaN)
    const reader = new BinaryReader(buf);
    assert.throws(
      () => parseExperience(reader, 0, 16),
      (err: unknown) => err instanceof ParseError,
      'NaN XP throws typed ParseError (XP must be finite)',
    );
  });

  test('Infinity XP throws ParseError (finite required)', () => {
    const buf = buildExperienceBuffer(Infinity, 120, 93); // !Number.isFinite(Infinity)
    const reader = new BinaryReader(buf);
    assert.throws(
      () => parseExperience(reader, 0, 16),
      (err: unknown) => err instanceof ParseError,
      'Infinity XP throws typed ParseError (XP must be finite)',
    );
  });

  test('size < 16 throws ParseError (undersized component)', () => {
    // A full 16-byte buffer but the declared size is 15 — the parser rejects before reading.
    const buf = buildExperienceBuffer(100.0, 120, 93);
    const reader = new BinaryReader(buf);
    assert.throws(
      () => parseExperience(reader, 0, 15),
      (err: unknown) => err instanceof ParseError,
      'size < 16 throws typed ParseError before any read',
    );
  });

  test('a boundary-valid triple at the edges parses (cap=1, level=1, xp=0)', () => {
    // Lower bounds: cap=1, level=1, xp=0 — all valid (1<=cap, 1<=level<=cap, xp>=0 finite).
    const buf = buildExperienceBuffer(0.0, 1, 1);
    const reader = new BinaryReader(buf);
    const entries = parseExperience(reader, 0, 16);
    assert.equal(entries.length, 3);
    const cap = entries.find((e) => e.key === 'experience.levelCap')!;
    assert.equal(cap.value, 1);
    assert.equal(cap.readOnly, true);
  });

  test('a boundary-valid triple at the upper edge parses (cap=200, level=200, xp finite)', () => {
    // Upper bounds: cap=200, level=200 (level==cap is valid: 1<=level<=cap), xp finite>=0.
    const buf = buildExperienceBuffer(1000.0, 200, 200);
    const reader = new BinaryReader(buf);
    const entries = parseExperience(reader, 0, 16);
    assert.equal(entries.length, 3);
    const level = entries.find((e) => e.key === 'experience.level')!;
    assert.equal(level.value, 200);
    assert.equal(level.readOnly, undefined, 'Level writable at the upper boundary');
  });
});

// ---------------------------------------------------------------------------
// buildExperienceBuffer — craft small Experience component buffers for validation tests
// ---------------------------------------------------------------------------

/**
 * Build a 16-byte Experience component buffer:
 *   [double XP (8B)][int32 LevelCap (4B)][int32 Level (4B)]
 * Mirrors the fixture's Experience layout (RESEARCH §Code Examples). Used to craft
 * out-of-range/undersized triples for SC-3 context-validation negative tests. The
 * caller controls the declared `size` passed to parseExperience (e.g. 15 for the
 * undersized test) — this helper always writes the full 16 bytes.
 */
function buildExperienceBuffer(xp: number, levelCap: number, level: number): Buffer {
  const buf = Buffer.alloc(16);
  buf.writeDoubleLE(xp, 0);
  buf.writeInt32LE(levelCap, 8);
  buf.writeInt32LE(level, 12);
  return buf;
}
