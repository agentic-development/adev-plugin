## API reference

Lifecycle event log:

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — read the projection; this skill writes the `review` step entries that downstream skills gate on.
- `requireGate(state, "specify", { mode })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — hard-blocks (or warns) when the prior step is not complete.
- `resolveGateMode(loadManifest(projectRoot))` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — resolves `manifest.lifecycle.gate_mode`.
- `reportStep(projectRoot, specPath, { step: "review", status, verdict? })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits skill entry/exit. The exit event carries the consolidated verdict.
- `reportReviewer(projectRoot, specPath, { step: "review", reviewer, verdict, notes })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits one event per dispatched reviewer; severity is stamped at write time from `reviewers.yaml`.

Spec drift:

- `hasDrift(specPath)` from `<ADEV_ROOT>/lib/spec-drift.mjs` — detects spec-content drift since last validation; used in Step 1 to identify specs needing re-review.

Rigor tiers:

- `resolveRigorMode({ skill: "review", riskLevel, policies, tierOverride, routingEasy })` from `<ADEV_ROOT>/lib/governance/rigor-mode.mjs` — resolves `full` | `quick` (Step 2.5). Precedence: tier override > routing signal > risk policy > `full`.
- `loadRigorPolicies(projectRoot)` from `<ADEV_ROOT>/lib/governance/rigor-mode.mjs` — reads `risk-policies.yaml` `policies` map (`review_mode` / `validate_mode`).

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
