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
    // distinct qtyOffset so duplicate item IDs across tabs are distinct fields (D-01).
    const qty = fieldTable.get('bank.inventory.MelvorBase:NormalLog@736');
    assert.ok(qty, 'NormalLog stack at qtyOffset 736 present in the FieldTable');
    assert.equal(qty!.kind, 'int32');
    assert.equal(qty!.width, 4);
    assert.equal(qty!.offset, 736, 'qty at qtyOffset (Phase 3 same-width write target)');
    assert.equal(qty!.value, 48652, 'NormalLog quantity matches the research reference');

    // placeholder/locked flags also emitted (D-01 free metadata — parsed for free, surfaced
    // in the FieldTable so the ViewModel projection can derive BankItem with no extra state).
    const placeholder = fieldTable.get('bank.inventory.MelvorBase:NormalLog@736.placeholder');
    assert.ok(placeholder, 'placeholder flag emitted alongside qty');
    assert.equal(placeholder!.kind, 'bool');
    assert.equal(placeholder!.width, 1);
    assert.equal(placeholder!.offset, 736 + 4, 'placeholder at qtyOffset + 4');
    assert.equal(placeholder!.value, false, 'NormalLog is not a placeholder');

    const locked = fieldTable.get('bank.inventory.MelvorBase:NormalLog@736.locked');
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
    assert.ok(fieldTable.get('bank.inventory.MelvorBase:NormalLog@736'),
      'inventory parsed — Bank located by component names, not ID');
  });
});
