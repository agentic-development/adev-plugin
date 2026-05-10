# Live Spec: Plan Injection

<!-- Live Spec within the heuristics charter.
     Adds heuristic injection to /adev:plan so that per-task context packets
     in the generated plan include relevant heuristics. This enables
     /adev:implement subagents to receive heuristics even before runtime
     retrieval, as the plan itself carries the heuristic references.
     Depends on: retrieval-filtering.md (budget and format conventions).
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: validated
risk_level: low
milestone: 1
revision: 1
charter-revision: 5
created: 2026-04-12
updated: 2026-04-12
source-manifest:
  sha: "b079392"
  files:
    - skills/plan/SKILL.md
    - tests/skills/plan-heuristic-injection.test.mjs
    - lib/heuristics.mjs
    - .context-index/specs/features/heuristics/retrieval-filtering.md
  computed-at: "2026-04-25T21:55:13.556Z"
---

## Behavioral Contract

### Preconditions

- `/adev:plan` SKILL.md exists with a "Context Packet Section" that generates per-task context manifests
- `lib/heuristics.mjs` is importable
- The spec being planned has a `charter:` frontmatter field identifying the target module
- Retrieval filtering conventions (retrieval-filtering.md) are defined

### Behaviors

1. **When** `/adev:plan` generates a plan for a spec with `charter: M` **then** it reads heuristics for module `M` and `_global` using the retrieval protocol (dual-read, merge, dedup, budget cap). This read happens once during plan generation, not per task.

2. **When** heuristics are available **then** `/adev:plan` adds a `- Heuristics:` entry to each task's context packet manifest listing the heuristic IDs and titles that are relevant to the plan's module:

```markdown
### Task N Context
- Spec: `.context-index/specs/features/<module>/<spec>.md` (criteria 1-3)
- Charter: `.context-index/specs/features/<module>/charter.md`
- Heuristics: <N> entries for module `<M>` (IDs: <id1>, <id2>, ...)
```

3. **When** heuristics are available **then** `/adev:plan` also adds a top-level `## Heuristics` section to the plan file (after Context Packets, before Parallelization) that renders each heuristic in the standard format. This section serves as a self-contained reference — `/adev:implement` can read heuristics from the plan itself rather than requiring runtime file reads.

4. **When** no heuristics are available for the module **then** no `- Heuristics:` entry appears in task context packets and no `## Heuristics` section is added to the plan. The plan is valid without heuristics.

5. **When** `readHeuristics` throws during plan generation **then** the planner catches the error, logs a single-line warning, and proceeds without heuristics. Planning is never blocked by heuristic retrieval failure.

6. **When** `heuristics.injection_limit` is set to `0` in `manifest.yaml` **then** heuristic injection is skipped entirely with a logged advisory.

### Postconditions

- The generated plan file includes heuristic references in context packets when heuristics are available
- The plan's `## Heuristics` section is a snapshot at plan-generation time for review convenience only; it does not auto-update if heuristics change later. At execution time, `/adev:implement` reads from the live heuristic store (per implement-injection spec), which is authoritative over the plan snapshot.
- No heuristic files are modified by the plan generation process

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `lib/heuristics.mjs` cannot be imported | Log warning, generate plan without heuristics | — |
| Spec has no `charter:` field | Use `_global` heuristics only | — |
| Module slug not in manifest modules | Proceed with `_global` only | — |

## System Constitution Reference

- **Principle 2: Skills are primarily markdown** — Injection logic is documented as SKILL.md instructions. The planner reads heuristics via inline Node.js, matching existing plan generation patterns.
- **Quality: Degradation** — Heuristic injection failure never blocks planning.
- **Quality: Context Budget** — The injection budget prevents plan file bloat.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1 | Add heuristic loading to `/adev:plan` SKILL.md (inline Node.js read during context loading phase) | small |
| T2 | Add `- Heuristics:` entry to the context packet manifest template in SKILL.md | small |
| T3 | Add `## Heuristics` section template to the plan output format in SKILL.md | small |
| T4 | Eval test: plan generation with heuristics → plan includes heuristics section | small |
| T5 | Eval test: plan generation without heuristics → plan has no heuristics section | small |

## Acceptance Criteria

- [ ] `/adev:plan` reads heuristics for the target module during plan generation
- [ ] Per-task context packets include `- Heuristics:` entries when heuristics are available
- [ ] A top-level `## Heuristics` section is added to the plan file with rendered heuristic blocks
- [ ] Heuristic retrieval failures are caught and logged, never blocking planning
- [ ] `injection_limit: 0` disables injection with a logged advisory
- [ ] `low`-confidence heuristics are never included
- [ ] Plans generated without heuristics are structurally identical to current output
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
