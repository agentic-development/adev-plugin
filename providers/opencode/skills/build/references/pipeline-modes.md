## Pipeline Modes

**Implement Pipeline** (default, no `--full`): `plan → route → implement → validate`

Use when the spec already exists with a valid `.review.md` (PASS or PASS_WITH_NOTES verdict). Skips specify and review. If no `.review.md` is found, the skill warns and stops. Includes the validate→implement retry loop if `build.max_retries > 0`.

**Full Pipeline** (`--full`): `specify → review (BLOCK → /adev:specify --revise loop, up to build.max_review_retries cycles) → plan → route → implement → validate`

Use when starting from scratch or when the spec needs authoring. Step 0 dispatches `/adev:specify` only when no spec file exists AND the lifecycle log has no completed `specify` event for this spec; otherwise Step 0 is recorded as `skipped` (the prior session's spec work is authoritative — `review-specs` and downstream gates catch any drift). Step 1 runs `/adev:review-specs`; on BLOCK with `build.max_review_retries > 0`, the build dispatches the BLOCK→revise auto-retry loop documented under "Blocker handling" below — `/adev:specify --revise <spec>` re-authors the spec, `/adev:review-specs` re-evaluates, and the convergence detector (`lib/loop-convergence.mjs`) decides PASS / CONTINUE / NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED. With `--require-human-final-pass`, a PASS verdict halts the build at `PASS_PENDING_HUMAN` for operator acknowledgement. Includes the validate→implement retry loop if `build.max_retries > 0`.

**Model:** The build orchestrator carries no `model:` frontmatter pin — it runs on the session's active model (the hardcode was removed in `42294cf7`/`170f8837`; no spec tracks that key). Its own work is mechanical (gate-check, dispatch, record); a cheaper model there was floated in the 2026-05-16 validation-charter retro (Opus was ~5x Sonnet's cost on cache reads) but isn't enforced. Worker skills resolve their own tier from `platform-context.yaml:model_tiers` (see `.context-index/specs/cross-cutting/model-routing.spec.md`). Config-driven binding via `/adev:sync` is tracked by `issue-538`.

---
