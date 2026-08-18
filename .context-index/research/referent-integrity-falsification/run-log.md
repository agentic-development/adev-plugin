# Referent-Integrity Falsification: Run Log

Each row records one MAPPED id's run. A run is only RECORDED if the registry resolved
positively (referent-integrity present, errors empty), the context pack's globs matched real
files inside that specific scratch worktree, the run was dispatched at `--tier full` from
inside the worktree, and `referent-integrity` actually appears among the dispatched reviewers
in the resulting `.review.md`. Any run failing one of these is VOID, not scored.

**Methodology note (he2 only):** the first he2 attempt (superseded, not reflected below) hand-
simulated the four reviewer dispatches without exercising the real `/adev:review-specs`
gate check or reviewer-dispatch mechanism, and was rejected on spec-compliance review
(t4-he2-1/t4-he2-2). It was redone as recorded below using: (1) real `adev gate require
--skill review-specs` / `adev report --type step --status started` calls with cwd pinned to
the scratch worktree, (2) a small node script (`build-dispatches.mjs`, not committed —
scratch tooling) that imports the installed plugin's own `loadReviewConfig` +
`buildReviewerDispatches` + `renderPack` from `lib/governance/*.mjs` to produce the exact
prompt text (including real context-pack rendering and fencing/nonce) the production skill
would build, rather than a hand-approximated prompt, (3) real subagent dispatch of each of
the four reviewers against that exact prompt text, scoped to the scratch worktree as their
verification root, and (4) real `adev report --type reviewer` / `--type step --status
completed --verdict <v> --from-summary` calls (also cwd-pinned) to compute the consolidated
verdict from the actual logged reviewer reports, not a hand-computed tally.

| id | resolved project root | resolved plugin root | tier | pack-glob-match | dispatched-reviewer | consolidated verdict | status |
|----|------------------------|-----------------------|------|------------------|----------------------|----------------------|--------|
| he2 | `/tmp/rif-he2` | `/Users/dpavancini/.claude/plugins/cache/agentic-development/adev/0.28.0-next.2` | full | PASS (docs/cli-reference.md, docs/skill-reference.md, .context-index/orientation/architecture.md all present in worktree) | PASS (referent-integrity appears 8x in the `.review.md`; findings RI-1..RI-4) | BLOCK (5 blockers, 5 warnings, 3 suggestions total; computed via `adev report --type step --status completed --verdict BLOCK --from-summary` from the real `reviewer_report` events logged inside the worktree) | RECORDED |
