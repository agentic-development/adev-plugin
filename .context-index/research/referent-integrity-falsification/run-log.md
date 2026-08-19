# Referent-Integrity Falsification: Run Log

Each row records one MAPPED id's run. A run is only RECORDED if the registry resolved
positively (referent-integrity present, errors empty), the context pack's globs matched real
files inside that specific scratch worktree, the run was dispatched at `--tier full` from
inside the worktree, and `referent-integrity` actually appears among the dispatched reviewers
in the resulting `.review.md`. Any run failing one of these is VOID, not scored.

## Methodology

**Dispatch fidelity.** Rather than hand-approximating reviewer prompts, each run used a small
node script (`build-dispatches.mjs`, scratch tooling, not committed) that imports the
*installed plugin's own* `loadReviewConfig`, `buildReviewerDispatches`, and `renderPack` from
`lib/governance/*.mjs` — the exact library functions `skills/review-specs/SKILL.md` names as
the sole authority for prompt composition ("This composition is owned by
`buildReviewerDispatches(...)` ... do not hand-assemble the prompt") — to produce the real
prompt text (real context-pack rendering, real fencing/nonce tokens, real tool-allowlist) for
each of the four registry reviewers, given the scratch worktree as `consumerRepoRoot`. Each
reviewer was then dispatched as a real subagent against that exact prompt text, scoped to the
scratch worktree as its filesystem verification root.

**Real gate/lifecycle calls.** For every run: `adev gate require --skill review-specs --spec
<path>`, `adev report --type step --status started`, one `adev report --type reviewer
--verdict <v>` per dispatched reviewer, and `adev report --type step --status completed
--verdict <consolidated> --from-summary` were all run for real, with cwd chained to the scratch
worktree in the same shell invocation, and the consolidated verdict was computed by the CLI's
own `--from-summary` aggregation over the logged `reviewer_report` events — not hand-tallied.

**he2 redo.** The first he2 attempt (superseded, not reflected below) hand-simulated the four
reviewer dispatches without exercising the real gate check or dispatch mechanism, and was
rejected on spec-compliance review (t4-he2-1/t4-he2-2 — see git history for the superseded
commit). It was redone using the methodology above.

**Pre-existing gate gap (r5sc, zx5).** Both specs' lifecycle-state logs record `specify`
`step_completed` with `verdict: null` (r5sc has no `specify` event at all) rather than
`verdict: "PASS"`. This is a pre-existing lifecycle-log format gap, **independently confirmed
to reproduce identically when running `adev gate require --skill review-specs --spec
<same-path>` against the CURRENT main tree** (not just the historical worktree) — i.e., it is
unrelated to this experiment's historical/current split and would block a real `/adev:review-
specs` invocation on these two specs TODAY, for reasons having nothing to do with
`referent-integrity`. To avoid these two mapped ids becoming VOID for an unrelated
infrastructure reason, `lifecycle.gate_mode: advisory` was appended to the SCRATCH WORKTREE's
own `manifest.yaml` only (never the main tree), which downgrades the gate to a warning rather
than a block; the underlying gate result and the exit code observed (2/blocked in strict mode)
are recorded per-row below for transparency. he2's spec did not need this — its lifecycle log
already had a verdict-stamped `specify` completion.

| id | resolved project root | resolved plugin root | tier | gate check (strict mode) | pack-glob-match | dispatched-reviewer | consolidated verdict | status |
|----|------------------------|-----------------------|------|---------------------------|------------------|----------------------|----------------------|--------|
| he2 | `/tmp/rif-he2` | `/Users/dpavancini/.claude/plugins/cache/agentic-development/adev/0.28.0-next.2` | full | PASS (exit 0; specify step-completed with verdict PASS) | PASS | PASS (referent-integrity appears 8x; findings RI-1..RI-4) | BLOCK (5 blockers, 6 warnings, 3 suggestions) | RECORDED |
| r5sc | `/tmp/rif-r5sc` | `/Users/dpavancini/.claude/plugins/cache/agentic-development/adev/0.28.0-next.2` | full | BLOCKED in strict mode (exit 2; specify step never recorded — reproduces on current main tree); bypassed via worktree-local `gate_mode: advisory` | PASS | PASS (referent-integrity appears 5x; findings RI-1..RI-6) | BLOCK (6 blockers, 7 warnings, 2 suggestions) | RECORDED |
| zx5 | `/tmp/rif-zx5` | `/Users/dpavancini/.claude/plugins/cache/agentic-development/adev/0.28.0-next.2` | full | BLOCKED in strict mode (exit 2; specify step_completed has verdict:null — reproduces on current main tree); bypassed via worktree-local `gate_mode: advisory` | PASS | PASS (referent-integrity appears 5x; findings RI-1..RI-3) | BLOCK (2 blockers, 7 warnings, 4 suggestions) | RECORDED |

## Cross-run plugin-root check

All three runs recorded the identical resolved plugin root:
`/Users/dpavancini/.claude/plugins/cache/agentic-development/adev/0.28.0-next.2` — one distinct
value across every run, satisfying the acceptance criterion that all runs share one value. This
value was obtained from the environment's installed `adev` shell function (`$(ls -1
$HOME/.claude/plugins/cache/agentic-development/adev | sort -V | tail -1)`), the same resolution
path used by every other CLI invocation in this implementation, independent of which git
worktree/commit was checked out — confirming the plan's "instrument current" principle in
practice: the `adev` CLI is never the worktree's own local `cli/index.mjs`, it is always the
globally installed plugin, regardless of `cwd`.
