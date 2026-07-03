# Pitfalls Research

**Domain:** Local desktop binary save-file editor (.NET `BinaryReader`/`BinaryWriter`, Brotli-compressed, Melvor Idle 2 `.sav`)
**Researched:** 2026-07-03
**Confidence:** HIGH (format spec is internally authoritative; generic .NET/Brotli/Electron facts cross-checked against docs)

> The worst outcome for this tool is a save the game refuses to load or silently loads wrong. Every pitfall below is ranked by how directly it threatens that outcome. "Silent" corruption (writes succeed, game loads, but a value is wrong or a later section is misaligned) is more dangerous than "loud" corruption (game rejects the file), because the loud kind is caught immediately by a round-trip test.

---

## Critical Pitfalls

### Pitfall 1: Patching the cosmetic SaveHeader GP/SlayerCoins instead of the Bank wallet

**What goes wrong:**
The editor changes `SaveHeader.GP` (or `SaveHeader.SlayerCoins`), the preview shows the new value, the save loads fine — but in-game the currency is unchanged, because the header field is a snapshot that the game overwrites from the Bank entity's Wallet on the next save. The user thinks the edit "silently failed."

**Why it happens:**
The header GP is the easiest int64 to find (fixed offset, parsed first) and reads back correctly, so it looks authoritative. The real value lives in the `MelvorBase:Bank` entity's Wallet section (near a `Walleta` marker) and requires entity-region parsing to reach.

**How to avoid:**
- Treat the header GP/SlayerCoins as **read-only display** in the UI. Never write to them.
- Write currency edits **only** to the Bank wallet int64, located inside the parsed Bank entity region.
- Optionally rewrite the header snapshot too (so the summary UI is consistent immediately), but never rewrite the header *instead of* the wallet.
- Encode this as a domain rule in the data model: "currency has one authoritative location (Bank wallet); header is a mirror."

**Warning signs:**
Edit round-trips and loads, but reloading the same save in the editor after an in-game save shows the old value; or the header and wallet disagree at load time.

**Phase to address:**
Parsing/model phase (define authoritative-vs-mirror fields) and the currency-edit phase.

---

### Pitfall 2: Wrong-width writes (int32 vs int64 vs double)

**What goes wrong:**
Writing an int32 where an int64 lives (or vice versa) overwrites 4 fewer/more bytes than intended. Writing 8 bytes for GP is correct; writing 4 bytes for an item quantity is correct — but swapping them shifts or truncates the field and clobbers adjacent data. A too-narrow write leaves stale high bytes (value looks huge/negative); a too-wide write corrupts the next field entirely.

**Why it happens:**
GP/SlayerCoins are int64, item quantities are int32, skill XP is double (8 bytes) but Level is int32 (4 bytes). It's easy to reuse one `writeValue(offset, n)` helper without carrying the width, or to pack with the wrong `struct` format (`<i` vs `<q` vs `<d`).

**How to avoid:**
- Model each editable field with an **explicit type + byte width**; the write function must take the field's declared width, never a default.
- In-place edits must assert `bytesWritten === field.width` and that the write stays within `[fieldOffset, fieldOffset + width)`.
- Never let a value's magnitude choose the width (e.g. Node `Buffer.writeIntLE` with a variable byte length). Width is a property of the field, not the value.
- Range-validate before writing: int32 quantity ≤ 2,147,483,647 and ≥ 0; int64 currency within int64 range; Level within 1..LevelCap.

**Warning signs:**
Post-edit re-parse of the same buffer yields a different value than you wrote, or fields *after* the edited one become garbage. A displayed value that's negative or absurdly large after a "small" edit signals a width/sign mistake.

**Phase to address:**
Binary primitives / codec phase (typed field abstraction) — this is foundational and must exist before any edit phase.

---

### Pitfall 3: False-positive offset matches from raw byte-search

**What goes wrong:**
Item stacks and skill XP are located by searching for bytes (the item-ID string, or the current XP double) and then reading a fixed number of bytes *before* the match. The same byte sequence can occur elsewhere (another item's data, an unrelated double, a substring of a longer item ID like `MelvorBase:AgilityMark` inside a hypothetical `...AgilityMarkII`). Patching a false match writes into the wrong place → silent corruption.

**Why it happens:**
`buffer.indexOf(needle)` has no notion of structure. The string search can land inside another field; the 6-bytes-before assumption only holds if the match is genuinely a length-prefixed item ID at a stack boundary.

**How to avoid:**
- **Always validate surrounding context** before trusting a match (the existing skill already does the right things — codify them):
  - The byte immediately before the item-ID string must equal the string's 7-bit length prefix (single byte for lengths < 128) AND, for IDs ≥ 128 bytes, the full multi-byte varint must decode to the exact length.
  - The candidate quantity (int32, 6 bytes before the prefix) must be in a sane range (0..2.1 B).
  - For XP: the int32 at `+8` (LevelCap) must be plausible (e.g. ≤ 120) and the int32 at `+12` (Level) in 1..LevelCap.
- Constrain every search to the **correct entity region** (`bank_start..bank_end`, or a single skill entity's `[start, start+size)`), never the whole file.
- **Guard against exact substring/superstring IDs**: verify the byte *after* the ID string is a plausible next-field boundary, and match the ID as a length-delimited token (prefix byte == exact length) rather than a bare substring.
- If a search yields **more than one** validated candidate for a "unique" target, surface it as ambiguous and refuse to auto-patch — do not silently pick the first.

**Warning signs:**
Multiple candidate offsets for a single logical value; a matched offset whose context bytes fail the range checks; item quantity changes but the wrong item's count moves in-game.

**Phase to address:**
Item-edit and skill-edit phases; the validation helper should be shared and unit-tested against real saves.

---

### Pitfall 4: XP and Level set inconsistently

**What goes wrong:**
The `ExperienceComponent` stores `[double XP][int32 LevelCap][int32 Level]`. If XP is set but Level isn't (or they don't agree with the XP table), the game may recompute the level from XP and reject/normalize the value, or display a level inconsistent with XP, or (worst case) treat the mismatch as a corrupt component.

**Why it happens:**
It's tempting to set only the XP double (since level is "derived"), or to set a Level without setting XP to the table threshold for that level.

**How to avoid:**
- Always set **both** XP and Level together, derived from the same XP table (`scaling=0.25, exponent_scaling=300.0, base=2^(1/7)`).
- When the user picks a target Level, set XP = `XP_TABLE[level-1]` exactly; when the user picks target XP, compute the corresponding Level from the table.
- Leave `LevelCap` unchanged.
- Unit-test the XP table against the known milestones in the spec (L50=101,331; L99=13,034,427; L120=104,273,162) to catch off-by-one / floor-order bugs in the table generator.

**Warning signs:**
In-game level differs from what the editor set; the game "snaps" XP to a table boundary on load; editor-computed milestone XP disagrees with the spec's table.

**Phase to address:**
Skill-edit phase (must include a verified XP-table module).

---

### Pitfall 5: Accidental byte-count change on an "in-place" edit (region-size desync)

**What goes wrong:**
v1 is scoped to same-width edits only, precisely because inserting/removing bytes changes an entity's region byte length — and each entity is preceded by an `[int32 region byte length]` prefix. If any edit path changes total bytes without updating that prefix (and every downstream offset), the parser desyncs at that point and the game rejects the save. Even within v1's "safe" edits, a subtle bug (e.g. writing a variable-length representation, or a UTF-8 string field) can silently change length.

**Why it happens:**
A helper that writes "a value" rather than "N bytes at offset" can emit a different length. String edits (out of scope for v1, but the code must not do them by accident) always risk length change. A refactor could route an edit through a generic serializer that re-emits a whole region.

**How to avoid:**
- Enforce an **invariant** at the codec layer: `output.length === input.length` for every v1 write path. Assert it before recompression and fail loudly if violated.
- All v1 edits are `writeFixedWidth(buffer, offset, width, value)` operating on the existing buffer — never splice, never re-serialize a region.
- Do **not** implement string-length-prefix rewriting or byte insertion in v1 even as dead code that could be reached by mistake; if added later, make region-size-prefix updates a first-class, tested operation.
- Keep the byte-length assertion in an automated test that diffs input vs output length on a corpus of real saves + random valid edits.

**Warning signs:**
`output.length !== input.length` after any edit; the game loads but a section past the edit is wrong; entity re-parse fails only after editing.

**Phase to address:**
Codec/write phase — the length invariant is a hard gate. Also a standing guardrail for the out-of-scope "add new item" feature.

---

### Pitfall 6: Reusing offsets across loads/edits (stale-offset corruption)

**What goes wrong:**
Offsets found during one parse are cached and reused after the buffer changes (or across sessions / different save files). Any earlier edit — or simply a different save — invalidates them, so a later write lands at the wrong place.

**Why it happens:**
Performance instinct ("we already found the Bank at 0x4210") plus UI state that outlives the buffer. The lesson is explicitly called out in the spec.

**How to avoid:**
- **Re-parse offsets fresh from the current buffer on every load**, and re-derive any offset after any mutation that could move it.
- For v1 (same-width edits), offsets don't move *within a single load*, but never persist offsets to disk or reuse them across file loads.
- Tie offsets to a buffer identity/version token; invalidate on new load.

**Warning signs:**
Edits work on the first file of a session but corrupt the second; the second edit in a batch hits the wrong field.

**Phase to address:**
Parsing/state-management phase.

---

### Pitfall 7: 7-bit length-prefix and endianness decoding bugs

**What goes wrong:**
.NET `BinaryReader` strings are prefixed with a **7-bit-encoded (LEB128-style) length in BYTES of the UTF-8 payload**, not a fixed byte and not a character count. Bugs: assuming a single-byte prefix (breaks for IDs ≥ 128 bytes), treating the prefix as char count (breaks for multi-byte UTF-8), or reading multi-byte integers big-endian. Any of these desyncs the whole header/entity walk.

**Why it happens:**
The varint is easy to under-implement (works for all short IDs, silently wrong at 128). Endianness mistakes are invisible for small values whose high bytes are zero, then surface on large values.

**How to avoid:**
- Implement the 7-bit varint reader/writer exactly (continuation bit `0x80`, 7 data bits per byte, little-endian groups); the prefix is the **UTF-8 byte length**.
- All fixed-width integers/doubles are **little-endian** (`readInt32LE`, `readBigInt64LE`, `readDoubleLE`).
- Unit-test the varint against a string ≥ 128 bytes and a multi-byte UTF-8 string; test int32/int64/double round-trips against known .NET-produced bytes from a real save.
- Since v1 doesn't edit strings, the reader only needs to be correct enough to *walk* the layout — but a walk bug corrupts everything downstream, so it's still critical.

**Warning signs:**
Header parse produces a nonsense entity count or a huge/garbage entity ID; parsing works on short-name characters but fails on longer names/IDs.

**Phase to address:**
Binary primitives phase.

---

### Pitfall 8: Brotli round-trip / recompression assumptions

**What goes wrong:**
Two flavors:
1. **Corruption via non-standard mode** — using "Large Window Brotli" (window > standard) produces output that is NOT RFC 7932-compliant, and .NET `BrotliStream` may fail to decompress it → game can't load.
2. **False fear that recompression must be byte-identical** — worrying that Node's compressor must reproduce the game's exact bytes and doing something hacky to match it.

**Why it happens:**
Misreading Brotli as if the compressed bytes must match. In reality Brotli is **lossless**: the game only cares that decompression yields the correct bytes, so any standard-compliant compressor at any quality is fine. Node's `brotliCompressSync` defaults to **quality 6, window 20** (both RFC-7932-compliant), which .NET reads fine.

**How to avoid:**
- Use Node's built-in `zlib.brotliDecompressSync` / `brotliCompressSync` with **standard parameters** (do NOT enable large-window). Quality can be raised to 11 for smaller files; it does not affect correctness.
- **Round-trip test the codec itself first**: `compress(decompress(original))` then `decompress(...)` must equal the original decompressed bytes. This proves the compressor is game-compatible before any editing logic exists.
- Accept that the output `.sav` will differ byte-for-byte from the original compressed file — that's expected and harmless.
- Handle decompress errors explicitly (corrupt/truncated input, wrong format) with a clear "not a valid MV2 save" message rather than a stack trace.

**Warning signs:**
Game rejects the file with a decompression/format error; codec round-trip test fails; you find yourself trying to match the original compressed size.

**Phase to address:**
Codec phase (Brotli round-trip test is the first gate).

---

### Pitfall 9: No in-game round-trip verification in the loop

**What goes wrong:**
The team validates only that the editor can re-open its own output (self-consistent parse), which passes even when the game would reject the file or silently ignore the edit (see Pitfall 1). "It re-parses" is not "the game loads it and shows the new value."

**Why it happens:**
Self-parse is fast and automatable; launching the actual game and loading a save is manual and slow, so it gets skipped.

**How to avoid:**
Layer the verification (cheapest → most authoritative):
1. **Byte-length invariant** — output length == input length (Pitfall 5). Automated.
2. **Codec round-trip** — decompress(output) parses cleanly and every unedited field is byte-identical to the input; only the intended bytes changed (a diff of decompressed buffers should show *only* the edited ranges). Automated.
3. **Field read-back** — re-parse output and confirm each edited field equals the intended value. Automated.
4. **In-game load** — actually load the edited `.sav` in Melvor Idle 2 and confirm the value shows correctly and the save persists after an in-game re-save. Manual, but **mandatory** for accepting the corruption-safety requirement and after any change to the codec/offset logic.

Keep a small **corpus of real saves** (different gamemodes, char-name lengths, bank sizes) as fixtures for levels 1–3, and document a manual in-game checklist for level 4.

**Warning signs:**
The only test is "editor re-opens its output"; no fixture corpus; no documented in-game load step.

**Phase to address:**
Every edit phase's acceptance criteria; the diff-only-edited-bytes test belongs in the codec phase.

---

### Pitfall 10: Destructive writes / no original preservation

**What goes wrong:**
Writing back over the original `.sav` (or to the same path) means a bad edit destroys the only good save. For a tool whose entire value is "don't corrupt my save," this is the cardinal UX sin.

**Why it happens:**
Convenience ("just save it") and Electron save-dialog defaults that suggest the source path.

**How to avoid:**
- Always write to a **new output file**; never overwrite the source (the PROJECT constraint). Default the save dialog to a distinct name (e.g. `name.edited.sav` or timestamped).
- Operate on an in-memory copy of the decompressed buffer; the loaded original buffer is never mutated in place until an explicit, validated write.
- Optionally keep a backup of the source before writing.

**Warning signs:**
Save dialog defaults to the input path; edits mutate the loaded buffer before the user confirms; no separate output file.

**Phase to address:**
File I/O + write/confirm phase.

---

### Pitfall 11: Electron file access wired into the renderer (security + robustness)

**What goes wrong:**
Doing `fs`/Brotli/binary parsing in the renderer requires `nodeIntegration: true` / `contextIsolation: false`, which disables the sandbox and opens the app to RCE if any content is injected. It also entangles binary logic with UI. A broad preload bridge (e.g. a generic `readFile`/`writeFile`) is nearly as bad.

**Why it happens:**
It's the quickest way to get file access working in a renderer-centric app.

**How to avoid:**
- Secure baseline: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for the renderer.
- Keep **all** file I/O, Brotli, and binary parsing in the **main process**. Expose a **narrow, purpose-specific IPC API** (`openSave()`, `getSummary()`, `applyEdits(edits)`, `writeSave(path)`) — one method per message, not a generic file bridge.
- Validate/whitelist any path handling in main; never `exec`/`eval` on renderer-supplied data.
- Because inputs are untrusted binary files, treat parsing defensively: bounds-check every read, never trust a length prefix or entity count without sanity limits (a malformed/huge prefix must not cause an out-of-bounds read or a multi-GB allocation).

**Warning signs:**
`nodeIntegration: true` or `contextIsolation: false` in `webPreferences`; `require('fs')` in renderer code; a preload that exposes generic file or shell access.

**Phase to address:**
App-shell / IPC architecture phase (set the security posture before feature work).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Whole-file byte-search instead of region-scoped search | Less parsing code | False-positive matches → silent corruption (Pitfall 3) | Never for writes; acceptable only for a read-only "find" that shows all candidates |
| Single generic `writeValue(offset, value)` without width | Fewer functions | int32/int64/double confusion (Pitfall 2) | Never |
| Skip in-game load test, rely on self-parse | Fast CI | Header-vs-wallet and format-rejection bugs ship (Pitfalls 1, 8, 9) | Only between in-game checkpoints; never as the sole gate before release |
| Cache offsets in UI state | Snappier UI | Stale-offset corruption across loads (Pitfall 6) | Never persist; only within a single immutable-buffer load |
| Overwrite source file | One less dialog | One bad edit destroys the save | Never |
| Hand-hardcode the XP table from the milestone table | Skip the generator | Wrong intermediate levels; L-by-L off-by-one | Never — generate and unit-test against milestones |
| Enable large-window Brotli for smaller files | Marginally smaller output | Non-RFC-7932 output .NET may reject (Pitfall 8) | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Node `zlib` Brotli | Assuming recompressed bytes must match the original; or enabling large-window | Use standard params; rely on losslessness — only decompressed bytes matter; round-trip test |
| .NET `BinaryReader` string format | Treating length prefix as fixed 1 byte or as char count | 7-bit varint = UTF-8 **byte** length; handle ≥128-byte prefixes |
| .NET numeric layout | Big-endian reads; wrong width | Little-endian everywhere; width is per-field |
| Melvor Idle 2 itself | Editing header GP and calling it done | Edit Bank wallet; header is a mirror it overwrites |
| Electron main↔renderer | `fs` in renderer / broad bridge | fs+parsing in main; narrow one-method-per-message IPC |
| Save version | Hard-failing on unknown version int | Version 17 = Alpha 0.9.1; warn but tolerate format bumps, don't silently mis-parse |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-`indexOf` scanning the whole file per item | Slow "find all items"; UI jank | Parse the entity list once, scope searches to the Bank region, index stacks in one pass | Large banks (hundreds of stacks) |
| Decompress/recompress on every keystroke/preview | Laggy edits | Decompress once into an in-memory buffer; recompress only on write | Any save; recompress at quality 11 is the slow step |
| Copying the full buffer for each edit | Memory churn | Mutate a single working copy in place (fixed-width), keep original immutable | Many batched edits |

*Note: this is a single-user local tool on modest save files — do not over-engineer for scale. The traps above matter only for interactivity, not throughput.*

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `nodeIntegration: true` / `contextIsolation: false` | Renderer RCE, disabled sandbox | Secure baseline: isolation on, node off, sandbox on |
| Broad preload bridge (generic file/shell access) | Injected script gains file/RCE | Narrow, purpose-built IPC methods only |
| Trusting length prefixes / entity counts from an untrusted `.sav` | OOB read or multi-GB allocation on a malformed/hostile file | Bounds-check every read; cap prefix/count against remaining buffer size |
| `eval`/`exec` on parsed save data | Code execution from file contents | Never interpret save data as code; treat as opaque bytes |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Edit succeeded" when only the header snapshot changed | User trusts a no-op edit (Pitfall 1) | Confirm against the authoritative field; show what will actually change in-game |
| No preview/diff before write | Blind writes, hard to catch mistakes | Preview a summary of pending changes (field, old→new, width) and require confirm |
| Silent auto-pick on ambiguous match | Wrong item edited without warning | Surface ambiguity; require the user to disambiguate |
| Overwriting the source save | Irrecoverable loss | Write to a new file, default a distinct name, keep original untouched |
| Unclear error on a non-MV2/corrupt file | Confusing stack trace | Friendly "not a valid MV2 save / unsupported version" message |

## "Looks Done But Isn't" Checklist

- [ ] **Currency edit:** Often only changes the header snapshot — verify the **Bank wallet int64** changed and it persists after an in-game save.
- [ ] **Item quantity edit:** Often matches a false offset — verify context (prefix == byte length, sane qty) and that exactly one intended stack changed.
- [ ] **Skill edit:** Often sets XP without a consistent Level — verify both XP and Level agree with the XP table and survive in-game load.
- [ ] **Write path:** Often changes total byte length — verify `output.length === input.length` and that a decompressed diff shows *only* the edited byte ranges.
- [ ] **Codec:** Often "round-trips in the editor" but not in-game — verify an actual in-game load of the edited save.
- [ ] **String/varint reader:** Often works for short names — verify with a ≥128-byte prefix and a multi-byte UTF-8 string.
- [ ] **Electron shell:** Often ships with insecure defaults — verify `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, and no `fs` in renderer.
- [ ] **Original file:** Often overwritten — verify a new output file is produced and the source is byte-unchanged.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Corrupted output ships to game | LOW (by design) | Non-destructive write means the original `.sav` is intact — reload it, fix the bug, re-edit |
| Header-only edit (silent no-op) | LOW | Point the edit at the Bank wallet; re-run |
| False-positive offset patched wrong field | MEDIUM | Discard the output (original safe); add/strengthen context validation; re-edit from original |
| Byte-length desync from an accidental variable-width write | MEDIUM | Original safe; add the length invariant assertion to catch it; audit the write path |
| Wrong XP/Level consistency | LOW | Recompute both from the XP table; re-edit |
| Non-RFC Brotli output rejected by game | LOW | Switch to standard params; re-run codec round-trip test |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Cosmetic vs real currency | Parsing/model + currency-edit | In-game load shows new GP; persists after in-game save |
| 2. Wrong-width writes | Binary-primitives/codec | Field width asserted; re-parse yields written value |
| 3. False-positive offsets | Item/skill-edit | Context-validation unit tests; ambiguity surfaced not auto-picked |
| 4. XP/Level inconsistency | Skill-edit | XP table matches spec milestones; in-game level correct |
| 5. Byte-length desync | Codec/write | `output.length === input.length` assertion + corpus test |
| 6. Stale offsets | Parsing/state | Re-parse on load; second-file-in-session test |
| 7. Varint/endianness | Binary-primitives | ≥128-byte prefix + multi-byte UTF-8 + LE round-trip tests |
| 8. Brotli round-trip | Codec (first gate) | `compress(decompress(x))` decompresses to x; standard params only |
| 9. No in-game verification | Every edit phase (acceptance) | Documented manual in-game load checklist + decompressed diff test |
| 10. Destructive write | File-I/O/write | New output file; source byte-unchanged |
| 11. Electron file access | App-shell/IPC (before features) | Secure `webPreferences`; narrow IPC; no renderer `fs` |

## Sources

- `docs/current-skill.md` — authoritative reverse-engineered MV2 save format, "Important Notes" and "Lessons Learned" (HIGH; internal, verified against real saves).
- `.planning/PROJECT.md` — scope, constraints, and safety requirements (HIGH; internal).
- [Node.js `zlib` documentation](https://nodejs.org/api/zlib.html) — Brotli defaults (quality 6, window 20), standard vs large-window mode (MEDIUM–HIGH).
- [Brotli / RFC 7932 losslessness and .NET `BrotliStream` interop](https://github.com/httptoolkit/brotli-wasm) — standard-compliant output is cross-decompressible; large-window is non-standard (MEDIUM).
- [Electron Security tutorial](https://www.electronjs.org/docs/latest/tutorial/security) — contextIsolation/nodeIntegration/sandbox baseline (HIGH).
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) and [main-process fs via IPC guidance](https://github.com/electron/electron/blob/main/docs/tutorial/security.md) — keep fs in main, narrow one-method-per-message IPC (HIGH).
- General .NET `BinaryReader`/`BinaryWriter` string 7-bit-length-prefix + little-endian numeric layout (HIGH; well-established framework behavior consistent with the spec).

---
*Pitfalls research for: local binary save-file editor (Melvor Idle 2 `.sav`)*
*Researched: 2026-07-03*
