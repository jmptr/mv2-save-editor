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
