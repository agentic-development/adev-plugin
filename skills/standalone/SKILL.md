# /adev:standalone

Disable lifecycle gate enforcement for this session.

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill standalone
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

## When to Use

- Exploratory coding without a plan
- Quick fixes to non-tracked code
- Prototyping before committing to a spec

## Behavior

1. Write `status: standalone` to `.context-index/.execution-state.json` via `writeExecutionState`
2. All lifecycle gates pass for the remainder of this session
3. Next session start (without `ADEV_STANDALONE=1` env var) resets to `idle`

## Instructions

Find the project root (the directory containing `.context-index/`). Then write the execution state via the CLI:

```bash
adev execution-state write --status standalone
```

The verb persists `{ status: "standalone" }` to `.context-index/.execution-state.json` and exits 0 on success. Confirm to the user: "Standalone mode activated. Lifecycle gates disabled for this session."
