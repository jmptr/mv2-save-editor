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

## Milestone: v1.1 — Packaging & Distribution

**Shipped:** 2026-08-20
**Phases:** 3 | **Plans:** 8 | **Tasks:** 13

### What Was Built
- **Packaging (P6):** electron-builder wraps the existing esbuild `dist/` into a per-user Windows NSIS installer; a zero-dep pure-Node ICO writer supplies the icon; config + dist-sibling layout pinned by node:test.
- **Auto-update (P7):** electron-updater as an unpruned runtime dep kept esbuild-`external`, wired via an `app.isPackaged`-guarded lazy-require `initAutoUpdater()` (one launch check, dual-channel error trap, zero-dep fs logger) — strictly inert in dev.
- **Release CI (P8):** a `v*` tag → windows-latest build → draft GitHub Release (`.exe`+`latest.yml`+`.blockmap`) → manual publish; the whole chain proven end-to-end by a live v1.1.0 → v1.1.1 self-update (SC4).

### What Worked
- **CI mirrors the proven local chain.** release.yml adds only `--publish onTagOrDraft` + `GH_TOKEN` to the already-working `build:electron` → electron-builder command — nothing novel to debug in CI.
- **Static-text assertions over the workflow YAML** (zero-dep node:test) pinned every load-bearing key + the `@esbuild/win32-x64` lockfile coverage, so the CI contract can't silently drift.
- **The live two-release gate earned its keep.** SC4 caught two issues no static test could: electron-builder's duplicate-draft race and the private-repo auto-update blocker — both fixed before "done".
- **Dependency-ordered phases** (package → updater embeds → CI automates) meant each phase's output was the next phase's input, with no rework.

### What Was Inefficient
- **Infra assumptions surfaced only at ship time.** The private-repo `releases.atom` 404 and the duplicate-draft race were both discoverable in Phase 7/8 research but weren't — they cost live debugging during the SC4 gate. Auto-update transport (repo visibility) belonged in the Phase 7 threat/assumptions list.
- **Phase 8 closed without a VERIFICATION.md.** It was accepted via its manual SC4 gate, so the milestone audit flagged it `gaps_found` and the artifact had to be backfilled. A manual-gate phase should still emit a VERIFICATION.md at close.
- **Milestone tag ↔ release trigger collision.** The GSD `v1.1` milestone tag matches release.yml's `v*` trigger; not anticipated, so the tag is create-local-don't-push. A `vX.Y.Z`-only trigger would remove the footgun.

### Patterns Established
- **Pre-create the draft Release** (`gh release create --draft`) before electron-builder, so parallel asset uploads reuse one release instead of racing into duplicates.
- **Version=Tag lockstep bump** across package.json + package-lock.json + every version-coupled test literal, in one commit with the suite green.
- **Manual human-gate as the runtime-acceptance record** for OS-specific slices (Windows packaging/install/update) that can't run on the Linux/CI host — mirrored across P6/P7/P8.

### Key Lessons
1. A live end-to-end gate against the real distribution channel surfaces infrastructure assumptions (repo visibility, release-creation races) that no static/unit test will.
2. GitHub-Releases auto-update requires a public repo (or an embedded token — a leak risk); decide repo visibility as part of designing auto-update, not at ship time.
3. Even a phase closed by a manual acceptance gate should emit its VERIFICATION.md, or milestone audit will (correctly) flag it.

### Cost Observations
- Model mix: Opus orchestration throughout; one gsd-executor subagent for Wave 1 (08-01), the rest inline (manual gates + small edits).
- Notable: most of the milestone's wall-clock was real-world gating (CI runs, publishing, Windows self-update observation), not code — the code surface was ~13 commits.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 5 | 23 | Baseline — inside-out core-first build; in-game acceptance as the ship gate |
| v1.1 | 3 | 8 | Distribution-only; live end-to-end gate (SC4) as the ship gate; CI mirrors the proven local chain |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 272 | 100% (format core) | codec, primitives, parser, patcher, XP table, IPC guards all zero-new-dep |
| v1.1 | 300 | 100% (format core, maintained) | ICO writer, packaging/updater/release-workflow static tests all zero-new-dep; only runtime dep added: electron-updater |

### Top Lessons (Verified Across Milestones)

1. **Real-consumer acceptance catches what unit tests can't** — v1.0's in-game load caught silent bank corruption; v1.1's live self-update caught the private-repo + duplicate-draft infra bugs. Confirmed across both milestones.
2. **Structural/explicit over heuristic/implicit** — v1.0's structural bank tab-walk (vs marker-search); v1.1's pre-created draft (vs racing electron-builder's implicit create). Confirmed across both milestones.
3. Decide infrastructure/transport assumptions (repo visibility, release mechanics) during design, not at the ship gate.
