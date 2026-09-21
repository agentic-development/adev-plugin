### What the Orchestrator Does Directly

The ONLY work the build orchestrator performs itself (not via subagent):

- **Uses** `lib/build-state.mjs` helper (`readBuildState`, `createBuildState`, `recordStepResult`, `getNextStep`) for all build-orchestrator resume state — never writes the helper's underlying storage manually. The helper owns its on-disk shape; the skill talks to the helper, not to the filesystem.
- **Uses** `lib/lifecycle-state.mjs` (`currentState`, `requireGate`, `reportStep`) to gate between chained sub-skills and to emit step-level lifecycle events that downstream skills consume.
- **Reads** spec frontmatter for `milestone` field (milestone discovery) and `source-manifest` (validate step context)
- **Reads** `state.steps.review.notes` and `state.steps.review.verdict` from the lifecycle projection for review skip conditions / context (replaces parsing `.review.md` directly)
- **Reads** `.plan.md` files for skip conditions and to extract task count for step context
- **Reads** `governance/gates.yaml` for dry-run gate display only
- **Reads** `manifest.yaml` for `tasks.backend` (issue board configuration) via `loadManifest`
- **Reads** `user-config` files (local and global) via `parseUserConfig()` for `build.max_retries` (retry policy)
- **Calls** `detectWorkspace(cwd)` once at build start for workspace context
- **Writes** build-orchestrator resume state via `recordStepResult()` (atomic writes with validation, owned by the helper)
- **Emits** `reportStep` events to the lifecycle log at each sub-skill entry/exit so downstream `requireGate` calls see the latest state
- **Prints** progress headers and the final summary

Everything else — reading source code, running tests, dispatching implementation subagents, checking spec compliance, writing reports — happens inside the subagent's context.

---
