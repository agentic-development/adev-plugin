# Review-Block Auto-Retry Convergence Eval — treatment trial (partial)

**Date:** 2026-10-04
**Fixture:** tests/evals/integration-sandbox/.context-index/specs/cross-cutting/broken-loop-fixture.spec.md
**Arm:** treatment (current branch, `e73dbeaa` + uncommitted harness fixes)  **Model:** sonnet  **Tier:** full
**Trials:** 1 usable (the session hit the claude.ai usage limit during its 4th review); trial 2 failed in 3s on the same limit.

Reconstructed from the trial's own session transcript (`12da4208`), because the
next trial's fixture reset deleted the lifecycle log before the harness read it.
The harness now reads partial trials before resetting.

> **Caveat — mixed CLI versions.** Trials before the arm-pinned `adev` shim ran
> the branch's skill prose but resolved a bare `adev` to the host's installed
> 0.27.9 plugin cache (via a `~/.zshrc` function). This trial hit missing verbs
> and switched to the branch CLI by hand for the loop verbs (`group-blockers`,
> `revise`, `check-mechanisms`, `blockers write`), but every `build-state` call
> ran on 0.27.9. Findings 1–3 come from branch-CLI calls; finding 5 (retry
> budget) is unconfirmed; costs and cycle counts are not comparable with the
> baseline, whose bare `adev` calls also ran 0.27.9.

## What happened

| Revision | Review verdict | Blockers | Loop action |
|---|---|---|---|
| 1 | BLOCK | 11 (all `defect`) | 2 authoring subagents (`error-cases`, `behavioral-contract`); `revise --auto` → rev 2, 3 addressed; `check-mechanisms` clean |
| 2 | BLOCK | 13, **3 `external`** (`remedy_ref` → orders charter) | External-remedy lines printed, externals excluded from accounting; 2 authoring subagents; `revise` → rev 3, 2 addressed |
| 3 | BLOCK | 9 (6 loop-eligible) | Convergence: prev=10, curr=6 → CONTINUE; `revise` with **no authored sections** → rev 4, 0 addressed |
| 4 | — | — | Review dispatched; session hit usage limit |

Cost (session + 29 subagents, `analyzeSession`): **$40.55**. Duration 55 min.

Baseline reference (`eec2d6e1`, same model, 2026-10-03 and 2026-09-25): 1 revise cycle,
9–10 reviewer dispatches, terminal BLOCK, $17.55 / $20.48.

## Findings

1. **`EXTERNAL_REMEDY` works end to end.** Real reviewers emitted `finding_class: external`
   with a `remedy_ref`; the loop printed the rendered line and excluded those ids from
   convergence accounting.
2. **Blocker anchors that are not headings can never be authored.** The fixture's behaviors
   are a numbered list under one `## Behaviors` heading. Reviewers anchored blockers to
   `behaviors-1/2/3/5`; `group-blockers` resolves only heading anchors, so those blockers
   landed in `anchors_not_found` every cycle. These are the planted contradiction (BEH-2)
   and mechanism-existence (BEH-3) defects, so the loop cannot converge on this fixture.
3. **Splice left `error-cases` malformed** (old table and new paragraph both present).
4. **A cycle with nothing to author still revised** (rev 3 → 4, `addressed: []`), spending
   a full re-review that cannot make progress.
5. **Retry budget appears to start counting at the first convergence check**, so the trial
   reached revision 4 with `max_review_retries: 2`.
6. **`DECISION_REQUIRED` did not fire**: no reviewer classed the planted design-decision
   defect (BEH-4) as `decision`.

## Verdict for criterion #11

Not met. The treatment reached neither PASS nor a correct `DECISION_REQUIRED`/`EXTERNAL_REMEDY`
exit, and cost more than the baseline. Findings 2 and 4 are structural: another trial on this
fixture would reproduce them, so they should be fixed before re-running.
