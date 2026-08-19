<!-- partial_schema: spec@1 -->

---
affects: [all-skills, copilot-provider, codex-provider, opencode-provider, cursor-provider]
mode: cross-cutting
kind: refactor
status: review-pending
created: 2026-08-19
updated: 2026-08-19
revision: 1
diff-source: "main..chore/skills/progressive-disclosure (5 commits, 417 files)"
---

# Refactoring Spec: Progressive disclosure for SKILL.md bodies

<!-- Cross-cutting refactoring spec. Governs the body/companion split for every
     skills/<name>/SKILL.md and its provider mirrors.

     AUTHORED RETROACTIVELY. The implementation landed on
     chore/skills/progressive-disclosure before this spec existed — the work was
     driven directly from the issue board (adev-plugin-5yfz.3, adev-plugin-5yfz.4,
     adev-plugin-skill-size-headroom-wnn9, adev-plugin-04jr.1) rather than through
     the lifecycle. This spec is the reconciliation artifact for that gap; it
     documents what shipped and fixes the trail. It is NOT a plan for future work.

     `--from-diff` would have been the honest workflow flag, but it is mutually
     exclusive with `--cross-cutting` (CONFLICTING_FLAGS), and the concern spans
     all 30 skills with no single owning charter — so cross-cutting wins on
     artifact location and the retroactive origin is recorded in `diff-source`. -->

## Current State

The state this refactor started from, measured on `main` at 90fcc8bf with
`agent-ecosystem/skill-validator` v1.6.0 and `wc -c`.

### Structure

Each skill was a directory holding `SKILL.md` plus, for nine skills, companion
files sitting flat at the skill root:

| Path | Contents |
|------|----------|
| `skills/<name>/SKILL.md` | Entire instruction body — always loaded in full on invocation |
| `skills/build/*.md` | 4 mode files at root |
| `skills/plan/*.md` | 6 mode/prompt files at root |
| `skills/implement/*.md` | 6 files at root, incl. the PR #268 conditional-loading companions |
| `skills/research/*.md`, `skills/brainstorm/*.md` | 5 reviewer/researcher prompts at root |
| `skills/write-test/*.{sh,mjs}` | 6 executable helpers at root |
| `skills/eval/default-rubric.yaml` | Rubric data at root |
| `skills/review-specs/*-prompt.md`, `adapters/` | 9 files at root — **URI-addressed** |
| `skills/validate/checks/` | 13 check prompts — **URI-addressed** |

### Problems

1. **16 of 30 SKILL.md bodies exceeded the Agent Skills spec's ~5,000-token
   guidance**; 11 also exceeded its 500-line guidance. Total across all 30 bodies:
   856,056 bytes (~209,818 tokens at the 4.08 B/tok ratio recovered from
   skill-validator's own hygiene measurement of 65,350 B / 16,018 tok).

2. **Four bodies were within 1.5 KB of a hard crash.** `lib/providers/copilot/skill-validator.mjs`
   enforces `FRONTMATTER_BYTE_LIMIT = 64 * 1024`; crossing it throws
   `INVALID_SKILL_FRONTMATTER` from inside `buildPlan()` and takes down every
   Copilot adapter path — install, uninstall, status, dry-run.

   | Skill | Bytes | Headroom |
   |-------|-------|----------|
   | hygiene | 65,350 | 186 |
   | build | 65,345 | 191 |
   | implement | 64,856 | 680 |
   | specify | 64,119 | 1,417 |

3. **The cost is multiplied, not paid once.** A body is injected in full on
   invocation and then re-read as part of the context prefix on every subsequent
   turn. On one measured lifecycle (adev-plugin-04jr) `cache_read` was 98.1% of
   total token cost, and mean `cache_read` per message grew 8.7x over the session.

4. **Neither limit was visible at authoring time.** The hard cap existed only as a
   constant inside a Copilot provider module. `skills/hygiene/SKILL.md` carried a
   hand-written warning comment saying "the remedy is to split this catalogue out"
   — the correct remedy, recorded nowhere a tool could enforce it.

5. **Layout diverged from the spec**, which expects only `SKILL.md` at a skill root
   with support material under `scripts/`, `references/`, or `assets/`.

### Dependencies

Constraints that bound any fix:

- **`plugin:<skill>/<path>` is a published URI contract.** `templates/review-specs/defaults.yaml`,
  `templates/domains/software/reviewers.yaml`, `lib/governance/review-config.mjs:609`
  and `lib/governance/validate-config.mjs:316` resolve `plugin:review-specs/<file>`
  and `plugin:validate/checks/<file>`. Those URIs are materialized into every user
  project's `.context-index/governance/review.yaml` and `validate.yaml`.
- **~25 test files assert on inline SKILL.md prose**, several by slicing between
  headings or comparing heading offsets.
- **Provider mirrors** under `providers/{codex,opencode}/skills/` hold their own
  copies; `scripts/sync-provider-skills.mjs` syncs only `SKILL.md`, not companions.
- **Three instruction classes govern the whole invocation**, not one branch: the
  Load Skill Extensions block (required by `universal-skill-extensions.spec.md`
  and `tests/skills-extension-coverage.test.mjs`), the synchronous-dispatch and
  never-end-your-turn rules, and `## Prerequisites`.

## Target State

### Structure

```
skills/<name>/
├── SKILL.md          # always-read: routing, whole-invocation rules, section stubs
├── references/       # on-demand companions, loaded immediately before use
└── scripts/          # executable helpers
```

The body keeps every section's heading, a one-line summary of what that section
covers, and a pointer:

> **Conditional loading:** Read `skills/<name>/references/<file>.md` for the full
> instructions. Do not act on this section from the summary above.

`skills/hygiene/SKILL.md` is the reference implementation: 23 audit passes live one
file each under `references/audit-passes/`, and the body carries a routing table
mapping each pass to its `--check` slug and its companion path.

### Improvements

| Problem | Resolution |
|---------|------------|
| 1. 16 bodies over guidance | 0 over. Total 856,056 → 350,162 B (−59.1%); ~209,818 → ~85,824 est. tokens |
| 2. Four bodies near the hard cap | Smallest headroom across all 30 is now 47,688 B (`route`, untouched) |
| 3. Multiplied cost | 505,894 fewer bytes enter the prefix per invocation, so the reduction compounds per turn |
| 4. Invisible at authoring time | Both limits documented in `constitution.md` / `CLAUDE.md` and `docs/skill-reference.md`; guarded by `tests/skills/skill-size-cap.test.mjs` |
| 5. Layout divergence | 27 prose-referenced companions moved to `references/` and `scripts/` |

Per-skill result for the 16 that were over guidance:

| Skill | Before | After | Skill | Before | After |
|-------|--------|-------|-------|--------|-------|
| hygiene | 65,350 | 12,997 | review-specs | 43,053 | 14,225 |
| build | 65,345 | 16,821 | brainstorm | 38,901 | 11,408 |
| implement | 64,856 | 12,415 | write-test | 32,038 | 12,660 |
| specify | 64,119 | 15,226 | retro | 27,358 | 4,532 |
| validate | 60,062 | 16,746 | recover | 26,754 | 5,430 |
| plan | 50,998 | 9,662 | debug | 24,063 | 7,968 |
| init | 49,654 | 7,203 | status | 23,279 | 7,407 |
| | | | prototype | 22,854 | 9,875 |
| | | | work | 21,694 | 10,694 |

## Changes Catalog

### ADDED

- 161 companion files under `skills/*/references/**`
- `readSkillSurface(name)` and `readSkillSurfaceAt(dir)` in `tests/helpers.mjs`
- `tests/skills/work-no-skill-reentry.test.mjs`
- A `~5,000-token` guidance assertion in `tests/skills/skill-size-cap.test.mjs`
- A routing assertion pinning that `skills/hygiene/SKILL.md` names its Pass 19 companion
- "How a skill is laid out on disk" in `docs/skill-reference.md`
- The two-size-limits anti-pattern in `.context-index/constitution.md` (synced to `CLAUDE.md`)

### MODIFIED

- 30 `skills/*/SKILL.md` bodies (16 substantively; the rest only for rewritten companion paths)
- 24 provider mirror `SKILL.md` files, regenerated by `scripts/sync-provider-skills.mjs`
- ~25 test files, rewired to follow relocated prose (see Invariants)
- `skills/work/SKILL.md` — new "Do not re-enter a skill whose body is already loaded" section

### REMOVED

Nothing. No prose was deleted; every instruction still ships.

### RENAMED

- 76 file moves: 27 canonical companions plus their provider-mirror counterparts
- `skills/write-test/{detect-framework,detect-gaming,write-handoff}.{sh,mjs}` → `scripts/`

**Deliberately NOT moved** — 18 files addressed by the `plugin:<skill>/<path>` URI
contract (`skills/review-specs/*-prompt.md`, `review-specs/adapters/`,
`validate/checks/`). Relocating them breaks every installed project at review and
validate time, and since they already live outside `SKILL.md` it would reclaim
zero body bytes.

## Migration Path

Executed in this order; each step was independently verifiable and left the suite green.

### Step 1: Adopt the spec layout for prose-referenced companions

Move the 27 companions referenced only from adev's own SKILL.md prose into
`references/` and `scripts/`; rewrite every path reference in skills, tests, lib,
docs, and specs; move the provider mirrors in step.

- **Risk:** Low — pure relocation, no prose change.
- **Verify:** full suite green; `providers/*` mirrors regenerate with no drift.
- **Landed:** commit `6281d3ae`.

### Step 2: Split the five largest bodies

`hygiene`, `build`, `implement`, `specify`, `validate` — the four near the hard cap
plus `validate`.

- **Risk:** High — these are the most load-bearing skills in the repo.
- **Verify:** full suite green; the Load Skill Extensions block and dispatch rules
  still present in every body.
- **Landed:** commit `9bdbfec1`.

### Step 3: Bring the remaining eleven under the guidance

`plan`, `init`, `review-specs`, `brainstorm`, `write-test`, `retro`, `recover`,
`debug`, `status`, `prototype`, `work`; trim `build`/`implement`/`validate` the rest
of the way.

- **Risk:** Medium — same mechanism, less load-bearing skills.
- **Verify:** all 30 bodies under the guidance; suite green.
- **Landed:** commit `27a43f45`.

### Step 4: Stop the conductor re-loading bodies already in context

`/adev:work` Conductor Mode gains an explicit no-re-entry rule (adev-plugin-04jr.1
approach 3).

- **Risk:** Low — additive instruction, no existing behaviour removed.
- **Verify:** `tests/skills/work-no-skill-reentry.test.mjs`.
- **Landed:** commit `57061d3a`.

### Step 5: Make both limits an authoring-time constraint

Constitution, docs, and a regression guard.

- **Risk:** Low.
- **Verify:** the new guard fails if any body exceeds the guidance.
- **Landed:** commit `522181db`.

## Invariants

Properties that held at every step, and must keep holding for any future split.

1. **No prose is deleted.** Sections move whole. The remedy for an oversized body is
   relocation, never trimming. A future edit that "tightens" a body to fit violates
   this spec.

2. **Whole-invocation instructions stay in the body.** Three classes must never sit
   behind a conditional-loading pointer:
   - the Load Skill Extensions block — it establishes standing instructions for the
     entire execution;
   - the synchronous-dispatch and never-end-your-turn rules — a dispatcher that
     reads them only sometimes violates them the rest of the time;
   - `## Prerequisites` — every invocation passes through it before any step. The
     concrete case: `implement`'s `--no-batch` / `--parallel` conflict check is only
     meaningful because it is unconditional. Behind a pointer it stops being so.

   All three were carried out by the mechanical split and had to be restored. This
   invariant exists because the failure is silent: the body still reads coherently.

3. **Every companion is reachable by a full, greppable path.** `skills/<name>/references/...`
   in backticks, not a bare filename, and not a path relative to the skill directory.

4. **Assertions follow the prose; they are never weakened to pass.** Three shapes,
   three treatments:
   - *content presence* → `readSkillSurface(skill)`, which reads `SKILL.md` plus its
     `references/` tree;
   - *a specific section* → read that companion directly. The concatenated surface
     holds the body's **stub** for the same heading first, so `indexOf` returns the
     conditional-loading pointer rather than the section;
   - *ordering* → read the one companion that owns the sequence. Sibling mode files
     number their own steps 3/4/5, so offsets taken across the concatenation compare
     headings from different modes and mean nothing.

5. **A sweep that would become vacuous is widened, not relaxed.** The `--signature`
   call-surface audit walks `references/`; without that it found zero matches and its
   equality degenerated to `[] === []`. `readSkillSurface` deliberately does **not**
   walk `skills/validate/checks/` — those are prompt bodies handed to subagents, and
   several tests draw exactly that distinction.

6. **Provider mirrors stay coherent with the bodies they mirror.** `sync-provider-skills.mjs`
   syncs only `SKILL.md`, so companion moves must be mirrored by hand or the mirrored
   prose points at files that are not there.

7. **`.plan.md` files are immutable.** The mechanical path rewrite touched seven of
   them and was reverted; `tests/skills/plan-task-immutability.test.mjs` detects this
   from git history, so the commit had to be amended rather than fixed in the tree.

## Behavioral Contract

Describes the system after the refactor.

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** any `skills/<name>/SKILL.md` is written or edited, **then** its
  body is at most ~5,000 tokens (20,400 bytes at 4.08 B/tok) and strictly under the
  65,536-byte Copilot `FRONTMATTER_BYTE_LIMIT`.
- **BEH-2** — **When** a skill body would exceed either limit, **then** the remedy is
  to move a section into `skills/<name>/references/` and leave a conditional-loading
  pointer; deleting prose to fit is a violation.
- **BEH-3** — **When** a section is relocated to a companion, **then** the body retains
  that section's heading, a one-line summary, and a full-path pointer to the companion.
- **BEH-4** — **When** an agent reaches a section whose body carries a conditional-loading
  pointer, **then** it reads the named companion before acting, and does not act from
  the summary alone.
- **BEH-5** — **When** a skill runs a mode, pass, or step that has its own companion,
  **then** only that companion is read — a `--check <type>` hygiene run reads one of 23
  audit passes, not all of them.
- **BEH-6** — **When** an instruction governs the whole invocation (Load Skill Extensions,
  dispatch discipline, `## Prerequisites`), **then** it stays in the body regardless of
  body size.
- **BEH-7** — **When** a companion file is added under `skills/<name>/references/`,
  **then** some file in that skill's surface references it by full path; an unreferenced
  companion is dead weight.
- **BEH-8** — **When** a skill's companions move, **then** the corresponding provider
  mirrors under `providers/*/skills/<name>/` move in the same change.
- **BEH-9** — **When** `/adev:work` has already loaded its own body or a target skill's
  body in a session, **then** it does not re-invoke that skill to advance the arc; it
  continues from the instructions in context or dispatches a subagent.
- **BEH-10** — **When** a test asserts on instruction prose, **then** it reads the
  surface (`readSkillSurface`) for content presence, or the specific companion for
  section-scoped and ordering assertions.

### Error Cases

| Condition | Expected behavior | Signal |
|-----------|-------------------|--------|
| A `SKILL.md` exceeds 65,536 bytes | `validateSkillNames()` throws `INVALID_SKILL_FRONTMATTER`; every Copilot adapter path fails | Exception from `buildPlan()` |
| A `SKILL.md` exceeds the ~5,000-token guidance | `tests/skills/skill-size-cap.test.mjs` fails, naming the skill and its estimated token count | Test failure |
| A body is 90–100% of the hard cap | The existing guard prints a margin note without failing | `console.log` note |
| A body loses its Load Skill Extensions block | `tests/skills-extension-coverage.test.mjs` fails for that skill | Test failure |
| A dispatching skill loses a dispatch-discipline rule | `tests/skills-dispatch-turn-discipline.test.mjs` fails | Test failure |
| A conditional-loading pointer names a file that does not exist | Broken pointer — the agent cannot load the section | **UNGUARDED** (see Acceptance Criteria) |
| A companion exists that nothing references | Dead weight shipped to every consumer | **UNGUARDED** — 2 pre-existing instances |
| Provider mirror `SKILL.md` drifts from canonical | `tests/sync/provider-skill-parity.test.mjs` fails, naming the drifted files | Test failure |
| Provider mirror *companions* drift | Mirrored prose points at absent files | **UNGUARDED** — `sync-provider-skills.mjs` syncs only `SKILL.md` |

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|------------------|
| All 30 skills | High | Bodies split; 16 substantively restructured, all 30 must honour BEH-1..BEH-8 |
| `copilot-provider` | High | Owns the hard cap. Its `skill-validator.mjs` is the enforcement point, unchanged, but the cap is now documented outside it |
| `codex` / `opencode` providers | Medium | Mirror trees carry companions; `sync-provider-skills.mjs` covers only `SKILL.md`, so companion moves are manual |
| `cursor-provider` | Low | Publishes recursively (`cpSync {recursive:true}`), so companions ship without change; its test now reads the published tree |
| Test suite | High | ~25 files rewired; `tests/helpers.mjs` gains the surface readers |
| `governance` (review/validate registries) | None, by design | The `plugin:<skill>/<path>` URI contract is untouched — that is why 18 files did not move |

## Integration Points

1. **skills ↔ copilot-provider:** `lib/providers/copilot/skill-validator.mjs` is the sole
   enforcement point for the 65,536-byte cap. `tests/skills/skill-size-cap.test.mjs`
   recovers the value *behaviourally* — it feeds the validator an oversized probe and
   parses the limit out of the thrown error — so raising it in one place cannot leave a
   stale duplicate asserting the old number.
2. **skills ↔ governance registries:** `plugin:review-specs/<file>` and
   `plugin:validate/checks/<file>` resolve through `lib/governance/review-config.mjs`
   and `validate-config.mjs`. These URIs are materialized into user projects, making
   those paths a public contract that this refactor deliberately does not touch.
3. **skills ↔ provider mirrors:** `scripts/sync-provider-skills.mjs` is the canonical
   sync for `SKILL.md` only. Companion parity is currently a manual invariant (BEH-8).
4. **skills ↔ tests:** `readSkillSurface` / `readSkillSurfaceAt` in `tests/helpers.mjs`
   are the sanctioned way for a test to read instruction content that may live in a
   companion. They walk `references/` and deliberately exclude `checks/`.
5. **work ↔ every other skill:** Conductor Mode's no-re-entry rule (BEH-9) is the only
   in-repo lever against duplicate body loads; general dedup needs harness support.

## System Constitution Reference

- **Principle 2 — "Skills are primarily markdown."** Directly load-bearing here. The
  split keeps every skill's instructions in markdown and adds no code dependency: a
  companion is markdown, and the pointer that loads it is prose. Nothing about a
  skill's operation now requires companion *code*.
- **Principle 1 — "Minimize external dependencies."** Honoured. The whole refactor is
  file moves plus markdown edits; the new test helpers use only `node:fs` / `node:path`.
- **Anti-pattern — "No executable logic inside SKILL.md files."** Preserved. Sections
  moved verbatim; no inline Node was introduced, and the pre-commit
  `no-inline-node` hook's per-H3 both-forms rule still applies to the smaller bodies.
- **Anti-pattern — "New skills MUST include a Load Skill Extensions block."** This
  refactor is the reason the constitution now also states that the block may not be
  relocated into a companion. Invariant 2 generalises the rule from *presence* to
  *presence in the body*.
- **New anti-pattern added by this work** — "SKILL.md bodies have two size limits, and
  prose deletion is the wrong fix for either." Encodes BEH-1, BEH-2 and BEH-6 in
  `.context-index/constitution.md`, synced to `CLAUDE.md`.

## Acceptance Criteria

- [x] All 30 `SKILL.md` bodies are under the ~5,000-token guidance (16 were over)
- [x] All 30 are under the 65,536-byte hard cap with ≥47,688 bytes of headroom
- [x] No prose deleted — every relocated section moved whole (BEH-2)
- [x] Every body retains heading + summary + full-path pointer per relocated section (BEH-3)
- [x] Load Skill Extensions block present in all 30 bodies (BEH-6), pinned by `tests/skills-extension-coverage.test.mjs`
- [x] Dispatch-discipline rules present in all 9 dispatching bodies (BEH-6), pinned by `tests/skills-dispatch-turn-discipline.test.mjs`
- [x] `## Prerequisites` restored to the body for `implement`, `validate`, `build` (BEH-6)
- [x] 208 full-path companion references resolve; 0 broken (BEH-7)
- [x] Provider mirrors moved in step and regenerate with no drift (BEH-8)
- [x] `/adev:work` carries the no-re-entry rule (BEH-9), pinned by `tests/skills/work-no-skill-reentry.test.mjs`
- [x] Test assertions follow the prose rather than being weakened (BEH-10)
- [x] Both limits documented in `constitution.md` / `CLAUDE.md` and `docs/skill-reference.md`
- [x] A regression guard fails if any body exceeds the guidance
- [x] All quality gates pass — 7160 tests, 0 failures (baseline 7152, +8 new assertions)
- [x] No constitutional violations

**Known gaps — carried, not silently closed:**

- [ ] **No guard for broken conditional-loading pointers.** Verified once by hand (208
      references, 0 broken); nothing prevents the next edit from breaking one.
- [ ] **No guard for unreferenced companions.** Two exist today —
      `skills/brainstorm/references/charter-reviewer-prompt.md` and
      `skills/plan/references/mode-router.md` — both orphaned on `main` before this work,
      neither introduced by it. Left in place: wiring them in or deleting them is a
      decision about skill behaviour, not layout.
- [ ] **No guard for provider-mirror companion parity.** `sync-provider-skills.mjs`
      covers `SKILL.md` only, so BEH-8 is a manual invariant.
- [ ] **The token saving is estimated, not measured.** Every figure here is bytes, or
      bytes divided by 4.08. The stored module heuristic warns byte proxies overstate
      savings by 2–2.5x, so these must not be quoted as a measured token or cost
      reduction. What is established: 505,894 fewer bytes enter the context prefix per
      invocation. Settling it needs `adev cost summary --spec <s> --include-checkpoints`
      over one comparable lifecycle before and after — possible now that
      adev-plugin-882a.1 has landed, but not yet run.

**Traceability:** adev-plugin-5yfz.3 (token budgets), adev-plugin-5yfz.4 (layout ruling),
adev-plugin-skill-size-headroom-wnn9 (hard-cap headroom), adev-plugin-04jr.1 (skill-load
dedup, approach 3). Cross-referenced: adev-plugin-gkfv.4 (orchestrator loop norms),
adev-plugin-04jr (token cost epic), adev-plugin-5yfz (skill validation epic).
