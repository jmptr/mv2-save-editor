# Feature Research

**Domain:** Binary/offline game save-file editor (Melvor Idle 2 `.sav`)
**Researched:** 2026-07-03
**Confidence:** HIGH (well-established tool category; conventions are stable and directly grounded in this project's documented save format)

## Feature Landscape

Save editors cluster into two families: (1) **structured/JSON editors** (e.g. saveeditor.online, RPG Maker / Unity editors) that expose a decoded object tree, and (2) **binary/offline editors** (e.g. No Man's Sky Save Editor, ETS2 Save-Edit-Tool, Cheat Engine tables) that patch specific values in a compiled blob. This project is firmly in family (2): a Brotli-compressed .NET `BinaryWriter` blob with no JSON layer. That distinction shapes what's table stakes — binary editors live or die on **not corrupting the file** and on **finding the right bytes**, whereas JSON editors get parsing largely for free.

The dominant lesson across every editor surveyed: **safety is the product**. Non-destructive copy-on-write, backups, and a visible "what changed" view are universally present or universally requested. The dominant frustration: **finding the value you want to edit** in a save with hundreds of items and dozens of skills — which is why search/filter and human-readable name lookups repeatedly show up as the highest-value quality-of-life features.

### Table Stakes (Users Expect These)

Missing any of these makes the tool feel broken or dangerous.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Load & decode a save (Brotli decompress + parse layout) | Nothing works without it; this is the entry point | MEDIUM | Parse `[version][SaveHeader][entity list]…`; re-parse offsets fresh every load (documented lesson — never reuse offsets across sessions) |
| Character/save summary (name, gamemode, GP, Slayer Coins, total level) | Immediate "is this the right save?" confirmation + orientation | LOW | Read-only for v1; header GP/SC are cosmetic snapshots — display them but note the wallet is the source of truth |
| Browse a list of bank items with current quantities | Can't edit what you can't see; the whole point of a browsing editor | MEDIUM | Item stack = `[int32 qty][bool placeholder][bool locked][string itemID]`; iterate the Bank region rather than byte-scan per item |
| Browse a list of skills with current XP + level | Same as items — visibility precedes editing | LOW-MEDIUM | Iterate known skill entities; read `ExperienceComponent` = `[double XP][int32 LevelCap][int32 Level]` |
| Edit a value in-place (GP/SC int64, qty int32, XP double, Level int32) | The core verb of a save editor | MEDIUM | Same-byte-width only for v1 → no region-size-prefix rewrites → primary corruption risk avoided |
| Validate values against type/range before write | Out-of-range values corrupt or crash the game; a naive editor is a footgun | LOW-MEDIUM | int32 max 2,147,483,647; int64 max ~9.2e18; Level 1–LevelCap (usually 120); XP finite non-negative double |
| Non-destructive write to a NEW `.sav` (original untouched) | Universal convention; a corrupted save is the worst outcome and must stay recoverable | LOW | Brotli-recompress; write to a new path. This IS the backup mechanism for v1 |
| Round-trip correctness (output loads in-game) | The single core-value requirement; a save the game rejects is a total failure | MEDIUM | Verify unchanged bytes are byte-identical after a no-op load→save; in-place same-width edits preserve region sizes |
| Preview/confirm pending changes before writing | Users expect to see "you are about to do X" before an irreversible-feeling action | LOW-MEDIUM | A pending-changes list (field, old → new); mirrors the near-universal "show only changed fields" pattern |

### Differentiators (Competitive Advantage)

Quality-of-life wins for someone editing saves *frequently*. These align with the Core Value ("fast, safe, repeatable"). A frequent editor's bottleneck is *finding* and *entering* values, not the byte-patching itself.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Search/filter across bank items | Hundreds of items; scrolling is unusable. Highest-leverage QoL feature | LOW | Client-side substring/fuzzy filter on itemID/name; incremental as-you-type. Depends on the item browse list |
| Search/filter across skills | Fast jump to a skill among ~30 | LOW | Trivial once the skill list exists |
| Human-readable item names (catalog lookup) | `MelvorBase:AgilityMark` → "Agility Mark" is far more usable than raw IDs | MEDIUM | Needs a name catalog (bundled game-data map or ID→label table). If unavailable, prettify the ID (strip namespace, split camelCase) as a graceful fallback |
| XP-table-aware level setting | Set a skill by typing a **level** and auto-compute the correct XP (and vice-versa), keeping XP+Level consistent | MEDIUM | Use the documented `StandardExperienceTable` (`scaling=0.25, exp_scaling=300, base=2^(1/7)`). Setting Level without matching XP is the classic skill-edit corruption; this feature *prevents* it. High value, contained cost |
| Diff/preview of pending changes (structured) | See every edit (old → new, per field) before committing; the de-facto "undo" for tools without real undo | LOW-MEDIUM | Elevates the table-stakes preview into a first-class review screen |
| Bulk edits (set all filtered items to N, "max all skills") | The recurring "add 1,000,000 of every item" / "level everything" tester workflow, in one action | MEDIUM | Apply an edit across the current filtered set; each still validated. Pairs with search/filter |
| Backup-on-write / timestamped output naming | Auto-name outputs (`save_2026-07-03_1.sav`) so repeated edits don't clobber each other | LOW | Cheap safety-and-convenience win on top of non-destructive write |
| Round-trip self-check on load | Immediately warn if the parser can't reproduce the input byte-for-byte (format drift / unsupported version) | MEDIUM | Guards against silent format bumps beyond version 17; version checks should be tolerant, this makes them safe |
| Copy-item / duplicate-stack helpers | Right-click "set to max", "clone quantity to another item" | LOW-MEDIUM | Minor accelerators seen in other editors (drag-clone). Nice, not essential |

### Anti-Features (Commonly Requested, Often Problematic)

Explicitly NOT for v1. Documented here to prevent scope creep.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Add brand-new items/entities not already in the save | "I want an item I don't have yet" — the obvious next ask | Requires **byte insertion** + rewriting region-size prefixes; the single largest corruption risk and the whole reason v1 is in-place-only | Defer to a later milestone. For now, add the item in-game once (or via console), then edit its quantity |
| Edit header/character info (name, gamemode, total level) | Rename character, switch gamemode | Header GP/SC are cosmetic and refresh on save; gamemode/total-level edits interact with in-game state and validation in ways v1 hasn't mapped | Deferred (not forbidden). Keep header read-only in v1 |
| Overwrite the original `.sav` in place | "Just save it, don't make me manage files" | Destroys the recovery path; one bad write = lost save | Always write a new file; make the new-file flow frictionless (auto-naming) |
| Cloud sync / multi-user / distribution | Sounds "complete" | This is a personal single-tester tool; auth, packaging, and sync are pure overhead with zero user value here | Local-only desktop app; no accounts |
| Encryption / anti-cheat handling | Assumed necessary for game saves | The format is Brotli-compressed but **not** encrypted; there's nothing to defeat | Skip entirely; Brotli is via Node's built-in `zlib` |
| Full generic tree/hex editor of every byte | "Total control" like Cheat Engine | Enormous surface area, easy to corrupt, no validation, contradicts the "safe" core value | Curated typed editors for the known fields (GP, SC, item qty, XP/Level) with validation |
| Real-time in-game editing / live memory patching | Cheat-Engine-style instant effects | Different problem domain (process memory, not files); out of scope and fragile across game updates | File-based edit → reload save in game |
| Live game-data catalog fetched online | Always-current item names | Adds a network dependency to an offline local tool; version skew risk | Bundle a static ID→name map; fall back to prettified IDs |

## Feature Dependencies

```
Load & decode save (Brotli + parse layout)
    ├──requires──> Save summary (header read)
    ├──requires──> Bank item browse list
    │                   ├──enhances──> Item search/filter
    │                   ├──enhances──> Human-readable item names (catalog)
    │                   ├──requires──> Edit item quantity (int32, in-place)
    │                   └──enables───> Bulk edits (set filtered items to N)
    └──requires──> Skill browse list
                        ├──enhances──> Skill search/filter
                        ├──requires──> Edit skill XP + Level (in-place)
                        └──requires──> XP-table-aware level setting
                                            └──requires──> XP table (StandardExperienceTable)

Edit any value ──requires──> Range/type validation
                                  └──requires──> Pending-changes model
                                                     ├──feeds──> Preview/confirm (diff view)
                                                     └──feeds──> Non-destructive write (new .sav)
                                                                     └──requires──> Round-trip correctness
```

### Dependency Notes

- **Everything requires Load & decode:** parsing the layout (version → header → entity list → Bank/skill regions) is the foundation; all browse/edit/write features build on the parsed offset model. Offsets must be re-parsed fresh each load.
- **Edit requires a Pending-changes model:** validation, preview, and non-destructive write all consume a common in-memory list of `{offset, type, old, new}`. Building this abstraction once unlocks preview, diff, and bulk edits cheaply.
- **XP-table-aware level setting requires the XP table AND depends on edit-XP/Level:** it's the safe front-end over the raw double/int32 edit — it exists specifically to keep XP and Level consistent, preventing the most common skill-edit corruption.
- **Search/filter enhances (not requires) the browse lists:** lists work without it, but at hundreds of items the tool is frustrating without it — the reason it's the top differentiator rather than a nicety.
- **Human-readable names enhance browsing but must degrade gracefully:** if the catalog is missing an ID, prettify the raw ID rather than hide the item.
- **Bulk edits conflict with per-item confirmation UX:** applying to a filtered set must still route every change through validation + the pending-changes preview, or it becomes a mass-corruption footgun.

## MVP Definition

### Launch With (v1)

Minimum to validate "fast, safe, repeatable save editing."

- [ ] Load `.sav` (Brotli decompress + parse layout) — entry point for everything
- [ ] Save summary (name, gamemode, GP, SC, total level, read-only) — orientation/confirmation
- [ ] Bank item browse list with quantities — can't edit what you can't see
- [ ] Skill browse list with XP + Level — same
- [ ] Item search/filter — hundreds of items make this effectively table stakes for v1 usability
- [ ] Skill search/filter — cheap once list exists
- [ ] Edit GP & Slayer Coins (int64, in-place, wallet not header)
- [ ] Edit item quantity (int32, in-place)
- [ ] Edit skill XP + Level (in-place); set-by-level using the XP table to keep them consistent
- [ ] Range/type validation on every edit
- [ ] Pending-changes preview/confirm before write
- [ ] Non-destructive write to a new `.sav` (Brotli-recompress)
- [ ] Round-trip correctness (no-op load→save is byte-identical; edited save loads in-game)

### Add After Validation (v1.x)

- [ ] Human-readable item/skill names via bundled catalog — trigger: raw IDs prove annoying in daily use
- [ ] Bulk edits (set all filtered items to N, max-all-skills) — trigger: repetitive multi-item edits observed
- [ ] Timestamped/auto-named outputs + backup-on-write — trigger: output-file clutter/clobber friction
- [ ] Round-trip self-check warning on load — trigger: first save-format version bump

### Future Consideration (v2+)

- [ ] Edit header/character info (name, gamemode) — defer: interacts with in-game validation/state
- [ ] Add brand-new items/entities (byte insertion + region-size rewrite) — defer: highest corruption risk, needs its own milestone
- [ ] Editing other entities (Shop, Farming plots, Quests, Statistics) — defer: expand once the core edit/write loop is proven safe

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Load & decode save | HIGH | MEDIUM | P1 |
| Save summary (read-only) | MEDIUM | LOW | P1 |
| Bank item browse list | HIGH | MEDIUM | P1 |
| Skill browse list | HIGH | LOW | P1 |
| Edit GP / Slayer Coins | HIGH | LOW | P1 |
| Edit item quantity | HIGH | MEDIUM | P1 |
| Edit skill XP + Level | HIGH | MEDIUM | P1 |
| XP-table-aware level setting | HIGH | MEDIUM | P1 |
| Range/type validation | HIGH | LOW | P1 |
| Pending-changes preview/confirm | HIGH | LOW | P1 |
| Non-destructive write to new file | HIGH | LOW | P1 |
| Round-trip correctness check | HIGH | MEDIUM | P1 |
| Item/skill search/filter | HIGH | LOW | P1 |
| Human-readable names (catalog) | MEDIUM | MEDIUM | P2 |
| Bulk edits | MEDIUM | MEDIUM | P2 |
| Auto-named/backup outputs | MEDIUM | LOW | P2 |
| Copy/duplicate-stack helpers | LOW | LOW | P3 |
| Edit header/character info | LOW (v1) | MEDIUM | P3 |
| Add new items (byte insertion) | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have / future

## Expected UX

### Browsing hundreds of items
- **Single searchable, scrollable list** (virtualized if the item count is large) with an always-visible filter box; filter as-you-type on both raw ID and human-readable name. This is the pattern users expect from every editor surveyed and the antidote to the top frustration ("I can't find the value").
- Show quantity inline and edit in place (inline field or click-to-edit row) rather than a separate modal per item — frequent editors value low click-count.
- Consider a "show only changed" toggle — the near-universal stand-in for undo in binary editors, and it doubles as the preview surface.

### Setting skill levels via an XP table
- Let the user type a **level** (the mental model they actually have) and auto-fill the required XP from the table; optionally allow typing raw XP and show the resulting level. Always write **both** XP and Level so they stay consistent — the whole reason for the feature.
- Surface milestone context (e.g. L99 = 13,034,427 XP; L120 = 104,273,162 XP) so the user understands the magnitude of what they're setting.
- Clamp Level to `1..LevelCap` (usually 120) and reject non-finite/negative XP at validation time.

## Competitor Feature Analysis

| Feature | Structured editors (saveeditor.online, RPG Maker/Unity) | Binary/offline editors (NMS Save Editor, ETS2 Save-Edit-Tool, Cheat Engine) | Our Approach |
|---------|--------------------------------------------------------|------------------------------------------------------------------------------|--------------|
| Parsing | Decode to JSON tree, edit generically | Hand-parse known offsets/regions; patch specific values | Hand-parse documented .NET binary layout; curated typed fields |
| Browsing | Full object tree | Curated panels (inventory, stats) + search | Searchable bank + skill lists |
| Editing | Free-form tree edits | Typed value patch, in-place | In-place same-width typed edits, validated |
| Item names | Often raw keys or bundled labels | Bundled ID→name catalogs | Bundled catalog (v1.x); prettified IDs as fallback |
| Safety | Copy + "show only changed fields" | Copy-on-write, backups, undo (sometimes) | Non-destructive new-file write + validation + preview |
| Bulk ops | Some ("set all") | "Add 1M of everything" scripts, level-all | Bulk-set on filtered set (v1.x), each validated |
| Add-new entities | Trivial (append to JSON) | Hard/avoided (byte insertion) | Out of scope for v1 |

## Sources

- [Save Editor Online](https://saveeditor.online/) — structured editor conventions (tree editing, gold/stats/items)
- [Save Editor Online (saveeditonline.com)](https://www.saveeditonline.com/) — upload/edit/download flow
- [No Man's Sky Save Editor (goatfungus)](https://github.com/goatfungus/nmssaveeditor) — binary/offline editor: inventory management, backups
- [ETS2 Save-Edit-Tool](https://github.com/xLieferant/Save-Edit-Tool) — read/edit/save binary game data, auto-update, "overwrite skill levels" pattern
- [paradoxie/saveeditor](https://github.com/paradoxie/saveeditor) — privacy-focused, 100% local processing (offline-first convention)
- [The Complete Guide to Game Save Editors (readzoner)](https://readzoner.com/game-save-editor/) — non-destructive editing, auto-backup, "show only changed fields" as undo
- [Melvor Idle In-game Functions (wiki)](https://wiki.melvoridle.com/w/In-game_Functions) — `addItemByID`, currency setters, level-up commands (the workflows this tool replaces)
- [Melvor Idle Save Editor (Gaming Pirate)](https://gamingpirate.com/melvor-idle-save-editor/) — existing community editor UX (import/edit gold+items/export)
- [Melvor Mod your save file (Steam guide)](https://steamcommunity.com/sharedfiles/filedetails/?id=2511741502) — community save-editing workflow and "back up first" convention
- Project spec: `docs/current-skill.md` (save format, stack layout, XP table) and `.planning/PROJECT.md` (v1 scope)

---
*Feature research for: binary/offline game save-file editor (Melvor Idle 2)*
*Researched: 2026-07-03*
