/* c8 ignore start */
// Structural walk — the deterministic spine of the save parser (IO-01 + Determinism).
//
// Walks the decompressed save with the Phase 1 BinaryReader in the .NET
// BinaryReader mental model the spec (`docs/current-skill.md`) is written in:
//   int32 version → SaveHeader → entity list → per-entity component list.
//
// Every entity is `[int32 componentCount][component × count]`, and every
// component is `[string name][int32 dataSize][dataSize bytes]` — fully
// self-describing framed serialization (RESEARCH §Pattern 1). The walk lands
// delta-0 (declared count == walked count AND cursor == regionEnd) on all 33
// fixture entities; this plan asserts that integrity invariant per region and
// throws a typed ParseError on any mismatch (T-02-05 — fail loud, never emit a
// silently-wrong model).
//
// Offsets are derived fresh from `reader.offset` after every variable-length
// string (RESEARCH Pitfall 4) — never hard-coded — so a longer/UTF-8 name does
// not shift a wrong offset. The SaveHeader GP/SlayerCoins FieldEntries are
// emitted read-only with `mirrors` pointing at the wallet keys (SC-2) so Phase
// 3's patcher can never target the header; only the Bank wallet is
// authoritative for currency.
//
// SC-5: counts and region sizes are untrusted file bytes. This module bounds
// every count against its enclosing region before looping, rejects negative
// sizes, asserts `dataStart + size <= regionEnd` before trusting a size, and
// lets the BinaryReader's native OOB / malformed-7-bit-prefix RangeErrors
// (Phase 1 T-1-02/T-1-04) propagate — never swallows them. A malformed buffer
// throws a bounded typed error (ParseError or propagated RangeError), never
// OOB-reads and never drives a giant allocation (T-02-01/T-02-02/T-02-03).
//
// Entity spans are retained opaquely `{id, start, size}` (no payload decode) so
// Phase 4 can round-trip untouched entities byte-intact. Wave 3's region parsers
// (02-03 Wallet/Experience, 02-04 Inventory) attach at the component boundaries
// this walk locates; 02-05's orchestrator threads the spine through.
/* c8 ignore end */

import { BinaryReader } from './binary-reader';
import { ParseError, type FieldEntry } from './field-table';

/**
 * The save version this parser was built and verified against (the committed
 * fixture is version 20 — RESEARCH §State of the Art; not 17 as older docs say).
 * Any other version sets {@link VersionInfo.unknownVersion} (warn-but-parse,
 * SC-5) — the structural walk is version-agnostic (the format is
 * self-describing), so a newer version still parses if its layout holds.
 */
export const KNOWN_VERSION = 20;

/**
 * Result of {@link readVersion}: the int32 save version plus the
 * {@link unknownVersion} warn flag (true when `version !== KNOWN_VERSION`).
 * Never throws on version alone (SC-5 — warn-but-parse, never hard-fail).
 */
export interface VersionInfo {
  /** The int32 save version read at offset 0 (fixture: 20). */
  version: number;
  /** True if the version is newer/older than {@link KNOWN_VERSION} (SC-5). */
  unknownVersion: boolean;
}

/**
 * Character/save summary projected from the SaveHeader. int64 currencies (gp,
 * slayerCoins) are `bigint` here (the FieldTable value kind) — Wave 3's
 * orchestrator projects them to `string` for the JSON/IPC-safe ViewModel. The
 * wallet is authoritative (SC-2); these SaveHeader copies are read-only
 * mirrors that refresh on the next in-game save.
 */
export interface SaveHeaderSummary {
  /** CharacterName (from SaveHeader). Fixture: "Bob". */
  name: string;
  /** Gamemode (from SaveHeader). Fixture: "Test". */
  gamemode: string;
  /** TotalLevel int32 (from SaveHeader). Fixture: 1366. */
  totalLevel: number;
  /** GP int64 (from SaveHeader — a read-only mirror of wallet.GoldPieces). */
  gp: bigint;
  /** SlayerCoins int64 (from SaveHeader — a read-only mirror of wallet.SlayerCoins). */
  slayerCoins: bigint;
}

/**
 * Result of {@link parseSaveHeader}: the SC-2 read-only-mirror FieldEntries for
 * the header GP/SlayerCoins (so Phase 3's patcher can never target the header),
 * the offset-free summary projection, and `headerEnd` — the cursor position
 * where the entity list begins (the byte immediately after SlayerCoins).
 */
export interface SaveHeader {
  /** FieldEntries emitted from the SaveHeader (header.GP + header.SlayerCoins, both readOnly mirrors). */
  entries: FieldEntry[];
  /** Offset-free summary projection (name, gamemode, totalLevel, gp, slayerCoins). */
  summary: SaveHeaderSummary;
  /** Cursor offset where the SaveHeader ends (entity list starts here). Fixture: 150. */
  headerEnd: number;
}

/**
 * An entity's opaque span in the entity list — `{id, start, size}`. The payload
 * is NOT decoded here (Phase 4 round-trips untouched entities byte-intact); Wave
 * 3's region parsers (02-03/02-04) attach at the component boundaries
 * {@link walkComponents} locates inside `[start, start + size)`.
 */
export interface EntitySpan {
  /** Entity ID string (e.g. "MelvorBase:Bank", "MelvorBase:Layout"). */
  id: string;
  /** Byte offset where the entity's component list begins. */
  start: number;
  /** Declared byte size of the entity's payload (component list). */
  size: number;
}

/**
 * A component's framed location inside an entity — `{name, dataStart, size}`.
 * The component payload is `[dataStart, dataStart + size)`; Wave 3 parsers seek
 * here to read the Wallet/Inventory/Experience payload. Unmodeled components
 * are skipped via `reader.seek(dataStart + size)` so they stay byte-intact.
 */
export interface Component {
  /** Component name string (e.g. "Wallet", "Inventory", "Experience"). */
  name: string;
  /** Byte offset where the component payload begins (after the name+size framing). */
  dataStart: number;
  /** Declared byte size of the component payload. */
  size: number;
}

/**
 * Read the int32 save version at offset 0. Returns `{version, unknownVersion}`
 * where `unknownVersion` is true for any version != {@link KNOWN_VERSION} —
 * warn-but-parse, never throw on version alone (SC-5). The structural walk is
 * version-agnostic (the format is self-describing), so a newer save still
 * parses if its layout holds.
 *
 * Seeks to offset 0 (idempotent — safe to call at any cursor position).
 */
export function readVersion(reader: BinaryReader): VersionInfo {
  reader.seek(0);
  const version = reader.readInt32();
  return { version, unknownVersion: version !== KNOWN_VERSION };
}

/**
 * Parse the SaveHeader starting at offset 4 (immediately after the version
 * int32). Walks UUID(16B) → CharacterName → Gamemode → timestamp(int64) →
 * ActiveEntityName → ActiveEntityIcon → ActiveActionName → ActiveActionIcon →
 * TotalLevel(int32) → GP(int64) → SlayerCoins(int64), deriving every
 * post-string offset from `reader.offset` (never hard-coded — RESEARCH Pitfall
 * 4: a longer/UTF-8 name must not shift a wrong offset).
 *
 * Emits FieldEntries for the header GP and SlayerCoins, both `readOnly: true`
 * with `mirrors` pointing at the wallet keys (SC-2): the SaveHeader copies are
 * cosmetic snapshots that refresh on the next in-game save; only the Bank
 * wallet is authoritative for currency and a write target. Phase 3's patcher
 * reads the `readOnly` flag and never targets the header.
 *
 * Seeks to offset 4 (idempotent). Leaves the cursor at `headerEnd` (the byte
 * where the entity list begins — fixture: 150).
 */
export function parseSaveHeader(reader: BinaryReader): SaveHeader {
  reader.seek(4);
  // UUID (16 bytes) — opaque for v1; skip without interpreting.
  reader.seek(reader.offset + 16);
  // Variable-length strings — offsets derived from the cursor, never hard-coded.
  const name = reader.readString(); // CharacterName
  const gamemode = reader.readString(); // Gamemode
  reader.readInt64(); // timestamp (DateTime.ToBinary) — opaque, skip
  reader.readString(); // ActiveEntityName
  reader.readString(); // ActiveEntityIcon
  reader.readString(); // ActiveActionName
  reader.readString(); // ActiveActionIcon
  const totalLevel = reader.readInt32();
  const gpOffset = reader.offset;
  const gp = reader.readInt64();
  const scOffset = reader.offset;
  const slayerCoins = reader.readInt64();
  const headerEnd = reader.offset;

  const entries: FieldEntry[] = [
    {
      key: 'header.GP',
      offset: gpOffset,
      kind: 'int64',
      width: 8,
      value: gp,
      readOnly: true,
      mirrors: 'wallet.GoldPieces',
    },
    {
      key: 'header.SlayerCoins',
      offset: scOffset,
      kind: 'int64',
      width: 8,
      value: slayerCoins,
      readOnly: true,
      mirrors: 'wallet.SlayerCoins',
    },
  ];

  return {
    entries,
    summary: { name, gamemode, totalLevel, gp, slayerCoins },
    headerEnd,
  };
}

/**
 * Walk the entity list: read `int32 count`, then `count × [string id][int32
 * size][size bytes]`, recording each entity's opaque `{id, start, size}` span.
 * The walk is generic (no hard-coded entity-ID list — the fixture contains
 * `MelvorBase:Layout`, not in the docs' Known Entity IDs).
 *
 * Bounds (SC-5): rejects a negative size, and asserts `start + size <= listEnd`
 * before trusting a size — a size that overruns the entity-list region throws a
 * typed ParseError (T-02-03). After the loop, asserts `cursor == listEnd`
 * (delta-0 — T-02-05): the walk must consume the region exactly. The BinaryReader's
 * native OOB / malformed-7-bit-prefix RangeErrors propagate (T-02-02).
 *
 * Entity spans are retained opaquely (no payload decode) so Phase 4 round-trips
 * untouched entities byte-intact.
 */
export function walkEntities(
  reader: BinaryReader,
  listStart: number,
  listEnd: number,
): EntitySpan[] {
  reader.seek(listStart);
  const count = reader.readInt32();
  // SC-5 (T-02-01): bound the count against the enclosing region BEFORE looping.
  // A giant int32 count must not drive an unbounded loop or allocation. Each item
  // needs at least 5 bytes of framing (1-byte 7-bit string prefix for an empty id
  // + 4-byte int32 size), so a count whose minimum span exceeds the remaining
  // region — or a negative count — is rejected with a typed ParseError before any
  // iteration runs. `count * 5` cannot overflow a JS double for any int32 count.
  const MIN_ENTITY_FRAMING = 5;
  const remaining = listEnd - reader.offset;
  if (count < 0 || count * MIN_ENTITY_FRAMING > remaining) {
    throw new ParseError(
      `entity count ${count} exceeds region capacity (remaining ${remaining} bytes, min ${MIN_ENTITY_FRAMING}/item)`,
    );
  }
  const spans: EntitySpan[] = [];
  for (let i = 0; i < count; i++) {
    const id = reader.readString();
    const size = reader.readInt32();
    if (size < 0) {
      throw new ParseError(`entity "${id}": negative size ${size}`);
    }
    const start = reader.offset;
    if (start + size > listEnd) {
      throw new ParseError(
        `entity "${id}": size ${size} overflows entity-list region (start=${start}, listEnd=${listEnd})`,
      );
    }
    spans.push({ id, start, size });
    reader.seek(start + size); // skip payload — untouched entities stay byte-intact
  }
  if (reader.offset !== listEnd) {
    throw new ParseError(
      `entity walk did not consume region exactly (cursor=${reader.offset}, listEnd=${listEnd})`,
    );
  }
  return spans;
}

/**
 * Walk an entity's component list: read `int32 componentCount`, then
 * `componentCount × [string name][int32 size][size bytes]`, recording each
 * component's `{name, dataStart, size}` location. Unmodeled components are
 * skipped via `reader.seek(dataStart + size)` so they stay byte-intact for
 * Phase 4's round-trip; Wave 3's region parsers (02-03 Wallet/Experience, 02-04
 * Inventory) attach at the `dataStart` boundaries this walk locates.
 *
 * Bounds (SC-5): rejects a negative size, and asserts `dataStart + size <= end`
 * (where `end = entityStart + entitySize`) before trusting a size — a size that
 * overruns the entity region throws a typed ParseError (T-02-03). After the
 * loop, asserts `cursor == end` (delta-0 — T-02-05): the component walk must
 * consume the entity region exactly. This is the integrity spine everything
 * else rides on. The BinaryReader's native OOB / malformed-7-bit-prefix
 * RangeErrors propagate (T-02-02).
 */
export function walkComponents(
  reader: BinaryReader,
  entityStart: number,
  entitySize: number,
): Component[] {
  const end = entityStart + entitySize;
  reader.seek(entityStart);
  const count = reader.readInt32();
  // SC-5 (T-02-01): bound the count against the enclosing entity region BEFORE
  // looping. A giant int32 component count must not drive an unbounded loop or
  // allocation. Each component needs at least 5 bytes of framing (1-byte 7-bit
  // string prefix for an empty name + 4-byte int32 size), so a count whose
  // minimum span exceeds the remaining entity region — or a negative count — is
  // rejected with a typed ParseError before any iteration runs.
  const MIN_COMPONENT_FRAMING = 5;
  const remaining = end - reader.offset;
  if (count < 0 || count * MIN_COMPONENT_FRAMING > remaining) {
    throw new ParseError(
      `component count ${count} exceeds entity region capacity (remaining ${remaining} bytes, min ${MIN_COMPONENT_FRAMING}/item)`,
    );
  }
  const comps: Component[] = [];
  for (let i = 0; i < count; i++) {
    const name = reader.readString();
    const size = reader.readInt32();
    if (size < 0) {
      throw new ParseError(`component "${name}": negative size ${size}`);
    }
    const dataStart = reader.offset;
    if (dataStart + size > end) {
      throw new ParseError(
        `component "${name}": size ${size} overflows entity region (dataStart=${dataStart}, end=${end})`,
      );
    }
    comps.push({ name, dataStart, size });
    reader.seek(dataStart + size); // skip payload — untouched components stay byte-intact
  }
  if (reader.offset !== end) {
    throw new ParseError(
      `component walk did not consume entity region exactly (cursor=${reader.offset}, end=${end})`,
    );
  }
  return comps;
}
