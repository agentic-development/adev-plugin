---
partial_schema: spec@1
affects: [all-skills, copilot-provider, codex-provider, opencode-provider, cursor-provider, extensions]
mode: cross-cutting
kind: refactor
status: review-pending
created: 2026-08-19
updated: 2026-08-19
revision: 8
diff-source: "main..61064c9a — the implementation range (5 commits, 417 files). The branch has since gained the reconciliation and review-fix commits."
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
   guidance**; 12 also exceeded its 500-line guidance (`recover` at 501 lines is the twelfth). Total across all 30 bodies:
   856,056 bytes (~209,818 tokens at the 4.08 B/tok ratio recovered from
   skill-validator's own hygiene measurement of 65,350 B / 16,018 tok).

2. **Four bodies were within 1.5 KB of a hard crash.** `lib/providers/copilot/skill-validator.mjs`
   enforces `FRONTMATTER_BYTE_LIMIT = 64 * 1024`; crossing it throws
   `INVALID_SKILL_FRONTMATTER` from inside `buildPlan()`, which is called from
   exactly one site (`providers/copilot/adapter.mjs:203`, inside `install()`).
   Copilot **install** and its `--dry-run` branch fail; `uninstall()` and
   `status()` never call it. (An earlier revision of this spec claimed every
   adapter path — corrected per RI-2.)

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

- **`plugin:<skill>/<path>` is a published URI contract over the WHOLE `skills/`
  tree**, not a review-specs/validate subset. `resolveReviewerPath`
  (`lib/governance/review-config.mjs:636-654`) resolves `plugin:` against
  `resolve(pluginRoot, 'skills')` generically. Consumers:
  `templates/review-specs/defaults.yaml`, `templates/domains/software/reviewers.yaml`,
  `lib/governance/review-config.mjs:609`, `lib/governance/validate-config.mjs:316`,
  `lib/extensions/content-install.mjs:284-302` (validates an extension-contributed
  `prompt` against that tree; an unresolvable prompt aborts the whole review with
  `GOVERNANCE_FIELD_VALUE_INVALID`), and `lib/extensions/install.mjs:100-102`
  (`isRelocatablePayload` passes any `plugin:`-prefixed path through unrewritten).

  **Consequence for the freeze.** All 76 moved files were inside the same published
  URI surface as the 22 frozen ones. The freeze's conclusion still holds — but only
  because no shipped template, doc, or extension names a moved path (verified: every non-test
  `plugin:` URI in `templates/` that addresses the `skills/` tree resolves to
  `review-specs/*` or `validate/checks/*`. `templates/diagnostics-template.yaml`
  also carries `plugin:tier1/*.mjs` URIs, which resolve through a *different*
  namespace — `lib/diagnostics/index.mjs` against `<pluginRoot>/lib/diagnostics`, not
  the `skills/` tree —
  and are therefore out of scope for this contract, not counterexamples to it). A third-party extension pack naming, say,
  `plugin:plan/plan-reviewer-prompt.md` now fails with `PLUGIN_FILE_MISSING`. The
  moved-vs-frozen line is therefore empirical, not structural, and a future split
  must re-check it rather than assume it.
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

> **Conditional loading:** Read `<ADEV_ROOT>/skills/<name>/references/<file>.md`
> for the full instructions. Do not act on this section from the summary above.

The `<ADEV_ROOT>` anchor is mandatory — see Invariant 3. This template is what a
future author copies, so it must not show the bare `skills/...` form the invariant
forbids.

`skills/hygiene/SKILL.md` is the reference implementation: 23 audit passes live one
file each under `references/audit-passes/`, and the body carries a routing table
mapping each pass to its `--check` slug and its companion path.

### Improvements

| Problem | Resolution |
|---------|------------|
| 1. 16 bodies over guidance | 0 over. Total 856,056 → 381,620 B (−55.4%); ~209,818 → ~93,534 est. tokens |
| 2. Four bodies near the hard cap | Smallest headroom across all 30 is now 47,688 B (`route`, untouched) |
| 3. Multiplied cost | 474,436 fewer bytes enter the prefix per invocation, so the reduction compounds per turn |
| 4. Invisible at authoring time | Both limits documented in `constitution.md` / `CLAUDE.md` and `docs/skill-reference.md`; guarded by `tests/skills/skill-size-cap.test.mjs` |
| 5. Layout divergence | 28 companions moved to `references/` and `scripts/` |

Per-skill result for the 16 that were over guidance:

| Skill | Before | After | Skill | Before | After |
|-------|--------|-------|-------|--------|-------|
| hygiene | 65,350 | 13,315 | review-specs | 43,053 | 14,309 |
| build | 65,345 | 17,109 | brainstorm | 38,901 | 11,492 |
| implement | 64,856 | 12,504 | write-test | 32,038 | 12,732 |
| specify | 64,119 | 15,334 | retro | 27,358 | 4,604 |
| validate | 60,062 | 16,926 | recover | 26,754 | 5,526 |
| plan | 50,998 | 10,088 | debug | 24,063 | 8,076 |
| init | 49,654 | 7,251 | status | 23,279 | 7,515 |
| | | | prototype | 22,854 | 9,995 |
| | | | work | 21,694 | 12,863 |

## Changes Catalog

### ADDED

- 161 companion files under `skills/*/references/**`
- `readSkillSurface(name)` and `readSkillSurfaceAt(dir)` in `tests/helpers.mjs`
- `tests/skills/work-no-skill-reentry.test.mjs` — pins the conductor no-re-entry rule
- `tests/sync/provider-companion-parity.test.mjs` — mirror pointer resolution and
  both directions of companion-set equality
- `tests/skills/whole-invocation-rules-in-body.test.mjs` — `## Prerequisites` in the
  body for all 21 skills that carry it, plus the `<ADEV_ROOT>` anchor sweep
- `tests/provider/cursor-path-containment.test.mjs` — the published-name allowlist and
  realpath containment
- A `~5,000-token` guidance assertion in `tests/skills/skill-size-cap.test.mjs`
- A routing assertion pinning that `skills/hygiene/SKILL.md` names its Pass 19 companion
- "How a skill is laid out on disk" in `docs/skill-reference.md`
- The two-size-limits anti-pattern in `.context-index/constitution.md` (synced to `CLAUDE.md`)

### MODIFIED

- 18 `skills/*/SKILL.md` bodies (the 16 in the size table plus `eval` and `research`, whose only change was rewritten companion paths)
- 36 provider mirror `SKILL.md` files (18 codex + 18 opencode), regenerated by `scripts/sync-provider-skills.mjs`
- 100 test files modified plus 5 added; 91 import `readSkillSurface` (see Invariants).
  Four of the five are in scope here; `tests/governance/reviewer-model-tier.test.mjs`
  belongs to the separate tier fix this branch also carries (see Scope, below)
- `scripts/sync-provider-skills.mjs` — companion sync widened to walk `references/` and `scripts/` recursively
- `providers/cursor/adapter.mjs` — a published skill name must now be a single path
  segment, and the destination is containment-checked before any write. The
  frontmatter grammar `\S+` admitted `/` and `..`, so a skill declaring
  `name: adev:../../x` escaped `~/.cursor/skills/` before the recursive copy. The flaw
  predates this refactor; the recursive `references/` copy widened what flowed through
  it, which is why it is fixed here (BND-4 in the round-3 review)
- `skills/work/SKILL.md` — new "Do not re-enter a skill whose body is already loaded" section

### REMOVED

Nothing. No prose was deleted; every instruction still ships.

### RENAMED

- 76 file moves: 28 canonical companions (22 into `references/`, 6 into `scripts/`) plus their provider-mirror counterparts. One of the 28, `brainstorm/references/charter-reviewer-prompt.md`, was deleted in revision 6 as a duplicate, so 27 survive — and all 27 are referenced.
- `skills/write-test/{detect-framework,detect-gaming,write-handoff}.{sh,mjs}` → `scripts/`

**Deliberately NOT moved** — 22 files addressed by the `plugin:<skill>/<path>` URI
contract: 8 `skills/review-specs/*-prompt.md`, `review-specs/adapters/generic.md`,
and 13 under `validate/checks/`. Of those, 16 are named by an actual `plugin:` URI
in `templates/` or `lib/`; the rest sit in the same addressable namespace. Relocating them breaks every installed project at review and
validate time, and since they already live outside `SKILL.md` it would reclaim
zero body bytes.

## Migration Path

Executed in this order; each step was independently verifiable and left the suite green.

### Step 1: Adopt the spec layout for prose-referenced companions

Move the 28 companions referenced only from adev's own SKILL.md prose into
`references/` and `scripts/`; rewrite every path reference in skills, tests, lib,
docs, and specs; move the provider mirrors in step.

- **Risk:** Low — pure relocation, no prose change.
- **Verify:** full suite green; `providers/*` mirrors regenerate with no drift.
- **Landed:** commit `e50948e7`.

### Step 2: Split the five largest bodies

`hygiene`, `build`, `implement`, `specify`, `validate` — the four near the hard cap
plus `validate`.

- **Risk:** High — these are the most load-bearing skills in the repo.
- **Verify:** full suite green; the Load Skill Extensions block and dispatch rules
  still present in every body.
- **Landed:** commit `3b95cc23`.

### Step 3: Bring the remaining eleven under the guidance

`plan`, `init`, `review-specs`, `brainstorm`, `write-test`, `retro`, `recover`,
`debug`, `status`, `prototype`, `work`; trim `build`/`implement`/`validate` the rest
of the way.

- **Risk:** Medium — same mechanism, less load-bearing skills.
- **Verify:** all 30 bodies under the guidance; suite green.
- **Landed:** commit `bce79691`.

### Step 4: Stop the conductor re-loading bodies already in context

`/adev:work` Conductor Mode gains an explicit no-re-entry rule (adev-plugin-04jr.1
approach 3).

- **Risk:** Low — additive instruction, no existing behaviour removed.
- **Verify:** `tests/skills/work-no-skill-reentry.test.mjs`.
- **Landed:** commit `25a34fc1`.

### Step 5: Make both limits an authoring-time constraint

Constitution, docs, and a regression guard.

- **Risk:** Low.
- **Verify:** the new guard fails if any body exceeds the guidance.
- **Landed:** commit `61064c9a`.

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

3. **Every pointer is anchored with `<ADEV_ROOT>` and greppable.**
   `` `<ADEV_ROOT>/skills/<name>/references/...` `` — not a bare filename, not a
   path relative to the skill directory, and **not a bare `skills/...` path**.

   The anchor is load-bearing, not cosmetic. A bare `skills/...` path is
   repo-root-relative and nothing anchors it once the skill is installed: cursor
   publishes to `~/.cursor/skills/adev-<name>/` with the directory renamed,
   copilot under `.github/` or `~/.copilot/`, codex to `~/.agents/skills/<name>/`.
   In a user project the agent's cwd is the *project* root, so a bare path
   resolves to nothing — or binds to a same-named file in a project-owned
   `skills/` tree that the pointer prose then tells the agent to treat as the
   authoritative instructions. That is a confused deputy across the
   plugin/project boundary, and it is why the constitution already forbids
   hardcoded install paths.

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

6. **Provider mirrors stay coherent with the bodies they mirror.**
   `scripts/sync-provider-skills.mjs` walks `references/` and `scripts/`
   recursively, so running it is sufficient — do NOT mirror companions by hand.
   `tests/sync/provider-companion-parity.test.mjs` enforces both directions of set
   equality plus pointer resolution inside each mirror tree.

   Historical note, because the failure was subtle: the script always had a
   companion-sync step, but it globbed flat `*.md` at the skill root. Moving
   companions into `references/` made that filter match nothing, silently, while
   the same script kept regenerating mirror bodies full of pointers to them.

7. **The pointer graph is a DAG rooted at each SKILL.md, at most 3 levels deep.**
   A companion may point at another companion — the shipped tree does, e.g.
   `implement/SKILL.md` → `references/repo-mode-advisory.md` →
   `references/steps/step-2-per-task-loop.md` → `references/batched-mode.md` — but
   the graph must stay acyclic and reachable from the body.

   BEH-7's reachability test does not imply this: a mutually-referencing pair
   A↔B satisfies "some file in that skill's surface references it" while being
   both cyclic and unreachable from the body. Depth is bounded because each hop
   is a separate read the agent must decide to make, and a chain deeper than
   three has stopped being disclosure and become indirection.

8. **`.plan.md` files are immutable.** The mechanical path rewrite touched seven of
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
  that section's heading, a one-line summary, and a pointer to the companion by its
  `<ADEV_ROOT>`-anchored full path.
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
- **BEH-8** — **When** a skill gains, loses, or moves a companion, **then** the
  provider mirrors under `providers/*/skills/<name>/` carry the identical
  companion set in the same change, and every pointer in a mirror body resolves
  inside that mirror's own tree.

  Worded around *any* change to the companion set, not just moves. The original
  wording said "when a skill's companions move", which excluded newly *created*
  companions — and creation is exactly how this behavior was first violated: the
  27 relocated companions were mirrored, the 156 created in later steps were not,
  and a guard derived from the original wording would still have missed it.
- **BEH-9** — **When** `/adev:work` has already loaded its own body or a target skill's
  body in a session, **then** it does not re-invoke that skill to advance the arc; it
  continues from the instructions in context or dispatches a subagent.
- **BEH-9a** — **When** the conductor continues in context, **then** reading a companion
  the body points at is a permitted continuation, not a re-entry. Without this,
  BEH-9's first escape contradicts BEH-4: what is in context is the body plus only
  the companions the first branch loaded, so a re-run taking a different branch has
  no in-context instructions and BEH-4 forbids acting from the stub.
- **BEH-9b** — **When** the conductor re-runs a stage, **then** it counts the re-runs
  itself, caps them at 3 per stage per unit of work, and on the third failure stops
  and reports rather than trying again or switching strategy. `build.max_retries`
  and `build.max_review_retries` do NOT bound this path — they are decremented
  inside `/adev:build`'s own state, so a conductor-driven re-run spends none of
  that budget.
- **BEH-9c** — **When** no operator is present (`--intake --file`, or any unattended
  session), **then** the conductor stops at the FIRST failure rather than the third.
  The "propose, don't assume" confirmation gates *invocation*, and an in-context
  continuation is not an invocation, so nothing else would halt a repeat. Arcs that
  genuinely need unattended retries route to `/adev:build`, which has real ceilings
  and `--resume`.
- **BEH-10** — **When** a test asserts on instruction prose, **then** it reads the
  surface (`readSkillSurface`) for content presence, or the specific companion for
  section-scoped and ordering assertions.

### Error Cases

> **This table names the SIGNAL each failure produces, not whether a guard exists
> today.** Guard coverage and open/closed status live in exactly one place — the
> Known-gaps list under Acceptance Criteria. Six findings across five review rounds
> came from this table and that list disagreeing after a fix updated one of them;
> the durable fix is that only one of them carries status at all.


| Condition | Expected behavior | Signal |
|-----------|-------------------|--------|
| A `SKILL.md` exceeds 65,536 bytes | `validateSkillNames()` throws `INVALID_SKILL_FRONTMATTER`; Copilot **install** and its `--dry-run` branch fail (`uninstall`/`status` never call `buildPlan()`) | Exception from `buildPlan()` |
| A `SKILL.md` exceeds the ~5,000-token guidance | `tests/skills/skill-size-cap.test.mjs` fails, naming the skill and its estimated token count | Test failure |
| A body is 90–100% of the hard cap | The existing guard prints a margin note without failing | `console.log` note |
| A body loses its Load Skill Extensions block | `tests/skills-extension-coverage.test.mjs` fails for that skill | Test failure |
| A dispatching skill loses a dispatch-discipline rule | `tests/skills-dispatch-turn-discipline.test.mjs` fails | Test failure |
| A conditional-loading pointer names a file that does not exist | Broken pointer — the agent cannot load the section | `tests/sync/provider-companion-parity.test.mjs` fails, naming the pointer and its missing target |
| A companion exists that nothing references | Dead weight shipped to every consumer | No automated signal — see Known gaps for current status |
| Provider mirror `SKILL.md` drifts from canonical | `tests/sync/provider-skill-parity.test.mjs` fails, naming the drifted files | Test failure |
| A skill declares a `name:` that is not a single path segment | `resolvePublishTarget` throws `SKILL_NAME_UNSAFE`; cursor publishes every other skill and reports this one | Entry in the `failed[]` array returned by `publishSkillsFromCache` — not an exception to the caller, not a test failure |
| A published destination resolves outside the skills root | `resolvePublishTarget` throws `SKILL_PATH_ESCAPE` before any write | Same `failed[]` entry shape |
| Provider mirror *companions* drift | Mirrored prose points at absent files | `tests/sync/provider-companion-parity.test.mjs` fails, naming each unresolved pointer |

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|------------------|
| All 30 skills | High | Bodies split; 16 substantively restructured, all 30 must honour BEH-1..BEH-8 |
| `copilot-provider` | High | Owns the hard cap. Its `skill-validator.mjs` is the enforcement point, unchanged, but the cap is now documented outside it |
| `codex` / `opencode` providers | Medium | Mirror trees carry companions; `sync-provider-skills.mjs` now syncs them recursively, and parity is guarded |
| `cursor-provider` | Medium | Publishes recursively (`cpSync {recursive:true}`), so companions ship — but the published layout is `~/.cursor/skills/adev-<name>/`, which no `<ADEV_ROOT>` value maps a `skills/<name>/references/...` pointer onto. Companions shipping is NOT the same as pointers resolving (BND-2 in the round-1 review); the cursor plugin cache at `~/.cursor/plugins/local/adev/` does hold a conforming `skills/<name>/` tree, and that is the root a cursor-hosted agent must resolve `<ADEV_ROOT>` to |
| Test suite | High | ~25 files rewired; `tests/helpers.mjs` gains the surface readers |
| `governance` (review/validate registries) | Low | The `plugin:` contract is untouched, which is why 22 files did not move — but the contract spans the whole `skills/` tree, so the isolation is empirical, not structural (BND-3) |
| `lib/extensions` | Low | `content-install.mjs` and `install.mjs` resolve `plugin:` URIs against the same tree; no shipped extension names a moved path, but a third-party pack could |

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
   sync for `SKILL.md` *and* every companion under `references/` and `scripts/`.
   Companion parity is guarded by `tests/sync/provider-companion-parity.test.mjs`,
   which checks the property directly rather than by re-running the sync script —
   the pre-existing `provider-skill-parity` test compares the script against its own
   `--dry-run` output, so a sync that copied nothing reported no drift.
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
- [x] Every body retains heading + summary + `<ADEV_ROOT>`-anchored pointer per relocated section (BEH-3), pinned by the anchor sweep in `tests/skills/whole-invocation-rules-in-body.test.mjs`
- [x] Load Skill Extensions block present in all 30 bodies (BEH-6), pinned by `tests/skills-extension-coverage.test.mjs`
- [x] Dispatch-discipline rules present in all 9 dispatching bodies (BEH-6), pinned by `tests/skills-dispatch-turn-discipline.test.mjs`
- [x] `## Prerequisites` in the body for all 21 skills that carry it (BEH-6), pinned by `tests/skills/whole-invocation-rules-in-body.test.mjs` — an earlier version of that guard pinned only 3 of the 21
- [x] Every `<ADEV_ROOT>`-anchored companion pointer in `skills/**` resolves; 0 broken (BEH-7). 193 occurrences naming 190 unique targets, swept by `tests/sync/provider-companion-parity.test.mjs`; earlier figures of "208" and "183" named no scope and were not reproducible (RI-6)
- [x] Mirrors carry the identical companion set — 222 files each in canonical, codex and opencode, counted the way the guard counts (every non-`SKILL.md` file, `agents/` excluded) — and every mirror-body pointer resolves inside its own tree (BEH-8), pinned by `tests/sync/provider-companion-parity.test.mjs` in both set directions
- [x] `/adev:work` carries the no-re-entry rule with a 3-per-stage cap, a stated cap-trip verdict, an unattended stop-at-first-failure default, and the companion-load carve-out (BEH-9, 9a, 9b, 9c), pinned by `tests/skills/work-no-skill-reentry.test.mjs`
- [x] Test assertions follow the prose rather than being weakened (BEH-10)
- [x] Both limits documented in `constitution.md` / `CLAUDE.md` and `docs/skill-reference.md`
- [x] A regression guard fails if any body exceeds the guidance
- [x] All quality gates pass — `npm test` is green on this tree, 0 failures.

      No absolute test count is stated here, deliberately. It drifted in revisions
      3, 4, 5 and 6, every time because a later edit in the same commit moved it
      after it was measured, and every time the response was to promise more care.
      The number also carries nothing a reader needs: "the gates pass" is the claim,
      and the suite's own size is not evidence for it.

      The figures that DO track the tree — the current byte total, the saving, the
      companion count, the pointer counts — are now re-derived by
      `tests/skills/spec-figures-current.test.mjs`, which parses them out of this
      prose and recomputes each from the repository. A stale figure fails the suite
      instead of waiting for a reviewer to do the arithmetic. Baseline values
      (856,056 B and the sixteen "before" sizes) are history and cannot drift, so
      they are not pinned.

- [x] No constitutional violations

**Known gaps — carried, not silently closed:**

- [x] **Invariant 7 is now enforced** by `tests/sync/provider-companion-parity.test.mjs`,
      which walks the pointer graph from every `SKILL.md` and fails on a cycle or a
      chain deeper than 3 hops (closes TERM-3, carried since revision 3). Falsified
      against both modes. It found a real self-loop on its first run:
      `skills/eval/references/default-rubric.yaml` named its own path in its header —
      the same line the round-1 review flagged as stale (BND-4), where the staleness was
      fixed and the self-reference left.
- [x] **`<ADEV_ROOT>` resolution is now stated per surface** in
      `docs/skill-reference.md`. Cursor is the case that catches people: it publishes
      a renamed copy to `~/.cursor/skills/adev-<name>/`, which no root maps a
      `skills/<name>/references/...` pointer onto, but its plugin cache at
      `~/.cursor/plugins/local/adev/` is a full `cpSync` of the plugin root and does
      hold a conforming tree. That is the root a cursor-hosted agent resolves to
      (closes BND-2 from the round-1 review). Still no *substitution* mechanism —
      `<ADEV_ROOT>` is resolved by the agent from documentation, not by code.
- [x] **Both orphan companions resolved**, each on its merits rather than as a batch.
      `charter-reviewer-prompt.md` was a DUPLICATE of the prompt brainstorm Step 6
      already inlines, and the duplicate carried the stale `Task tool (general-purpose)`
      dispatch form that never executes — deleted. It survived because
      `tests/skills-dispatch-turn-discipline.test.mjs` scanned only `SKILL.md` bodies,
      a blind spot THIS refactor created by moving dispatch prose into companions
      without the guard following; that sweep now covers `references/` too.
      `mode-router.md` is self-described design documentation, not a runtime
      companion, and is now referenced as background from `plan/SKILL.md` Step 0.
      Zero markdown companions are unreferenced. The six `write-test/scripts/*` files
      are referenced by relative `bash scripts/...` invocation and by test import.
- [ ] **The token saving is estimated, not measured.** Every figure here is bytes, or
      bytes divided by 4.08. The stored module heuristic warns byte proxies overstate
      savings by 2–2.5x, so these must not be quoted as a measured token or cost
      reduction. What is established: 474,436 fewer bytes enter the context prefix per
      invocation. Settling it needs `adev cost summary --spec <s> --include-checkpoints`
      over one comparable lifecycle before and after — possible now that
      adev-plugin-882a.1 has landed, but not yet run.

**Revision 8 note — the structural fix, not another round of corrections.**

Two defect classes accounted for most findings across five review rounds, and both
were properties of how this document is written rather than mistakes in it:

*Stale figures* (revisions 3-6, one per round). A number was measured, a later edit
in the same commit moved it, and only a reviewer's arithmetic could notice. Now
`tests/skills/spec-figures-current.test.mjs` parses the tree-tracking figures out of
this prose and recomputes each from the repository, so drift fails the suite. Falsified
against all six ways it actually went stale. The suite total was REMOVED rather than
pinned — asserting it from inside the suite is circular and it tells a reader nothing.

*Contradicting sections* (six findings). The Error Cases table and the Known-gaps list
both carried guard status, so every fix had two places to be right and repeatedly hit
one. Status now lives only in Known gaps; the table names the signal a failure
produces and nothing else.

Neither was fixed by more care, which had been tried and failed four times.

**Revision 7 note.** Round 5 returned 2 blockers, both saying revision 5's fix was
cosmetic. The per-surface `<ADEV_ROOT>` table merged codex and opencode into one row
and was wrong for opencode on both counts — it links from an install-time cache at
`~/.config/opencode/plugins/cache/adev/`, into `~/.config/opencode/skills/`, not from
the checkout into `~/.agents/skills/`. And the round-qualified citations added in
revision 5 pointed at the wrong rounds, because the `.review.md` header claimed rounds
were retained verbatim when rounds 2-5 are summaries. Both fixed, and every
round-qualified citation is now verified to resolve against the artifact.

Round 5 also caught that deleting `charter-reviewer-prompt.md` as a "duplicate" was
based on comparing checklist categories, not the whole file: two sections were lost
(a reviewer self-verification step and a 1,500-token output cap) and are restored, and
a dangling reference in an approved charter is repointed.

**Revision 6 note.** Closes the three gaps carried since revision 3, rather than
carrying them a fourth time.

Invariant 7 is now enforced — a pointer-graph walk from every `SKILL.md` failing on
a cycle or a chain past 3 hops, falsified against both. It found a real self-loop on
its first run: `default-rubric.yaml` named its own path in its header, the same line
the revision-3 review flagged as stale where the staleness was fixed and the
self-reference left.

`<ADEV_ROOT>` resolution is stated per surface in `docs/skill-reference.md`. Cursor
was the gap: it publishes a renamed copy to `~/.cursor/skills/adev-<name>/` that no
root maps a pointer onto, while its plugin cache is a full copy of the plugin root
and does conform — that cache is the root a cursor-hosted agent resolves to.

Both orphan companions are resolved on their merits. `charter-reviewer-prompt.md` was
a duplicate of the prompt brainstorm Step 6 already inlines, carrying the stale
`Task tool (general-purpose)` form that never executes; deleted, and the guard that
should have caught it was widened to scan `references/` — it had scanned only
`SKILL.md` bodies, a blind spot this refactor created by moving dispatch prose into
companions without the guard following. `mode-router.md` is design documentation and
is now referenced as background from `plan/SKILL.md`.

**Revision 5 note.** Round 4 blocked on one finding, raised independently by two
reviewers: the regression test written for the round-3 cursor containment fix never
exercised it. The guard is now the exported pure function `resolvePublishTarget`, and
is falsified against three reintroduced defects. Running those probes caught a fourth
vacuous guard in the repair itself — the first version still passed with the allowlist
disabled, because the test never created the skills root, so every input threw for an
unrelated reason. Containment now goes through `realpathSync` (BND-2 in the round-4
review); a lexical check is defeated by a symlinked root.

Also from round 4: the board was brought onto this branch, so the issue ids this spec
cites resolve in the tree it ships in; reviewer finding ids are now qualified by round,
because ids are round-scoped and `BND-4` means different things in rounds 2 and 3; and
the review artifact covers all four rounds rather than round 1 alone.

**Revision 4 note.** Revision 3 was reviewed BLOCK on one finding: BND-4, the cursor
adapter's missing path containment. The reviewer escalated it from a revision-2
suggestion on the grounds that it was neither fixed NOR recorded as a carried gap,
while this refactor's recursive `references/` copy widened what flows through the
unvalidated destination. Both layers are now in place — a single-path-segment
allowlist on the published name, and a containment check on the resolved destination
— with `tests/provider/cursor-path-containment.test.mjs` pinning the reported vector.

Two of the five reviewers returned clean or near-clean: consistency PASS with no
findings, and referent-integrity re-derived every count, byte total, SHA and line
citation independently, all reproducing exactly except the test total. The remaining
notes were a fifth stale "UNGUARDED" row and an off-by-one-segment resolution base.

**Scope of this spec vs the branch.** `chore/skills/progressive-disclosure` also
carries a fix for `adev-plugin-reviewer-tier-not-applied-wohx` — `lib/model-tiers.mjs`,
the resolved `model` field on `adev governance reviewers --json`, and the mandatory
model-passing rule in review-specs Step 4. That work is deliberately NOT covered here:
it is a separate defect with its own issue, and it has no producer or consumer in this
spec's Changes Catalog or Behavioral Contract. Recorded so the uncovered code on the
branch is visible rather than silently unspecced. A reviewer briefed to check it against
this spec correctly declined (WIR-7 in the round-3 review).

**Revision 3 note.** Revision 2 was reviewed BLOCK on two defects, both of which
were the *fixes* from revision 1 landing incompletely: the Target State pointer
template still showed the bare form Invariant 3 forbids (so the spec taught the
failure it prohibits), and four sections still asserted that companion sync was
manual and unguarded — including Invariant 6, which instructed maintainers to
hand-mirror, the exact procedure that produced the revision-1 blocker. Both fixed.

Three guard holes the reviewers proved by probe are also closed: `resolveSkillPointer`
accepted bare pointers silently and is now strict; the mirror parity check asserted
only canonical ⊆ mirror, so a stale mirror copy masked a deleted canonical target,
and it now checks both directions plus canonical-side pointer resolution; and the
Prerequisites guard pinned 3 of the 21 skills that carry the section, now all 21.

Every figure in this revision was measured immediately before writing, against the
tree it ships in. Revisions 1 and 2 both shipped counts that were correct when taken
and stale by the time they landed.

**Revision 2 note.** Revision 1 was reviewed BLOCK — 5 blockers, 13 warnings and
5 suggestions across five reviewers (see the sibling `.review.md`). Two blockers were
defects in the shipped tree rather than in this prose, and were fixed in the code
instead of described away: the provider mirrors were missing 156 companions, and
Invariant 3 mandated an install-unanchored pointer form. Two acceptance criteria in
revision 1 were marked complete and were false; both now carry a guard that makes them
checkable. The rest were stale counts, stale byte figures, and five `Landed:` SHAs
orphaned by the `filter-branch` that re-stamped this branch's `Spec:` trailers — all
corrected against the shipping tree.

**Traceability:** adev-plugin-5yfz.3 (token budgets), adev-plugin-5yfz.4 (layout ruling),
adev-plugin-skill-size-headroom-wnn9 (hard-cap headroom), adev-plugin-04jr.1 (skill-load
dedup, approach 3). Cross-referenced: adev-plugin-gkfv.4 (orchestrator loop norms),
adev-plugin-04jr (token cost epic), adev-plugin-5yfz (skill validation epic).
