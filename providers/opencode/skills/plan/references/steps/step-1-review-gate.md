## Step 1: Review Gate

Before planning, verify the spec has passed architecture review by reading the lifecycle event log. **This is the FIRST action in the skill, before any plan-file authoring, context loading, or other writes.**

1. Identify the spec file path. If `--spec` was provided, use that. Otherwise, ask the user which spec to plan.

2. **Gate on `review` step via the lifecycle log:**

   ```bash
   adev gate require --skill plan --spec <spec-path>
   ```

   - In `mode === "strict"` (default — resolved from `manifest.yaml`'s `lifecycle.gate_mode`), the helper exits `2` (per the hook protocol) if the `review` step did not complete with a passing verdict. The skill stops; surface the helper's stderr message unchanged. Do NOT catch the failure.
   - In `mode === "advisory"`, the helper emits a warning and exits `0`.
   - Path-containment is enforced by the helper (`INVALID_PROJECT_ROOT` / `INVALID_SPEC_PATH`). Skill prose MUST NOT pre-validate or normalize paths.

3. **Note any `PASS_WITH_NOTES` warnings.** Read `state.steps.review` for verdict notes; print them for the user but do not block.

4. **Code-Side Drift Check (CODE_DRIFT gate).** Independent from the review gate:

   ```javascript
   const { hasDrift } = await import('<ADEV_ROOT>/lib/spec-drift.mjs');
   const drifted = await hasDrift(specPath);
   ```

   - If `hasDrift()` returns `true`, **block**:
     ```
     CODE_DRIFT: Spec "<name>" has drift_detected: true. The latest unresolved
     code_drift_detected event in the spec's lifecycle JSONL reports source
     file <drift_source> was modified since the source manifest was last
     stamped. Run /adev:validate or update the spec before planning new work.
     ```

     The inline `drift_detected: true` boolean is the rolled-up view; the
     authoritative `drift_source` / `drift_at` payload lives on the spec's
     latest `code_drift_detected` event in `.context-index/lifecycle-state/<slug>.jsonl`.
     Use `adev verify spec --spec <path> --check-drift` to surface those fields.

   - If `hasDrift()` returns `false`, also run `verifyManifest()` as a fallback
     (catches drift on non-Claude-Code hosts where the hook never fired):
     ```javascript
     const { verifyManifest } = await import('<ADEV_ROOT>/lib/source-manifest.mjs');
     const result = await verifyManifest(manifest, projectRoot);
     if (!result.matches) { /* block with CODE_DRIFT message */ }
     ```

   - If `verifyManifest()` also fails (missing files), block with:
     ```
     CODE_DRIFT_VERIFY_ERROR: Cannot verify source manifest for spec "<name>" —
     <N> files missing. Run /adev:hygiene to diagnose, or /adev:implement to
     re-stamp the manifest.
     ```

   - If `hasDrift()` throws (malformed frontmatter), **block** (fail-closed):
     ```
     CODE_DRIFT_READ_ERROR: Cannot read drift status for spec "<name>" —
     frontmatter may be malformed. Fix the spec frontmatter before planning.
     ```

5. **Emit step-started event:** after the gate passes (and before context loading), record the plan step start:

   ```bash
   adev report --type step --spec <spec-path> --step plan --status started
   ```

   After the plan file is written at the end of the skill, emit the matching exit event with the produced plan's verdict:

   ```bash
   adev report --type step --spec <spec-path> --step plan --status completed --verdict <verdict> --from-summary
   ```

6. **Failure-path exit event:** whenever the skill stops after the `--status started` event above without reaching the Step 7 exit event, emit the terminal event before surfacing the error to the operator:

   ```bash
   adev report --type step --spec <spec-path> --step plan --status failed --verdict FAIL
   ```

   `--verdict FAIL` is required, not decorative. The projection's aggregation pass in `lib/lifecycle-state.mjs` only treats a step terminal as explicit when it carries a string verdict; a `step_failed` emitted without one is overwritten by the verdict synthesized from the actor reports already on the log, leaving a dead plan run indistinguishable from a clean one.

   Abort paths in this skill that MUST emit it:

   | Step | Abort |
   |---|---|
   | Step 1, Spec Mode target-repo detection | `validateModuleName()` rejects the spec's `target-repo` — `INVALID_TARGET_REPO`. |
   | Step 6, plan review loop | The reviewer still returns "Issues Found" after the 3-iteration cap, so the remaining issues are handed to the user for guidance. Report this as `LOOP_BUDGET_EXHAUSTED`, matching `/adev:build`'s BLOCK→revise vocabulary and `/adev:implement`'s Stage-2 cap, and state plainly that the plan has NOT been approved: Step 7 does not run, no charter Capability Map update, no `plan_task` `pending` events, no epic creation. |

   Everything in Step 0 and Step 1 substeps 1-4 — the `.partial` lock STOP, `adev gate require` exiting `2`, and the `CODE_DRIFT` / `CODE_DRIFT_VERIFY_ERROR` / `CODE_DRIFT_READ_ERROR` blocks — runs *before* the `--status started` event and therefore strands nothing. Do not emit for those.

   **Known gap (not this skill's to fix):** `adev report --type step` accepts no `--error` flag, so the abort's error code cannot be carried on the event even though the `step_failed` schema has an `error` field. Name the code in operator-facing output; widening the CLI surface is a follow-up.

### Spec Mode — Workspace-Aware Target-Repo Detection

After the Review Gate passes (Step 1) and before loading context (Step 2), check whether the spec declares a `target-repo:` field in its YAML frontmatter:

1. **Parse spec frontmatter** for the `target-repo:` field.
2. **If `target-repo` is present AND `detectWorkspace(cwd)` returns non-null:** enter **workspace-aware Spec Mode**. The remaining steps (2-7) follow the workspace-aware branching documented below.
3. **If `target-repo` is present but no workspace is detected (NO_WORKSPACE fallback):** emit a warning and fall back to the single-repo flow. Rationale: the `target-repo` field is only meaningful inside a workspace; outside a workspace, the spec is treated as a normal single-repo spec. The single-repo fallback ensures the skill remains functional for users who copy workspace specs into standalone repos.
   ```
   Warning: spec declares target-repo: '<value>' but no workspace detected.
   Falling back to single-repo flow. To use workspace-aware planning,
   run from a workspace root or a registered repo directory.
   ```
4. **Validate target-repo** against the workspace registry using `validateModuleName()` from `lib/workspace.mjs`. If validation fails, block with error code `INVALID_TARGET_REPO`:
   ```
   INVALID_TARGET_REPO: target-repo '<value>' is not a valid repo slug
   in the workspace registry. Valid slugs: <list>.
   ```
