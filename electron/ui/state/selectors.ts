// selectors.ts — pure projections over AppState (the D-02 dirty→payload derivation).
//
// The renderer analog of src/ipc/ipc-guards.ts `toWireReport`: a pure map-and-project. Owns the
// D-02 rule that DIRTINESS IS DERIVED, not stored — `editsToPayload` emits an edit for an
// accumulator entry ONLY when it is `valid` AND differs from the loaded ViewModel value for that
// fieldKey. `dirtyCount` is exactly that payload's length (it drives the Preview badge, D-07).
//
// int64 currency (wallet.GoldPieces / wallet.SlayerCoins) crosses as a decimal STRING end-to-end
// (T-4-08 — never a JSON number): the accumulator already holds it as a string, so it passes
// through untouched. All core/wire types cross in via `import type` only (esbuild-erased).

import type { AppState } from './reducer';
import type { ViewModel } from '../../../src/view-model';
import type { WireEdit } from '../../../src/ipc/ipc-guards';

/** Matches a skill accumulator key and captures the skill id + the xp|level suffix. */
const SKILL_KEY = /^skill\.(.+)\.(xp|level)$/;

/**
 * Resolve the loaded (on-disk) value for a fieldKey against the view model, so a dirty edit can be
 * distinguished from an edit that merely restates the current value. Returns `undefined` when the
 * key resolves to nothing in the view model (the edit is then treated as changed).
 *
 * @param vm The loaded view model.
 * @param fieldKey The accumulator key.
 * @returns The loaded value (int64 currency as a string; quantity/xp/level as a number), or undefined.
 */
function loadedValue(vm: ViewModel, fieldKey: string): string | number | undefined {
  if (fieldKey === 'wallet.GoldPieces') return vm.summary.gp;
  if (fieldKey === 'wallet.SlayerCoins') return vm.summary.slayerCoins;
  const skill = SKILL_KEY.exec(fieldKey);
  if (skill) {
    const s = vm.skills.find((k) => k.id === skill[1]);
    if (s === undefined) return undefined;
    return skill[2] === 'xp' ? s.xp : s.level;
  }
  // Bank item stacks are addressed by their offset-free BankItem.fieldKey (Plan 05-01) so
  // duplicate-itemId stacks resolve distinctly (T-05-02).
  const item = vm.bankItems.find((b) => b.fieldKey === fieldKey);
  return item === undefined ? undefined : item.quantity;
}

/**
 * Project the accumulator into the exact `{ fieldKey, newValue }[]` sent to preview/write (D-02).
 * Emits ONLY entries that are `valid` AND differ from the loaded value (dirtiness is derived).
 * int64 currency is emitted as-is (already a decimal string in the accumulator); int32/double/level
 * are emitted as numbers.
 *
 * @param state The current app state.
 * @returns The dirty edits payload (empty when nothing loaded or nothing changed).
 */
export function editsToPayload(state: AppState): WireEdit[] {
  const vm = state.viewModel;
  if (vm === null) return [];
  const out: WireEdit[] = [];
  for (const [fieldKey, entry] of Object.entries(state.edits)) {
    if (!entry.valid) continue;
    const loaded = loadedValue(vm, fieldKey);
    // Compare by string form so the string(int64)/number(int32) split never yields a false diff.
    if (loaded !== undefined && String(loaded) === String(entry.value)) continue;
    out.push({ fieldKey, newValue: entry.value });
  }
  return out;
}

/**
 * The number of dirty edits — exactly `editsToPayload(state).length` (drives the Preview badge, D-07).
 *
 * @param state The current app state.
 * @returns The dirty edit count.
 */
export function dirtyCount(state: AppState): number {
  return editsToPayload(state).length;
}
