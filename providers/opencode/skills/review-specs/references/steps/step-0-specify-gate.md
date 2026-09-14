## Step 0: Specify-step gate (FIRST action)

Before identifying targets, gate on the prior step via the lifecycle log, then emit the step-started event:

```bash
adev gate require --skill review-specs --spec <spec-path>
adev report --type step --spec <spec-path> --step review --status started --revision <spec-revision>
```

`<spec-revision>` is the spec's own `revision:` frontmatter value, read once here and reused for every `adev report --type step` call in this skill (Step 8, Step 0-fail below). Without it, `currentState().steps.review.byRevision` folds every hand-authored revision's events into bucket 1 regardless of which revision actually produced them — the only path currently available while `adev specify revise --auto` has open convergence bugs (adev-plugin-656e).

In strict mode (default — resolved from `manifest.yaml`'s `lifecycle.gate_mode`), `adev gate require` exits `2` if the `specify` step has not been recorded as completed (the spec must exist and have a `lifecycle_step: specify, status: completed` event). In advisory mode, it emits a warning and exits `0`. Do NOT catch the failure — surface the helper's stderr unchanged. Path-containment is enforced by the helper.

When reviewing in bulk (`--charter` or no-args), apply the gate per-spec inside the loop.

In Step 8, emit the matching exit event with the consolidated review verdict:

```bash
adev report --type step --spec <spec-path> --step review --status completed --verdict <consolidated-verdict> --from-summary --revision <spec-revision>
```

### Step 0-fail: Failure-path exit event

A BLOCK verdict is **not** a failure — it is a completed review whose consolidated verdict happens to block downstream steps, and it exits through the `--status completed --verdict BLOCK` line above. This section covers the *other* case: the review aborts before it can produce any verdict at all.

Whenever the skill stops after the `--status started` event above without reaching the Step 8 exit event, emit the terminal event before surfacing the error to the operator:

```bash
adev report --type step --spec <spec-path> --step review --status failed --verdict FAIL --revision <spec-revision>
```

`--verdict FAIL` is required, not decorative. The projection's aggregation pass in `lib/lifecycle-state.mjs` only treats a step terminal as explicit when it carries a string verdict; a `step_failed` emitted without one is overwritten by the verdict synthesized from whatever `reviewer_report` events already landed, so a partial review whose first reviewer passed would project as `{verdict: PASS, status: completed}` and open the `plan` gate. This is the same class of bug fixed for BLOCK in `aggregateReports`.

Abort paths in this skill that MUST emit it:

| Step | Abort |
|---|---|
| Step 2 | The parent charter or the constitution is missing and the operator chooses **abort** rather than proceeding with reduced context. |
| Step 3 | `loadReviewConfig` returns errors — the reviewer registry could not be loaded, so no reviewer can be dispatched. |
| Step 4 | Rigor tier `quick` and the bundled `plugin:review-specs/quick-synthesized-reviewer-prompt.md` is missing (the documented fail-loud path — do not silently fall back to a weaker review). |

Argument-level rejections (`INVALID_TIER`) and the "no specs need review" no-op exit in Step 1 happen *before* the `--status started` event and therefore strand nothing — do not emit for those.

**Known gap (not this skill's to fix):** `adev report --type step` accepts no `--error` flag, so the abort's error code cannot be carried on the event even though the `step_failed` schema has an `error` field. Name the code in operator-facing output; widening the CLI surface is a follow-up.
