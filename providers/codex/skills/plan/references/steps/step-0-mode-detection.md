## Step 0: Mode Detection

Before any other steps, determine the operating mode. Explicit flag wins over keyword detection, which wins over project-state inference, which falls back to a multi-choice menu on ambiguity.

### Resume Detection (Incremental Authoring)

**Before** anything else in Step 0, check whether a prior `/adev:plan` invocation left a `.partial` file for the resolved plan path. Per `incremental-artifact-writes.spec.md`, plan files are written incrementally to `<plan-path>.partial` with a `partial_schema: plan@1` marker and atomically renamed to `<plan-path>` on completion. If a `.partial` exists, a prior invocation was interrupted mid-stream (commonly: Claude API streaming dropped a long Write tool call — see issue-504).

Steps:

1. Resolve the prospective plan path from arguments (Spec Mode: `<spec-path>` minus `.spec.md` plus `.plan.md`; other modes: per their detection logic).
2. Run `adev partial inspect --artifact <plan-path>.partial` to check existence + schema marker + lock state.
3. If `partial_exists` is true:
   - **Schema marker is `plan@1` and `schema_allowed` is true:** ask the user `Resume from prior partial, discard and restart, or abort?` Default in `--auto` mode is **resume** (read the partial, continue authoring from the last coherent section).
   - **Schema marker missing or not allowed:** the file may be from an older plan format or an unrelated process. Discard with a logged warning and start fresh: `adev partial discard --artifact <plan-path>.partial --spec <spec-path>`.
4. If `partial_exists` is false, proceed normally.
5. If the inspect call reports a live lock (`lock_exists` true, owner alive), STOP — another `/adev:plan` invocation is in flight. Tell the user and exit.

### Detection Precedence

1. **Explicit flag (highest priority):** If one of `--spec`, `--feature`, `--release`, `--milestone`, or `--epic` is present, enter that mode immediately. Skip keyword and state detection entirely.
   - Error: if two or more mode flags are passed together, output `CONFLICTING_FLAGS` and exit.

2. **Path argument:** If a single argument ends in `.md` and resembles a file path to a Live Spec (e.g., `multi-repo-workspace/init-workspace.md`), identify it as a spec path and route to **Spec Mode** with that path as the `--spec` value.

3. **Keyword detection (free-text argument):** If a plain-text argument is provided, scan it for mode keywords:
   - "release" or "launch" → **Release Mode** (extract release name from remaining text)
   - "milestone" or "phase" → **Milestone Mode** (extract milestone name from remaining text)
   - "feature" or "module" → **Feature Mode** (extract module name from remaining text)
   - "epic" → **Epic Mode** (extract epic ID from remaining text)
   - Example: "plan release v2" → Release Mode, `name: "v2"`

4. **Project-state scan (no flag, no argument):** Read `.context-index/` to infer mode from current state:
   - If exactly one reviewed spec (with `*.review.md` passing verdict) lacks a corresponding `*.plan.md` → propose **Spec Mode** for that spec.
   - If multiple reviewed specs lack plans → present a multi-choice menu listing all pending specs plus other available modes.
   - If no reviewed specs need plans, check whether any Feature charter has capabilities without specs → propose **Feature Mode**.

5. **Ambiguity fallback (multi-choice menu):** When mode detection cannot resolve to a single mode, present a menu:
   ```
   What would you like to plan?

   1. Spec — decompose a reviewed Live Spec into Tasks
   2. Feature — identify missing specs for a charter module
   3. Release — build a release plan from product.md
   4. Milestone — create or update a milestone Epic
   5. Epic — decompose an existing Epic into Features

   Enter a number or describe what you want to plan:
   ```
   Await user selection and proceed. If the user dismisses without selecting, exit without action.

### Mode Summary Table

| Mode | Entry Condition | What it produces |
|------|----------------|-----------------|
| Spec | `--spec` / `.md` path / single reviewed spec lacking plan | Ordered Task list in a `*.plan.md` file |
| Feature | `--feature <module>` / "feature" keyword | Feature work items under an Epic |
| Release | `--release <name>` / "release" keyword | Sequenced release plan + child Epics |
| Milestone | `--milestone <name>` / "milestone" keyword | Milestone Epic + Feature placeholders |
| Epic | `--epic <id>` / "epic" keyword | Missing Feature proposals under an Epic |
