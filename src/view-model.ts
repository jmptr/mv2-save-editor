// Offset-free ViewModel — the UI-facing projection of the parsed save (SC-4 boundary).
//
// The ViewModel TYPE contains NO byte offset at any depth. Offsets live ONLY in the
// FieldTable (src/field-table.ts); the view model is a pure projection that Phase 5
// renders and Phase 3's patcher NEVER reads from (it reads the FieldTable). This makes
// SC-4 (offsets only in the FieldTable) true by type construction, not by convention.
//
// int64 currency fields (gp, slayerCoins) are `string` — JSON/IPC-safe with no precision
// loss (a JSON number would lose precision past 2^53; a bigint isn't JSON-serializable).
// Items/skills use raw namespaced IDs (D-02) — no friendly-name mapping in Phase 2
// (that needs a game-data name table = new dependency, deferred to Phase 5). The member
// types leave room for an optional `name?: string` to be added later without rework.
//
// D-01 free metadata: each stack's isPlaceholder/isLocked flags and the entityIds list
// are exposed (parsed for free from the byte layout — cost nothing extra, help Phase 5).
// D-03 ambiguity: unresolvedFields surfaces fields with >1 context-validated candidate;
// the candidates here are offset-free (evidence only) — the FieldTable holds the
// offset-bearing FieldCandidate list; the ViewModel surfaces the ambiguity without leaks.

/**
 * A bank item stack in the offset-free view model. Items are identified by their raw
 * namespaced ID (D-02); no friendly name (deferred to Phase 5 — the shape leaves room
 * for an optional `name?: string` to be added later without rework).
 */
export interface BankItem {
  /** Raw namespaced item ID, e.g. "MelvorBase:NormalLog" (D-02 — no name table). */
  itemId: string;
  /** Stack quantity (int32). The editable surface for bank item quantity edits. */
  quantity: number;
  /** Free metadata (D-01): the stack's placeholder flag, parsed for free from the byte layout. */
  isPlaceholder: boolean;
  /** Free metadata (D-01): the stack's locked flag, parsed for free from the byte layout. */
  isLocked: boolean;
  // Intentionally NO `name` field (D-02 — deferred to Phase 5). The shape leaves room
  // for an optional `name?: string` to be added later without rework.
}

/**
 * A skill (entity with an Experience component) in the offset-free view model. Skills
 * are identified by their raw namespaced ID (D-02); no friendly name (deferred to Phase 5).
 */
export interface Skill {
  /** Raw namespaced skill ID, e.g. "MelvorBase:Woodcutting" (D-02 — no name table). */
  id: string;
  /** Skill XP (double). The editable surface for XP edits (kept consistent with Level via the XP table, Phase 3 EDIT-04). */
  xp: number;
  /** Skill level (int32). The editable surface for level edits (consistent with XP). */
  level: number;
  /** Level cap (int32). Read-only (never a write target) but surfaced for UI display. */
  levelCap: number;
  // Intentionally NO `name` field (D-02 — deferred to Phase 5).
}

/**
 * Character/save summary (from SaveHeader). int64 currencies (gp, slayerCoins) are
 * `string` for JSON/IPC safety — the wallet is authoritative (SC-2); the SaveHeader
 * copies are read-only mirrors that refresh on the next in-game save. These values
 * are projected FROM the wallet (the authoritative source), NOT the header mirrors.
 */
export interface Summary {
  /** Character name (from SaveHeader). */
  name: string;
  /** Gamemode (from SaveHeader). */
  gamemode: string;
  /** Total level across all skills (from SaveHeader). */
  totalLevel: number;
  /** GP (Gold Pieces) as a string — int64 currency, JSON/IPC-safe (no precision loss). */
  gp: string;
  /** Slayer Coins as a string — int64 currency, JSON/IPC-safe (no precision loss). */
  slayerCoins: string;
}

/**
 * An offset-free view of an ambiguous candidate (D-03). The FieldTable holds the
 * offset-bearing `FieldCandidate` (offset + evidence); the ViewModel surfaces only the
 * evidence so Phase 5's UI can display the ambiguity WITHOUT leaking byte offsets (SC-4).
 * Carrying the offset here would violate "no offset key at any depth."
 */
export interface ViewCandidate {
  /** Human-readable evidence describing why this candidate validated (no offset). */
  evidence: string;
}

/**
 * A field with more than one context-validated candidate, surfaced for a higher layer /
 * the user to disambiguate (D-03 — candidates-when-many, never auto-picked).
 */
export interface UnresolvedField {
  /** The logical field key that had >1 context-validated candidate (D-03). */
  field: string;
  /** Offset-free candidate list (evidence only — no `offset` key, SC-4). */
  candidates: ViewCandidate[];
}

/**
 * The offset-free JSON view model — the UI-facing projection of the parsed save.
 * Contains NO byte offset at any depth (SC-4 by construction). Phase 5 renders this;
 * Phase 3's patcher reads the FieldTable, NEVER the view model.
 *
 * Provisional decisions encoded (see 02-CONTEXT.md):
 *   - D-01: lean + free metadata (isPlaceholder/isLocked/entityIds parsed for free).
 *   - D-02: raw namespaced IDs, no name table (optional `name` field deferred to Phase 5;
 *     member types leave room for it).
 *   - D-03: unresolvedFields surfaces ambiguity (offset-free candidates).
 * If the user later narrows the view model, only this file's types + Wave 3's projection
 * change — the FieldTable and Wave 2 parsers are unaffected.
 */
export interface ViewModel {
  /** Save version (int32 at offset 0). Fixture is version 20. */
  version: number;
  /** True if the save version is newer than the parser was built for (SC-5 — warn-but-parse). */
  unknownVersion: boolean;
  /** Character/save summary (name, gamemode, totalLevel, GP, SlayerCoins). */
  summary: Summary;
  /** Bank item stacks (flat list across all tabs — D-04 research open question 2). */
  bankItems: BankItem[];
  /** Skills (entities with an Experience component). */
  skills: Skill[];
  /** All entity IDs present in the save (D-01 free metadata — parsed from the entity list). */
  entityIds: string[];
  /**
   * Fields with more than one context-validated candidate (D-03 ambiguity surfacing).
   * Present only when there are unresolved fields; the candidates are offset-free (SC-4).
   */
  unresolvedFields?: UnresolvedField[];
  // Intentionally NO `offset` key anywhere (SC-4 by construction). assertNoOffsets()
  // (test/helpers/no-offset-scan.ts) is the runtime guard that catches a leak.
}
