/* c8 ignore start */
// Save-parser orchestrator — the single entry point Phase 3 (patcher, reads the
// FieldTable) and Phase 5 (UI, reads the ViewModel) consume.
//
// Wires the spine (02-02 readVersion + parseSaveHeader + walkEntities + walkComponents)
// to the three region parsers (02-03 parseWallet + parseExperience; 02-04 findStacks):
//
//   int32 version → SaveHeader (readOnly-mirror GP/SC entries + summary) →
//   entity list (33 entities) → per-entity component walk:
//     - the Bank (entity whose components include 'Wallet' AND 'Inventory' — located by
//       component NAMES, not a hard-coded entity ID, T-02-05) → parseWallet at the
//       Wallet dataStart (authoritative int64 GP/SC) + findStacks at the Inventory
//       [dataStart, dataStart+size) region (689 stacks);
//     - every entity with an 'Experience' component (a skill, RESEARCH A3 — Combat may
//       surface as an XP-bearing entry) → parseExperience at the Experience dataStart,
//       re-keyed from experience.{xp,levelCap,level} to skill.<entityId>.{...} for
//       FieldTable uniqueness across multiple skills.
//
// SC-2: wallet currencies are authoritative (write targets); header GP/SC are readOnly
//   mirrors (02-02 emits them with mirrors pointing at the wallet). Phase 3's patcher
//   reads the authoritative flag and never targets the header.
// SC-4: the FieldTable is the SOLE home of byte offsets. The ViewModel is DERIVED from
//   the parsed data by projection (projectViewModel) and contains NO offset at any depth.
//   parseSave re-derives offsets fresh on every call (deterministic walk — the same
//   buffer yields identical offsets); offsets are never cached or persisted (T-02-09).
// SC-5: an unknown/newer version sets unknownVersion=true (warn-but-parse — the walk is
//   version-agnostic, the format is self-describing).
//
// Implements: D-01 (free metadata: placeholder/locked/entityIds parsed for free), D-04
// (coverage-gated core). Mitigates: T-02-04 (offsets in view model → projection with no
// offset field), T-02-05 (Bank by hard-coded ID → by component names), T-02-09 (offsets
// persisted → re-derived every call, deterministic), T-02-SC (no packages installed).
/* c8 ignore end */

import { BinaryReader } from './binary-reader';
import {
  readVersion,
  parseSaveHeader,
  walkEntities,
  walkComponents,
  type SaveHeaderSummary,
} from './structural-walk';
import { parseWallet } from './wallet-parser';
import { parseExperience } from './experience-parser';
import { findStacks, type InventoryStack } from './inventory-parser';
import { FieldTable, type FieldEntry } from './field-table';
import type {
  ViewModel,
  Summary,
  BankItem,
  Skill,
  UnresolvedField,
} from './view-model';

/**
 * The trailing 36-byte tail (ActionManager + RNG + SidebarFavouritesOptions + EventLog)
 * the structural walk does NOT model. The entity list consumes exactly to
 * `buffer.length − TAIL_BYTES`. Verified empirically in 02-RESEARCH.md and pinned by
 * 02-02's structural-walk test (`ENTITY_LIST_END === 2,284,711 === FIXTURE.length − 36`).
 */
const TAIL_BYTES = 36;

/**
 * Result of {@link parseSave}: the offset-bearing {@link FieldTable} (Phase 3's patcher
 * reads `{ offset, kind, width, value }` per writable field) plus the offset-free
 * {@link ViewModel} (Phase 5's UI projection — derived from the same parse, SC-4 by
 * construction). The two artifacts share the same parse pass but never share offsets.
 */
export interface ParsedSave {
  /** The sole home of byte offsets (SC-4 boundary). Phase 3 reads this. */
  fieldTable: FieldTable;
  /** The offset-free UI projection (SC-4 by construction). Phase 5 reads this. */
  viewModel: ViewModel;
}

/**
 * Intermediate skill info collected during the walk — the offset-free {id, xp, level,
 * levelCap} tuple per Experience-bearing entity. Used by {@link projectViewModel} to
 * build the ViewModel's `skills` array without re-reading the FieldTable. (The
 * FieldTable holds the offset-bearing skill.{id}.{xp,levelCap,level} FieldEntries for
 * Phase 3; this tuple holds the offset-free projection inputs for Phase 5.)
 */
interface SkillInfo {
  /** Raw namespaced skill ID (D-02 — e.g. `MelvorBase:Woodcutting`). */
  id: string;
  /** Skill XP (double). */
  xp: number;
  /** Level cap (int32 — readOnly in the FieldTable, surfaced for UI display). */
  levelCap: number;
  /** Current level (int32). */
  level: number;
}

/**
 * Context passed to {@link projectViewModel}: the non-FieldTable data the projection
 * needs that the FieldTable does not hold (version, unknownVersion, the SaveHeader
 * summary fields name/gamemode/totalLevel, the recovered bank stacks with their
 * itemId/placeholder/locked metadata, and the per-skill info tuple). The FieldTable
 * holds the offset-bearing currency/stack/skill FieldEntries; this context carries the
 * offset-free inputs the projection maps to the ViewModel (SC-4 — no offset crosses
 * the boundary in either direction).
 */
export interface ProjectionContext {
  /** Save version (int32 at offset 0). Fixture: 20. */
  version: number;
  /** True if the version is newer/older than {@link KNOWN_VERSION} (SC-5). */
  unknownVersion: boolean;
  /** SaveHeader summary fields (name, gamemode, totalLevel — summary-only per 02-02). */
  headerSummary: SaveHeaderSummary;
  /** Recovered bank stacks (itemId/qty/placeholder/locked — D-01 free metadata). */
  bankStacks: InventoryStack[];
  /** Per-skill {id, xp, level, levelCap} tuples (one per Experience-bearing entity). */
  skillInfos: SkillInfo[];
  /**
   * Pre-projected offset-free unresolved fields (D-03 — candidates surfaced for a
   * higher layer, never auto-picked). This plan does not surface any candidates
   * (no D-03 ambiguity arises in the wallet/bank/skill walk); the field is present so
   * a future plan can surface candidates without changing the projection signature.
   * Carries ViewCandidate (evidence only) — never FieldCandidate (which bears offset).
   */
  unresolvedFields?: UnresolvedField[];
}

/**
 * Parse a decompressed save buffer into a `{ fieldTable, viewModel }` pair (IO-01
 * delivered end-to-end). Walks the spine (version → SaveHeader → 33-entity list →
 * per-entity component list), dispatches to the region parsers at each component
 * boundary (parseWallet at the Bank's Wallet, findStacks at the Bank's Inventory,
 * parseExperience at every skill's Experience), and assembles one FieldTable. The
 * ViewModel is derived by {@link projectViewModel} — offset-free by construction
 * (SC-4).
 *
 * The Bank is located by component names ('Wallet' + 'Inventory'), not by a hard-coded
 * entity ID — the fixture has `MelvorBase:Layout` (not in the docs' Known Entity IDs),
 * so a hard-coded ID would break on a variant save (T-02-05). 'Skill' = any entity
 * carrying an Experience component (RESEARCH A3 — Combat may surface as an XP-bearing
 * entry; the projection is provisional, flagged in 02-CONTEXT.md).
 *
 * Determinism (SC-4): the walk re-derives offsets from `reader.offset` on every call —
 * nothing is cached or persisted (T-02-09). Calling {@link parseSave} twice on the same
 * buffer yields identical FieldTable entries (same offsets, same values).
 *
 * @param buffer A decompressed save buffer (use Phase 1 `decompress` to obtain one).
 * @returns `{ fieldTable, viewModel }` — the offset-bearing FieldTable (Phase 3) and
 *          the offset-free ViewModel (Phase 5).
 */
export function parseSave(buffer: Buffer): ParsedSave {
  const reader = new BinaryReader(buffer);

  // 1. Version + unknownVersion flag (SC-5 — warn-but-parse, never throw on version).
  const { version, unknownVersion } = readVersion(reader);

  // 2. SaveHeader: summary (name/gamemode/totalLevel/gp/slayerCoins) + readOnly-mirror
  //    FieldEntries for header.GP / header.SlayerCoins (SC-2 — Phase 3 never targets
  //    the header). headerEnd is where the entity list starts.
  const { entries: headerEntries, summary: headerSummary, headerEnd } = parseSaveHeader(reader);

  // 3. Entity list — 33 opaque {id, start, size} spans. The list consumes exactly to
  //    buffer.length − TAIL_BYTES (the 36-byte tail this plan does not model).
  const entityListEnd = buffer.length - TAIL_BYTES;
  const spans = walkEntities(reader, headerEnd, entityListEnd);
  const entityIds = spans.map((s) => s.id);

  // 4. Build the FieldTable — the sole home of byte offsets (SC-4 boundary).
  const fieldTable = new FieldTable();
  for (const e of headerEntries) fieldTable.add(e);

  // Walk each entity's component list and dispatch to the region parsers at the
  // boundaries walkComponents locates. The Bank (Wallet + Inventory) and every
  // Experience-bearing entity (a skill) get region-parsed; all other components are
  // skipped byte-intact (Phase 4 round-trip).
  let bankStacks: InventoryStack[] = [];
  const skillInfos: SkillInfo[] = [];

  for (const span of spans) {
    const components = walkComponents(reader, span.start, span.size);

    // Bank: entity whose component list contains BOTH 'Wallet' AND 'Inventory'. Located
    // by component NAMES, not a hard-coded entity ID (T-02-05 — a variant save whose
    // Bank has a different ID still parses; the fixture's MelvorBase:Layout proves the
    // walk must be generic).
    const walletComp = components.find((c) => c.name === 'Wallet');
    const invComp = components.find((c) => c.name === 'Inventory');
    if (walletComp && invComp) {
      // Wallet → authoritative int64 currencies (GP/SC write targets, 02-03).
      const walletEntries = parseWallet(reader, walletComp.dataStart);
      for (const e of walletEntries) fieldTable.add(e);

      // Inventory → bounded marker-search, 689 stacks (02-04). Each stack becomes 3
      // FieldEntries keyed by `bank.inventory.<itemId>@<qtyOffset>{,.placeholder,.locked}`
      // — the @<qtyOffset> ensures uniqueness for duplicate item IDs across tabs
      // (D-01 — duplicate stacks are DISTINCT fields, NOT D-03 ambiguity). itemId is
      // encoded in the key (no separate string FieldEntry — variable-width, not a v1
      // edit target); the projection decodes it from the key for the ViewModel.
      bankStacks = findStacks(buffer, invComp.dataStart, invComp.dataStart + invComp.size);
      for (const s of bankStacks) {
        const keyBase = `bank.inventory.${s.itemId}@${s.qtyOffset}`;
        fieldTable.add({
          key: keyBase,
          offset: s.qtyOffset,
          kind: 'int32',
          width: 4,
          value: s.qty,
        });
        fieldTable.add({
          key: `${keyBase}.placeholder`,
          offset: s.qtyOffset + 4,
          kind: 'bool',
          width: 1,
          value: s.placeholder,
        });
        fieldTable.add({
          key: `${keyBase}.locked`,
          offset: s.qtyOffset + 5,
          kind: 'bool',
          width: 1,
          value: s.locked,
        });
      }
    }

    // Skill: any entity with an Experience component (RESEARCH A3 — Combat also has
    // one; surfaced as an XP-bearing entry, provisional per 02-CONTEXT.md). Re-key the
    // component-relative experience.{xp,levelCap,level} entries to
    // skill.<entityId>.{xp,levelCap,level} for FieldTable uniqueness across the
    // multiple skills (the parser is a pure structural parser; the orchestrator owns
    // entity-level namespacing — 02-03 decision).
    const expComp = components.find((c) => c.name === 'Experience');
    if (expComp) {
      const expEntries = parseExperience(reader, expComp.dataStart, expComp.size);
      // Capture the offset-free skill tuple alongside the re-keyed FieldEntries.
      let xp = 0;
      let levelCap = 0;
      let level = 0;
      for (const e of expEntries) {
        // Strip the 'experience.' prefix → 'xp' | 'levelCap' | 'level'.
        const suffix = e.key.slice('experience.'.length);
        const newKey = `skill.${span.id}.${suffix}`;
        fieldTable.add({ ...e, key: newKey });
        if (suffix === 'xp') xp = e.value as number;
        else if (suffix === 'levelCap') levelCap = e.value as number;
        else if (suffix === 'level') level = e.value as number;
      }
      skillInfos.push({ id: span.id, xp, levelCap, level });
    }
  }

  // 5. Derive the offset-free ViewModel by projection (SC-4 — no offset crosses the
  //    boundary). The FieldTable holds the offset-bearing entries; projectViewModel
  //    maps the parsed data into the UI-facing shape with int64 currencies rendered as
  //    strings (JSON/IPC-safe — a JSON number would lose precision past 2^53).
  const viewModel = projectViewModel(fieldTable, entityIds, {
    version,
    unknownVersion,
    headerSummary,
    bankStacks,
    skillInfos,
  });

  return { fieldTable, viewModel };
}

/**
 * Project the parsed save data into the offset-free {@link ViewModel} (SC-4 by
 * construction — no byte offset at any depth). The FieldTable holds the offset-bearing
 * entries (Phase 3's patcher reads `{ offset, kind, width, value }`); this function
 * derives the UI-facing projection that Phase 5 renders, with int64 currencies as
 * `string` (JSON/IPC-safe) and NO offset key at any depth.
 *
 * The projection reads the authoritative wallet currencies from the FieldTable (so the
 * ViewModel's summary reflects the wallet, NOT the readOnly header mirrors — SC-2) and
 * renders them as strings. The bank items, skills, entity IDs, and version come from
 * the {@link ProjectionContext} (offset-free intermediate data collected during the
 * walk).
 *
 * @param fieldTable The FieldTable built by {@link parseSave} (read for the authoritative
 *                   wallet currencies — never for the header mirrors).
 * @param entityIds  The list of entity IDs in the save (D-01 free metadata).
 * @param context    The offset-free intermediate data (version, summary, bank stacks,
 *                   skill infos, optional unresolved fields).
 * @returns The offset-free ViewModel (SC-4 — assertNoOffsets passes).
 */
export function projectViewModel(
  fieldTable: FieldTable,
  entityIds: string[],
  context: ProjectionContext,
): ViewModel {
  // Summary: project GP/SlayerCoins FROM the wallet (the authoritative source — SC-2),
  // never from the header mirrors. int64 rendered as string for JSON/IPC safety.
  const walletGp = fieldTable.getRequired('wallet.GoldPieces');
  const walletSc = fieldTable.get('wallet.SlayerCoins');
  const summary: Summary = {
    name: context.headerSummary.name,
    gamemode: context.headerSummary.gamemode,
    totalLevel: context.headerSummary.totalLevel,
    gp: (walletGp.value as bigint).toString(),
    slayerCoins: walletSc ? (walletSc.value as bigint).toString() : '0',
  };

  // bankItems: from the recovered stacks (itemId/qty/placeholder/locked — D-01 free
  // metadata, offset-free here; the FieldTable holds the offset-bearing counterparts).
  const bankItems: BankItem[] = context.bankStacks.map((s) => ({
    itemId: s.itemId,
    quantity: s.qty,
    isPlaceholder: s.placeholder,
    isLocked: s.locked,
  }));

  // skills: from the per-skill tuples (offset-free; the FieldTable holds the
  // offset-bearing skill.<id>.{xp,levelCap,level} FieldEntries for Phase 3).
  const skills: Skill[] = context.skillInfos.map((si) => ({
    id: si.id,
    xp: si.xp,
    level: si.level,
    levelCap: si.levelCap,
  }));

  const viewModel: ViewModel = {
    version: context.version,
    unknownVersion: context.unknownVersion,
    summary,
    bankItems,
    skills,
    entityIds,
  };
  // Only include unresolvedFields when there are any (exactOptionalPropertyTypes —
  // cannot assign undefined; omit the key entirely when absent). This plan does not
  // surface any D-03 candidates, so the field is absent in practice; the branch is
  // here for forward compatibility with a future plan that surfaces ambiguity.
  if (context.unresolvedFields && context.unresolvedFields.length > 0) {
    viewModel.unresolvedFields = context.unresolvedFields;
  }
  return viewModel;
}
