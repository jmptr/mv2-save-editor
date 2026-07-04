---
status: testing
phase: 03-patcher-validation-xp-table
source: [03-VERIFICATION.md]
started: 2026-07-04T15:19:46Z
updated: 2026-07-04T15:19:46Z
---

## Current Test

number: 1
name: Apply a patchSave edit, recompress, and load the resulting .sav in Melvor Idle 2
expected: |
  The game loads the save without corruption/rejection and the edited value
  (GP, item quantity, or skill XP/Level) is reflected in-game.
awaiting: user response

## Tests

### 1. Apply a patchSave edit, recompress, and load the resulting .sav in Melvor Idle 2
expected: Apply a GP/quantity/skill edit via patchSave, recompress with codec.compress, write the bytes to a new .sav, and load it in Melvor Idle 2. The game loads the save without corruption/rejection and the edited value (GP, item quantity, or skill XP/Level) is reflected in-game.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
