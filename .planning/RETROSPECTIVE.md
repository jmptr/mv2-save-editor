# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-07-05
**Phases:** 5 | **Plans:** 23 | **Tasks:** 44

### What Was Built
- Pure-TS format core, byte-exact against a real `.sav`: LE primitives (int64 as BigInt) + game-compatible Brotli round-trip (P1), documented-layout parser → fresh-offset FieldTable + offset-free ViewModel (P2), same-width in-place patch engine + reject-never-clamp validation + StandardExperienceTable XP↔Level coupling (P3).
- Hardened Electron 43 shell: `contextIsolation`/`sandbox` renderer, narrow 4-method contextBridge IPC, offsets/bigint never cross, non-destructive new-file write (P4).
- React 19 renderer: read-only summary, virtualized filter-as-you-type bank + skill lists, inline validated edits, SAFE-02 preview/confirm gate — closed by a mandatory in-game acceptance (P5).

### What Worked
- **Inside-out build order.** Proving the corruption-risk core (P1–P3) byte-exact with golden-file tests *before* any Electron/UI existed meant the risky work carried its own proof, and the later Electron/React phases were comparatively standard plumbing.
- **Offset-free ViewModel by construction + `assertNoOffsets` guard.** Keeping byte offsets exclusively in the FieldTable and deriving the UI model made the IPC security boundary (no offsets/bigint cross the bridge) provable rather than aspirational.
- **Mandatory in-game acceptance as the real gate.** It caught two defects unit tests never could: the header GP/SlayerCoins snapshot coupling (4573e70) and the phantom-stack bank corruption — both silent-corruption bugs that only manifest on an actual game load.
- **Fail-loud everywhere** (ParseError on misaligned records, reject-never-clamp validation, length invariant) — the safe posture for a corruption-sensitive tool: refuse rather than emit questionable bytes.

### What Was Inefficient
- **Bank Inventory parsed twice.** P2 shipped a loose marker-search (recovered "all 689 stacks") that was later root-caused as the phantom-stack corruption source and rewritten as an explicit tab-walk post-ship. The trailing "Chests" registry structure wasn't decoded until forced to; decoding it up front in P2 would have avoided a ship-blocking bug and a redo.
- **A regression test hard-coded an unverified expected count** (`save_35a` = 330, copied from a different save's structure). It passed transiently, then went red once the committed state was re-run — caught only by the milestone audit's integration checker. Byte-derive fixture expectations; never copy them across saves.
- **In-session "green suite" was trusted without a clean re-run.** A `272/272` reading went stale after a later commit; the true state was `271/272`. Re-run the suite from a clean state before declaring green.

### Patterns Established
- **FieldTable (offset-bearing) vs ViewModel (offset-free), single `parseSave` entry** producing both — the core contract every downstream layer consumes.
- **Structural walks over heuristic scans** for binary regions: drive parsing by the file's own length/count fields and stop exactly at declared boundaries; phantoms become structurally impossible, not filtered.
- **int64 as BigInt end-to-end, serialized as decimal strings** across every IPC/JSON boundary — never `Number`.
- **Debug knowledge base** (`.planning/debug/knowledge-base.md`) seeded — resolved sessions surface known-pattern hypotheses for future investigations.

### Key Lessons
1. For a "must-not-corrupt" format tool, an end-to-end acceptance against the real consumer (the game) is non-negotiable — it's the only check that catches silent-revert corruption.
2. Decode binary structures *fully* before shipping a parser; a heuristic that "recovers everything" can be silently over-recovering (phantom records) in a way that corrupts on write.
3. Test expectations for real fixtures must be byte-derived and re-verified from a clean state — a transiently-green suite is not a green suite.

### Cost Observations
- Model mix: Opus-heavy (orchestration + debugging); subagents for debug session, integration check.
- Notable: the milestone audit (integration checker) paid for itself by catching a committed red suite that an in-session run had reported green.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 5 | 23 | Baseline — inside-out core-first build; in-game acceptance as the ship gate |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 272 | 100% (format core) | codec, primitives, parser, patcher, XP table, IPC guards all zero-new-dep |

### Top Lessons (Verified Across Milestones)

1. *(pending v1.1)* — in-game/real-consumer acceptance catches corruption unit tests can't.
2. *(pending v1.1)* — structural walks beat heuristic scans for binary parsing safety.
