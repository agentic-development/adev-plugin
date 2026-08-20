---
spec: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md
plan: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.plan.md
tier: quick
date: 2026-08-20
overall-status: PASS_WITH_NOTES
---

# Validation Report: Refactoring Spec — /adev:issues Lib-Directive Extraction

> **Date:** 2026-08-20
> **Spec:** `.context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md`
> **Plan:** `.context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.plan.md`
> **Rigor tier:** quick (explicit `--tier quick`)
> **Overall Status:** PASS_WITH_NOTES

Registry loaded from `.context-index/governance/validate.yaml` (8 entries, 0 loader warnings).
Gate set resolved via `adev domain load-gates --module cli-driver-surface` — domain `software`
(source level: `default`), 3 gates, 0 warnings. No legacy `gates:` section in `manifest.yaml`.
No `infra_requirements` in the spec, so infrastructure preflight did not run.
Workspace detection: none — repo-scoped validation, no cross-repo `depends-on` references.
Skill extensions: `__NONE__`. Module heuristics: 3 retrieved for `cli-driver-surface` (token
measurement, cache-read cost, summarized skill output) — none bore on this refactor.

**Quick-tier scope.** Check 1 ran with full fail-fast semantics; Checks 2 and 4 ran as one
synthesized compliance pass; Checks 1.5, 1.6, 8, 9 and 14 were skipped by tier. Check 11
evaluated its independent trigger and skipped (no UI files).

---

## Check 1: Quality Gates — PASS_WITH_NOTES

### Check 1a: Fast Tier — PASS

- `test` (`npm test`, severity `error`, `command_sha 527c484b…`): **PASS** (42.6s) — 6971 tests,
  6969 pass, 0 fail, 0 skipped, 2 todo, 997 suites.
- `quality-gate` (`npm test`, severity `error`, `command_sha 527c484b…`): **PASS** (44.7s) —
  identical counts. This gate declares the same argv as `test`; both were executed rather than
  deduplicated, since a recorded outcome must correspond to an execution that happened.

### Check 1b: Integration Tier — WARN (non-blocking)

- `integration-test` (`npm run test:evals`, severity `warning`, `command_sha 9e6a54d2…`):
  **FAIL** (exit 1) — 391 tests, 366 pass, 25 fail, 0 skipped, 0 todo.

  Severity is `warning`, so this does not block. The 25 failures fall in two clusters, neither
  touched by this implementation:

  - `tests/evals/configurable-governance/{configurable-governance,tier1-library,tier2-dispatch-shape,tier3-live}.test.mjs`
    — review-specs governance registries, reviewer profiles, context-pack fencing.
  - `tests/evals/integration-sandbox/{build-with-db,build-without-db,reality-check}.test.mjs`
    — require PostgreSQL on port 5433. Verified closed (`nc -z localhost 5433` fails), which is
    the intended hard-fail behavior for the infra-dependent sandbox rather than a code defect.

  `git log --oneline ddc223f4~1..HEAD -- tests/evals/` returns no commits: no eval file was
  touched by the implementation range, so these failures are pre-existing and environmental.

### Check 1c: E2E Tier — SKIP

- e2e tier — no gates configured, skipped.

### Tier summary

| Sub-check | Gate | Tier | Severity | Verdict | Duration |
|---|---|---|---|---|---|
| 1a | `test` | fast | error | PASS | 42.6s |
| 1a | `quality-gate` | fast | error | PASS | 44.7s |
| 1b | `integration-test` | integration | warning | FAIL | ~90s |
| 1c | — | e2e | — | SKIP (none configured) | — |

Per-gate outcomes were attested once for the whole check via
`adev report --type validator --validator validate.check-1-quality-gates --gate-outcomes …
--manifest-sha 90e6843`. No other check emitted `gate_outcomes`.

Fast tier passed, so validation proceeded to the compliance pass.

---

## Check 1.5: Source Manifest Verification — SKIP

Skipped — quick rigor tier. (The spec does carry a `source-manifest` block, `sha: 90e6843`,
23 files, computed 2026-08-20T03:07:08.408Z; it was used as the declared-scope baseline by
Check 2's scope-expansion sub-finding, but the SHA verification itself did not run.)

## Check 1.6: Code-Side Drift Warning — SKIP

Skipped — quick rigor tier.

---

## Check 2: Spec Compliance — PASS_WITH_NOTES

Run as the first half of the quick-tier synthesized compliance pass. Every verdict below is
grounded in source and test files read during this validation run; no plan-file `[x]` checkbox
was used as evidence.

### Acceptance Criteria

- **All current tests pass without modification (INV-1)** — PASS. `node --test` over the 10
  changed test files plus `tests/skills-extension-coverage.test.mjs` returned 137 pass / 0 fail.
  Every test path in the diff is a new file; no pre-existing test was modified.
- **Every one of the 16 directive sites in `skills/issues/SKILL.md` names a verb, or sits in the
  descriptive API-reference section** — PASS. All 296 lines read. Every H3 under `## Process`
  (lines 45–275) opens with a fenced `bash` block naming `adev issues <sub>`. The only lib names
  left are under `## API reference` (`skills/issues/SKILL.md:286-296`), prefaced by
  "**Descriptive only — do not call these directly.**" (`:288`). Pinned by
  `tests/skills/issues-skill-verb-coverage.test.mjs:98-105`.
- **The fenced JavaScript block at lines 49-63 is gone** — PASS. `skills/issues/SKILL.md:49-51`
  is now a ```` ```bash ```` block invoking `adev issues board`. No ```` ```javascript ```` or
  ```` ```js ```` fence remains anywhere in the file; asserted at
  `tests/skills/issues-skill-verb-coverage.test.mjs:93-96`.
- **Each new verb has tests covering its success path, its refusal path, and its exit code** —
  PASS. `board` — `tests/cli/issues-board.test.mjs:70-116` (no exit-2 path; read-only by
  construction, documented `lib/cli/issues-board.mjs:14-16`). `list`/`ready` —
  `tests/cli/issues-list.test.mjs:86-228`, exit 1 at `:224-228`. `update`/`close`/`dep` —
  `tests/cli/issues-mutate.test.mjs:84-280`, exit 2 at `:86` and `:178`, exit 1 at
  `:98`/`:198`/`:268`. `epic` — `tests/cli/issues-epic.test.mjs:74-197`. `milestone` —
  `tests/cli/issues-milestone.test.mjs:118-219`, exit 2 in four distinct refusal shapes.
- **At least one test creates or mutates the board from a linked worktree and asserts the main
  checkout's board changed (BEH-1)** — PASS. `tests/cli/issues-worktree-storage.test.mjs:109-133`
  runs `create` from `wt/`, asserts `readBoard(root).issues` gained the id (`:121`) and that
  `existsSync(join(wt, BOARD_REL))` is `false` (`:128`). A second suite (`:179-199`) covers the
  git-tracked shadow-board case and asserts the frozen worktree copy is byte-unchanged (`:188`).
  There is no skip branch; the in-file comment at `:29-30` states this deliberately.
- **`adev issues <sub> --help` prints the sub-verb's usage for every sub-verb (BEH-8)** — PASS.
  `tests/cli/issues-help-routing.test.mjs:124-149` reads the sub-verb list back off
  `issues --help` and asserts each one's own `usage:` line, so a future unwired sub-verb fails on
  landing. Backed by `mod.dispatchesSubcommandHelp !== true` at `cli/index.mjs:1975-1979` and
  `export const dispatchesSubcommandHelp = true` at `lib/cli/issues.mjs:33`.
- **`docs/cli-reference.md` documents every new sub-verb** — **PARTIAL**. `docs/cli-reference.md:527-537`
  documents `board`, `create`, `epic`, `update`, `close`, `dep`, `list`, `ready`; `:541-546`
  covers `milestone create|list|ship|defer`; `:549-556` adds the uniform exit-code table.
  Gap: `:529` gives `epic <title> [--milestone <name>] [--json]` and omits `--plan-ref`, which
  `lib/cli/issues-epic.mjs:38` declares and which `tests/skills/epic-creation-verb-coverage.test.mjs:77-87`
  makes mandatory on every skill's epic call. See Finding 3.
- **Provider mirrors regenerated; parity test passes** — PASS.
  `node --test tests/sync/provider-skill-parity.test.mjs` → 1 pass / 0 fail
  ("provider skill mirrors are in sync with canonical skills/ (no drift)").
- **`hooks/pre-commit-no-inline-node.sh` passes** — PASS. Script inspected first
  (`hooks/pre-commit-no-inline-node.sh:1-40`; only `git diff --cached` / `git show` reads, and
  the sole `>` in the file is a `>&2` at `:250`), then executed: exit 0.
- **All quality gates pass (`npm test`)** — PASS. See Check 1a.
- **No constitutional violations introduced** — PASS. See Check 4.

### Behavioral Contract

- **BEH-1** (worktree resolution) — PASS. `tests/cli/issues-worktree-storage.test.mjs:109-133`,
  `:179-199`. Every verb obtains storage via `getIssueManager()`: `lib/cli/issues-board.mjs:62`,
  `issues-list.mjs:111,173`, `issues-mutate.mjs:171,234,257`,
  `issues-milestone.mjs:131,160,199,304`, `issues-create.mjs:126`, `issues-epic.mjs:102`.
- **BEH-2** (board → stdout, no disk write) — PASS. `lib/cli/issues-board.mjs:81-83` prints only;
  `writeTasksMd` is deliberately not imported (`:14-16`). Asserted at
  `tests/cli/issues-board.test.mjs:70-85`, including byte-identity with `renderTasksMd()` (`:78`).
- **BEH-3** (ready = open issues with every dependency closed) — PASS. Filter at
  `lib/cli/issues-list.mjs:188-196`; asserted at `tests/cli/issues-list.test.mjs:86-121`
  (excludes a blocked issue, includes it once the blocker closes) and `:95-102` (never lists
  in_progress / closed / deferred).
- **BEH-4** (close blocked → exit 2, names blockers) — PASS. `lib/cli/issues-mutate.mjs:73-81`
  maps `BLOCKED_BY_DEPENDENCIES` / `CASCADE_BLOCKED` to 2 and prints every blocker;
  `tests/cli/issues-mutate.test.mjs:84-94` asserts exit 2, both blocker ids, and
  `status === "open"` afterwards.
- **BEH-5** (dep cycle → exit 2, reports the cycle) — PASS. `CIRCULAR_DEPENDENCY` is in
  `GUARD_CODES` (`lib/cli/issues-mutate.mjs:43`); `tests/cli/issues-mutate.test.mjs:174-186`
  asserts exit 2, `/[Cc]ircular/`, both ids, and `dependencies === []` afterwards.
- **BEH-6** (update resolves epic-vs-issue by lookup, not by id prefix) — PASS.
  `lib/cli/issues-mutate.mjs:170-176` calls `manager.get(id)` then falls back to `listEpics()`;
  no prefix inspection anywhere in the file. `tests/cli/issues-mutate.test.mjs:230-243` drives
  both id kinds through the same argv shape.
- **BEH-7** (`milestone ship` ALWAYS passes a `confirmFn`) — PASS, mechanism verified.
  `lib/cli/issues-milestone.mjs:195` is an unconditional
  `const confirmFn = async () => Boolean(yes);`, spread into the single `milestoneShip` call at
  `:200-205`. There is no `yes ? fn : undefined` branch in the file. The mechanism — not merely
  the outcome — is pinned by `tests/cli/issues-milestone.test.mjs:236-308`, which intercepts
  `lib/milestones.mjs` via `registerHooks` and asserts `confirmType === "function"` **and**
  `confirmResolved === false/true` in **both** branches (`:292-293`, `:304-305`). This is the
  correct guard: an absent callback would let `lib/milestones.mjs`'s
  `confirms.length > 0 && options.confirmFn` skip confirmation and ship.
- **BEH-8** (sub-verb `--help`) — PASS. See acceptance criteria. Second-level
  `issues milestone <sub> --help` is separately covered
  (`tests/cli/issues-help-routing.test.mjs:100-109`), and the `milestone` branch deliberately
  forwards `--help` untouched (`lib/cli/issues.mjs:97-106`).
- **BEH-9** (every executable step names a verb; lib names only in the API reference) — PASS.
  Verified by reading the whole SKILL.md; enforced by
  `tests/skills/issues-skill-verb-coverage.test.mjs:98-128`, which splits on `## API reference`,
  asserts nine lib symbols are absent from the body, and sweeps H3-by-H3 with exactly one named
  exemption (`Backend Resolution`, `:41-49`).

### Invariants

- **INV-1** — PASS. See above; no pre-existing test file modified.
- **INV-2** (storage only via `getIssueManager()`) — PASS.
  `grep -n "\.beads\|tasks\.json\|milestones\.json" lib/cli/issues-*.mjs` returns only
  comment / help-string lines (`issues-board.mjs:8`, `issues-create.mjs:8`, `issues-list.mjs:10`,
  `issues-mutate.mjs:11`, `issues-milestone.mjs:352`, plus pre-existing
  `issues-migrate.mjs:134,225`). No `readFileSync` / `join` against a store path in any new verb;
  milestone JSON I/O stays inside `lib/milestones.mjs` (`lib/cli/issues-milestone.mjs:46-52`).
- **INV-3** (no section carries both a lib directive and a verb) — PASS.
  `bash hooks/pre-commit-no-inline-node.sh` exits 0, and
  `tests/skills/issues-skill-verb-coverage.test.mjs:98-105` proves no lib name survives in the
  body at all.
- **INV-4** (no verb exposes `--plan-task`) — PASS. `grep -rn "plan-task" lib/cli/issues-*.mjs`
  returns only two prose lines stating its absence (`lib/cli/issues-create.mjs:16`, `:169`). No
  `OPTIONS` table declares it: `issues-create.mjs:33-50`, `issues-epic.mjs:40-48`,
  `issues-mutate.mjs:45-57`, `issues-list.mjs:37-46`, `issues-board.mjs:30-33`,
  `issues-milestone.mjs:71-84`.
- **INV-5** (2 = guard refusal, 1 = usage/adapter, 0 = success) — PASS. Mapping centralised at
  `lib/cli/issues-mutate.mjs:70-85` (`GUARD_CODES` at `:43`) and
  `lib/cli/issues-milestone.mjs:246-286` (every `reportRefusal` branch returns 2) versus
  `reportThrow` → 1 (`:93-97`). The returned code reaches the process: `cli/index.mjs:2007-2010`
  assigns `ret` to `returnCode` and `:2011` calls `process.exit(returnCode)`. Tests pin the codes
  at the real CLI boundary via `spawnSync`
  (`tests/cli/issues-mutate.test.mjs:86,98,143,178,198,226,268,277`;
  `tests/cli/issues-milestone.test.mjs:125,140,163,190,206,216`).
- **INV-6** (`adev status --render` still writes `tasks.md`; `adev issues board` never writes) —
  PASS. `cli/index.mjs:1508` still calls `await writeTasksMd(cwd)` under `--render`;
  `tests/cli/issues-board.test.mjs:81-85` asserts `tasks.md` does not exist after running `board`.
  Documented at `docs/cli-reference.md:565-570`.
- **INV-7** (Load Skill Extensions block survives) — PASS. `skills/issues/SKILL.md:37-43` carries
  `adev skill-ext load --skill issues` plus the required framing sentence verbatim;
  `tests/skills-extension-coverage.test.mjs` passed, and
  `tests/skills/issues-skill-verb-coverage.test.mjs:135-137` pins it independently.

### Error Cases (spec exit-code table)

| Condition | Verdict | Evidence |
|---|---|---|
| Missing required positional | PASS | `issues-mutate.mjs:102-105`, `issues-milestone.mjs:114-117`, `issues-epic.mjs:90-98` → 1; tested `tests/cli/issues-mutate.test.mjs:204-208`, `tests/cli/issues-milestone.test.mjs:385-388`, `tests/cli/issues-epic.test.mjs:193-197` |
| Unknown sub-verb | PASS | `lib/cli/issues.mjs:150-152` prints `unknown issues subcommand: <s>` + `help()` → 1; tested `tests/lib/cli-issues-migrate.test.mjs:121-130` |
| `--priority` outside 0-4 | PASS | `issues-create.mjs:119-122` and `issues-mutate.mjs:152-158` both emit `invalid --priority: <v>. Valid: 0-4` → 1; tested `tests/issues/cli-create.test.mjs:121-125` |
| Close blocked by unclosed dependencies | PASS | exit 2 — `tests/cli/issues-mutate.test.mjs:84-94` |
| Dependency would create a cycle | PASS | exit 2 — `tests/cli/issues-mutate.test.mjs:174-186` |
| `milestone ship` without `--yes` | PASS | exit 2, file byte-compared before/after — `tests/cli/issues-milestone.test.mjs:118-128` |
| `ship` with failing auto-check criteria | PASS | exit 2, `shipped:false`, unchanged file — `tests/cli/issues-milestone.test.mjs:148-168` |
| `ship` gate evaluation times out | PASS | exit 2, gate id + `750` budget named — `tests/cli/issues-milestone.test.mjs:170-198`. The verb matches `/ETIMEDOUT\|timed out\|timeout/i` at `issues-milestone.mjs:275` rather than relying on the lib's unreachable classification, correctly routing around known `issue-qo9jn8` |
| `ship` confirmation rejected | PASS | exit 2, `confirmRejected` named — `tests/cli/issues-milestone.test.mjs:130-146` |
| Adapter throws | PASS | `<CODE>: <message>` → 1 — `issues-board.mjs:66`, `issues-list.mjs:115,177`, `issues-mutate.mjs:83`, `issues-milestone.mjs:95`; tested `tests/cli/issues-milestone.test.mjs:213-219` (`MILESTONE_NOT_FOUND`) |
| Issue id not found | PASS | `NOT_FOUND: <id> not found …` → 1 — `issues-mutate.mjs:182`; tested `tests/cli/issues-mutate.test.mjs:96-101, 197-202, 275-280`, which explicitly assert **1, not 2** |

### Test Integrity — no anti-patterns found

Files read in full: `tests/cli/issues-board.test.mjs`, `issues-list.test.mjs`,
`issues-milestone.test.mjs`, `issues-mutate.test.mjs`, `issues-worktree-storage.test.mjs`,
`issues-help-routing.test.mjs`, `tests/skills/issues-skill-verb-coverage.test.mjs`,
`tests/skills/epic-creation-verb-coverage.test.mjs`. Assertion lists read for
`tests/cli/issues-epic.test.mjs` and `tests/issues/cli-create.test.mjs`.

Positive signals, rather than gaps:

- No `if (…) return` or try/catch skips around assertions anywhere.
  `tests/cli/issues-worktree-storage.test.mjs:29-30` states in-file that there is deliberately no
  "skip when git worktree is unavailable" branch.
- Exit codes are pinned with exact `assert.equal(r.status, N)`, never `>= 0` or truthiness.
- Refusal tests assert the negative too — board byte-unchanged
  (`issues-milestone.test.mjs:127,144,166,194`) or status still `open`
  (`issues-mutate.test.mjs:93,110,147,272`).
- Seed data is deterministic (ids captured from `create()` return values), never sampled from the
  live board.
- Two guards against vacuous passes: `issues-worktree-storage.test.mjs:144-149` checks specific
  ids after the byte-equality comparison so two empty renders cannot pass, and
  `issues-help-routing.test.mjs:127` asserts the parsed sub-verb list has at least 13 entries
  before looping.
- The one deliberately loose matcher, `issues-milestone.test.mjs:143`
  (`/reject|refus|not confirmed|unconfirmed|pending/i`), is paired with an exact assertion on the
  confirm text at `:142` and an exact exit code at `:140`, so it cannot carry a pass alone.
- `issues-help-routing.test.mjs:133` exempts `migrate` from the lowercase-`usage:` convention
  **by name** rather than loosening the regex for the other twelve.

### Scope Expansion Sub-Finding — DETECTED (severity: warning)

Eight implementation files changed in `ddc223f4..HEAD` are absent from the spec's authoritative
`source-manifest.files` (`issues-skill-lib-directive-extraction.spec.md:15-38`):

- `providers/codex/skills/{issues,plan,implement,reconcile}/SKILL.md`
- `providers/opencode/skills/{issues,plan,implement,reconcile}/SKILL.md`

The manifest lists the canonical `skills/{issues,plan,implement,reconcile}/SKILL.md` (`:25-28`)
but no `providers/**` path. The spec body does authorize the work — Migration Path Step 5
(`:208`, "Regenerate provider mirrors") and the acceptance criterion at `:270` — and the
frontmatter comment at `:56-63` records that the charter's Out-of-Scope entry is stale. This is
frontmatter/body inconsistency, not unauthorized work.

Recommended action: update the spec's `source-manifest.files` to include the eight
`providers/*/skills/*/SKILL.md` paths, so the declared scope matches Step 5 and the acceptance
criterion that already require them.

## Cross-Repo Dependency Validation — N/A

No workspace detected and no cross-repo `depends-on` references.

---

## Check 4: Constitution Compliance — PASS

Run as the second half of the quick-tier synthesized compliance pass. Every finding below,
PASS included, carries evidence per the check's symmetric evidence-citation contract.

- **Architecture boundaries: PASS**
  - No new skill in the lifecycle order — `git diff --name-only ddc223f4..HEAD` adds no
    `skills/<new>/` directory; only four existing SKILL.md files are modified
    (`constitution.md:75`).
  - Hook protocol unchanged — `git diff ddc223f4..HEAD -- hooks/ .claude-plugin/ install/`
    is empty (`constitution.md:76,78`).
  - CLI installation path structure unchanged — same empty diff over `install/`; no new
    top-level `VERB_REGISTRY` entry (`cli/index.mjs:1908`'s `["issues", …]` is pre-existing and
    unchanged in the range) (`constitution.md:77`).
  - No external dependency added — `package.json` has zero diff in the range; `dependencies`
    remains `{tree-sitter-typescript, web-tree-sitter}` and `devDependencies`
    `{@dotenvx/dotenvx, typescript}` (`constitution.md:79`).
  - No version bump — `git diff ddc223f4..HEAD -- package.json .claude-plugin/plugin.json
    .cursor-plugin/plugin.json` is empty, satisfying the release-please rule in CLAUDE.md.
- **Non-negotiable principles: PASS**
  1. *Minimize external dependencies* (`constitution.md:12`) — every new verb imports only
     `node:util`'s `parseArgs` plus relative lib paths: `issues-board.mjs:23-26`,
     `issues-list.mjs:26-29`, `issues-mutate.mjs:31-34`, `issues-milestone.mjs:43-52`,
     `issues-epic.mjs:33-35`. No third-party import in any of them.
  2. *Skills are primarily markdown* (`constitution.md:13`) — each rewritten H3 keeps prose
     describing what the step does around the verb line: `skills/issues/SKILL.md:53-63` (board
     semantics and ordering rules), `:90-92` (why `epic` is not `create --type epic`), `:109-111`
     (lookup resolution, field ownership, the `--status closed` redirect), `:235-237` (the
     confirmation protocol). No section is a bare verb line.
  3. *Pure ESM* (`constitution.md:14`) — `grep -n "require(\|module.exports" lib/cli/issues-*.mjs`
     returns no matches; all six files use `import` / `export`.
  4. *Hook protocol compliance* (`constitution.md:15`) — no hook file changed (empty diff over
     `hooks/`); `hooks/pre-commit-no-inline-node.sh` still exits 0 on the current tree.
  5. *Version parity* (`constitution.md:16`) — `package.json`, `.claude-plugin/plugin.json` and
     `.cursor-plugin/plugin.json` all read `0.28.0-next.3`.
- **Coding standards: PASS**
  - camelCase functions/variables — `runUpdate`, `runClose`, `runDep`, `reportFailure`,
    `parseFor` (`issues-mutate.mjs:115,220,250,70,93`); `byPriority`, `printTable`, `runReady`
    (`issues-list.mjs:52,68,155`); `reportRefusal`, `safeFindMilestone`
    (`issues-milestone.mjs:246,226`).
  - kebab-case files — `issues-board.mjs`, `issues-create.mjs`, `issues-epic.mjs`,
    `issues-list.mjs`, `issues-milestone.mjs`, `issues-mutate.mjs`.
  - Node built-ins before relative imports — `issues-milestone.mjs:43` (`node:util`) then
    `:45-52`; same shape at `issues-list.mjs:26/28-29`, `issues-mutate.mjs:31/33-34`,
    `issues-board.mjs:23/25-26`.
  - Fatal errors exit 1 — every verb returns 1 and `cli/index.mjs:2011` converts it via
    `process.exit(returnCode)`; guard refusals return 2 by design (INV-5).
- **Anti-patterns: PASS**
  - No inline-Node directives in SKILL.md (`constitution.md:66`) —
    `bash hooks/pre-commit-no-inline-node.sh` exits 0; no `Run inline Node`, `node -e`, or
    heredoc appears in `skills/issues/SKILL.md` (read in full).
  - No both-forms H3 section (`constitution.md:67`) — the same hook's blob-based check passes,
    and the body carries no lib name at all
    (`tests/skills/issues-skill-verb-coverage.test.mjs:98-105`).
  - Fenced JavaScript descriptive-only (`constitution.md:68`) — this is the rule the spec exists
    to close. `skills/issues/SKILL.md` now has zero ```` ```javascript ```` fences (asserted
    `issues-skill-verb-coverage.test.mjs:93-96`), and the surviving lib names sit under
    `## API reference` behind the explicit "Descriptive only — do not call these directly."
    framing (`SKILL.md:288`).
  - Load Skill Extensions block (`constitution.md:69`) — retained at `SKILL.md:37-43`.
  - No hardcoded `~/.claude/` paths (`constitution.md:65`) —
    `grep -n "~/.claude" lib/cli/issues-*.mjs skills/issues/SKILL.md` returns no matches.
- **Commit trailers: PASS** — `git log --format='%H%n%B' ddc223f4..HEAD` shows every
  implementation commit carrying
  `Spec: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md`,
  plus `Plan-task:` where applicable (`a0952b9c` → `Plan-task: 4`, `c4520e94` → `Plan-task: 9`)
  and the manifest-required `Author-type:` / `Operator:`.

---

## Check 8: Boundary Compliance — SKIP

Skipped — quick rigor tier.

## Check 9: Transition Gates — SKIP

Skipped — quick rigor tier. (Check 1 did emit the `implement-to-validate` attestation this
transition would read: `gate_outcomes` for all three gates, stamped with `--manifest-sha 90e6843`.)

## Check 11: Visual Verification — SKIP

No UI files in the implementation diff — visual verification not applicable. Case A of the
trigger-guard matrix: `git diff --name-only ddc223f4..HEAD` matched against
`*.tsx|*.jsx|*.vue|*.svelte|*.css|*.scss|*.html` and `components/|pages/|views/|public/`
returned nothing; Playwright MCP is not available either.

## Check 14: Gate Executability — SKIP

Skipped — quick rigor tier.

---

## Findings

None of the five findings is a behavioral defect; all are documentation or scope-declaration
drift. Per the validation-step scope constraint, none was repaired — the operator decides.

1. **[warning] Scope declaration lags the body.** Eight `providers/*/skills/*/SKILL.md` files
   changed but are missing from `source-manifest.files`
   (`issues-skill-lib-directive-extraction.spec.md:15-38`), even though Migration Path Step 5
   (`:208`) and an acceptance criterion (`:270`) mandate regenerating them.
   Fix: add the eight paths to the frontmatter.
2. **[warning] The spec body was never reconciled with the shipped design.** The charter records
   the deviation (`charter.md`, "Implementation note (2026-08-20)"), but the spec still says
   `--epic <id>` and `--milestone <name>` land on `adev issues create` (`:162`), with no
   `issues-epic.mjs` row in the Target State table (`:127-137`); `create --milestone` is in fact
   refused with exit 1 (`lib/cli/issues-create.mjs:107-116`). Two smaller staleness points in the
   same catalog: `update` is specified with `--next-action` and `--json` (`:155`) but implements
   `--notes` and no `--json` (`issues-mutate.mjs:45-51`), and `close`/`dep`/`milestone
   list|ship|defer` are specified with `[--json]` (`:156-161`) that no verb implements —
   `docs/cli-reference.md:558` documents the true, narrower `--json` surface.
   Fix: update the spec's Target State and Changes Catalog to match what shipped.
3. **[warning] `docs/cli-reference.md:529` omits `--plan-ref` from the `epic` signature**, though
   `lib/cli/issues-epic.mjs:38` declares it and
   `tests/skills/epic-creation-verb-coverage.test.mjs:77-87` requires every epic-creating skill
   to pass it. A reader following the docs would mint a duplicate epic on every run — the exact
   failure that commit `a0952b9c` was written to fix.
4. **[info] Stale contract comment.** `lib/cli/issues.mjs:14-19` states "The CLI dispatcher does
   not honor the return value (it always exits 0 …), so non-zero exits also call
   `process.exit(code)` directly." Both halves are false today: `cli/index.mjs:2007-2011`
   propagates the returned code, and no `issues-*.mjs` calls `process.exit`. Pre-existing (the
   block predates this range), but the surrounding header was rewritten in this range without
   correcting it.
5. **[info] `.context-index/manifest.yaml:10` sets `adev_version: "0.28.0-next.4"`** while all
   three plugin manifests read `0.28.0-next.3`. Artifact-path only, and outside the "no version
   bump" rule, but the value does not correspond to a released version.

### Pre-existing issues already on the board (context, not new work)

- `issue-1vwwea` — `milestoneShip` never closes a shipped milestone's epic on the json backend
  (`lib/milestones.mjs:942`).
- `issue-qo9jn8` — gate-timeout classification unreachable on Node 24 (`lib/milestones.mjs:668`).
  Note that `lib/cli/issues-milestone.mjs:275` already routes around it.
- `issue-l1efc1` — `adev <verb> --json` truncates at 64 KiB when piped (`cli/index.mjs:2011`).

### Charter capability map

No capability row was updated. The spec carries `charter-extension: true` and records in its own
frontmatter comment (`:44-55`) that no existing row in `cli-driver-surface/charter.md` names
prose-level lib-directive extraction; the "Inline-Node extraction sweep" row (`charter.md:90`) is
already `implemented` and covers a different pattern class. Adding a
"Lib-directive extraction (prose-level)" row is a charter change and belongs to
`/adev:brainstorm`, per the spec's own note.

---

**Summary:** 3 checks ran, 3 passed (Check 1 PASS_WITH_NOTES, Check 2 PASS_WITH_NOTES,
Check 4 PASS), 0 failed, 6 skipped (1.5, 1.6, 8, 9, 14 by quick tier; 11 by its own no-UI
trigger). 3 warning-severity and 2 info-severity findings recorded, none blocking.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI
> files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — ADR compliance (formerly Check 5), cross-cutting compliance (formerly
>   Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3,
>   now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — lifecycle reconciliation (formerly Check 12).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — heuristic extraction (formerly Check 13),
>   now a non-blocking Stop-event hook.
