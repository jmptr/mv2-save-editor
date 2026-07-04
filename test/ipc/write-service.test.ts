// write-service test — the IO-02 non-destructive new-file write, proven headlessly.
//
// performWrite patches the held session buffer, re-parses it fresh (D-02), asserts the DECOMPRESSED
// length invariant (IO-02/IO-03) BEFORE compress, then writes ONLY to a NEW path picked by the
// injected showSaveDialog: the source path is rejected (D-03 source-path guard, T-4-04); a canceled
// dialog is a clean no-op; the source buffer is never mutated. fs + dialog are INJECTED (fakes here),
// so the whole path runs under `tsx --test` with no Electron runtime — this is where IO-02 is proven.
//
// Uses loadFixtureBuffer() (already decompressed) to construct an ActiveSession.decompressedBuffer
// directly + a real wallet edit; the fake writeFile records its calls so we can assert it fires
// exactly once (new path) or zero times (cancel / source-path).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { loadFixtureBuffer } from '../helpers/fixture';
import { parseSave } from '../../src/save-parser';
import { decompress } from '../../src/codec';
import { type Edit } from '../../src/patcher';
import { type ActiveSession } from '../../src/ipc/session';
import {
  performWrite,
  defaultOutputPath,
  WriteInvariantError,
} from '../../src/ipc/write-service';

const FIXTURE = loadFixtureBuffer();
const SOURCE_PATH = '/saves/test-fixture.sav';

// A real authoritative int64 currency edit (wallet.GoldPieces → same-width, length-preserving).
const EDITS: Edit[] = [{ fieldKey: 'wallet.GoldPieces', newValue: 12345n }];

/** Build a fresh ActiveSession from the decompressed fixture (parse re-derives offsets — SC-4). */
function session(path = SOURCE_PATH): ActiveSession {
  const decompressedBuffer = Buffer.from(FIXTURE); // own copy so mutation checks are meaningful
  const { fieldTable, viewModel } = parseSave(decompressedBuffer);
  return { path, decompressedBuffer, fieldTable, viewModel };
}

/** A recording fake writeFile — collects (path, data) tuples so we can assert call count/content. */
function recordingWriteFile() {
  const calls: { path: string; data: Buffer }[] = [];
  const writeFile = async (path: string, data: Buffer): Promise<void> => {
    calls.push({ path, data });
  };
  return { writeFile, calls };
}

describe('defaultOutputPath — sibling <base>-edited.sav (D-03)', () => {
  test('appends -edited.sav next to the source', () => {
    assert.equal(defaultOutputPath('/dir/save.sav'), '/dir/save-edited.sav');
  });
});

describe('performWrite — NEW-path write (IO-02)', () => {
  test('writes the recompressed buffer to the picked NEW path and returns outputPath', async () => {
    const s = session();
    const outPath = '/saves/test-fixture-edited.sav';
    const { writeFile, calls } = recordingWriteFile();
    const result = await performWrite(s, EDITS, {
      showSaveDialog: async () => ({ canceled: false, filePath: outPath }),
      writeFile,
    });
    assert.deepEqual(result, { ok: true, outputPath: outPath });
    assert.equal(calls.length, 1, 'writeFile called exactly once');
    assert.equal(calls[0]!.path, outPath, 'written to the NEW picked path');
    // The written bytes are valid Brotli that decompresses to the patched buffer (edit applied).
    const roundTripped = decompress(calls[0]!.data);
    const reparsed = parseSave(roundTripped).fieldTable;
    assert.equal(reparsed.getRequired('wallet.GoldPieces').value, 12345n, 'edit is in the output');
    assert.equal(roundTripped.length, FIXTURE.length, 'decompressed length invariant holds');
  });

  test('does NOT mutate the source buffer', async () => {
    const s = session();
    const before = Buffer.from(s.decompressedBuffer);
    const { writeFile } = recordingWriteFile();
    await performWrite(s, EDITS, {
      showSaveDialog: async () => ({ canceled: false, filePath: '/saves/out.sav' }),
      writeFile,
    });
    assert.deepEqual(s.decompressedBuffer, before, 'source buffer byte-unchanged after write');
  });
});

describe('performWrite — cancel is a clean no-op', () => {
  test('canceled dialog returns cancelled and never calls writeFile', async () => {
    const s = session();
    const { writeFile, calls } = recordingWriteFile();
    const result = await performWrite(s, EDITS, {
      showSaveDialog: async () => ({ canceled: true }),
      writeFile,
    });
    assert.deepEqual(result, { ok: true, cancelled: true });
    assert.equal(calls.length, 0, 'writeFile never called on cancel');
  });

  test('no filePath (empty pick) also returns cancelled and never writes', async () => {
    const s = session();
    const { writeFile, calls } = recordingWriteFile();
    const result = await performWrite(s, EDITS, {
      showSaveDialog: async () => ({ canceled: false }),
      writeFile,
    });
    assert.deepEqual(result, { ok: true, cancelled: true });
    assert.equal(calls.length, 0);
  });
});

describe('performWrite — source-path guard (D-03 / T-4-04)', () => {
  test('picking the source path throws WriteInvariantError and never writes', async () => {
    const s = session();
    const { writeFile, calls } = recordingWriteFile();
    await assert.rejects(
      () =>
        performWrite(s, EDITS, {
          showSaveDialog: async () => ({ canceled: false, filePath: SOURCE_PATH }),
          writeFile,
        }),
      WriteInvariantError,
    );
    assert.equal(calls.length, 0, 'writeFile never called when target == source');
  });

  test('a non-canonical path resolving to the source is also rejected', async () => {
    const s = session('/saves/test-fixture.sav');
    const { writeFile, calls } = recordingWriteFile();
    await assert.rejects(
      () =>
        performWrite(s, EDITS, {
          showSaveDialog: async () => ({ canceled: false, filePath: '/saves/../saves/test-fixture.sav' }),
          writeFile,
        }),
      WriteInvariantError,
    );
    assert.equal(calls.length, 0);
  });
});
