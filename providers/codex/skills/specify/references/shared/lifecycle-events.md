## Shared: Lifecycle Events

Every mode (Standard, Extract, Refactor, From-Diff, Cross-Cutting) MUST emit a lifecycle entry event before writing any spec content and a matching exit event after the spec is saved. Without these events, the lifecycle log has no record of the specify step and `/adev:review-specs` blocks with `step "review" requires prior step "specify" to be completed`.

**Amend Mode is the exception, and NOT because it is exempt.** `adev specify amend` emits the pair itself, on the amendment's own log, immediately after the atomic write — so the skill MUST NOT emit them again or the step opens twice. This is deliberate: the amendment needs a lifecycle of its own to be reviewable, and the verb is the only place that knows the amendment's path before it exists on disk. Amend Mode also has no failure-path exit event to emit for the same reason (see `adev-plugin-gkfv.1`).

**Entry event** (emit before Step 1 / earliest spec-related action):

```bash
adev report --type step --spec <spec-path> --step specify --status started
```

**Exit event** (emit at the end of the Summary step):

```bash
adev report --type step --spec <spec-path> --step specify --status completed --verdict PASS --from-summary
```

The `--verdict PASS` is required — downstream gates require the prior step to have completed with PASS or PASS_WITH_NOTES. The specify step has no failure path that reaches the Summary step (success implies the spec was written, status set to `review-pending`, and the Feature work item created or skipped), so success implies PASS.

**Failure-path exit event.** Whenever the skill stops after the entry event without reaching the exit event, emit the terminal event before surfacing the error to the operator:

```bash
adev report --type step --spec <spec-path> --step specify --status failed --verdict FAIL
```

`--verdict FAIL` is required, not decorative. The projection's aggregation pass in `lib/lifecycle-state.mjs` only treats a step terminal as explicit when it carries a string verdict; a `step_failed` emitted without one is overwritten by the verdict synthesized from the actor reports already on the log, so the step projects as `{status: "completed", verdict: "PASS"}` and opens the `review` gate on a spec that was never finished.

**Ordering constraint — read before adding an emission.** `adev report` requires `<spec-path>` to exist on disk and exits `1` with `spec not found` otherwise. Every abort earlier than the atomic-rename commit in Step 5 therefore *cannot* emit a step event, because at that point only `<spec-path>.partial` exists:

| Abort | Emit? |
|---|---|
| Step 2.5 `CHARTER_CLOSED` | No — spec file does not exist yet. |
| Step 3.5 invalid `kind` | No — spec file does not exist yet. |
| Step 5 `PARTIAL_ARTIFACT_OVERSIZE`, or the operator choosing **abort** at the prior-`.partial` prompt | No — only the `.partial` exists. |
| Step 5 `resolveTemplate` throwing `TEMPLATE_NOT_FOUND` / `UNSAFE_TEMPLATE_PATH` / `INVALID_KIND` | No — spec file does not exist yet. |
| Step 5.5 failing to read back or rewrite the saved spec's `status:` frontmatter | **Yes** — the atomic rename has committed, so the spec is on disk and a stop here strands the step. |
| Step 5.6 issue-board adapter throwing | No — this is explicitly non-blocking; the run continues to Step 6 and exits `completed`. |

Be precise about what that single **Yes** row is: Step 5.5 is written as a plain read-modify-write with no documented halt, so this skill currently has **no prose-level abort that both follows the entry event and reaches a spec that exists on disk**. The instruction above is therefore a standing rule for any future edit that introduces one — not a description of a path that fires today. Every abort this skill *does* document is a pre-write abort whose entry event could not land either: the same `spec not found` guard rejects the `--status started` emission at Step 0 in every mode that authors a new spec, so nothing is stranded and there is nothing to close out. Recording pre-write specify aborts requires either a spec-less event channel or relaxing the existence check in `lib/cli/report.mjs`; both are library changes and out of scope here.

`--revise` mode is unaffected: it emits `spec_revised` rather than step entry/exit events, so its error cases (`NO_REVIEW_SIDECARS`, `SPEC_NOT_BLOCKED`, `INVALID_SPEC_PATH`, `REVISION_NOT_INCREMENTED`, `CONFLICTING_FLAGS`) strand no step and must not emit `--status failed`.

**Known gap (not this skill's to fix):** `adev report --type step` accepts no `--error` flag, so the abort's error code cannot be carried on the event even though the `step_failed` schema has an `error` field. Name the code in operator-facing output; widening the CLI surface is a follow-up.

For `--cross-cutting` mode, the spec path is `.context-index/specs/cross-cutting/<slug>.spec.md` rather than `.context-index/specs/features/<module>/<slug>.spec.md`. The events are otherwise identical.

---
