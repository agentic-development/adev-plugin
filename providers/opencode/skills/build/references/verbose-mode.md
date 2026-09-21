### Verbose Mode

When `--verbose` is set, the orchestrator prints its reasoning before each dispatch: which step was selected, why it was not skipped, what context packet was assembled. This is diagnostic output only — `--verbose` does not change the one-step-per-turn behavior. The orchestrator still dispatches exactly one step and re-invokes.

---
