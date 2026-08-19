## Prerequisites

Before starting, verify all conditions. If any fails, stop and tell the user what to fix.

1. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
2. **Spec provided or discoverable.** At least one spec must be specified via `--spec` or discoverable via `--charter` or `--milestone`.
3. **Valid arguments.** If `--spec` is provided, the file must exist. If `--charter` (or `--module`) is provided, the module name must be a non-empty string and `.context-index/specs/features/<module>/` must be a directory. If `--milestone` is provided, the milestone name must be a non-empty string.

4. **Read build config.** Resolve `build.max_retries` from `user-config` (local `.context-index/user-config` → global `<PLUGIN_ROOT>/user-config` → default `0`). Use `parseUserConfig()` from `lib/persona.mjs` to read both config files. Look for the key `build.max_retries`. Clamp to range 0-3 with a warning if out of range.

5. **Read review-retry config.** Resolve `build.max_review_retries` from `manifest.yaml::build.max_review_retries` (default 2 per `lib/manifest.mjs` Task 12 of review-block-auto-retry). Set to `0` to disable the BLOCK→revise auto-retry loop entirely (sidecar+fail-loud on the first BLOCK — the legacy 7e333fd behavior). Negative values are rejected at manifest load with `INVALID_MAX_REVIEW_RETRIES`. The CLI flag `--require-human-final-pass` orthogonally requires operator sign-off when the loop converges on PASS — see the BLOCK→revise auto-retry loop documentation in Step 1 below.

If `.context-index/` does not exist, tell the user:

> This project has not been initialized with the Agentic Development Framework. Run `/adev:init` first to set up the context index, then come back to build.

