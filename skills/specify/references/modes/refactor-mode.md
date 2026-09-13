## Refactor Mode (`--refactor`)

Produces a refactoring spec with current state analysis, target state definition, a step-by-step migration path, and invariants.

### Step 0: Lifecycle entry event

Emit the entry event from the Shared: Lifecycle Events section before any other action in this mode.

### Step 1: Resolve Charter

Use the shared Resolve Charter section above.

### Step 2: Load Context and Identify Scope

Load context per the shared section above. Ask the user:

```
→ What code do you want to refactor? (module, files, or describe the area)
→ What is the problem with the current code?
→ What should the code look like after refactoring?
```

### Step 3: Analyze Current State

Read the identified code. Build the Current State section:

- **Structure table:** file, role, line count, notes
- **Problems:** specific, measurable issues (e.g., "`processOrder` is 340 lines with cyclomatic complexity of 28, handling 4 unrelated concerns.")
- **Dependencies:** what other code relies on code being refactored — these are migration constraints.

If an extract spec already exists for this module, load it instead of re-analyzing.

### Step 4: Define Target State

Based on user description and analysis:

- **Structure table:** target file layout with roles
- **Improvements:** how each problem from Current State is resolved

Validate the target state against the constitution. Flag violations:

```
⚠ Your target state introduces a direct database call from a UI component.
  This violates: "Database access only through server actions or API routes."

→ Revise the target state, or note this as a constitutional exception?
```

### Step 5: Build Migration Path

Each migration step must be independently deployable, have clear verification criteria, include risk assessment, and follow safe ordering (extract before modify, tests before refactor).

Use the template at `${CLAUDE_PLUGIN_ROOT}/templates/spec-template.refactor.md`.

```
Proposed migration path (4 steps):

  Step 1: Extract shared validation logic
    Move validation into validators/order-validators.ts.
    Risk: Low — pure extraction, no behavior change.
    Verify: All existing order tests pass.

  Step 2: Split processOrder into pipeline stages
    Break into: validate → enrich → persist → notify.
    Risk: Medium — behavior must remain identical.
    Verify: Existing tests pass + new unit tests per stage.

  Step 3: Add integration test for the full pipeline
    Risk: Low — adding tests only.

  Step 4: Update entry points to use the pipeline
    Risk: Medium — all callers must be updated.
    Verify: All tests pass, no remaining references to old function.

→ Does this migration path look right? (yes / reorder / add step / remove step)
```

### Step 6: Define Invariants

Invariants are properties that must remain true at every migration step. Always include:

- All existing tests continue to pass at every step
- Public API contracts do not change (unless the spec explicitly permits it)
- No data loss or corruption during migration

Ask for domain-specific invariants:

```
→ Any additional invariants? For example:
  - "Response times must stay under 200ms"
  - "The audit log format must not change"
```

### Step 7: Write Behavioral Contract and Spec

Define the target behavior (what the system does AFTER refactoring). This gives `/adev:validate` something to verify against.

1. **Resolve kind first** (apply Step 3.5 of Standard mode if not already supplied): if `--kind` was not passed, prompt with the ask-first menu. The natural pairing for a refactor workflow is `--kind refactor`, but any kind is permitted — the workflow and kind axes are orthogonal.
2. **Resolve the template via `resolveTemplate('spec', kind, domain)`** (see Standard mode Step 5). Do not hardcode the template filename. Handle `TEMPLATE_NOT_FOUND` and `UNSAFE_TEMPLATE_PATH` the same way Standard mode does.
3. Set frontmatter per the shared section with `mode: refactor` AND an explicit `kind: <chosen value>` field (no defaulting).
4. Save to `.context-index/specs/features/<module>/<spec-slug>.spec.md`.

### Step 7.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 8: Summary

Emit the lifecycle exit event from the Shared: Lifecycle Events section (`--status completed --verdict PASS`).

Output the shared summary template with these stats:
```
  Current state: <N> files, <N> problems identified
  Target state: <N> files (<N> new, <N> modified, <N> unchanged)
  Migration steps: <count>
  Invariants: <count>
  Behaviors: <count>
  Acceptance criteria: <count>

  Review the migration path carefully — this is the highest-risk section.
```

---
