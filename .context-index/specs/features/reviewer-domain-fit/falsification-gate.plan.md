<!-- partial_schema: plan@1 -->

# Implementation Plan: Falsification Gate

> **Methodology:** adev
> **Charter:** .context-index/specs/features/reviewer-domain-fit/charter.md
> **Spec:** .context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-18, revision 6, manual operator approval)
> **Platform:** CLI tool (no framework), Node.js (ESM), `node:test`, npm

**Goal:** Run the one-shot falsification experiment that decides, on evidence, whether a
`referent-integrity` reviewer catches known defects the current review panel would miss —
the gate that determines whether the reviewer-domain-fit initiative's Phase 2 (panel and
prompt retargeting) is unblocked, stopped, or left INCONCLUSIVE.

**Architecture:** This spec is `kind: action` — its contract is Postconditions + Procedure +
Idempotency + Rollback, not Behaviors, and DONE is a recorded verdict, not new production
code (Postcondition 6, and the global acceptance criterion that `git diff --stat` against the
branch point stays confined to `.context-index/`). Per the reviewing operator's explicit
guidance, this plan departs from the skill's default template in exactly one place: task
verification does not create `node:test` files. A global acceptance criterion requires
`npm test` and `adev diagnose` to be UNAFFECTED by this work — a new test file would itself
be a leak outside `.context-index/`. Each task's `**Tests:**` field instead names the concrete
CLI command(s) and expected output that verify the task's postcondition, following the same
write-failing-check → do-the-work → write-passing-check rhythm as TDD, just without a
`node:test` artifact. The six tasks below map 1:1 onto the spec's six Procedure steps, in the
same order; each task's verification list is drawn from the Acceptance Criteria that step is
responsible for satisfying. `.context-index/manifest.yaml` declares `specialists: []`, so
every task is tagged `[specialist: none]`.

An epic already exists 1:1-bound to this spec: `adev-plugin-j7pq.5.1` ("Falsification gate:
does a referent-integrity reviewer catch known defects?"), created by `/adev:specify`. This is
not one of the six tasks below — it is handled by `/adev:plan`'s own Execution Handoff step
(the skill's Step 7, external to this document): rather than creating a duplicate epic for this
plan, that step reuses `adev-plugin-j7pq.5.1`.

---

## File Structure

**Create:**
- `.context-index/prompts/referent-integrity.md` — the reviewer prompt (Procedure Step 2)
- `.context-index/research/referent-integrity-falsification/mapping-table.md` — Postcondition 2
  resolution table: id → spec path, pre-fix SHA, fixing commit, or `UNMAPPED` + reason
  (Procedure Step 1)
- `.context-index/research/referent-integrity-falsification/<id>.review.md` — one preserved
  `.review.md` copy per MAPPED id (e.g. `he2.review.md`, `r5sc.review.md`, `zx5.review.md`,
  `rftq.review.md`, `ysqd.review.md` — the actual set depends on Task 1's mapping result)
  (Procedure Step 4)
- `.context-index/research/referent-integrity-falsification/run-log.md` — per-run resolved
  project root, resolved plugin root, pack-glob-match confirmation, and dispatched-reviewer
  confirmation, one row per run (Procedure Step 4, Acceptance Criteria on project root /
  plugin root / pack verification)
- `.context-index/research/referent-integrity-falsification/scoring.md` — Procedure Step 5
  judgements (defect named, citation resolves) and the raw tally (Postcondition 3)
- `.context-index/research/referent-integrity-falsification-2026-08.md` — the finding
  (Procedure Step 6, Postcondition 5 — exact path fixed by the spec)

**Modify:**
- `.context-index/governance/review.yaml` — add the `referent-integrity` reviewer entry and
  the `referent-integrity-pack` entry under `context_packs:` (Procedure Step 3)
- `.context-index/specs/features/reviewer-domain-fit/charter.md` — tick the three Phase 1
  acceptance-criteria checkboxes once Task 6 records the verdict (Migration Plan > Evidence
  track > Phase 1)

**Reference (read, do not modify):**
- `lib/governance/review-config.mjs:79,108` — `loadReviewConfig` reads `review.yaml` from the
  run's project root; `:196-201` — a pack that fails to resolve is silently `continue`d past
- `lib/governance/context-pack.mjs:102-117` — `resolveExtends`, where `UNKNOWN_CONTEXT_PACK` is
  actually raised; `:227` — `renderPack` (NOT the raise site); `:349` — glob expansion against
  `ctx.repoRoot`
- `lib/profiles/index.mjs` — `getPluginRoot()` derivation (two levels up from its own module
  location)
- `skills/review-specs/SKILL.md` Step 4 — tier dispatch (`quick` skips the registry loop
  entirely); the skill also documents `adev gate require --skill review-specs --spec <path>`
- `lib/cli/heuristics.mjs:76-78,282` — `adev heuristics signature --origin review-specs
  --blocker-id <id>` usage, the non-hash-computing alternative Procedure Step 2 requires
- Existing bundled reviewer prompts (`plugin:review-specs/structural-architect-prompt.md`,
  `security-reviewer-prompt.md`, `consistency-analyzer-prompt.md`) — structural reference for
  prompt shape only; `referent-integrity`'s scope is unrelated to theirs
- `.context-index/governance/review.yaml` (current 3-reviewer registry) — pattern for the new
  entry's schema (`id`, `dispatch`, `profile`, `prompt`, `severity_cap`, `context_pack`)

---

## Context Packets

### Task 1 Context (Procedure Step 1)
- Spec: `falsification-gate.spec.md` — Procedure Step 1, Postcondition 2, Postcondition 4
  (denominator), Acceptance Criteria: resolution table records all five ids; mapping table
  committed before Step 4; reviewed commit is an ancestor of the fixing commit
- Charter: `charter.md` (Migration Plan > Evidence track > Phase 1 — the exact five ids and the
  3-of-5 exit condition)
- Issue board: `br show adev-plugin-he2`, `adev-plugin-r5sc`, `adev-plugin-zx5`,
  `adev-plugin-rftq`, `adev-plugin-ysqd` — close reasons name fixing commits directly for at
  least two (`r5sc`: `0476a7bc`, `8d8d5c5a`; `ysqd`: `11b179d7`)
- Git history: `git log --all --oneline --grep <id>` per id, and `git show <sha>^` for each
  fixing commit's first parent (the pre-fix revision)

### Task 2 Context (Procedure Step 2)
- Spec: Procedure Step 2 (scope: enumerate every referent a spec names — CLI flags, verbs,
  functions, files, error codes, event fields, config keys), Constitution anti-pattern (no
  hand-computed hashes — reviewers run `execute: deny`)
- `lib/cli/heuristics.mjs:76-78,282` — exact `adev heuristics signature --origin review-specs
  --blocker-id <id>` invocation shape
- Bundled reviewer prompts (read-only, for shape/tone reference): `plugin:review-specs/
  structural-architect-prompt.md`, `security-reviewer-prompt.md`

### Task 3 Context (Procedure Step 3)
- Spec: Procedure Step 3 in full — the `UNKNOWN_CONTEXT_PACK` / `loadReviewConfig` continue-past
  behavior, the two positive verification checks (key literally present under `context_packs:`;
  include globs match at least one file in the worktree, checked against the filesystem, not
  against `.review.md`)
- `.context-index/governance/review.yaml` (current registry, to extend)
- `lib/governance/review-config.mjs:196-201`, `lib/governance/context-pack.mjs:102-117,227,349`
- Task 2's output: `.context-index/prompts/referent-integrity.md` (dependency)
- CLI verb: `adev governance reviewers --json`

### Task 4 Context (Procedure Step 4)
- Spec: Procedure Step 4 in full — this is the longest and highest-risk step in the spec:
  historical/current split ("subject matter historical, instrument current"), the `--tier full`
  pin, the project-root pin, the plugin-root pin (via resolved root, NOT `adev --version`, which
  does not exist and exits 1 on stderr), and the `$?`/`PIPESTATUS` exit-code trap
- Task 1's output: `mapping-table.md` (dependency — supplies the pre-fix SHAs to check out)
- Task 3's output: updated `review.yaml` + `referent-integrity.md` (dependency — the CURRENT
  versions to copy into each scratch worktree)
- `skills/review-specs/SKILL.md` — `--tier full` semantics, `--spec` argument
- `lib/profiles/index.mjs` — `getPluginRoot()`
- Governance boundary check: `.context-index/governance/boundaries.yaml` — no rule targets
  scratch worktrees or `.context-index/research/`, so no boundary conflict is expected, but
  Task 4 should re-check after Task 1/3 fix concrete file paths

### Task 5 Context (Procedure Step 5)
- Spec: Procedure Step 5, Postcondition 3 (two independent judgements: defect named, citation
  resolves — both must hold to count as caught), Postcondition 4 (bar/denominator/floor formula)
- Task 4's output: preserved `.review.md` copies + `run-log.md` (dependency — scoring reads the
  preserved copies, never the lifecycle projection, since the log is append-only and a second
  pass would blend runs per the spec's Idempotency section)
- Task 1's output: `mapping-table.md` (dependency — denominator source)

### Task 6 Context (Procedure Step 6)
- Spec: Procedure Step 6, Postcondition 4 (bar formula, `ceil(0.6 x denominator)`, INCONCLUSIVE
  floor of 3), Postcondition 5 (three terminal states, each names its successor)
- Charter: `charter.md` Migration Plan > Evidence track (exit condition, Phase 2 gating
  language) and Acceptance Criteria > Phase 1 (three checkboxes this task closes out)
- Task 5's output: `scoring.md` (dependency)
- Rollback section of the spec — referenced only if the operator later decides to roll back;
  not exercised by this task

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
- **Evidence:** 1 observations

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts. The model reasons the same way regardless of how much it echoes back. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observations

None of these are specific to reviewer/governance work; they surfaced from module-slug
retrieval against `reviewer-domain-fit` with no closer match in the heuristic store. Included
per protocol (retrieval did not return `__NONE__`); Task 4's "return only a structured summary"
practice is the one with plausible bearing here, since each of the five scratch-worktree runs
produces a full `.review.md` that should be preserved on disk rather than echoed in full.

## Parallelization

- Group A (independent): Task 1 (resolve issues to specs and pre-fix commits) — no file overlap
  with Group B
- Group B (sequential): Task 2 (author prompt) → Task 3 (declare reviewer, depends on Task 2's
  prompt file existing)
- Join point: Task 4 depends on BOTH Task 1 (mapping table) and Task 3 (declared reviewer +
  prompt) — cannot start until both groups complete
- Sequential tail: Task 4 → Task 5 (score) → Task 6 (evaluate + write finding)

Groups A and B can run in parallel; nothing else in this plan can, since Steps 4-6 are strictly
sequential in the spec's own Procedure (Step 4 produces the artifacts Step 5 scores; Step 5's
tally is Step 6's input).

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Resolve five issues to specs and pre-fix commits | small | manual-verification | — | 1 create |
| 2 | Author the `referent-integrity` prompt | medium | manual-verification | — | 1 create |
| 3 | Declare reviewer + context pack in `review.yaml` | medium | manual-verification | Task 2 | 0 create, 1 modify |
| 4 | Run pre-fix reviews in scratch worktrees | large | manual-verification | Task 1, Task 3 | up to 6 create |
| 5 | Score each run | medium | manual-verification | Task 4 | 1 create |
| 6 | Evaluate threshold and write the finding | small | manual-verification | Task 5 | 1 create, 1 modify |

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| manual-verification | 6 | spec-declared (Postcondition 6 / global acceptance criterion: `npm test` and `adev diagnose` must be UNAFFECTED — no `node:test` file may be added) |

No task resolves to `unit` via the normal priority chain (no `test_strategy` in spec
frontmatter, no `manifest.yaml` `test_strategies` glob match, and file-path auto-detection has
nothing to key off since every changed path is `.md`/`.yaml` under `.context-index/`, not
source). Left to that chain alone, every task would fall through to the `unit` default — which
would then require a `node:test` file per task, directly contradicting the global acceptance
criterion above. `manual-verification` is therefore the correctly-resolved strategy by the
chain's own first rule (spec-declared), not an ad hoc override: the spec's Postcondition 6 and
the `npm test` acceptance criterion together constitute a declaration that this work carries no
automated test surface.

## Test Infrastructure Requirements

> These requirements must be satisfied before Task 4's runs can execute.
> Tasks without these prerequisites will produce setup errors, not experiment results.

### External Systems

None. Every dependency below is local tooling already present in this repo; no network access,
cloud credential, or hosted service is required.

### Credentials / Environment Variables

None required.

### Pre-Provisioned State

- [ ] `git` available and this repo's full history present locally (Task 4 checks out five
  historical commits into scratch worktrees)
- [ ] `adev` resolvable the same way in every run — either always via `PATH` or always via a
  fixed absolute path to the installed plugin's `cli/index.mjs` — so the plugin root recorded
  in `run-log.md` is identical across all five runs (Acceptance Criterion: "all runs share one
  value")
- [ ] `br` (beads) issue board readable for Task 1's five `br show` lookups

### CI Configuration

Not applicable — this experiment is a one-shot, operator-driven procedure, not a suite added to
`npm test` or any CI job. Nothing here runs in CI.

### Unresolved Requirements

None at plan time. If Task 1 finds an id whose fixing commit is unreachable from local history
(e.g. squashed or on an unfetched branch), record that under Task 1's own `UNMAPPED` handling
(Procedure Step 1) rather than here — it is a per-id resolution outcome, not an infrastructure
gap.

## Task Structure

### Task 1: Resolve five issues to specs and pre-fix commits [specialist: none]

**Charter capability:** Migration Plan > Evidence track > Phase 1 — resolution table (Postcondition 2)
**Strategy:** manual-verification (source: spec-declared, confidence: high)
**Files:**
- Create: `.context-index/research/referent-integrity-falsification/mapping-table.md`

**Tests:** No `node:test` file (see Strategy Summary). Verification:
```bash
test -f .context-index/research/referent-integrity-falsification/mapping-table.md
grep -c '^| ' .context-index/research/referent-integrity-falsification/mapping-table.md
```
Expected: a row for each of `he2`, `r5sc`, `zx5`, `rftq`, `ysqd`, each either MAPPED (spec path
+ pre-fix SHA + fixing commit SHA) or `UNMAPPED` with a stated reason — no id silently omitted.

**Context to load:**
- `falsification-gate.spec.md` Procedure Step 1
- `charter.md` Migration Plan > Evidence track > Phase 1

- [ ] **Define the verification check** — the shape above (five rows, each MAPPED-with-all-three-fields or UNMAPPED-with-reason) is the objective definition of "done" for this task.

- [ ] **Run the check now — expect FAIL**

  Run: `test -f .context-index/research/referent-integrity-falsification/mapping-table.md && echo EXISTS || echo MISSING`
  Expected: FAIL — prints `MISSING` (file does not exist yet)

- [ ] **Do the work.** For each id, run `br show adev-plugin-<id>` and read the close reason.
  Identify the governing spec (search `.context-index/specs/` for the spec that governed the
  defective behaviour) and the fixing commit (`git log --all --grep <id>` when not named
  directly; the close reason already names it for `r5sc` — `0476a7bc`/`8d8d5c5a` — and `ysqd` —
  `11b179d7`). Compute the pre-fix revision as `git rev-parse <fixing-sha>^` (first parent). If
  no governing spec exists for an id, mark it `UNMAPPED` with the reason (e.g. "defect lived
  only in source, no governing spec") — do not substitute a loosely related spec to preserve the
  denominator. Write:
  ```markdown
  | Id | Spec | Pre-fix SHA | Fixing commit | Status |
  |----|------|-------------|----------------|--------|
  | he2 | <path or —> | <sha or —> | <sha or —> | MAPPED / UNMAPPED (reason: ...) |
  ```

- [ ] **Run the check again — expect PASS**

  Run: `cat .context-index/research/referent-integrity-falsification/mapping-table.md`
  Expected: PASS — five rows present, matching Postcondition 2 and the "mapping table committed
  before Step 4" acceptance criterion.

- [ ] **Commit**

  Branch (create if not already created): `feat/reviewer-domain-fit/falsification-gate`

  ```bash
  git add .context-index/research/referent-integrity-falsification/mapping-table.md
  git commit -m "$(cat <<'COMMITEOF'
  research(reviewer-domain-fit): map five closed defects to specs and pre-fix commits

  Spec: .context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md
  Plan-task: 1
  COMMITEOF
  )"
  ```

### Task 2: Author the `referent-integrity` prompt [specialist: none]

**Charter capability:** Procedure Step 2 — precursor to Postcondition 1
**Strategy:** manual-verification (source: spec-declared, confidence: high)
**Files:**
- Create: `.context-index/prompts/referent-integrity.md`

**Tests:** No `node:test` file. Verification:
```bash
test -f .context-index/prompts/referent-integrity.md
grep -c 'adev heuristics signature' .context-index/prompts/referent-integrity.md   # expect >= 1
grep -ic 'sha-256\|sha256\|compute.*hash' .context-index/prompts/referent-integrity.md  # expect 0
```
Expected: the prompt tells the model to obtain its `blocker_id` via the signature helper, and
never instructs it to compute a hash itself (reviewers run `execute: deny`).

**Context to load:**
- `falsification-gate.spec.md` Procedure Step 2
- `lib/cli/heuristics.mjs:76-78,282`
- Bundled prompts `plugin:review-specs/structural-architect-prompt.md`,
  `security-reviewer-prompt.md` (shape/tone reference only)

- [ ] **Define the verification checks** (the three commands above)

- [ ] **Run the checks now — expect FAIL**

  Run: `test -f .context-index/prompts/referent-integrity.md && echo EXISTS || echo MISSING`
  Expected: FAIL — prints `MISSING`

- [ ] **Write the prompt.** Scope: enumerate every referent the spec under review names — CLI
  flags, verbs, functions, files, error codes, event fields, config keys — and for each, state
  where its existence was verified (file path + line, or the CLI usage banner) or that it could
  not be verified. A named referent that does not exist is a `blocker`. Instruct the model to
  obtain its `blocker_id` via `adev heuristics signature --origin review-specs --blocker-id
  <id>`, never by computing one itself.

- [ ] **Run the checks again — expect PASS**

  Run the three commands above.
  Expected: PASS per the criteria stated in **Tests**.

- [ ] **Commit**

  ```bash
  git add .context-index/prompts/referent-integrity.md
  git commit -m "$(cat <<'COMMITEOF'
  research(reviewer-domain-fit): author referent-integrity reviewer prompt

  Spec: .context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md
  Plan-task: 2
  COMMITEOF
  )"
  ```

### Task 3: Declare `referent-integrity` and its context pack in `review.yaml` [specialist: none]

**Depends on:** Task 2
**Charter capability:** Postcondition 1 — reviewer exists and dispatches
**Strategy:** manual-verification (source: spec-declared, confidence: high)
**Files:**
- Modify: `.context-index/governance/review.yaml`

**Tests:** No `node:test` file. Verification:
```bash
adev governance reviewers --json > /tmp/rif-reviewers.json
grep -c '"id": "referent-integrity"' /tmp/rif-reviewers.json              # expect 1
grep -c '"context_pack": "referent-integrity-pack"' /tmp/rif-reviewers.json  # expect 1
grep -c '"errors": \[\]' /tmp/rif-reviewers.json                          # expect 1
grep -q 'referent-integrity-pack:' .context-index/governance/review.yaml  # key literally present
                                                                           # under context_packs: —
                                                                           # NOT inferred from errors
ls docs/cli-reference.md docs/skill-reference.md .context-index/orientation/architecture.md
                                                                           # include globs match real
                                                                           # files in THIS worktree —
                                                                           # checked against the
                                                                           # filesystem, never against
                                                                           # a .review.md
```
Expected: all commands succeed with the counts noted; the three bundled reviewers
(`structural-architect`, `security-reviewer`, `consistency-analyzer`) still appear in
`/tmp/rif-reviewers.json` alongside the new entry.

**Context to load:**
- `falsification-gate.spec.md` Procedure Step 3 in full
- `.context-index/governance/review.yaml` (current state)
- `lib/governance/review-config.mjs:196-201`, `lib/governance/context-pack.mjs:102-117,227,349`
- Task 2's output: `.context-index/prompts/referent-integrity.md`

- [ ] **Define the verification checks** (the block above)

- [ ] **Run the checks now — expect FAIL**

  Run: `adev governance reviewers --json | grep -c '"id": "referent-integrity"'`
  Expected: FAIL — 0 matches (entry does not exist yet)

- [ ] **Do the work.** Add to `.context-index/governance/review.yaml`:
  ```yaml
  reviewers:
    # ... existing three entries unchanged ...
    - id: referent-integrity
      name: Referent Integrity
      dispatch: always
      profile: reviewer-reasoning
      context_pack: referent-integrity-pack
      severity_cap: blocker
      prompt: prompts/referent-integrity.md

  context_packs:
    referent-integrity-pack:
      extends: base
      include:
        - glob: "docs/cli-reference.md"
          title: "CLI Verb Reference"
        - glob: "docs/skill-reference.md"
          title: "Skill Reference"
        - glob: ".context-index/orientation/architecture.md"
          title: "Architecture Orientation"
  ```
  `prompt:` is relative, so it resolves under `.context-index/` — no plugin file is needed
  (Postcondition 1). The globs above were confirmed to resolve in this worktree before writing
  this plan.

- [ ] **Run the checks again — expect PASS**

  Run the full verification block above.
  Expected: PASS on every line.

- [ ] **Commit**

  ```bash
  git add .context-index/governance/review.yaml
  git commit -m "$(cat <<'COMMITEOF'
  research(reviewer-domain-fit): declare referent-integrity reviewer and context pack

  Spec: .context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md
  Plan-task: 3
  COMMITEOF
  )"
  ```

### Task 4: Run pre-fix reviews in scratch worktrees [specialist: none]

**Depends on:** Task 1, Task 3
**Charter capability:** Postcondition 3 — one review run per MAPPED id; also the acceptance
criteria on tier pin, project-root pin, plugin-root pin, pack-glob verification, and
dispatched-reviewer confirmation
**Strategy:** manual-verification (source: spec-declared, confidence: high)
**Files:**
- Create: `.context-index/research/referent-integrity-falsification/<id>.review.md` (one per
  MAPPED id from Task 1 — e.g. up to five: `he2.review.md`, `r5sc.review.md`, `zx5.review.md`,
  `rftq.review.md`, `ysqd.review.md`)
- Create: `.context-index/research/referent-integrity-falsification/run-log.md`

**Tests:** No `node:test` file. Per-run verification (repeat for every MAPPED id):
```bash
grep -c '"id": "referent-integrity"' /tmp/rif-<id>-reviewers.json   # expect 1, captured FROM
grep -c '"errors": \[\]' /tmp/rif-<id>-reviewers.json               # INSIDE the scratch worktree
grep -c 'referent-integrity' .context-index/research/referent-integrity-falsification/<id>.review.md
                                                                     # expect >= 1 — the reviewer
                                                                     #   actually dispatched
git merge-base --is-ancestor <pre-fix-sha> <fixing-sha> && echo ANCESTOR_OK
```
Expected: every run's `.review.md` names `referent-integrity` among its dispatched reviewers;
every run's `run-log.md` row records a resolved project root equal to that run's scratch
worktree path (never the main checkout) and a resolved plugin root identical across every run;
the reviewed commit is confirmed an ancestor of the fixing commit.

**Context to load:**
- `falsification-gate.spec.md` Procedure Step 4 in full — read it twice; it names three
  specific failure modes (stale registry, wrong project root, wrong plugin root) this task
  exists to avoid
- Task 1's `mapping-table.md`, Task 3's `review.yaml` + `referent-integrity.md`
- `skills/review-specs/SKILL.md` (`--tier full` semantics)
- `lib/profiles/index.mjs` (`getPluginRoot()`)

For each MAPPED id (repeat the full checklist per id):

- [ ] **Define the verification checks** — the block above, plus: reviewed commit is an
  ancestor of the fixing commit (`git merge-base --is-ancestor`).

- [ ] **Create the scratch worktree at the pre-fix revision**

  ```bash
  git worktree add /tmp/rif-<id> <pre-fix-sha>
  ```

- [ ] **Run the check now — expect FAIL** — before overwriting, confirm the historical registry
  lacks the entry:

  ```bash
  (cd /tmp/rif-<id> && adev governance reviewers --json | grep -c '"id": "referent-integrity"')
  ```
  Expected: FAIL — 0 matches (this commit predates the registry change).

- [ ] **Overwrite the historical registry and prompt with the CURRENT versions**

  ```bash
  cp .context-index/governance/review.yaml /tmp/rif-<id>/.context-index/governance/review.yaml
  mkdir -p /tmp/rif-<id>/.context-index/prompts
  cp .context-index/prompts/referent-integrity.md /tmp/rif-<id>/.context-index/prompts/referent-integrity.md
  ```
  This is the step the spec calls load-bearing: skipping it dispatches the OLD three-reviewer
  panel and produces a false negative. Pack file BODIES stay historical (globs like
  `docs/cli-reference.md` resolve against the worktree's own historical tree) — that is correct
  by design, not a gap.

- [ ] **Confirm the registry resolves correctly INSIDE the worktree — expect PASS**

  ```bash
  (cd /tmp/rif-<id> && adev governance reviewers --json > /tmp/rif-<id>-reviewers.json)
  grep -c '"id": "referent-integrity"' /tmp/rif-<id>-reviewers.json   # expect 1
  grep -c '"errors": \[\]' /tmp/rif-<id>-reviewers.json               # expect 1
  ```
  A run that skips this check is void per the spec.

- [ ] **Confirm the context pack's globs match a file INSIDE this specific scratch worktree —
  expect PASS, recorded per run**

  ```bash
  (cd /tmp/rif-<id> && ls docs/cli-reference.md docs/skill-reference.md .context-index/orientation/architecture.md)
  ```
  Record the result in `run-log.md` for this id. This is a SEPARATE check from Task 3's
  one-time confirmation against the main checkout: pack file bodies are historical by design
  (Procedure Step 4), so a glob that matched at authoring time can still miss at an early
  pre-fix commit if none of the three files existed yet there. **A run whose pack renders empty
  here is VOID, exactly like a run that did not dispatch the reviewer — treat it the same as a
  missing-dispatch VOID below, do not score it as a miss.**

- [ ] **Dispatch the review FROM INSIDE the worktree, pinned to `--tier full`**

  ```bash
  cd /tmp/rif-<id>
  # /adev:review-specs --spec <mapped-spec-path> --tier full
  cd -
  ```
  **The `--tier full` pin is load-bearing, not optional: a run dispatched at any other tier is
  VOID**, not scored — `quick` skips the registry loop entirely (`skills/review-specs/SKILL.md`
  Step 4) and dispatches only the bundled synthesized reviewer, so `referent-integrity` would
  never run at all. Record the tier used in `run-log.md`.

  Record in `run-log.md`: the resolved project root and the resolved plugin root. **The
  project-root pin is load-bearing, not optional: a run whose resolved project root was the
  main checkout is VOID, not a miss** — the pack would render from CURRENT sources against a
  historical spec, defeating the historical/current split, silently and with an empty `errors`
  array. Confirm the resolved root with:

  ```bash
  find /tmp/rif-<id>/.context-index -newer /tmp/rif-<id>/.context-index/governance/review.yaml -name '*.review.md'
  ```
  A hit under `/tmp/rif-<id>/.context-index/`, and nothing newer under the main tree's
  `.context-index/`, confirms the run's project root was the scratch worktree, not the main
  checkout.

  Do NOT record `adev --version` as the plugin-root check — that verb does not exist
  (unrecognized-verb dispatch, both invocations exit 1 on stderr with a usage banner
  byte-identical between an installed plugin and a worktree-local `cli/index.mjs`; a constant
  cannot distinguish the two). Read any exit code WITHOUT a pipe (`echo $?` immediately after
  the command, never after `| head`, since `$?` after a pipeline reports the LAST command).

  **Concrete recipe for the plugin root:** when a Claude Code Skill-tool dispatch runs
  `/adev:review-specs`, its tool result opens with a line of the form `Base directory for this
  skill: <plugin-root>/skills/review-specs` (this plan's own invocation carried the equivalent
  line for `/adev:plan`: `Base directory for this skill:
  /Users/.../plugins/cache/agentic-development/adev/<version>/skills/plan`). The resolved
  plugin root is that path with the trailing `/skills/review-specs` segment removed — i.e. two
  path components up from the announced base directory. Copy that path verbatim into
  `run-log.md` for this run. If `/adev:review-specs` is instead invoked as a raw CLI call
  (`node <path>/cli/index.mjs review-specs ...`, bypassing the Skill tool), the plugin root is
  `dirname(dirname(<path-to-cli/index.mjs>))` — one level up from the `cli/` directory,
  equivalently two levels up from `lib/profiles/index.mjs` (`getPluginRoot()`,
  `lib/profiles/index.mjs:29`). Either way, the value MUST be the same literal string across
  all five runs; do not paraphrase or abbreviate it between rows.

- [ ] **Confirm the preserved `.review.md` names `referent-integrity`, then copy it out**

  ```bash
  grep -c 'referent-integrity' /tmp/rif-<id>/.context-index/specs/<...path.../><spec>.review.md
  cp /tmp/rif-<id>/.context-index/specs/<...path.../><spec>.review.md \
     .context-index/research/referent-integrity-falsification/<id>.review.md
  ```
  Expected: PASS (count >= 1). If it does not, this run is VOID, not a miss — record it as VOID
  in `run-log.md` with the reason, and retry once before treating it as a reduced scorable-run
  count for Task 5.

- [ ] **Run the checks again — expect PASS** (the full per-run verification block, against the
  copied artifact now in the main tree)

- [ ] **Tear down the scratch worktree**

  ```bash
  git worktree remove /tmp/rif-<id>
  ```
  Per Idempotency: lifecycle events appended inside the worktree are discarded with it — nothing
  on the working branch needs cleanup.

- [ ] **Commit this run's artifacts**

  ```bash
  git add .context-index/research/referent-integrity-falsification/<id>.review.md \
          .context-index/research/referent-integrity-falsification/run-log.md
  git commit -m "$(cat <<'COMMITEOF'
  research(reviewer-domain-fit): record referent-integrity run for <id>

  Spec: .context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md
  Plan-task: 4
  COMMITEOF
  )"
  ```

Task 4 is complete once every MAPPED id has a run recorded (scored VOID-with-reason counts as
recorded; a VOID run still ends the per-id loop, it just contributes nothing to Task 5's tally).

- [ ] **Cross-run check — expect PASS: all recorded plugin roots are identical**

  ```bash
  awk -F'|' '{print $NF}' .context-index/research/referent-integrity-falsification/run-log.md | sort -u
  ```
  (adjust the column extraction to wherever `run-log.md`'s plugin-root column lands). Expected:
  exactly one distinct value across every non-VOID run — this is the acceptance criterion "every
  run records its resolved plugin root, and all runs share one value," verified here rather than
  merely assumed from the Test Infrastructure Requirements precondition. If more than one value
  appears, do not proceed to Task 5 until the discrepancy is resolved (re-run the affected id(s)
  with the same `adev` invocation method used everywhere else).

### Task 5: Score each run [specialist: none]

**Depends on:** Task 4
**Charter capability:** Postcondition 3 (two independent judgements), Postcondition 4
(denominator/bar and the scorable-run floor)
**Strategy:** manual-verification (source: spec-declared, confidence: high)
**Files:**
- Create: `.context-index/research/referent-integrity-falsification/scoring.md`

**Tests:** No `node:test` file. Verification:
```bash
test -f .context-index/research/referent-integrity-falsification/scoring.md
grep -q -i 'denominator' .context-index/research/referent-integrity-falsification/scoring.md
grep -q -i 'bar' .context-index/research/referent-integrity-falsification/scoring.md
grep -c '^| ' .context-index/research/referent-integrity-falsification/scoring.md   # >= 1 row per scorable run
```
Expected: PASS — a row per scorable run with both judgements recorded, and the denominator and
bar written down as a section that reads BEFORE the tally in document order (the spec requires
this ordering: fixed before any run is scored).

**Context to load:**
- `falsification-gate.spec.md` Procedure Step 5, Postcondition 3, Postcondition 4
- Task 4's preserved `.review.md` files and `run-log.md`
- Task 1's `mapping-table.md`

- [ ] **Define the verification checks** (the block above)

- [ ] **Run the checks now — expect FAIL**

  Run: `test -f .context-index/research/referent-integrity-falsification/scoring.md && echo EXISTS || echo MISSING`
  Expected: FAIL — prints `MISSING`

- [ ] **Fix the denominator and bar BEFORE scoring anything.** From Task 1's mapping table,
  count MAPPED ids → denominator. If denominator = 5, bar = 3. If denominator < 5, bar =
  `ceil(0.6 × denominator)`. If denominator < 3, the outcome is already INCONCLUSIVE regardless
  of scoring — write that down now, at the top of `scoring.md`, before touching any `.review.md`.

- [ ] **Score each preserved `.review.md`** (read from the preserved copies under
  `.context-index/research/referent-integrity-falsification/`, never from the lifecycle
  projection — a second pass would append rather than replace, per Idempotency, and blend
  runs). For each: (a) **defect named** — did a `blocker`-severity finding identify the known
  root cause? (b) **citation resolves** — does the file/symbol/line it names actually exist at
  the reviewed commit? Both must hold to count as caught; an unresolvable citation on an
  otherwise-correct finding counts as NOT caught. A run recorded VOID in Task 4 is excluded from
  scorable runs (not from the fixed denominator, which does not reopen); if scorable runs fall
  below 3, record the result as INCONCLUSIVE regardless of the raw tally.

- [ ] **Run the checks again — expect PASS**

- [ ] **Commit**

  ```bash
  git add .context-index/research/referent-integrity-falsification/scoring.md
  git commit -m "$(cat <<'COMMITEOF'
  research(reviewer-domain-fit): score referent-integrity falsification runs

  Spec: .context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md
  Plan-task: 5
  COMMITEOF
  )"
  ```

### Task 6: Evaluate the threshold and write the finding [specialist: none]

**Depends on:** Task 5
**Charter capability:** Postcondition 5 (three terminal states, each naming its successor);
Migration Plan > Evidence track exit condition
**Strategy:** manual-verification (source: spec-declared, confidence: high)
**Files:**
- Create: `.context-index/research/referent-integrity-falsification-2026-08.md`
- Modify: `.context-index/specs/features/reviewer-domain-fit/charter.md` (Phase 1 checkboxes)

**Tests:** No `node:test` file. Verification:
```bash
test -f .context-index/research/referent-integrity-falsification-2026-08.md
grep -Eq 'Bar met|Bar missed|INCONCLUSIVE' .context-index/research/referent-integrity-falsification-2026-08.md
git diff --stat <branch-point>..HEAD                 # confined to .context-index/ (Postcondition 6)
npm test                                              # must still pass, unaffected
adev diagnose                                         # must still be clean, unaffected
```
Expected: PASS on all five — one of the three terminal states is named explicitly with its
required successor language, `git diff --stat` shows no changes outside `.context-index/`, and
the two global regression checks show no change in outcome from the branch point.

**Context to load:**
- `falsification-gate.spec.md` Procedure Step 6, Postcondition 4, Postcondition 5
- `charter.md` Migration Plan > Evidence track, Acceptance Criteria > Phase 1
- Task 5's `scoring.md`

- [ ] **Define the verification checks** (the block above)

- [ ] **Run the checks now — expect FAIL**

  Run: `test -f .context-index/research/referent-integrity-falsification-2026-08.md && echo EXISTS || echo MISSING`
  Expected: FAIL — prints `MISSING`

- [ ] **Compare the tally to the bar (both from Task 5) and pick exactly one of three
  outcomes:**
  - **Bar met** — state it; Phase 2 is unblocked.
  - **Bar missed** — state it as a successful experiment with a negative result (the charter's
    Migration Plan already treats this as legitimate, not a setback); state that the failure
    was reachability, not scope; the evidence track stops.
  - **INCONCLUSIVE** (denominator < 3, or scorable runs fell below 3) — Phase 2 stays blocked;
    name ONE of: (a) widen the id set with further closed defects of the same class until a
    denominator of at least 3 is reachable and re-run, or (b) escalate the mapping table to the
    operator for a human decision on whether the experiment is runnable at all.

- [ ] **Write the finding** at the fixed path
  (`.context-index/research/referent-integrity-falsification-2026-08.md`), stating the tally,
  the bar, the verdict, and the consequence for the initiative's evidence track.

- [ ] **Tick the three Phase 1 acceptance-criteria checkboxes** in `charter.md`'s Migration Plan
  section, matching exactly what Tasks 1-5 verified:
  - `referent-integrity` is declared in `review.yaml` with a hand-written pack and dispatches
    with no plugin change
  - All MAPPED specs are reviewed at their pre-fix git revisions; each result records whether
    the known defect was flagged as blocker with a citation resolving to a real file or symbol
  - The threshold is evaluated and recorded before any Phase 2 work begins

- [ ] **Run the checks again — expect PASS**, including the two global regression checks
  (`npm test`, `adev diagnose`).

- [ ] **Commit**

  ```bash
  git add .context-index/research/referent-integrity-falsification-2026-08.md \
          .context-index/specs/features/reviewer-domain-fit/charter.md
  git commit -m "$(cat <<'COMMITEOF'
  research(reviewer-domain-fit): record falsification gate verdict

  Spec: .context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md
  Plan-task: 6
  COMMITEOF
  )"
  ```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results
are recorded in the validation report (`.validate.md`), not in this plan.

`.context-index/governance/gates.yaml` exists in this repo and defines the deterministic gate
set (fast tier `id: test`, `command: ["npm", "test"]`); it supersedes the constitution's plain
`npm test` line for automated enforcement, though the two commands are identical today.

- Tests pass: `npm test` — must show NO change from the branch point; a change indicates the
  experiment leaked outside `.context-index/` (global acceptance criterion)
- `adev diagnose` — must remain clean, unaffected
- `git diff --stat` against the branch point — confined to `.context-index/` (Postcondition 6)
- All 21 acceptance criteria from the spec satisfied, and all six Postconditions hold
- No constitutional violations — this plan adds zero external dependencies and zero companion
  code beyond one markdown prompt and one YAML registry entry, per the spec's own System
  Constitution Reference section

The `integration-test` gate (`npm run test:evals`, `required: false` per `gates.yaml`) is not
triggered by this work — no eval-tier code changes — and is noted here as skipped rather than
run.
