// reducer/selectors test suite — the D-02 accumulator, Pitfall 5 mutual exclusion, dirtyCount.
//
// Proves electron/ui/state/{reducer,selectors}.ts implement the D-02 edit accumulator with DERIVED
// dirtiness: an entry equal to its loaded ViewModel value contributes no edit; a changed valid
// int64 gp edit emits a decimal STRING (T-4-08, never a number); an invalid entry emits nothing;
// SET_EDIT of a skill's xp then its level leaves ONLY the level key (Pitfall 5 — avoids
// ConflictingEditError); and two bank stacks with the same itemId but distinct fieldKeys are
// independently editable (T-05-02). Harness convention copied from test/experience-table.test.ts
// (node:test + node:assert/strict).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { ViewModel } from '../../src/view-model';
import { appReducer, initialState, type AppState, type EditEntry } from '../../electron/ui/state/reducer';
import { editsToPayload, dirtyCount } from '../../electron/ui/state/selectors';

// A minimal fake view model: two NormalLog stacks (duplicate itemId, distinct fieldKeys), one skill
// with a levelCap, and gp/slayerCoins as strings (int64 currency — JSON/IPC-safe).
const VM: ViewModel = {
  version: 20,
  unknownVersion: false,
  summary: { name: 'Tester', gamemode: 'Standard', totalLevel: 10, gp: '1000', slayerCoins: '50' },
  bankItems: [
    { itemId: 'MelvorBase:NormalLog', quantity: 5, isPlaceholder: false, isLocked: false, fieldKey: 'bank.inventory.MelvorBase:NormalLog#0' },
    { itemId: 'MelvorBase:NormalLog', quantity: 12, isPlaceholder: false, isLocked: false, fieldKey: 'bank.inventory.MelvorBase:NormalLog#1' },
  ],
  skills: [{ id: 'MelvorBase:Woodcutting', xp: 13_034_427, level: 99, levelCap: 120 }],
  entityIds: ['MelvorBase:Woodcutting'],
};

/** A populated state with the fake VM loaded (edits/preview/write reset by LOAD_OK). */
function populated(): AppState {
  return appReducer(initialState, { t: 'LOAD_OK', viewModel: VM });
}

function setEdit(state: AppState, fieldKey: string, entry: EditEntry): AppState {
  return appReducer(state, { t: 'SET_EDIT', fieldKey, entry });
}

describe('editsToPayload — dirtiness is DERIVED (D-02)', () => {
  test('an entry equal to its loaded value contributes no edit; dirtyCount 0', () => {
    // gp loaded is '1000'; setting gp to '1000' restates the current value → not dirty.
    const state = setEdit(populated(), 'wallet.GoldPieces', { raw: '1000', value: '1000', valid: true });
    assert.deepEqual(editsToPayload(state), []);
    assert.equal(dirtyCount(state), 0);
  });

  test('a changed valid int64 gp edit emits a decimal STRING (T-4-08); dirtyCount 1', () => {
    const state = setEdit(populated(), 'wallet.GoldPieces', { raw: '2000', value: '2000', valid: true });
    const payload = editsToPayload(state);
    assert.equal(payload.length, 1);
    assert.deepEqual(payload[0], { fieldKey: 'wallet.GoldPieces', newValue: '2000' });
    assert.equal(typeof payload[0]!.newValue, 'string');
    assert.equal(dirtyCount(state), 1);
  });

  test('an invalid entry emits nothing', () => {
    const state = setEdit(populated(), 'wallet.GoldPieces', { raw: 'abc', value: '2000', valid: false });
    assert.deepEqual(editsToPayload(state), []);
    assert.equal(dirtyCount(state), 0);
  });
});

describe('reducer — Pitfall 5 skill xp/level mutual exclusion', () => {
  test('SET_EDIT skill xp then the same skill level leaves ONLY the level key; one skill edit', () => {
    let state = setEdit(populated(), 'skill.MelvorBase:Woodcutting.xp', { raw: '200', value: 200, valid: true });
    state = setEdit(state, 'skill.MelvorBase:Woodcutting.level', { raw: '50', value: 50, valid: true });

    // The sibling xp key was cleared by the level SET_EDIT (Pitfall 5).
    assert.equal('skill.MelvorBase:Woodcutting.xp' in state.edits, false);
    assert.equal('skill.MelvorBase:Woodcutting.level' in state.edits, true);

    const skillEdits = editsToPayload(state).filter((e) => e.fieldKey.startsWith('skill.'));
    assert.equal(skillEdits.length, 1);
    assert.equal(skillEdits[0]!.fieldKey, 'skill.MelvorBase:Woodcutting.level');
  });
});

describe('selectors — duplicate-itemId stacks are independently editable (T-05-02)', () => {
  test('two NormalLog stacks with distinct fieldKeys both emit', () => {
    let state = setEdit(populated(), 'bank.inventory.MelvorBase:NormalLog#0', { raw: '7', value: 7, valid: true });
    state = setEdit(state, 'bank.inventory.MelvorBase:NormalLog#1', { raw: '20', value: 20, valid: true });

    const payload = editsToPayload(state);
    assert.equal(payload.length, 2);
    const keys = payload.map((e) => e.fieldKey).sort();
    assert.deepEqual(keys, [
      'bank.inventory.MelvorBase:NormalLog#0',
      'bank.inventory.MelvorBase:NormalLog#1',
    ]);
  });
});
