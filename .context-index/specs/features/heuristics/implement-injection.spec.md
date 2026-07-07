# Live Spec: Implement Injection

<!-- Live Spec within the heuristics charter.
     Adds heuristic injection to /adev:implement Step 1 (Load Context) and
     Step 2a (Context Packet Assembly). Subagents receive relevant heuristics
     as part of their context, enabling them to learn from past failures and
     successes without reading heuristic files themselves.
     Depends on: retrieval-filtering.md (budget and format conventions).
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: validated
risk_level: low
milestone:
revision: 2
charter-revision: 5
created: 2026-04-12
updated: 2026-04-12
source-manifest:
  sha: "1a2f004"
  files:
    - skills/implement/SKILL.md
    - tests/skills/implement-heuristic-injection.test.mjs
    - lib/heuristics.mjs
    - .context-index/specs/features/heuristics/retrieval-filtering.spec.md
  computed-at: "2026-07-03T22:27:11.242Z"
---

## Behavioral Contract

### Preconditions

- `/adev:implement` SKILL.md exists with Step 1 (Load Context) and Step 2a (Context Packet Assembly)
- `lib/heuristics.mjs` is importable
- The plan file references a spec with a `charter:` field identifying the target module
- Retrieval filtering conventions (retrieval-filtering.md) are defined

### Behaviors

1. **When** `/adev:implement` Step 1 loads context **then** it also reads heuristics for the plan's target module using the retrieval protocol defined in retrieval-filtering: `readHeuristics(projectRoot, { module })` for the module scope and `readHeuristics(projectRoot, { module: '_global' })` for globals. Results are merged, deduplicated by `id`, sorted (confidence desc, module-before-global, recency), and capped per the injection budget (which excludes `low`-confidence entries).

2. **When** heuristics are loaded in Step 1 **then** they are stored as a `heuristics[]` array in the orchestrator's working memory for use in Step 2a context packet assembly. They are NOT re-read per task.

3. **When** Step 2a assembles a context packet for a task **then** it appends a `## Heuristics` section after the existing context packet content, containing the rendered heuristic blocks (per retrieval-filtering format). All tasks in the same plan receive the same heuristic set.

4. **When** the context packet is written to `.context-index/packets/<task-slug>.md` **then** the heuristics section is included in the persisted packet, making it available for post-mortem debugging via `/adev:recover`.

5. **When** no heuristics are available (empty store, module not found, or injection disabled via `injection_limit: 0`) **then** Step 2a proceeds without a heuristics section. No placeholder or empty section is emitted.

6. **When** `readHeuristics` throws during Step 1 **then** the orchestrator catches the error, logs a single-line warning, and proceeds with an empty heuristics set. Implementation is never blocked by heuristic retrieval failure.

7. **When** the subagent prompt is constructed **then** heuristics appear as advisory context with a preamble: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

### Postconditions

- Subagent context packets include relevant heuristics when available
- The heuristic content is logged to `.context-index/packets/` for traceability
- No heuristic files are modified by the injection process
- Implementation proceeds identically whether heuristics are present or not (no behavioral dependency on heuristic content)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `lib/heuristics.mjs` cannot be imported | Log warning, proceed without heuristics | — |
| Plan file has no `charter:` reference | Use `_global` heuristics only | — |
| Module slug from charter not in manifest modules | Proceed — `readHeuristics` returns `[]` for unknown modules | — |

## System Constitution Reference

- **Principle 2: Skills are primarily markdown** — The injection logic is documented as SKILL.md instructions. The orchestrator executes inline Node.js to call `readHeuristics`, matching the existing pattern used for execution state reads in Step 1.
- **Quality: Degradation** — Heuristic injection failure never blocks implementation. This is a strict non-blocking enhancement.
- **Quality: Context Budget** — The injection budget prevents context window bloat in subagent prompts.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1 | Add heuristic loading to Step 1 in `skills/implement/SKILL.md` using inline Node.js pattern | small |
| T2 | Add heuristics section to Step 2a context packet assembly in `skills/implement/SKILL.md` | small |
| T3 | Add advisory preamble to subagent prompt construction | small |
| T4 | Eval test: plan with heuristics available → context packet contains heuristics section | small |
| T5 | Eval test: plan with no heuristics → context packet has no heuristics section | small |
| T6 | Eval test: readHeuristics failure → implementation proceeds, warning logged | small |

## Acceptance Criteria

- [ ] `/adev:implement` Step 1 loads heuristics for the target module and `_global`
- [ ] Step 2a context packets include a `## Heuristics` section when heuristics are available
- [ ] Heuristics are rendered in the standard format (title, pattern, anti-pattern, evidence count)
- [ ] Subagent prompt includes advisory preamble for heuristic context
- [ ] Heuristic retrieval failures are caught and logged, never blocking implementation
- [ ] Context packets persisted to `.context-index/packets/` include the heuristics section
- [ ] `injection_limit: 0` disables injection entirely
- [ ] `low`-confidence heuristics are never injected
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
