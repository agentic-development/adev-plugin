## Dry Run Mode

When `--dry-run` is specified, show the full pipeline plan without executing any skill, writing any file, or modifying any state.

### Dry Run with `--spec <path>`

Show:
1. The spec path and its current status.
2. Which pipeline steps would **execute** vs **skip** (based on existing `.review.md`, `.plan.md`, `--no-route` flag).
3. If a `.plan.md` exists, show the estimated task count from the plan.
4. If a build state file exists, note whether `--resume` would change the pipeline.
5. Flag any `completed_with_warnings` conditions -- specs that may need attention even after previously passing review.

### Dry Run with `--charter <module>`

Show:
1. All discovered specs under `.context-index/specs/features/<module>/` (with their frontmatter status).
2. Dependency order (from `depends-on` frontmatter or charter Capability Map order).
3. Per-spec step breakdown: which steps would execute vs skip.
4. Total estimated tasks across all specs (from existing plans).
5. Specs that would be skipped entirely (draft status, not ready for pipeline mode).

### Dry Run with `--milestone <name>` (Workspace Mode)

When `--dry-run` is combined with `--milestone` in workspace-mode (`detectWorkspace` non-null, `currentRepoSlug` null), show the cross-repo build plan:

```
Dry Run: Workspace Build for milestone '<name>'

  Repo order (topological):
    1. <repo-slug> (upstream — no dependencies)
    2. <repo-slug> (depends on: <upstream-slug>)
    ...

  Per-repo spec breakdown:
    <repo-slug>:
      - <spec-path>: Step 1 Review SKIP, Step 2 Plan EXECUTE, ...
    ...
```

### Dry Run with `--milestone <name>` (Single-Repo)

Show:
1. All discovered specs for the milestone (with their frontmatter status).
2. Dependency order (if applicable).
3. Per-spec step breakdown: which steps would execute vs skip.
4. Total estimated tasks across all specs (from existing plans).
5. Specs that would be skipped entirely (already completed, draft status).

### Output Format

**Persona adaptation:** The formats below are defaults for the Developer persona. If a different persona is active, adapt the chat summary to its output rules.

```
Dry Run: Build Pipeline for <spec or milestone>

  Spec: .context-index/specs/features/<module>/<spec>.spec.md
    Step 1: Review    — SKIP (review.md exists, current)
    Step 2: Plan      — SKIP (plan.md exists, 5 tasks)
    Step 3: Route     — EXECUTE
    Step 4: Implement — EXECUTE (5 tasks)
    Step 5: Validate  — EXECUTE

  Gates: fast (test, lint), integration (test), e2e (smoke, full)

  ⚠ completed_with_warnings: <spec> passed review with notes — verify notes are addressed.

  Retry policy: max_retries=<N> (from user-config)

  Estimated effort: 5 tasks across 3 active steps.
```

**Gate tier summary in dry-run:** Read `governance/gates.yaml` for display purposes only — show tier names and gate IDs grouped by tier (e.g., "Gates: fast (test, lint), integration (test), e2e (smoke)"). This is a display-only read, not gate resolution — the orchestrator does not apply severity defaults or tier ordering. If `governance/gates.yaml` does not exist or has no gates, show "Gates: none configured."

`--dry-run` is strictly read-only. It never invokes a skill, writes a file, or modifies build state.

---
