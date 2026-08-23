## Arguments

- `--spec <path>`: build a single spec end-to-end through all pipeline steps
- `--charter <module>`: discover and build all specs under `.context-index/specs/features/<module>/`
- `--module <module>`: alias for `--charter`
- `--milestone <name>`: discover and build all specs with matching `milestone` frontmatter
- `--resume`: resume an interrupted build from the last successful step
- `--dry-run`: show the pipeline plan without executing any skill or writing any file
- `--no-route`: skip the route step (Step 3) in the pipeline
- `--full`: run the Full Pipeline (specify → review → plan → route → implement → validate). Without `--full`, the default Implement Pipeline skips specify and review and requires a pre-existing `.review.md`.
- `--from <step>`: override resume point — force restart from a specific step (`specify`, `review`, `plan`, `route`, `implement`, `validate`). Useful if build state is corrupted or stale.
- `--no-infra`: skip infrastructure preflight in implement and validate steps (user-only — the agent must never set this flag). Propagated to sub-skills via `ADEV_NO_INFRA=1` env var.
- `--verbose`: disable silent execution for all subagents in this pipeline run. Subagent prompts include `VERBOSE: true`, causing skills to narrate each step. Useful for debugging pipeline failures.
- `--auto`: run the entire pipeline without prompting the user for input. Stale builds are overwritten (not prompted). Subagent prompts include `AUTO: true`, instructing sub-skills to make autonomous decisions instead of asking the user (e.g., accept default choices, skip confirmations). The build stops on errors rather than asking for guidance. Useful for CI, scheduled builds, and batch operations.
- `--require-human-final-pass`: hybrid-mode gate added by the `review-block-auto-retry` spec. When the BLOCK→revise loop converges on PASS at revision N+1, the build halts with verdict `PASS_PENDING_HUMAN` instead of proceeding. A `human_approval_required` lifecycle event is emitted. The operator runs `/adev:build --resume --spec <spec>` to acknowledge the final revision and continue to plan/implement. Use in risk-averse domains where auto-revised specs require human sign-off before downstream work.
- `--tier <full|quick>`: rigor tier (graduated-rigor-tiers spec). When provided, propagated to the `/adev:review-specs --tier <t>` dispatch in Step 1 and the `/adev:validate --tier <t>` dispatch in Step 5. When absent, each of those steps resolves its own rigor tier via the routing signal / risk policy / default `full` precedence described in `graduated-rigor-tiers.spec.md` — the build orchestrator does not resolve or default this value itself. Invalid values surface as `INVALID_TIER` from whichever step first attempts resolution. **Not the same as gate tiers.** This is the rigor tier (`full`/`quick`) that governs review/validate depth — do not confuse it with the *gate* tiers (`fast`/`integration`/`e2e`) that Check 1 of `/adev:validate` groups quality gates into (see the Dry Run Mode gate-tier summary below); the two are unrelated concepts that happen to share the word "tier".
