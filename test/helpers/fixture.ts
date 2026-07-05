// Shared test harness — the decompressed committed fixture buffer (D-10/D-11).
//
// Every Wave 2 parser test (Wallet, Experience, Inventory) and the Wave 3 save-parser
// orchestrator test consume this buffer. Decompressed once at module load via the Phase 1
// `decompress` (src/codec.ts) — the fixture never changes during a test run, so caching
// is safe and avoids re-decompressing 152KB → 2.3MB on every test. Callers must NOT
// mutate the returned buffer (parser tests consume it read-only via BinaryReader, which
// does not mutate).

import { readFileSync } from 'node:fs';
import { decompress } from '../../src/codec';
import { BinaryReader } from '../../src/binary-reader';
import {
  readVersion,
  parseSaveHeader,
  walkEntities,
  walkComponents,
} from '../../src/structural-walk';

/**
 * The decompressed committed real .NET fixture save (D-10/D-11 — single source of
 * truth, exercises the code under test). 151,993 compressed bytes → 2,284,747
 * decompressed bytes. Cached at module load (the fixture never changes during a run).
 */
const FIXTURE_BUFFER: Buffer = decompress(readFileSync('test/fixtures/test-fixture.sav'));

/**
 * Load and return the decompressed committed fixture buffer. The same `Buffer` reference
 * is returned on every call (decompressed once at module load). Callers must NOT mutate
 * the returned buffer — parser tests consume it read-only via `BinaryReader`.
 *
 * Reused by Wave 2 parsers (Wallet/Experience/Inventory) and Wave 3's save-parser
 * orchestrator test. The fixture is version 20 (not 17 — see 02-RESEARCH.md).
 */
export function loadFixtureBuffer(): Buffer {
  return FIXTURE_BUFFER;
}

/**
 * Decompress an arbitrary committed `.sav` fixture by path (relative to the repo root,
 * e.g. `test/fixtures/MahoganyLog-103.sav`). Not cached — regression fixtures are loaded
 * on demand. Callers must NOT mutate the returned buffer.
 */
export function loadFixtureFile(path: string): Buffer {
  return decompress(readFileSync(path));
}

/**
 * The tail (ActionManager + RNG + SidebarFavouritesOptions + EventLog) the structural
 * walk does not model — the entity list consumes exactly to `buffer.length − TAIL_BYTES`.
 * Mirrors the constant in src/save-parser.ts.
 */
const TAIL_BYTES = 36;

/**
 * Locate the Bank entity's Inventory component region `[invStart, invEnd)` in a
 * decompressed save by walking the structural spine (version → header → entities →
 * components) and finding the entity whose components include BOTH `Wallet` and
 * `Inventory` (the Bank — located by component names, never a hard-coded ID). Returns the
 * exact byte offsets to hand to {@link import('../../src/inventory-parser').findStacks},
 * so a regression test need not hard-code per-fixture offsets.
 */
export function locateInventoryRegion(buf: Buffer): { invStart: number; invEnd: number } {
  const reader = new BinaryReader(buf);
  readVersion(reader);
  const { headerEnd } = parseSaveHeader(reader);
  const spans = walkEntities(reader, headerEnd, buf.length - TAIL_BYTES);
  for (const span of spans) {
    const comps = walkComponents(reader, span.start, span.size);
    const hasWallet = comps.some((c) => c.name === 'Wallet');
    const inv = comps.find((c) => c.name === 'Inventory');
    if (hasWallet && inv) {
      return { invStart: inv.dataStart, invEnd: inv.dataStart + inv.size };
    }
  }
  throw new Error('no Bank entity (Wallet + Inventory) found in fixture');
}
