---
status: complete
phase: 02-format-parser-fieldtable-model
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md]
started: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Bank Inventory — all 689 stacks recovered
expected: Parsing the fixture's Bank recovers exactly 689 valid item stacks across all tabs via bounded marker-search, each keyed by a distinct qtyOffset. Duplicate item IDs across tabs are distinct entries. NormalLog spot-check: qty 48652.
result: pass

### 2. parseSave orchestrator — full save → one model
expected: parseSave(buffer) wires version → SaveHeader → 33-entity list → per-entity component walk, dispatching to parseWallet / findStacks / parseExperience at each boundary and assembling one FieldTable + offset-free ViewModel. Fixture yields version 20, summary Bob/Test, 689 bank stacks, Woodcutting xp/cap/level, wallet authoritative + header mirrors.
result: pass

### 3. FieldTable model + typed error hierarchy
expected: FieldEntry discriminated union (int32/int64→bigint/double/bool/string), FieldTable container (add/get/getRequired + candidates), ParseError/RequiredFieldMissingError.
result: pass
source: automated
coverage_id: 02-01-D1

### 4. Offset-free ViewModel type (SC-4 type-level)
expected: ViewModel + Summary/BankItem/Skill/entityIds with int64 as string, no `offset` property at any depth.
result: pass
source: automated
coverage_id: 02-01-D2

### 5. SC-4 runtime guard (assertNoOffsets)
expected: assertNoOffsets recursively walks and throws naming the path if any `offset` key appears at any depth.
result: pass
source: automated
coverage_id: 02-01-D3

### 6. Shared test fixture harness
expected: loadFixtureBuffer() returns the 2,284,747-byte decompressed committed fixture, cached at module load.
result: pass
source: automated
coverage_id: 02-01-D4

### 7. readVersion + version tolerance
expected: Fixture yields version 20 (unknownVersion false); a version-21 copy parses with unknownVersion=true; shared fixture not mutated.
result: pass
source: automated
coverage_id: 02-02-D1

### 8. parseSaveHeader summary + mirrors
expected: Summary (Bob/Test/totalLevel 1366/GP 953063625/SC 6511) matches reference; header GP/SC are readOnly mirrors; cursor lands at headerEnd=150.
result: pass
source: automated
coverage_id: 02-02-D2

### 9. walkEntities (33 entities, delta-0)
expected: Fixture declares 33 entities, walk consumes exactly to byte 2,284,711; spans opaque {id,start,size}; generic (recovers MelvorBase:Layout).
result: pass
source: automated
coverage_id: 02-02-D3

### 10. walkComponents (delta-0 integrity spine)
expected: Every entity region walks count==walked AND cursor==regionEnd; Bank entity has Wallet + Inventory components; mismatch throws typed ParseError.
result: pass
source: automated
coverage_id: 02-02-D4

### 11. SC-5 structural bounds guards
expected: Oversized/negative entity+component counts throw ParseError before looping; size overruns throw ParseError; malformed 7-bit prefix / truncation propagate RangeError.
result: pass
source: automated
coverage_id: 02-02-D5

### 12. parseWallet (currency-by-ID, bigint)
expected: GP@20511=953063625n authoritative, SC@20573=6511n authoritative, PrayerPoints between them (order not assumed); int64 as bigint; missing GP → RequiredFieldMissingError with actionable fieldKey.
result: pass
source: automated
coverage_id: 02-03-D1

### 13. parseExperience (3 distinct offsets, SC-3 validation)
expected: Woodcutting XP double @+0 writable, LevelCap int32 @+8 readOnly, Level int32 @+12 writable; rejects level>cap, cap out of [1,200], negative/NaN/Infinity XP, size<16; edge triples parse.
result: pass
source: automated
coverage_id: 02-03-D2

### 14. Inventory SC-3 context-validation
expected: prefix ≥ marker length, qty in [0,2^31-1], placeholder/locked bytes in {0,1}; false marker matches rejected.
result: pass
source: automated
coverage_id: 02-04-D2

### 15. Inventory SC-5 region bounds
expected: Every read bounded to [invStart,invEnd); stacks before invStart or overrunning invEnd are skipped.
result: pass
source: automated
coverage_id: 02-04-D3

### 16. Inventory D-03 ambiguity contract (resolveOne)
expected: resolveOne returns resolved (1 match) / candidates (>1, never auto-picked) / notFound (0).
result: pass
source: automated
coverage_id: 02-04-D4

### 17. SC-2 authoritative wallet + readOnly header mirrors
expected: Wallet GP/SC authoritative (write targets); header GP/SC readOnly mirrors in both FieldTable and ViewModel.
result: pass
source: automated
coverage_id: 02-05-D2

### 18. SC-4 offset-free ViewModel + determinism
expected: assertNoOffsets(viewModel) passes; two parseSave calls yield identical FieldTable offsets (nothing cached/persisted).
result: pass
source: automated
coverage_id: 02-05-D3

### 19. SC-5 version tolerance in ViewModel
expected: Unknown/newer version parses with unknownVersion=true surfaced in the ViewModel (warn-but-parse).
result: pass
source: automated
coverage_id: 02-05-D4

### 20. projectViewModel branch coverage
expected: unresolvedFields forward-compat branch (present + absent) under exactOptionalPropertyTypes.
result: pass
source: automated
coverage_id: 02-05-D5

## Summary

total: 20
passed: 20
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
