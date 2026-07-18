// test/updater.logger.test.ts — behavior proof for the zero-dep fs logger (D-04).
//
// Exercises createFileLogger() from electron/updater.ts against a real writable tmp dir:
//   • info/warn/error are functions (debug is optional per electron-updater's Logger interface);
//   • each call appends one timestamped, level-tagged line containing the message to updater.log;
//   • a write to a non-existent nested (unwritable) path is swallowed — the logger NEVER throws (D-03);
//   • the module imports WITHOUT an Electron runtime — createFileLogger has no top-level electron /
//     electron-updater dependency, so this test runs green under plain tsx/node:test (UPD-03 contract).
//
// Covers UPD-01/UPD-02/UPD-03 (the logger half). Harness: node:test via tsx (matches the repo — NOT Vitest).

import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFileLogger } from '../electron/updater';

const tmpDirs: string[] = [];

function freshLogDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'updater-log-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined && existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('createFileLogger writes level-tagged lines and never throws (D-04/D-03)', () => {
  test('returns an object whose info/warn/error are functions (debug optional)', () => {
    const logger = createFileLogger(freshLogDir());
    assert.equal(typeof logger.info, 'function');
    assert.equal(typeof logger.warn, 'function');
    assert.equal(typeof logger.error, 'function');
  });

  test('info() appends one line containing the level tag and the message', () => {
    const dir = freshLogDir();
    const logger = createFileLogger(dir);
    logger.info('hello-info');

    const logPath = join(dir, 'updater.log');
    assert.ok(existsSync(logPath), 'updater.log must be created on first write');
    const contents = readFileSync(logPath, 'utf8');
    assert.match(contents, /\[info\]/i);
    assert.match(contents, /hello-info/);
    assert.equal(contents.split('\n').filter((l) => l.length > 0).length, 1, 'exactly one line');
  });

  test('warn() and error() also append level-tagged lines', () => {
    const dir = freshLogDir();
    const logger = createFileLogger(dir);
    logger.warn('careful-warn');
    logger.error('boom-error');

    const contents = readFileSync(join(dir, 'updater.log'), 'utf8');
    assert.match(contents, /\[warn\][^\n]*careful-warn/i);
    assert.match(contents, /\[error\][^\n]*boom-error/i);
  });

  test('a write to an unwritable/non-existent nested path is swallowed (never throws)', () => {
    // A deeply nested path whose parent dirs do not exist → appendFileSync would throw ENOENT.
    const bogus = join(freshLogDir(), 'does', 'not', 'exist');
    const logger = createFileLogger(bogus);
    assert.doesNotThrow(() => logger.info('should-not-throw'));
    assert.doesNotThrow(() => logger.warn('should-not-throw'));
    assert.doesNotThrow(() => logger.error('should-not-throw'));
  });
});
