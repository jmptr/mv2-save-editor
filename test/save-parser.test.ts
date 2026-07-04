// Save-parser orchestrator test suite — parseSave wires spine + region parsers into one
// FieldTable + derived offset-free ViewModel (IO-01 end-to-end, SC-1, SC-2, SC-4, SC-5).
//
// Proves the full integration: parseSave(fixture) walks version → SaveHeader → 33-entity
// list → per-entity component list (02-02's structural-walk spine), dispatches to the
// region parsers at each component boundary (02-03 parseWallet at the Bank's Wallet
// dataStart, 02-03 parseExperience at every skill's Experience dataStart, 02-04 findStacks
// at the Bank's Inventory region), and assembles one FieldTable.
//
// SC-1: full fixture parse — version 20, summary (Bob/Test/1366/953063625/6511), 689
//   stacks, Woodcutting xp 7439645.20000645 / cap 120 / level 93.
// SC-2: Bank wallet int64 currencies authoritative (write targets); SaveHeader GP/SC
//   readOnly mirrors (never written). Phase 3's patcher reads the authoritative flag.
// SC-4: ViewModel derived by projection (offset-free); re-parse yields identical
//   FieldTable offsets (deterministic walk, offsets never persisted).
// SC-5: an unknown/newer version (21) parses with unknownVersion=true (warn-but-parse).
//
// Locates the Bank by component names ('Wallet'+'Inventory'), NOT a hard-coded entity ID
// (T-02-05 mitigation — the fixture has MelvorBase:Layout, not in the docs' Known Entity
// IDs). 'Skill' = any entity with an Experience component (RESEARCH A3 — Combat may
// surface as an XP-bearing entry).
//
// Implements: D-04 (c8 gate — 100% lines+branches on src/save-parser.ts). Mitigates
// T-02-04 (offsets leaking into the view model → projection with no offset field),
// T-02-09 (offsets cached/persisted → re-derived every call, determinism test), T-02-05
// (Bank located by hard-coded ID → located by component names), T-02-SC (no packages
// installed — zero supply-chain surface).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { loadFixtureBuffer } from './helpers/fixture';
import { versionBumpedFixtureBuffer } from './helpers/malformed';
import { assertNoOffsets } from './helpers/no-offset-scan';
import { parseSave, projectViewModel } from '../src/save-parser';
import { FieldTable } from '../src/field-table';

// The decompressed committed fixture (2,284,747 bytes, version 20). Cached at module
// load. Consumed read-only via BinaryReader (never mutated).
const FIXTURE = loadFixtureBuffer();

// Verified fixture reference values (02-RESEARCH.md §Code Examples):
//   version 20, summary (Bob/Test/1366/GP 953063625/SC 6511)
//   Wallet dataStart 20507, count 3 — GoldPieces @ 20511 = 953063625n (authoritative),
//     PrayerPoints @ 20541 = 987361n (not authoritative), SlayerCoins @ 20573 = 6511n
//     (authoritative)
//   Inventory region [710, 20496) — 689 stacks; NormalLog @ qtyOffset 736 = 48652
//   Woodcutting Experience dataStart 47405, size 16 — xp @ 47405 = 7439645.20000645
//     (double), levelCap @ 47413 = 120 (readOnly), level @ 47417 = 93

// ---------------------------------------------------------------------------
// Task 1: parseSave orchestration — full fixture FieldTable (SC-1, SC-2)
// ---------------------------------------------------------------------------

describe('parseSave — full fixture integration into one FieldTable (SC-1, SC-2)', () => {
  test('parseSave returns { fieldTable, viewModel }', () => {
    const result = parseSave(FIXTURE);
    assert.ok(result.fieldTable instanceof FieldTable, 'fieldTable is a FieldTable');
    assert.ok(typeof result.viewModel === 'object' && result.viewModel !== null,
      'viewModel is an object');
  });

  test('viewModel.version is 20, unknownVersion false (SC-1)', () => {
    const { viewModel } = parseSave(FIXTURE);
    assert.equal(viewModel.version, 20);
    assert.equal(viewModel.unknownVersion, false);
  });

  test('viewModel.entityIds lists all 33 entities (SC-1, D-01 free metadata)', () => {
    const { viewModel } = parseSave(FIXTURE);
    assert.equal(viewModel.entityIds.length, 33);
    assert.ok(viewModel.entityIds.includes('MelvorBase:Bank'), 'Bank entity present');
    assert.ok(viewModel.entityIds.includes('MelvorBase:Woodcutting'), 'Woodcutting entity present');
    assert.ok(viewModel.entityIds.includes('MelvorBase:Layout'),
      'MelvorBase:Layout (not in docs Known Entity IDs) recovered — walk is generic');
  });

  test('FieldTable: wallet.GoldPieces authoritative at offset 20511 = 953063625n (SC-2)', () => {
    const { fieldTable } = parseSave(FIXTURE);
    const gp = fieldTable.get('wallet.GoldPieces');
    assert.ok(gp, 'wallet.GoldPieces entry emitted');
    assert.equal(gp!.kind, 'int64');
    assert.equal(gp!.width, 8);
    assert.equal(gp!.offset, 20511, 'GP at the fixture offset (currency-by-ID, 02-03)');
    assert.equal(gp!.value, 953063625n);
    assert.equal(gp!.authoritative, true, 'wallet GP is the authoritative write target (SC-2)');
    assert.equal(gp!.readOnly, undefined, 'wallet GP is NOT readOnly (it is the write target)');
    assert.equal(gp!.mirrors, undefined, 'wallet GP is the source, not a mirror');
    assert.equal(typeof gp!.value, 'bigint', 'int64 held as bigint (T-02-06)');
  });

  test('FieldTable: wallet.SlayerCoins authoritative at offset 20573 = 6511n (SC-2)', () => {
    const { fieldTable } = parseSave(FIXTURE);
    const sc = fieldTable.get('wallet.SlayerCoins');
    assert.ok(sc, 'wallet.SlayerCoins entry emitted');
    assert.equal(sc!.kind, 'int64');
    assert.equal(sc!.width, 8);
    assert.equal(sc!.offset, 20573);
    assert.equal(sc!.value, 6511n);
    assert.equal(sc!.authoritative, true, 'wallet SC is the authoritative write target (SC-2)');
    assert.equal(sc!.readOnly, undefined);
    assert.equal(typeof sc!.value, 'bigint');
  });

  test('FieldTable: header.GP / header.SlayerCoins are readOnly mirrors (SC-2)', () => {
    const { fieldTable } = parseSave(FIXTURE);
    const hgp = fieldTable.get('header.GP');
    assert.ok(hgp, 'header.GP entry emitted (02-02 readOnly mirror)');
    assert.equal(hgp!.kind, 'int64');
    assert.equal(hgp!.width, 8);
    assert.equal(hgp!.value, 953063625n, 'header GP mirrors the wallet value');
    assert.equal(hgp!.readOnly, true, 'header GP is readOnly (SC-2 — never a write target)');
    assert.equal(hgp!.mirrors, 'wallet.GoldPieces', 'header.GP.mirrors points at the wallet');
    assert.equal(hgp!.authoritative, undefined, 'header GP is NOT authoritative');

    const hsc = fieldTable.get('header.SlayerCoins');
    assert.ok(hsc, 'header.SlayerCoins entry emitted');
    assert.equal(hsc!.kind, 'int64');
    assert.equal(hsc!.value, 6511n);
    assert.equal(hsc!.readOnly, true);
    assert.equal(hsc!.mirrors, 'wallet.SlayerCoins');
    assert.equal(hsc!.authoritative, undefined);
  });

  test('FieldTable: bank inventory stack present (qty + placeholder + locked) (SC-1)', () => {
    const { fieldTable } = parseSave(FIXTURE);
    // NormalLog @ qtyOffset 736 (verified fixture reference). The stack is keyed by its
    // per-itemId occurrence index (#0 = first NormalLog in walk order) so duplicate item
    // IDs across tabs are distinct fields (D-01) WITHOUT leaking the byte offset (SC-4).
    // The FieldEntry `offset` still carries the real qtyOffset (736) internally.
    const qty = fieldTable.get('bank.inventory.MelvorBase:NormalLog#0');
    assert.ok(qty, 'NormalLog stack at qtyOffset 736 present in the FieldTable');
    assert.equal(qty!.kind, 'int32');
    assert.equal(qty!.width, 4);
    assert.equal(qty!.offset, 736, 'qty at qtyOffset (Phase 3 same-width write target)');
    assert.equal(qty!.value, 48652, 'NormalLog quantity matches the research reference');

    // placeholder/locked flags also emitted (D-01 free metadata — parsed for free, surfaced
    // in the FieldTable so the ViewModel projection can derive BankItem with no extra state).
    const placeholder = fieldTable.get('bank.inventory.MelvorBase:NormalLog#0.placeholder');
    assert.ok(placeholder, 'placeholder flag emitted alongside qty');
    assert.equal(placeholder!.kind, 'bool');
    assert.equal(placeholder!.width, 1);
    assert.equal(placeholder!.offset, 736 + 4, 'placeholder at qtyOffset + 4');
    assert.equal(placeholder!.value, false, 'NormalLog is not a placeholder');

    const locked = fieldTable.get('bank.inventory.MelvorBase:NormalLog#0.locked');
    assert.ok(locked, 'locked flag emitted alongside qty');
    assert.equal(locked!.kind, 'bool');
    assert.equal(locked!.width, 1);
    assert.equal(locked!.offset, 736 + 5, 'locked at qtyOffset + 5');
    assert.equal(locked!.value, false, 'NormalLog is not locked');
  });

  test('FieldTable: Woodcutting skill triple re-keyed to skill.<id>.{xp,levelCap,level} (SC-1)', () => {
    const { fieldTable } = parseSave(FIXTURE);
    const xp = fieldTable.get('skill.MelvorBase:Woodcutting.xp');
    assert.ok(xp, 'skill.MelvorBase:Woodcutting.xp present (re-keyed from experience.xp)');
    assert.equal(xp!.kind, 'double');
    assert.equal(xp!.width, 8);
    assert.equal(xp!.offset, 47405, 'xp at the Experience dataStart (+0)');
    // Exact double value (the literal round-trips bit-faithfully — verified in 02-03).
    assert.equal(xp!.value, 7439645.20000645);
    assert.equal(xp!.readOnly, undefined, 'XP writable (Phase 3 target)');

    const cap = fieldTable.get('skill.MelvorBase:Woodcutting.levelCap');
    assert.ok(cap, 'skill.MelvorBase:Woodcutting.levelCap present');
    assert.equal(cap!.kind, 'int32');
    assert.equal(cap!.width, 4);
    assert.equal(cap!.offset, 47413, 'levelCap at dataStart + 8');
    assert.equal(cap!.value, 120);
    assert.equal(cap!.readOnly, true, 'levelCap readOnly (Pitfall 5 — Phase 3 never patches)');

    const level = fieldTable.get('skill.MelvorBase:Woodcutting.level');
    assert.ok(level, 'skill.MelvorBase:Woodcutting.level present');
    assert.equal(level!.kind, 'int32');
    assert.equal(level!.width, 4);
    assert.equal(level!.offset, 47417, 'level at dataStart + 12');
    assert.equal(level!.value, 93);
    assert.equal(level!.readOnly, undefined, 'Level writable (Phase 3 target)');
  });

  test('Bank is located by component names (Wallet+Inventory), NOT by hard-coded entity ID (T-02-05)', () => {
    // The fixture Bank is 'MelvorBase:Bank', but the orchestrator locates it as "the
    // entity whose component list contains BOTH 'Wallet' and 'Inventory'" — generic
    // location that survives a variant save whose Bank has a different entity ID.
    // The proof: wallet.GoldPieces + bank.inventory.* are populated (they would be
    // absent if the orchestrator hard-coded 'MelvorBase:Bank' and the Bank had a
    // different ID). The fixture also has MelvorBase:Layout (not in docs) — the walk
    // is generic, so the Bank locator must be generic too (T-02-05).
    const { fieldTable } = parseSave(FIXTURE);
    assert.ok(fieldTable.get('wallet.GoldPieces'), 'wallet parsed — Bank located generically');
    assert.ok(fieldTable.get('bank.inventory.MelvorBase:NormalLog#0'),
      'inventory parsed — Bank located by component names, not ID (offset-free #<n> key)');
  });
});

// ---------------------------------------------------------------------------
// Task 2: Offset-free ViewModel projection + SC-4 determinism + SC-5 version
// tolerance. projectViewModel was implemented in Task 1 GREEN as part of the
// natural parseSave implementation (parseSave returns { fieldTable, viewModel },
// so the viewModel must be built somewhere). These tests lock in the SC-4/SC-5
// invariants (regression-test GREEN) and exercise the focused projectViewModel
// branches (missing SlayerCoins, unresolvedFields) for correctness.
// ---------------------------------------------------------------------------

describe('parseSave — ViewModel projection from the full fixture (SC-1, SC-2, SC-4)', () => {
  test('viewModel.summary projects GP/SlayerCoins as strings from the wallet (SC-2)', () => {
    const { viewModel } = parseSave(FIXTURE);
    assert.equal(viewModel.summary.name, 'Bob');
    assert.equal(viewModel.summary.gamemode, 'Test');
    assert.equal(viewModel.summary.totalLevel, 1366);
    // int64 rendered as string (JSON/IPC-safe — a JSON number would lose precision past 2^53).
    assert.equal(typeof viewModel.summary.gp, 'string');
    assert.equal(typeof viewModel.summary.slayerCoins, 'string');
    assert.equal(viewModel.summary.gp, '953063625');
    assert.equal(viewModel.summary.slayerCoins, '6511');
  });

  test('viewModel.bankItems has 689 entries (one per stack across all tabs, SC-1)', () => {
    const { viewModel } = parseSave(FIXTURE);
    assert.equal(viewModel.bankItems.length, 689);
    // Spot-check NormalLog: itemId, quantity, isPlaceholder, isLocked (D-01 free metadata).
    const normalLog = viewModel.bankItems.find((b) => b.itemId === 'MelvorBase:NormalLog');
    assert.ok(normalLog, 'NormalLog present in the viewModel bank items');
    assert.equal(normalLog!.quantity, 48652);
    assert.equal(normalLog!.isPlaceholder, false);
    assert.equal(normalLog!.isLocked, false);
    // The projected key is offset-free and matches the FieldTable key (#0 = first NormalLog).
    assert.equal(normalLog!.fieldKey, 'bank.inventory.MelvorBase:NormalLog#0');
  });

  test('duplicate itemIds get distinct #<n> keys and every fieldKey resolves to its qty (EDIT-02, T-05-01/T-05-03)', () => {
    const { fieldTable, viewModel } = parseSave(FIXTURE);

    // (a) A known duplicate itemId (the fixture has two MelvorBase:NormalLog stacks) gets
    //     distinct occurrence-indexed keys #0 and #1 — offset-free, yet unique per stack.
    const normalLogs = viewModel.bankItems.filter((b) => b.itemId === 'MelvorBase:NormalLog');
    assert.ok(normalLogs.length >= 2, 'fixture has >=2 NormalLog stacks (duplicate itemId)');
    assert.equal(normalLogs[0]!.fieldKey, 'bank.inventory.MelvorBase:NormalLog#0');
    assert.equal(normalLogs[1]!.fieldKey, 'bank.inventory.MelvorBase:NormalLog#1');
    assert.notEqual(normalLogs[0]!.fieldKey, normalLogs[1]!.fieldKey, 'distinct keys per stack');
    // Neither key encodes a byte offset (SC-4 / T-05-03) — no '@' + no digit-only offset segment.
    for (const b of normalLogs) {
      assert.ok(!b.fieldKey.includes('@'), 'no @<offset> in the key (offset-free)');
    }

    // (b) For EVERY bank item, its fieldKey resolves in the FieldTable to an entry whose
    //     value equals the stack quantity (round-trip: main re-resolves the exact key on
    //     preview/write — T-05-01 deterministic resolution). Also proves uniqueness: 689
    //     distinct keys for 689 stacks (a collision would make a later stack overwrite an
    //     earlier FieldEntry and the value would mismatch).
    assert.equal(viewModel.bankItems.length, 689);
    for (const b of viewModel.bankItems) {
      const entry = fieldTable.get(b.fieldKey);
      assert.ok(entry, `fieldKey ${b.fieldKey} resolves in the FieldTable`);
      assert.equal(entry!.value, b.quantity, `fieldKey ${b.fieldKey} resolves to the stack quantity`);
    }
  });

  test('viewModel.skills includes Woodcutting with xp/level/levelCap (SC-1)', () => {
    const { viewModel } = parseSave(FIXTURE);
    const wc = viewModel.skills.find((s) => s.id === 'MelvorBase:Woodcutting');
    assert.ok(wc, 'Woodcutting present in the viewModel skills');
    assert.equal(wc!.xp, 7439645.20000645);
    assert.equal(wc!.level, 93);
    assert.equal(wc!.levelCap, 120);
  });

  test('assertNoOffsets(viewModel) passes — no byte offset leaks into the view model (SC-4 runtime)', () => {
    const { viewModel } = parseSave(FIXTURE);
    // SC-4 runtime guard — recursively scans for any 'offset' key at any depth. Catches
    // a leak even if the type system was bypassed. The ViewModel TYPE is offset-free by
    // construction (src/view-model.ts); this is the runtime backstop (test/helpers/no-offset-scan.ts).
    assertNoOffsets(viewModel);
  });
});

describe('parseSave — determinism: re-parse yields identical FieldTable offsets (SC-4, T-02-09)', () => {
  test('two parseSave calls on the same buffer produce identical FieldTable entries', () => {
    // SC-4: the walk re-derives offsets fresh from reader.offset on every call — nothing
    // is cached or persisted (T-02-09 mitigation). Calling parseSave twice on the same
    // buffer must yield IDENTICAL FieldTable entries (same offsets, same values, same flags).
    const { fieldTable: ft1 } = parseSave(FIXTURE);
    const { fieldTable: ft2 } = parseSave(FIXTURE);

    // Representative keys covering every region parser + the spine:
    //   - header mirrors (header.GP, header.SlayerCoins) — 02-02
    //   - wallet authoritative currencies (wallet.GoldPieces, wallet.SlayerCoins) — 02-03
    //   - bank inventory stacks (NormalLog @ qtyOffset 736) — 02-04
    //   - skill triple (Woodcutting xp/levelCap/level) — 02-03
    const keys = [
      'header.GP',
      'header.SlayerCoins',
      'wallet.GoldPieces',
      'wallet.SlayerCoins',
      'bank.inventory.MelvorBase:NormalLog#0',
      'bank.inventory.MelvorBase:NormalLog#0.placeholder',
      'bank.inventory.MelvorBase:NormalLog#0.locked',
      'skill.MelvorBase:Woodcutting.xp',
      'skill.MelvorBase:Woodcutting.levelCap',
      'skill.MelvorBase:Woodcutting.level',
    ];
    for (const key of keys) {
      const e1 = ft1.get(key);
      const e2 = ft2.get(key);
      assert.ok(e1 && e2, `${key} present in both parses`);
      // Deep-strict-equal: same offset, kind, width, value, readOnly/authoritative/mirrors flags.
      assert.deepEqual(e1, e2, `${key} identical across re-parse (deterministic walk, T-02-09)`);
    }
  });

  test('offsets are NOT cached — fresh BinaryReader per call (T-02-09)', () => {
    // The proof: parseSave constructs a new BinaryReader(buffer) on every call, so the
    // cursor starts at 0 each time. If offsets were cached/persisted, the second call's
    // FieldTable would either be empty (stale cache miss) or have stale offsets. The
    // deep-equal assertion above proves both calls walk fresh and land on the same offsets.
    // This test pins the specific offset of a known field (wallet.GoldPieces @ 20511) so
    // a regression that cached a wrong offset is caught loudly.
    const { fieldTable: ft1 } = parseSave(FIXTURE);
    const { fieldTable: ft2 } = parseSave(FIXTURE);
    assert.equal(ft1.get('wallet.GoldPieces')!.offset, 20511, 'first call: GP at 20511');
    assert.equal(ft2.get('wallet.GoldPieces')!.offset, 20511, 'second call: GP still at 20511 (fresh, not cached)');
  });
});

describe('parseSave — version tolerance: unknown version warns-but-parses (SC-5)', () => {
  test('a version-bumped fixture yields unknownVersion=true with the rest of the model intact', () => {
    // SC-5: an unknown/newer version (21) must warn-but-parse, not hard-fail. The
    // structural walk is version-agnostic (the format is self-describing), so the
    // SaveHeader summary, the 33-entity list, the bank, and the skills all still parse.
    const bumped = versionBumpedFixtureBuffer(); // fixture copy, version 20 → 21
    const { viewModel, fieldTable } = parseSave(bumped);

    assert.equal(viewModel.version, 21, 'version is the bumped value');
    assert.equal(viewModel.unknownVersion, true, 'unknownVersion flag set (SC-5 warn-but-parse)');

    // The rest of the model is intact — same as the v20 fixture.
    assert.equal(viewModel.summary.name, 'Bob');
    assert.equal(viewModel.summary.gamemode, 'Test');
    assert.equal(viewModel.summary.totalLevel, 1366);
    assert.equal(viewModel.summary.gp, '953063625');
    assert.equal(viewModel.summary.slayerCoins, '6511');
    assert.equal(viewModel.entityIds.length, 33);
    assert.equal(viewModel.bankItems.length, 689);

    // The FieldTable is intact too — wallet authoritative + header mirrors still present.
    assert.equal(fieldTable.get('wallet.GoldPieces')!.value, 953063625n);
    assert.equal(fieldTable.get('wallet.SlayerCoins')!.value, 6511n);
    assert.equal(fieldTable.get('header.GP')!.readOnly, true);
  });

  test('the shared cached fixture buffer is NOT mutated by the version-bump helper', () => {
    // 02-02 already pins this for the structural walk; re-pin it here for parseSave so a
    // regression in the version-bump helper (mutating the shared buffer) is caught.
    const before = loadFixtureBuffer();
    const _bumped = versionBumpedFixtureBuffer();
    const after = loadFixtureBuffer();
    assert.equal(after.readInt32LE(0), 20, 'shared cached fixture still reads version 20');
    assert.ok(before !== _bumped, 'version-bump helper returns a copy, not the shared buffer');
  });
});

// ---------------------------------------------------------------------------
// Focused projectViewModel unit tests — exercise the missing-SlayerCoins and
// unresolvedFields branches for correctness (the fixture has SlayerCoins and no
// D-03 candidates are surfaced in this plan, so these branches are only reachable
// via direct projectViewModel calls with crafted FieldTables + context).
// ---------------------------------------------------------------------------

describe('projectViewModel — focused unit tests for branch coverage', () => {
  test('wallet lacking SlayerCoins renders slayerCoins as "0" (02-03: SC authoritative but NOT required)', () => {
    // A gamemode omitting SlayerCoins still parses (02-03 decision: SC is authoritative
    // when present but NOT required). projectViewModel must render slayerCoins as '0'
    // (not throw, not undefined) so the ViewModel stays well-formed.
    const ft = new FieldTable();
    ft.add({
      key: 'wallet.GoldPieces',
      offset: 0,
      kind: 'int64',
      width: 8,
      value: 100n,
      authoritative: true,
    });
    // No wallet.SlayerCoins — get('wallet.SlayerCoins') returns undefined → ternary false branch.

    const vm = projectViewModel(ft, [], {
      version: 20,
      unknownVersion: false,
      headerSummary: { name: 'X', gamemode: 'Y', totalLevel: 0, gp: 100n, slayerCoins: 0n },
      bankStacks: [],
      skillInfos: [],
    });

    assert.equal(vm.summary.slayerCoins, '0', 'missing SC renders as "0" (not throw/undefined)');
    assert.equal(vm.summary.gp, '100', 'GP still rendered from the authoritative wallet');
    assertNoOffsets(vm); // SC-4 holds even with the missing-SC fallback
  });

  test('unresolvedFields are surfaced when present (D-03 candidates, offset-free — SC-4)', () => {
    // This plan does not surface any D-03 candidates (no ambiguity arises in the
    // wallet/bank/skill walk). But projectViewModel must surface them when a future
    // plan provides them via the context — and they must be offset-free (ViewCandidate
    // carries evidence only, never FieldCandidate's offset key — SC-4 by construction).
    const ft = new FieldTable();
    ft.add({
      key: 'wallet.GoldPieces',
      offset: 0,
      kind: 'int64',
      width: 8,
      value: 100n,
      authoritative: true,
    });
    ft.add({
      key: 'wallet.SlayerCoins',
      offset: 8,
      kind: 'int64',
      width: 8,
      value: 50n,
      authoritative: true,
    });

    const vm = projectViewModel(ft, ['MelvorBase:Bank'], {
      version: 20,
      unknownVersion: false,
      headerSummary: { name: 'X', gamemode: 'Y', totalLevel: 0, gp: 100n, slayerCoins: 50n },
      bankStacks: [],
      skillInfos: [],
      unresolvedFields: [
        {
          field: 'some.logical.field',
          candidates: [{ evidence: 'matched at qtyOffset 1234 with qty=99' }],
        },
      ],
    });

    assert.ok(vm.unresolvedFields, 'unresolvedFields surfaced when present');
    assert.equal(vm.unresolvedFields!.length, 1);
    assert.equal(vm.unresolvedFields![0]!.field, 'some.logical.field');
    assert.equal(vm.unresolvedFields![0]!.candidates.length, 1);
    assert.equal(vm.unresolvedFields![0]!.candidates[0]!.evidence, 'matched at qtyOffset 1234 with qty=99');
    // SC-4 runtime guard: the candidates carry evidence only, NO 'offset' key at any depth.
    assertNoOffsets(vm);
  });

  test('unresolvedFields is omitted when absent (exactOptionalPropertyTypes)', () => {
    // When no candidates are surfaced (the common case), the viewModel.unresolvedFields
    // key must be ABSENT (not undefined) per exactOptionalPropertyTypes.
    const { viewModel } = parseSave(FIXTURE);
    assert.equal(viewModel.unresolvedFields, undefined,
      'no D-03 candidates in the fixture walk — unresolvedFields absent');
    assertNoOffsets(viewModel);
  });
});
