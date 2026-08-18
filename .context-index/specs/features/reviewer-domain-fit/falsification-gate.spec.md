---
# partial_schema: implement@1
charter: reviewer-domain-fit
kind: action
status: implemented
risk_level: medium
milestone:
revision: 6
charter-revision: 2
created: 2026-08-18
updated: 2026-08-18
tracker-ref: adev-plugin-j7pq.5
source-manifest:
  sha: "d7b19bd"
  files:
    - .context-index/governance/review.yaml
    - .context-index/prompts/referent-integrity.md
    - .context-index/research/referent-integrity-falsification-2026-08.md
    - .context-index/research/referent-integrity-falsification/he2.review.md
    - .context-index/research/referent-integrity-falsification/mapping-table.md
    - .context-index/research/referent-integrity-falsification/r5sc.review.md
    - .context-index/research/referent-integrity-falsification/run-log.md
    - .context-index/research/referent-integrity-falsification/scoring.md
    - .context-index/research/referent-integrity-falsification/zx5.review.md
    - .context-index/specs/features/reviewer-domain-fit/charter.md
  computed-at: "2026-08-18T17:09:30.736Z"
---

# Action Spec: Falsification Gate

<!-- Action Spec within the reviewer-domain-fit charter.
     One-shot experiment whose result decides whether the initiative's evidence
     track proceeds. Postcondition-first: DONE is a recorded verdict, not a
     changed codebase.
     Parent Charter: .context-index/specs/features/reviewer-domain-fit/charter.md -->

## Postconditions

1. **A `referent-integrity` reviewer exists and dispatches.** It is declared in this repo's
   `.context-index/governance/review.yaml` with a hand-written context pack, and
   `adev governance reviewers --json` returns it with zero `errors`. No file under
   `templates/`, `lib/`, `skills/` or `extensions/` has changed: `review.yaml` IS the whole
   effective reviewer set, and a relative `prompt:` path resolves under `.context-index/`, so a
   project-scoped reviewer needs no plugin file.

2. **A resolution table maps each of the five issues to a reviewable artifact.** For every id in
   `{he2, r5sc, zx5, rftq, ysqd}` the table records: the issue id, the spec path that governed the
   defective behaviour, the pre-fix commit SHA at which that spec still contained the defect, and
   the fixing commit. Any id that cannot be mapped is recorded as `UNMAPPED` with the reason.

3. **One review run is recorded per MAPPED id, each with a verdict and a citation judgement.**
   (Not necessarily five — PC2 admits `UNMAPPED` ids and PC4 a reduced denominator.) For each
   mapped spec, the run records: whether `referent-integrity` emitted a `blocker`-severity finding
   naming the known defect, and whether that finding's citation resolves — the file, symbol or line
   it names actually exists at the reviewed commit. A finding that names the right defect with an
   unresolvable citation counts as NOT caught.

4. **The threshold is evaluated against a denominator fixed before scoring, subject to a floor.**
   The bar is 3 of 5. If fewer than five ids map to a reviewable artifact, the denominator is the
   number that mapped and the bar is `ceil(0.6 × denominator)`, recorded explicitly before any run
   is scored. A run that stays VOID after retry does not re-open the denominator — it reduces the
   count of SCORABLE runs, and the bar is re-evaluated against scorable runs only in the direction of
   caution: if scorable runs fall below 3 the result is INCONCLUSIVE, never a miss.
   **Below a denominator of 3 the experiment is INCONCLUSIVE** — it neither unblocks nor
   stops Phase 2, and the finding says so. Without that floor a single mapped id yields a bar of 1,
   so the gate could be "met" on one run; and because Step 1's `UNMAPPED` classification is what
   sets the denominator, the weakening would happen upstream of the fix-the-denominator guard rather
   than after it. The mapping table is committed before Step 4 begins, so the denominator is on
   record independently of any result.

5. **A written finding exists for every terminal state, and the initiative's next step follows from
   it.** The finding is committed at
   `.context-index/research/referent-integrity-falsification-2026-08.md`. There are three terminal
   states, not two, and each names its successor:
   - **Bar met** — Phase 2 is unblocked.
   - **Bar missed** — the evidence track stops; the finding states that the reviewers were failing
     on reachability rather than scope.
   - **INCONCLUSIVE** (denominator < 3, or scorable runs < 3) — Phase 2 stays blocked, and the
     finding names ONE of two follow-ups: widen the id set with further closed defects of the same
     class from the board until a denominator of at least 3 is reachable and re-run, or, if no such
     ids exist, escalate the mapping table to the operator for a human decision on whether the
     experiment is runnable at all. INCONCLUSIVE must never be left without one of these named, or
     the evidence track parks with no owner while the charter still gates Phase 2 on Phase 1
     passing.

6. **No production code changed.** `git diff --stat` against the branch point shows changes confined
   to `.context-index/`.

## Procedure

### Step 1: Resolve the five issues to specs and pre-fix commits

For each id in `{he2, r5sc, zx5, rftq, ysqd}`, read the closed issue (`br show adev-plugin-<id>`)
and identify (a) the spec that governed the defective behaviour and (b) the commit that fixed it.
The pre-fix revision is that commit's first parent. Several issues name their fixing commit
directly in the close reason — for example `r5sc` names `0476a7bc` and `8d8d5c5a`, `ysqd` names
`11b179d7`.

Record the mapping table required by Postcondition 2. An id whose defect lived only in source with
no governing spec is `UNMAPPED` — do not substitute a loosely related spec to preserve the
denominator.

### Step 2: Author the `referent-integrity` prompt

Write `.context-index/prompts/referent-integrity.md`. Scope: enumerate every referent the spec
names — CLI flags, verbs, functions, files, error codes, event fields, config keys — and for each,
state where its existence was verified, or that it could not be. A named referent that does not
exist is a `blocker`.

The prompt MUST NOT instruct the model to compute a hash: reviewers run under `execute: deny` and
cannot run SHA-256, so any `blocker_id` it invents is typed hex. Use
`adev heuristics signature --origin review-specs --blocker-id <id>` as every other prompt does.

### Step 3: Declare the reviewer in `review.yaml`

Add one entry — `id: referent-integrity`, `dispatch: always`, `profile: reviewer-reasoning`,
`prompt: prompts/referent-integrity.md`, `severity_cap: blocker`, and
**`context_pack: referent-integrity-pack`** — plus that pack's body, declared under the
`context_packs:` map in the same `review.yaml`.

Naming the pack is not optional bookkeeping, and **an empty `errors` array does not prove the pack
resolved.** `loadReviewConfig` explicitly `continue`s past a pack that fails to resolve
(`lib/governance/review-config.mjs:196-201` — "its own error already surfaces where the pack is
rendered"); `UNKNOWN_CONTEXT_PACK` is raised inside `resolveExtends`
(`lib/governance/context-pack.mjs:117`, in the function beginning at `:102` — NOT in `renderPack`,
which begins at `:227`), and the render path returns `rendered: ""`. So a typo'd or undeclared
pack loads cleanly, the reviewer dispatches with NO context, finds nothing, and its report still
names `referent-integrity`. That is the rev-1 false-negative failure reachable through the check
added to prevent it.

Verify the pack POSITIVELY, by two checks that do not depend on `errors`:

1. The key named by `context_pack` is literally present under `context_packs:` in the same
   `review.yaml`.
2. The pack's declared include globs match at least one file in the worktree being reviewed,
   checked directly against the filesystem and recorded per run in the mapping table. Do NOT try to
   verify this from the preserved `.review.md`: that artifact is the reviewer's findings report and
   carries no `ADEV-PACK` sections — the rendered pack exists only in the dispatch prompt, which is
   not preserved.

A run whose pack rendered empty is VOID, exactly like a run that did not dispatch the reviewer.
The prompt path is relative, so it resolves under `.context-index/` and needs no plugin file.

Confirm with `adev governance reviewers --json`: the entry appears, `errors` is empty. A non-empty
`errors` array aborts the whole panel, so this check gates Step 4.

### Step 4: Run the review against each mapped spec at its pre-fix revision

**Exactly one thing is historical: the spec text under review.** Everything the experiment measures
WITH — the reviewer registry, the `referent-integrity` prompt, its context pack, and the installed
plugin — must be the CURRENT versions. Reviewing the current spec proves nothing (the defect is
fixed), but reviewing with a historical registry proves less than nothing: it produces a null result
that reads as a negative gate.

This is not hypothetical. `loadReviewConfig` reads `review.yaml` from the project root of the run
(`lib/governance/review-config.mjs:79,108`). A worktree checked out at a pre-fix commit therefore
carries that commit's `review.yaml`, which has no `referent-integrity` entry and no
`prompts/referent-integrity.md` — every pre-fix commit predates `a25971e2` (2026-08-16), the most
recent change to that file. A run there would dispatch the old three-reviewer panel, find nothing,
and record a false negative.

For each row:

1. Create a scratch worktree at the pre-fix commit.
2. **Copy the CURRENT `.context-index/governance/review.yaml` and
   `.context-index/prompts/referent-integrity.md` into it, overwriting the historical versions.**
3. Run `adev governance reviewers --json` inside the worktree and confirm `referent-integrity`
   appears with an empty `errors` array. A run that skips this check is void.
4. **From inside the scratch worktree** — its directory is the run's project root — run
   `/adev:review-specs --spec <path> --tier full`, and record the resolved project root and the
   resolved plugin root alongside the run.

   Both pins are load-bearing. The tier pin: in `quick` the skill "skip[s] the registry loop below"
   and dispatches only the bundled synthesized reviewer (`skills/review-specs/SKILL.md` Step 4), so
   an unpinned run could resolve to a tier in which `referent-integrity` never dispatches at all.
   The project-root pin: the skill renders each pack via `renderPack(..., { repoRoot, targetSpecPath })`
   and `loadReviewConfig` reads `review.yaml` from the run's `repoRoot`, so a run launched from the
   main checkout with only `--spec` pointing into the worktree would load the current registry but
   render the pack from CURRENT sources against a historical spec — silently, with an empty `errors`
   array, and defeating Step 3's in-worktree glob check.

   **Pack file BODIES are historical by design, and that is correct.** `renderPack` expands every
   glob against `ctx.repoRoot` (`context-pack.mjs:349`), so running from inside the worktree makes
   the charter, sibling specs, ADRs and cross-cutting specs the versions that existed at the pre-fix
   commit. That is what the experiment needs: `referent-integrity` judges whether the referents a
   spec names existed **at the time**, so evaluating them against today's tree would both clear
   referents that did not yet exist and fail ones that have since been renamed. The historical/current
   split is therefore not spec-text-versus-everything — it is **subject matter historical, instrument
   current**: the spec text and its context bodies come from the commit; the registry, prompt, pack
   DEFINITION and plugin come from today. Recording the plugin root closes the same
   hole one level up: `getPluginRoot()` derives from `lib/profiles/index.mjs`'s own location two
   levels up, so invoking the worktree's own `cli/index.mjs` instead of the `adev` on PATH would
   make `templates/` historical — and the resolved root distinguishes the two.

   Record the resolved plugin root, NOT `adev --version`. That verb does not exist: the dispatcher
   reads `argv[2]` as a verb name and has no `--version` entry, so both invocations write
   `unknown verb: --version` plus the usage banner **to stderr** (0 bytes on stdout) and **exit 1**.
   The output is byte-identical between the installed plugin and a worktree-local `cli/index.mjs`,
   because the same code emits it in every checkout — a constant cannot distinguish the two, so
   recording it would pass trivially in exactly the case this pin exists to catch.

   Two traps for whoever verifies this. `$?` after a pipeline reports the LAST command, so
   `adev --version 2>&1 | head -2; echo $?` measures `head` and reports 0 — an earlier revision of
   this spec asserted "exit 0" on exactly that mistake. Check the exit code without a pipe, or read
   `${PIPESTATUS[0]}`. And because all output is on stderr, a check that captures only stdout sees
   nothing at all.
5. Confirm the resulting `.review.md` names `referent-integrity` among its dispatched reviewers
   before scoring it. A `.review.md` that does not is a void run, not a miss.

Record the full `.review.md` for each run under
`.context-index/research/referent-integrity-falsification/`.

### Step 5: Score each run

Per run, record two independent judgements: **defect named** (did a `blocker` finding identify the
known root cause) and **citation resolves** (does the file, symbol or line it cites exist at the
reviewed commit). Both must hold to count as caught.

Score before computing the total, and record the raw judgements alongside the tally so a later
reader can re-derive the result without re-running the experiment.

### Step 6: Evaluate the threshold and write the finding

Compare the tally to the bar fixed in Postcondition 4. Write the finding, state the verdict, and
name the consequence for the initiative. Commit it.

If the bar is missed, this is a successful experiment with a negative result. Record it as such —
the charter's Migration Plan already states that outcome is a legitimate result, not a setback.

## Idempotency

Re-running the whole procedure is safe and produces the same verdict from the same inputs, with
three qualifications.

- **Step 4 overwrites review artifacts.** `/adev:review-specs` rewrites `.review.md` and, on BLOCK,
  `.blockers.md` beside the spec it reviews. Runs happen in a scratch worktree at a historical
  commit, so nothing on the working branch is touched; the copies preserved under
  `.context-index/research/referent-integrity-falsification/` are the durable record.
- **Step 4 appends lifecycle events.** Each run appends `reviewer_report` and `lifecycle_step`
  events to the reviewed spec's log. The log is append-only by design, so a second pass adds a
  second set rather than replacing the first. Scoring must therefore read the preserved `.review.md`
  copies, not the projection, which would blend runs.
- **Step 3 is additive and re-runnable.** Re-declaring an existing `id` in `review.yaml` is an
  edit, not a duplicate — the project file IS the whole effective reviewer set
  (`lib/governance/review-config.mjs:107-115`). `mergeReviewers` is NOT on this path; it runs only
  inside `adev governance materialize`.

Steps 1, 2, 5 and 6 are pure authoring and may be repeated freely.

## Rollback

No production code is modified, so rollback is deletion rather than reversion.

1. Remove the `referent-integrity` entry from `.context-index/governance/review.yaml`, restoring
   the three-reviewer panel. Verify with `adev governance reviewers --json`.
2. Delete `.context-index/prompts/referent-integrity.md`.
3. Delete the scratch worktree used in Step 4.

The finding under `.context-index/research/` is deliberately NOT rolled back: a negative result is
the experiment's product and must survive it, or the next person repeats the work.

Lifecycle events appended in Step 4 land on historical specs in a scratch worktree and are
discarded with it; nothing on the working branch requires cleanup.

## System Constitution Reference

- **Principle 1 — Minimize external dependencies.** The experiment adds none. It is one markdown
  prompt, one YAML entry, and existing CLI verbs.
- **Principle 2 — Skills are primarily markdown.** `referent-integrity` is a prompt file consumed by
  the existing reviewer dispatch path, adding no companion code.
- **Anti-pattern — no hand-computed identifiers in prompts.** Step 2 forbids instructing the model
  to compute a hash, because reviewers run under `execute: deny`. This is the same defect the
  charter's Phase 2 removes from the shipped prompts; the experiment must not reintroduce it.
- **Autonomous boundary.** Adding a project-scoped reviewer to this repo's own `review.yaml` changes
  no consumer behaviour and ships nothing, so it sits inside the agent-may-decide boundary. Changing
  the DEFAULT panel does not, and is deliberately out of this spec's scope.

## Acceptance Criteria

- [ ] `adev governance reviewers --json` lists `referent-integrity` with an empty `errors` array,
      and the three bundled reviewers still load alongside it
- [ ] The `referent-integrity` entry names a `context_pack`, that key is literally present under
      `context_packs:` in the same `review.yaml`, and the pack's include globs match at least one
      file in each reviewed worktree — all three verified positively, NOT by an empty `errors`
      array, which does not prove a pack resolved
- [ ] Every run was dispatched with `--tier full`; a run at any other tier is VOID
- [ ] Every run records its resolved project root, and that root is the scratch worktree; a run
      whose project root was the main checkout is VOID, not a miss
- [ ] Every run records its resolved plugin root, and all runs share one value
- [ ] If the result is INCONCLUSIVE, the finding names which of the two follow-ups applies
- [ ] A run whose pack rendered empty is recorded VOID, not scored as a miss
- [ ] Unresolvable VOIDs reduce scorable runs without re-deriving the committed denominator; below
      3 scorable runs the result is INCONCLUSIVE
- [ ] Each preserved `.review.md` names `referent-integrity` among its dispatched reviewers; a run
      whose report does not is recorded VOID and rescheduled, never scored as a miss
- [ ] Each run's worktree carried the CURRENT `review.yaml` and `prompts/referent-integrity.md`,
      verified by an in-worktree `adev governance reviewers --json` before the review was dispatched
- [ ] If fewer than 3 ids map, the finding records INCONCLUSIVE and Phase 2 is neither unblocked
      nor stopped
- [ ] The mapping table is committed before the first run of Step 4
- [ ] `git diff --stat` against the branch point shows changes confined to `.context-index/`
- [ ] The resolution table records all five ids, each either mapped to a spec path with a pre-fix
      commit SHA and a fixing commit, or marked `UNMAPPED` with a reason
- [ ] The denominator and the derived bar are written down BEFORE any run is scored
- [ ] Each scorable run has a preserved `.review.md` under
      `.context-index/research/referent-integrity-falsification/`
- [ ] Each scorable run carries two recorded judgements — defect named, citation resolves — and a finding
      whose citation does not resolve is scored as NOT caught
- [ ] The finding at `.context-index/research/referent-integrity-falsification-2026-08.md` states
      the tally, the bar, the verdict, and the consequence for the initiative's evidence track
- [ ] The experiment reviews PRE-FIX revisions: for each run, the reviewed commit is an ancestor of
      the fixing commit named in the resolution table
- [ ] `npm test` passes and `adev diagnose` is clean — neither should be affected, and a change to
      either indicates the experiment leaked outside `.context-index/`
- [ ] No constitutional violations
