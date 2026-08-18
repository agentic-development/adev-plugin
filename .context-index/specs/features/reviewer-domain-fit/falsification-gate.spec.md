---
charter: reviewer-domain-fit
kind: action
status: review-pending
risk_level: medium
milestone:
revision: 2
charter-revision: 2
created: 2026-08-18
updated: 2026-08-18
tracker-ref: adev-plugin-j7pq.5
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

3. **Five review runs are recorded, each with a verdict and a citation judgement.** For each
   mapped spec, the run records: whether `referent-integrity` emitted a `blocker`-severity finding
   naming the known defect, and whether that finding's citation resolves — the file, symbol or line
   it names actually exists at the reviewed commit. A finding that names the right defect with an
   unresolvable citation counts as NOT caught.

4. **The threshold is evaluated against a denominator fixed before scoring, subject to a floor.**
   The bar is 3 of 5. If fewer than five ids map to a reviewable artifact, the denominator is the
   number that mapped and the bar is `ceil(0.6 × denominator)`, recorded explicitly before any run
   is scored. **Below a denominator of 3 the experiment is INCONCLUSIVE** — it neither unblocks nor
   stops Phase 2, and the finding says so. Without that floor a single mapped id yields a bar of 1,
   so the gate could be "met" on one run; and because Step 1's `UNMAPPED` classification is what
   sets the denominator, the weakening would happen upstream of the fix-the-denominator guard rather
   than after it. The mapping table is committed before Step 4 begins, so the denominator is on
   record independently of any result.

5. **A written finding exists either way, and the initiative's next step follows from it.** The
   finding is committed at
   `.context-index/research/referent-integrity-falsification-2026-08.md`. If the bar is met, Phase 2
   is unblocked. If it is not, the evidence track stops and the finding states that the reviewers
   were failing on reachability rather than scope.

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

Naming the pack is not optional bookkeeping. An entry that omits `context_pack` silently inherits
`base`, whose globs resolve only under `.context-index/` — and context reachability is the exact
hypothesis this experiment falsifies, so an accidental fall-through would confound the result.
An entry naming a pack absent from `context_packs:` produces a load error instead, which aborts the
whole panel.
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
4. Run `/adev:review-specs --spec <path>`.
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
  edit, not a duplicate; `mergeReviewers` is keyed on `id`.

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
- [ ] The `referent-integrity` entry names a `context_pack`, and that pack is declared under
      `context_packs:` in the same `review.yaml` — it does NOT fall through to `base`
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
- [ ] Each of the five runs has a preserved `.review.md` under
      `.context-index/research/referent-integrity-falsification/`
- [ ] Each run carries two recorded judgements — defect named, citation resolves — and a finding
      whose citation does not resolve is scored as NOT caught
- [ ] The finding at `.context-index/research/referent-integrity-falsification-2026-08.md` states
      the tally, the bar, the verdict, and the consequence for the initiative's evidence track
- [ ] The experiment reviews PRE-FIX revisions: for each run, the reviewed commit is an ancestor of
      the fixing commit named in the resolution table
- [ ] `npm test` passes and `adev diagnose` is clean — neither should be affected, and a change to
      either indicates the experiment leaked outside `.context-index/`
- [ ] No constitutional violations
