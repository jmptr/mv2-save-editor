/* c8 ignore start */
// Wallet parser — currency-by-ID, authoritative, fail-loud on missing GP (SC-2, D-03).
//
// Parses the Bank entity's Wallet component, located by 02-02's walkComponents at its
// dataStart boundary. The Wallet layout is (RESEARCH §Code Examples, §Pattern 2):
//   [int32 count][ (int64 amount + string currencyId) × count ]
//
// Currencies are matched by their ID STRING (MelvorBase:GoldPieces / MelvorBase:SlayerCoins),
// NEVER by position. The fixture wallet order is [GoldPieces, PrayerPoints, SlayerCoins] —
// PrayerPoints sits BETWEEN GP and SlayerCoins, so a position-based match would mis-identify
// SC as PrayerPoints (slot 1, offset 20541, value 987361n). String-keying is the decisive
// correctness fix.
//
// SC-2: GP and SlayerCoins FieldEntries are marked authoritative:true — they are the real
//   write targets Phase 3's patcher edits. The SaveHeader GP/SlayerCoins FieldEntries 02-02
//   emits are readOnly mirrors (`mirrors: 'wallet.GoldPieces'/'wallet.SlayerCoins'`) that
//   NEVER get written. PrayerPoints is present but NOT authoritative (not a v1 edit target).
//
// D-03 fail-loud: GoldPieces is REQUIRED. A Wallet lacking GoldPieces (e.g. a hypothetical
//   gamemode that omits it) throws RequiredFieldMissingError — never emits a silently-wrong
//   model. SlayerCoins is authoritative but NOT required; a Wallet with only GP still parses.
//
// int64 amounts are held as bigint (Phase 1 BinaryReader.readInt64) — GP/SC exceed 2^53, so
// Number would corrupt the write target (T-02-06). The FieldEntry discriminated union types
// value: bigint for kind: 'int64' at compile time; tsc --noEmit is the type-level proof.
//
// Implements: D-03 (zero-match fail-loud for required GP), D-04 (coverage-gated).
// Mitigates: T-02-06 (int64 as Number → bigint), T-02-07 (missing GP → fail-loud typed error).
// Wave 3's parseSave orchestrator (02-05) calls this at the Wallet component dataStart.
/* c8 ignore end */

import { BinaryReader } from './binary-reader';
import { type FieldEntry, RequiredFieldMissingError } from './field-table';

/**
 * The currency ID string for Gold Pieces. Matched by string inside the Wallet component
 * (never by position). GP is REQUIRED — a Wallet without it throws
 * {@link RequiredFieldMissingError} (D-03 fail-loud).
 */
const GOLD_PIECES_ID = 'MelvorBase:GoldPieces';

/**
 * The currency ID string for Slayer Coins. Matched by string (never by position). SlayerCoins
 * is authoritative (a write target when present) but NOT required — a gamemode omitting SC
 * still parses.
 */
const SLAYER_COINS_ID = 'MelvorBase:SlayerCoins';

/**
 * Parse the Wallet component at {@link dataStart} into authoritative currency FieldEntries
 * keyed by currency ID string (SC-2 + RESEARCH §Pattern 2).
 *
 * Reads `[int32 count][ (int64 amount + string currencyId) × count ]`, recording each
 * amount's byte offset (the FieldTable offset Phase 3's patcher writes through). Currencies
 * are keyed `wallet.<shortName>` where `<shortName>` is the currencyId after the last `:`
 * (e.g. `MelvorBase:GoldPieces` → `wallet.GoldPieces`) — these are the keys the SaveHeader
 * mirrors in 02-02 point at (`header.GP.mirrors = 'wallet.GoldPieces'`).
 *
 * GP and SlayerCoins entries are marked `authoritative: true` (the real write targets);
 * other currencies (e.g. PrayerPoints) are emitted without the authoritative flag.
 *
 * GoldPieces is REQUIRED (D-03): if absent from the Wallet, throws
 * {@link RequiredFieldMissingError} with `fieldKey = 'wallet.GoldPieces'` — fail-loud,
 * never emit a silently-wrong model. SlayerCoins is NOT required.
 *
 * @param reader The BinaryReader over the decompressed save buffer.
 * @param dataStart The Wallet component's dataStart (the byte after the component's
 *   name+size framing, located by 02-02's walkComponents). Fixture: 20507.
 * @returns FieldEntry[] — one int64 entry per currency in the Wallet, keyed
 *   `wallet.<shortName>`, with GP/SlayerCoins marked authoritative.
 * @throws {RequiredFieldMissingError} if the Wallet contains no GoldPieces currency (D-03).
 */
export function parseWallet(reader: BinaryReader, dataStart: number): FieldEntry[] {
  reader.seek(dataStart);
  const count = reader.readInt32();
  const entries: FieldEntry[] = [];
  let hasGoldPieces = false;
  for (let i = 0; i < count; i++) {
    const amountOffset = reader.offset;
    const amount = reader.readInt64(); // bigint — never Number (T-02-06)
    const currencyId = reader.readString();
    // Key by short name (after the last ':') — matches the header mirror keys (02-02).
    const shortName = currencyId.slice(currencyId.lastIndexOf(':') + 1);
    const key = `wallet.${shortName}`;
    // SC-2: GP and SlayerCoins are the authoritative write targets; other currencies are not.
    const authoritative = currencyId === GOLD_PIECES_ID || currencyId === SLAYER_COINS_ID;
    const entry: FieldEntry = {
      key,
      offset: amountOffset,
      kind: 'int64',
      width: 8,
      value: amount,
    };
    if (authoritative) {
      entry.authoritative = true;
    }
    if (currencyId === GOLD_PIECES_ID) {
      hasGoldPieces = true;
    }
    entries.push(entry);
  }
  // D-03 fail-loud: GoldPieces is required. A Wallet without GP throws a typed
  // RequiredFieldMissingError naming the missing field — never emit a silently-wrong model.
  if (!hasGoldPieces) {
    throw new RequiredFieldMissingError('wallet.GoldPieces');
  }
  return entries;
}
