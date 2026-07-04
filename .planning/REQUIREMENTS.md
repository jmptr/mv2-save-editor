# Requirements: MV2 Save Editor

**Defined:** 2026-07-03
**Core Value:** Turn a fiddly, error-prone manual save-editing process into a fast, safe, repeatable one — the editor must always produce a `.sav` the game can load without corruption.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Save I/O

- [x] **IO-01**: User can load a `.sav` file — the app Brotli-decompresses it and parses the documented binary layout (version → SaveHeader → entity list), re-parsing offsets fresh on every load
- [x] **IO-02**: User can write edits to a NEW `.sav` file (Brotli-recompressed), leaving the original file untouched
- [x] **IO-03**: A no-op load→save produces a byte-identical decompressed buffer, and every write enforces `output.length === input.length` (same-width edits preserve region-size prefixes)

### Browse & Search

- [ ] **BROWSE-01**: User can see a read-only save summary — character name, gamemode, GP, Slayer Coins, and total level
- [ ] **BROWSE-02**: User can browse a list of all bank items with their current quantities
- [ ] **BROWSE-03**: User can browse a list of all skills with their current XP and level
- [x] **BROWSE-04**: User can filter the bank item list as-you-type (by item ID)
- [x] **BROWSE-05**: User can filter the skill list as-you-type

### Editing

- [x] **EDIT-01**: User can edit GP and Slayer Coins (int64, in the Bank wallet, in-place) — not the cosmetic SaveHeader snapshot
- [x] **EDIT-02**: User can edit a bank item's quantity (int32, in-place)
- [x] **EDIT-03**: User can edit a skill's XP (double) and Level (int32) in-place, with both written consistently
- [x] **EDIT-04**: User can set a skill by typing a target Level; the app auto-computes the correct XP from the StandardExperienceTable and keeps XP and Level consistent

### Safety & Validation

- [x] **SAFE-01**: The app validates every edited value against its type/range before writing (int32 ≤ 2,147,483,647; int64 ≤ ~9.2e18; Level 1..LevelCap; finite non-negative XP)
- [ ] **SAFE-02**: The app shows a pending-changes preview (field, old → new) and requires explicit confirmation before writing

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Names

- **NAME-01**: Human-readable item/skill names via a bundled ID→label catalog, with a prettified-ID fallback when an ID is missing

### Bulk Edits

- **BULK-01**: Bulk-set all currently-filtered bank items to a given quantity (each still validated)
- **BULK-02**: "Max all skills" bulk action

### Output Management

- **OUT-01**: Timestamped / auto-named output files and backup-on-write so repeated edits don't clobber each other
- **OUT-02**: Round-trip self-check on load that warns if the parser cannot reproduce the input byte-for-byte (format-drift / unsupported-version detection)

### Header Editing

- **HEADER-01**: User can edit header/character info (name, gamemode)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Add brand-new items/entities not already in the save | Requires byte insertion + region-size-prefix rewrites — the single largest corruption risk and the whole reason v1 is in-place-only |
| Overwrite the original `.sav` in place | Destroys the recovery path; one bad write loses the save. Always write a new file |
| Cloud sync / multi-user / distribution / accounts | Personal single-tester tool; pure overhead with zero value here |
| Encryption / anti-cheat handling | The format is Brotli-compressed but not encrypted — nothing to defeat |
| Full generic hex/tree editor of every byte | Enormous surface, no validation, contradicts the "safe" core value |
| Real-time in-game / live memory patching | Different problem domain (process memory, not files) |
| Online game-data catalog fetched at runtime | Adds a network dependency to an offline local tool |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IO-01 | Phase 2 | Complete |
| IO-02 | Phase 4 | Complete |
| IO-03 | Phase 1 | Complete |
| BROWSE-01 | Phase 5 | Pending |
| BROWSE-02 | Phase 5 | Pending |
| BROWSE-03 | Phase 5 | Pending |
| BROWSE-04 | Phase 5 | Complete |
| BROWSE-05 | Phase 5 | Complete |
| EDIT-01 | Phase 5 | Complete |
| EDIT-02 | Phase 5 | Complete |
| EDIT-03 | Phase 5 | Complete |
| EDIT-04 | Phase 3 | Complete |
| SAFE-01 | Phase 3 | Complete |
| SAFE-02 | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 14 total
- Mapped to phases: 14 ✓
- Unmapped: 0

---
*Requirements defined: 2026-07-03*
*Last updated: 2026-07-03 after roadmap creation*
