// Wallet parser test suite — currency-by-ID, authoritative, fail-loud on missing GP (SC-1, SC-2, D-03).
//
// Proves parseWallet over the decompressed committed fixture's Wallet component
// (dataStart 20507, count 3): currencies are keyed by ID string, NEVER by position.
// The fixture wallet order is [GoldPieces, PrayerPoints, SlayerCoins] — PrayerPoints
// sits BETWEEN GP and SlayerCoins, so position-based matching would mis-identify SC
// (slot 1 would be PrayerPoints@20541=987361n, not SlayerCoins). String-keying
// (MelvorBase:GoldPieces / MelvorBase:SlayerCoins) is the research's decisive
// correctness fix (RESEARCH §Pattern 2).
//
// SC-2: GP and SlayerCoins FieldEntries are marked authoritative:true (the real write
//   target the header.GP/header.SlayerCoins mirrors in 02-02 point at). PrayerPoints is
//   present but NOT authoritative (not a v1 write target).
// D-03: GoldPieces is REQUIRED — a crafted Wallet lacking GoldPieces throws
//   RequiredFieldMissingError (fail-loud, never emit a silently-wrong model). SlayerCoins
//   is authoritative but NOT required — a gamemode omitting SC still parses.
//
// Implements: D-04 (c8 gate — 100% lines+branches on src/wallet-parser.ts). Mitigates
// T-02-06 (int64 as Number → bigint via readInt64) and T-02-07 (missing GP → fail-loud
// typed error).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { BinaryReader } from '../src/binary-reader';
import { RequiredFieldMissingError } from '../src/field-table';
import { loadFixtureBuffer } from './helpers/fixture';
import { parseWallet } from '../src/wallet-parser';

// The decompressed committed fixture (2,284,747 bytes, version 20). Cached at module
// load. Consumed read-only via BinaryReader (never mutated).
const FIXTURE = loadFixtureBuffer();

// Wallet component in the Bank entity — verified fixture offsets (RESEARCH §Code Examples
// + the structural-walk spine from 02-02): dataStart 20507, size 97, count 3.
//   [0] GoldPieces    @ 20511 = 953063625n  (authoritative)
//   [1] PrayerPoints  @ 20541 = 987361n    (not authoritative — sits BETWEEN GP and SC)
//   [2] SlayerCoins   @ 20573 = 6511n      (authoritative)
const WALLET_DATA_START = 20507;

// ---------------------------------------------------------------------------
// Fixture Wallet — currency-by-ID, authoritative flags (SC-1, SC-2)
// ---------------------------------------------------------------------------

describe('parseWallet — fixture Wallet component (dataStart 20507, count 3) (SC-1, SC-2)', () => {
  test('returns 3 FieldEntries for the 3 fixture currencies', () => {
    const reader = new BinaryReader(FIXTURE);
    const entries = parseWallet(reader, WALLET_DATA_START);
    assert.equal(entries.length, 3);
  });

  test('GoldPieces is matched by ID string at offset 20511, authoritative (SC-2)', () => {
    const reader = new BinaryReader(FIXTURE);
    const entries = parseWallet(reader, WALLET_DATA_START);
    const gp = entries.find((e) => e.key === 'wallet.GoldPieces');
    assert.ok(gp, 'wallet.GoldPieces entry emitted');
    assert.equal(gp!.kind, 'int64');
    assert.equal(gp!.width, 8);
    assert.equal(gp!.value, 953063625n);
    assert.equal(gp!.offset, 20511);
    assert.equal(gp!.authoritative, true, 'GP is the authoritative write target (SC-2)');
    // int64 held as bigint, never Number (T-02-06 — precision above 2^53).
    assert.equal(typeof gp!.value, 'bigint');
  });

  test('SlayerCoins is matched by ID string at offset 20573, authoritative (SC-2)', () => {
    const reader = new BinaryReader(FIXTURE);
    const entries = parseWallet(reader, WALLET_DATA_START);
    const sc = entries.find((e) => e.key === 'wallet.SlayerCoins');
    assert.ok(sc, 'wallet.SlayerCoins entry emitted');
    assert.equal(sc!.kind, 'int64');
    assert.equal(sc!.width, 8);
    assert.equal(sc!.value, 6511n);
    assert.equal(sc!.offset, 20573);
    assert.equal(sc!.authoritative, true, 'SlayerCoins is the authoritative write target (SC-2)');
    assert.equal(typeof sc!.value, 'bigint');
  });

  test('PrayerPoints is present between GP and SlayerCoins — order NOT assumed (SC-1 / RESEARCH §Pattern 2)', () => {
    const reader = new BinaryReader(FIXTURE);
    const entries = parseWallet(reader, WALLET_DATA_START);
    const gp = entries.find((e) => e.key === 'wallet.GoldPieces');
    const pp = entries.find((e) => e.key === 'wallet.PrayerPoints');
    const sc = entries.find((e) => e.key === 'wallet.SlayerCoins');
    assert.ok(gp, 'GP present');
    assert.ok(pp, 'wallet.PrayerPoints entry emitted (3rd currency in the fixture)');
    assert.ok(sc, 'SC present');

    assert.equal(pp!.kind, 'int64');
    assert.equal(pp!.width, 8);
    assert.equal(pp!.value, 987361n);
    assert.equal(pp!.offset, 20541);
    // PrayerPoints is present but NOT authoritative (not a v1 write target).
    assert.equal(pp!.authoritative, undefined, 'PrayerPoints is NOT authoritative');

    // ORDER-NOT-ASSUMED proof: PrayerPoints sits strictly BETWEEN GP and SlayerCoins in
    // the buffer (20511 < 20541 < 20573). Position-based matching would assign SC to
    // slot 1 (offset 20541, value 987361n — WRONG). String-keying assigns SC to slot 2
    // (offset 20573, value 6511n — correct). This assertion proves currency-by-ID.
    assert.ok(
      gp!.offset < pp!.offset && pp!.offset < sc!.offset,
      'PrayerPoints offset is strictly between GP and SlayerCoins (order not assumed)',
    );
  });

  test('int64 amounts are bigint (never Number — T-02-06 precision)', () => {
    const reader = new BinaryReader(FIXTURE);
    const entries = parseWallet(reader, WALLET_DATA_START);
    for (const e of entries) {
      assert.equal(e.kind, 'int64');
      assert.equal(typeof e.value, 'bigint', `${e.key} value is bigint (not Number)`);
    }
  });
});

// ---------------------------------------------------------------------------
// D-03 fail-loud on missing required GoldPieces (T-02-07)
// ---------------------------------------------------------------------------

describe('parseWallet — D-03 fail-loud on missing required GoldPieces (T-02-07)', () => {
  test('a Wallet buffer lacking GoldPieces throws RequiredFieldMissingError', () => {
    // Craft a Wallet with count=2: [PrayerPoints, SlayerCoins] — no GoldPieces.
    const buf = buildWalletBuffer([
      { amount: 987361n, currencyId: 'MelvorBase:PrayerPoints' },
      { amount: 6511n, currencyId: 'MelvorBase:SlayerCoins' },
    ]);
    const reader = new BinaryReader(buf);
    assert.throws(
      () => parseWallet(reader, 0),
      (err: unknown) => err instanceof RequiredFieldMissingError,
      'missing GoldPieces throws typed RequiredFieldMissingError (D-03 fail-loud)',
    );
  });

  test('the missing-GP error carries the actionable fieldKey naming GoldPieces', () => {
    // A Wallet with only SlayerCoins — no GoldPieces.
    const buf = buildWalletBuffer([{ amount: 6511n, currencyId: 'MelvorBase:SlayerCoins' }]);
    const reader = new BinaryReader(buf);
    assert.throws(
      () => parseWallet(reader, 0),
      (err) => {
        assert.ok(err instanceof RequiredFieldMissingError, 'typed RequiredFieldMissingError');
        assert.equal(
          (err as RequiredFieldMissingError).fieldKey,
          'wallet.GoldPieces',
          'fieldKey names the missing required field',
        );
        // Actionable: the message names the missing currency (GoldPieces) so the caller
        // can diagnose which required field was unlocatable (D-03 fail-loud, not silent).
        assert.ok(
          (err as Error).message.includes('GoldPieces'),
          `error message names GoldPieces (got: ${(err as Error).message})`,
        );
        return true;
      },
      'missing GoldPieces error carries fieldKey wallet.GoldPieces + actionable message',
    );
  });

  test('a Wallet with only GoldPieces (no SlayerCoins) parses — SC is authoritative but NOT required', () => {
    // SlayerCoins is authoritative (a write target when present) but NOT required — a
    // gamemode omitting SC should still parse. Only GoldPieces is required (D-03).
    const buf = buildWalletBuffer([{ amount: 1000n, currencyId: 'MelvorBase:GoldPieces' }]);
    const reader = new BinaryReader(buf);
    const entries = parseWallet(reader, 0);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.key, 'wallet.GoldPieces');
    assert.equal(entries[0]!.value, 1000n);
    assert.equal(entries[0]!.authoritative, true);
    assert.equal(typeof entries[0]!.value, 'bigint');
  });
});

// ---------------------------------------------------------------------------
// buildWalletBuffer — craft small Wallet component buffers for negative tests
// ---------------------------------------------------------------------------

/**
 * Build a small Wallet component buffer for negative tests:
 *   [int32 count][ (int64 amount + 7-bit-length-prefixed string currencyId) × count ]
 * Mirrors the fixture's Wallet layout (RESEARCH §Code Examples). Used to craft a
 * Wallet lacking GoldPieces (D-03 fail-loud) and a Wallet with only GP (SC not
 * required). The 7-bit prefix is a single byte for lengths < 128 — all `MelvorBase:`
 * currency IDs are well under 128 bytes, so this simplified writer is sufficient.
 */
function buildWalletBuffer(currencies: { amount: bigint; currencyId: string }[]): Buffer {
  const parts: Buffer[] = [];
  const countBuf = Buffer.alloc(4);
  countBuf.writeInt32LE(currencies.length, 0);
  parts.push(countBuf);
  for (const c of currencies) {
    const amtBuf = Buffer.alloc(8);
    amtBuf.writeBigInt64LE(c.amount, 0);
    parts.push(amtBuf);
    const idBytes = Buffer.from(c.currencyId, 'utf8');
    assert.ok(idBytes.length < 128, 'currencyId byte length fits a single 7-bit prefix byte');
    parts.push(Buffer.from([idBytes.length])); // single-byte 7-bit length prefix
    parts.push(idBytes);
  }
  return Buffer.concat(parts);
}
