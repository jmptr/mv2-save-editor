// Filter-predicate test suite — case-insensitive substring, no RegExp-from-input (BROWSE-04/05).
//
// Proves electron/ui/lib/filter.ts is a plain case-insensitive `String.includes` match: an empty
// query matches everything, casing is ignored, and a regex-metacharacter query is treated as a
// literal (never compiled to a RegExp — mitigates T-05-06 ReDoS/injection). Harness convention
// copied from test/experience-table.test.ts (node:test + node:assert/strict).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { matches } from '../../electron/ui/lib/filter';

describe('matches — case-insensitive substring predicate (BROWSE-04/05)', () => {
  test('case-insensitive substring: "log" matches "MelvorBase:NormalLog"', () => {
    assert.equal(matches('log', 'MelvorBase:NormalLog'), true);
  });

  test('is case-insensitive on the query side too ("LOG" still matches)', () => {
    assert.equal(matches('LOG', 'MelvorBase:NormalLog'), true);
  });

  test('empty query matches every id', () => {
    assert.equal(matches('', 'MelvorBase:NormalLog'), true);
    assert.equal(matches('', ''), true);
  });

  test('a non-matching query returns false', () => {
    assert.equal(matches('ore', 'MelvorBase:NormalLog'), false);
  });

  test('a regex-metachar query "(" does not throw and matches literally', () => {
    assert.doesNotThrow(() => matches('(', 'MelvorBase:Weird(Name)'));
    assert.equal(matches('(', 'MelvorBase:Weird(Name)'), true);
    assert.equal(matches('(', 'MelvorBase:NormalLog'), false);
  });
});
