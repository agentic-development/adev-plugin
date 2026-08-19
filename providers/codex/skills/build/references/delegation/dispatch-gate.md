### Gate Between Sub-Skill Dispatches

Before dispatching ANY sub-skill, run the lifecycle gate. The lib contract for `requireGate(state, stepName, ...)` is **pass the step about to begin** — the lib resolves its prior internally and asserts that prior is completed with a passing verdict.

```javascript
import { currentState, requireGate, resolveGateMode, reportStep } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';
import { loadManifest } from '<ADEV_ROOT>/lib/manifest.mjs';

const state = currentState(projectRoot, specPath);
const mode = resolveGateMode(loadManifest(projectRoot));

// Per-step gate calls (pass the step ABOUT TO BEGIN; the lib resolves
// its prior internally and checks that prior is completed/passing):
//   before review    → requireGate(state, "review",    { mode })  // checks specify
//   before plan      → requireGate(state, "plan",      { mode })  // checks review
//   before route     → requireGate(state, "route",     { mode })  // checks plan
//   before implement → requireGate(state, "implement", { mode })  // skips optional route → checks plan
//   before validate  → requireGate(state, "validate",  { mode })  // checks implement
requireGate(state, "<step-about-to-begin>", { mode });

// Then emit the lifecycle entry event before invoking the sub-skill:
reportStep(projectRoot, specPath, { step: "<step>", status: "started" });
```

In strict mode (default), `requireGate` throws `GateError` if the resolved prior step is incomplete — the orchestrator stops and surfaces the message unchanged. In advisory mode, it warns and continues. Do NOT catch `GateError`. The `route` step is in `OPTIONAL_GATE_STEPS`, so `priorStepOf("implement")` walks past `route` and returns `"plan"` — implement does NOT require route to have run.

Emit a matching `reportStep` exit (`status: "completed"`) immediately after the sub-skill returns and BEFORE the `recordStepResult()` call, so the next turn's `currentState` reads the most recent step status.
