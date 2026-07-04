// session store test — the D-02 single-active-session proof.
//
// SessionStore holds exactly ONE freshly-parsed active session { path, decompressedBuffer,
// fieldTable, viewModel }. open() decompresses + parses its RAW input once; a second open()
// REPLACES the held session (no handle bookkeeping — D-02). getModel() returns the offset-free
// viewModel (assertNoOffsets — the same SC-4 guard the parser tests use); requireActive() exposes
// the held buffer + FieldTable by the SAME references parseSave produced (main never re-derives
// state per call); before any open() the store reports no-session (undefined / typed throw).
//
// open() calls decompress() on its input, so the test feeds the RAW committed compressed fixture
// (readFileSync('test/fixtures/test-fixture.sav')) — NOT loadFixtureBuffer(), which is already
// decompressed (passing it would double-decompress and throw).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertNoOffsets } from '../helpers/no-offset-scan';
import { decompress } from '../../src/codec';
import { parseSave } from '../../src/save-parser';
import { SessionStore, NoActiveSessionError, type ActiveSession } from '../../src/ipc/session';

// RAW compressed fixture bytes — open() decompresses these itself (D-02).
const RAW_FIXTURE = readFileSync('test/fixtures/test-fixture.sav');
const FIXTURE_PATH = '/saves/test-fixture.sav';

describe('SessionStore.open — decompress + parse once, hold one active session (D-02)', () => {
  test('open() returns the summary and the store then reports an active session', () => {
    const store = new SessionStore();
    const summary = store.open(FIXTURE_PATH, RAW_FIXTURE);
    // The returned summary is the parsed viewModel.summary (name/gamemode/gp/slayerCoins).
    const expected = parseSave(decompress(RAW_FIXTURE)).viewModel.summary;
    assert.deepEqual(summary, expected);
    assert.notEqual(store.getModel(), undefined, 'store reports an active session after open');
  });

  test('getModel() after open returns the held offset-free viewModel (SC-4)', () => {
    const store = new SessionStore();
    store.open(FIXTURE_PATH, RAW_FIXTURE);
    const model = store.getModel();
    assert.ok(model, 'getModel returns the held viewModel');
    assert.doesNotThrow(() => assertNoOffsets(model), 'viewModel carries no offset at any depth');
  });

  test('requireActive() exposes the held buffer + fieldTable by the SAME references (no re-derive)', () => {
    const store = new SessionStore();
    store.open(FIXTURE_PATH, RAW_FIXTURE);
    const a = store.requireActive();
    const b = store.requireActive();
    assert.equal(a, b, 'the held ActiveSession is a stable single reference');
    assert.equal(a.decompressedBuffer, b.decompressedBuffer, 'same buffer reference each call');
    assert.equal(a.fieldTable, b.fieldTable, 'same fieldTable reference each call');
    assert.equal(a.path, FIXTURE_PATH);
    // The held buffer is a real decompressed save (parseSave already succeeded on it).
    assert.equal(a.decompressedBuffer.length, decompress(RAW_FIXTURE).length);
    // The held fieldTable resolves a real authoritative currency key (proves it is the parse output).
    assert.ok(a.fieldTable.get('wallet.GoldPieces'), 'held fieldTable is the parse output');
  });

  test('a second open() REPLACES the active session (old buffer dropped)', () => {
    const store = new SessionStore();
    store.open(FIXTURE_PATH, RAW_FIXTURE);
    const first = store.requireActive();
    const secondPath = '/saves/other.sav';
    store.open(secondPath, RAW_FIXTURE);
    const second = store.requireActive();
    assert.notEqual(first, second, 'a fresh ActiveSession replaced the old one');
    assert.equal(second.path, secondPath, 'getModel/requireActive reflect the new save');
    assert.notEqual(
      first.decompressedBuffer,
      second.decompressedBuffer,
      'the old buffer is dropped — a new one is held',
    );
  });
});

describe('SessionStore before any open — no-session signalled, never a crash', () => {
  test('getModel() returns undefined before any open', () => {
    const store = new SessionStore();
    assert.equal(store.getModel(), undefined);
  });

  test('requireActive() throws NoActiveSessionError before any open', () => {
    const store = new SessionStore();
    assert.throws(() => store.requireActive(), NoActiveSessionError);
  });

  test('ActiveSession shape carries path/decompressedBuffer/fieldTable/viewModel', () => {
    const store = new SessionStore();
    store.open(FIXTURE_PATH, RAW_FIXTURE);
    const s: ActiveSession = store.requireActive();
    assert.deepEqual(Object.keys(s).sort(), [
      'decompressedBuffer',
      'fieldTable',
      'path',
      'viewModel',
    ]);
  });
});
