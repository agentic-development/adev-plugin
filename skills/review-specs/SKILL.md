---
name: adev:review-specs
description: "Run parallel specialist reviews (structural, security, consistency) on Live Specs before planning. Use for architecture review and expert evaluation."
allowed-tools: [Read, Glob, Grep, Agent]
---

# Review Specs

Run an architecture review on one or more Live Specs using parallel specialist subagents. This is the gate between specification and planning. No code gets planned until specs pass review.

**Announce at start:** "I'm using the adev:review-specs skill to run an architecture review."

### Dispatch Turn Discipline

**Never end your turn to wait for a dispatched subagent.** A synchronous dispatch (`run_in_background: false`) returns its final result directly in the tool call — there is nothing to wait for. If a dispatch ever returns a task ID instead of a result, that is a bug in the dispatch (the rule above was violated, or the harness backgrounded it anyway): fix the dispatch and re-run it synchronously. Do not end the turn hoping a completion notification will resume you — in a nested subagent context it will not. If this skill is itself running as a dispatched subagent (e.g., a build pipeline step), your own caller is waiting on a result contract — for build pipeline steps this is the `STEP_RESULT` format defined in `skills/build/SKILL.md`. Ending your turn without that result to report is a protocol violation, not a valid pause point.

**Quick tier branch (Step 2.5).** If the resolved rigor tier is `quick`, **skip the registry loop below** and dispatch exactly one subagent — the synthesized reviewer — using the bundled prompt `plugin:review-specs/quick-synthesized-reviewer-prompt.md` under the `reviewer-capable` profile, with the same rendered context pack and target spec appended. Pass `run_in_background: false` on this dispatch, exactly as the full-tier reviewers do (see the parallel-dispatch note below): the harness backgrounds Agent dispatches by default, and review-specs frequently runs as a build-step subagent where a backgrounded dispatch never re-invokes the caller and stalls the review. It returns `SA-`/`SEC-`/`CON-` findings in the standard format plus a consolidated verdict. Apply the same severity cap, `blocker_id` validation, and parse-failure fallback as any other reviewer, then proceed to Step 5. Do not dispatch the three specialist defaults in `quick` mode. If the bundled prompt file is missing, fail loud (do not silently fall back to a weaker or empty review). Otherwise (tier `full`, the default), dispatch the registry reviewers as described next.

---

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill review-specs
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

## Arguments

- No arguments: review all unreviewed specs (specs without a `.review.md` file, or where the spec is newer than the review)
- `--spec <path>`: review a specific spec file
- `--charter <module>`: review all specs under a feature charter
- `--tier <full|quick>`: rigor tier (graduated-rigor-tiers spec). `full` (default) dispatches the three parallel specialists; `quick` dispatches a single synthesized reviewer. Overrides any routing/risk-policy signal. Invalid value → `INVALID_TIER`.

## Step 0: Specify-step gate (FIRST action)

The gate that must run before anything else, and the aborts it may raise.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/review-specs/references/steps/step-0-specify-gate.md` for the full instructions. Do not act on this section from the summary above.

## Step 1: Identify Target Specs

Determine which specs need review:

1. If `--spec <path>` is provided, use that file directly.
2. If `--charter <module>` is provided, glob `.context-index/specs/features/<module>/*.spec.md`.
3. If no arguments, scan all `.context-index/specs/features/` and `.context-index/specs/cross-cutting/` directories. A spec needs review if:
   - The lifecycle projection does not yet have a `review` step recorded, OR
   - `state.steps.review.lastReviewedRevision` is less than the spec's current `revision`, OR
   - `hasDrift(specPath)` from `<ADEV_ROOT>/lib/spec-drift.mjs` returns `true` (content hash mismatch).

If no specs need review, report that and exit.

## Step 2: Load Context for Each Spec

Builds the per-spec context pack handed to every reviewer.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/review-specs/references/steps/step-2-load-context.md` for the full instructions. Do not act on this section from the summary above.

## Step 2b: Validate Cross-Repo `depends-on` References

After loading the spec, inspect its `depends-on` frontmatter field for cross-repo references. A cross-repo reference uses the format `@repo-slug/spec-slug`.

**Workspace detection:** Walk the directory tree upward from the spec file's location, looking for `adev-workspace.yaml`. If found, a workspace is active; use `resolveRef` from `lib/workspace.mjs` to resolve each cross-repo reference.

**If cross-repo references are present and a workspace is detected:**

For each `depends-on` entry that matches the `@repo-slug/spec-slug` pattern:

1. Call `resolveRef(ref, workspaceConfig)` to locate the referenced spec.
2. If the reference cannot be resolved (repo or spec not found), flag a **warning**:
   `"Cross-repo reference '@repo-slug/spec-slug' could not be resolved — repo or spec not found."`
3. If resolved successfully, read the referenced spec's `status` frontmatter field:
   - If `status: draft`, flag a **warning**: `"Cross-repo dependency '@repo-slug/spec-slug' is in draft status"`
   - If `status: superseded`, flag a **warning**: `"Cross-repo dependency '@repo-slug/spec-slug' is superseded"`
4. Include all cross-repo reference warnings in the context package passed to reviewer subagents (Step 4), so the Structural Architect can factor them into the review.

**If cross-repo references are present but no workspace detected:**

Skip cross-repo validation with a note to the user:
`"Cross-repo references found but no workspace detected — skipping validation."`

Do not treat missing workspace as a blocking error; proceed with the rest of the review using only locally available context.

**If no cross-repo references are present:** skip this step entirely.

## Step 2.5: Resolve Rigor Tier

Resolve the **rigor tier** (`full` | `quick`) that governs how this spec is reviewed. Per `graduated-rigor-tiers.spec.md`, `quick` never skips the gate — it dispatches a single synthesized reviewer instead of the three specialists, still producing the `.review.md` and the `review` lifecycle event.

Resolution precedence (highest first) — this is the `resolveRigorMode(...)` contract in `lib/governance/rigor-mode.mjs`:

1. **Explicit `--tier <full|quick>`** on invocation. Reject any other value with `INVALID_TIER`.
2. **Routing signal** — if the caller (`/adev:route`, `/adev:work`, or `/adev:build`) passed `--tier quick` because the work is "easy" (low blast-radius, high pattern coverage).
3. **Risk policy** — read `.context-index/governance/risk-policies.yaml`; map the spec's `risk_level` frontmatter (default `medium`) to `policies.<level>.review_mode`.
4. **Default** — `full`.

When reviewing in bulk, resolve the tier per spec. Record the resolved tier in the review report header.

## Step 3: Load Reviewer Registry

Resolves the reviewer registry and each reviewer prompt URI.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/review-specs/references/steps/step-3-load-reviewer-registry.md` for the full instructions. Do not act on this section from the summary above.

## Step 4: Dispatch Reviewers

Dispatches the registry reviewers (or the single quick-tier reviewer) with the rendered context pack.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/review-specs/references/steps/step-4-dispatch-reviewers.md` for the full instructions. Do not act on this section from the summary above.

## Step 5: Collect and Consolidate Findings

Parses reviewer output, applies the severity cap, and validates blocker_ids.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/review-specs/references/steps/step-5-consolidate-findings.md` for the full instructions. Do not act on this section from the summary above.

## Step 6: Emit Reviewer Events and Save Review Report

Emits per-reviewer events and writes the consolidated .review.md artifact.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/review-specs/references/steps/step-6-events-and-report.md` for the full instructions. Do not act on this section from the summary above.

## Step 7: Update Spec Status

> Legal status values are defined in `lib/spec-status.mjs::SPEC_STATUSES`. The
> seven legal transitions are tracked there; if a future review introduces a
> new status, extend that module first, then this skill.

After saving the review report, update the spec's status based on the verdict:

**If verdict is PASS or PASS_WITH_NOTES:**
1. Read the spec file
2. Parse YAML frontmatter
3. Update status: `review-pending` → `review-passed`
4. Write the spec file back

**If verdict is BLOCK:**
1. Read the spec file
2. Parse YAML frontmatter
3. Update status: `review-pending` → `review-blocked`
4. Write the spec file back

Log the status change to the user.

**Charter Capability Map update (PASS or PASS_WITH_NOTES only):** After updating the spec status to `review-passed`, also update the parent charter's Capability Map. Find the capability row corresponding to this spec and set its `Status` column to `review-passed`.

**Note:** Do not increment the spec's `revision` field on status-only changes. The `revision` field tracks content changes, not workflow transitions.

## Step 6c: Stamp Final file-sha

After Step 7 has written the status update to the spec file, compute the final SHA-256 of the on-disk spec content and update the `.review.md`:

```javascript
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const buf = await readFile(specPath);
const sha = createHash('sha256').update(buf).digest('hex');
// Replace `file-sha: <PENDING>` in the .review.md with `file-sha: <sha>`.
```

Do NOT shell out for hashing — the in-tree `crypto.createHash('sha256')` computation is the canonical hash for spec content, consistent with `lib/source-manifest.mjs` and `lib/spec-drift.mjs`.

**Why after Step 7:** Step 7 writes `review-pending → review-passed` (or `review-blocked`) back to the spec file, which changes the file's content and hash. If the SHA were captured in Step 6 (before Step 7), the stored SHA would immediately diverge from the on-disk spec, causing `/adev:plan` to report false drift on the very next invocation.

## Step 8: Report to User

Present the consolidated verdict and findings summary. **Do NOT echo the full .review.md content** — it is already on disk. Present ONLY the summary format below. **Persona adaptation:** The formats below are defaults for the Developer persona. If a different persona is active, adapt the chat summary to its output rules (e.g., Product persona: show pass/fail only, omit blocker codes and file paths). Artifacts written to disk (`.review.md`) always use the full technical format.

**If PASS:**
```
Review complete. All specs passed.

  <spec-slug>: PASS (0 findings)

The spec is ready for planning. Run /adev:plan --spec <path> to proceed.
```

**If PASS_WITH_NOTES:**
```
Review complete. Specs passed with notes.

  <spec-slug>: PASS_WITH_NOTES (2 warnings, 1 suggestion)

  Warnings:
  - SA-2: [brief description]
  - SEC-1: [brief description]

Review the full report at <path to .review.md>.
You can proceed to /adev:plan or address the warnings first.
```

**If BLOCK:**
```
Review complete. Specs blocked.

  <spec-slug>: BLOCK (1 blocker, 2 warnings)

  Blockers:
  - SA-1: [brief description]
  - CON-3: [brief description]

These issues must be resolved before planning can begin.
Review the full report at <path to .review.md>.
Run /adev:specify to revise the spec, then /adev:review-specs to re-review.
```

## Gate Behavior

This skill produces the canonical reviewer events in the lifecycle log that `/adev:plan` (and `/adev:implement`, `/adev:validate`) gate on. The `.review.md` artifact is a rendered presentation of those events for human inspection.

Downstream skills MUST call `requireGate(state, "review", { mode })` against `currentState(projectRoot, specPath)` — they MUST NOT parse `.review.md` frontmatter for verdict or grep for `status:` fields. The lifecycle log is the source of truth; the rendered artifact is a view.

This skill also updates the spec's `status` frontmatter field (Step 7):
- PASS → `review-passed`
- PASS_WITH_NOTES → `review-passed`
- BLOCK → `review-blocked`

When a blocked spec is revised and re-reviewed, the status will be updated from `review-blocked` back to `review-passed` upon a passing verdict.

## Multiple Specs

When reviewing multiple specs (no arguments or `--charter`), process each spec independently. Each gets its own set of parallel subagents, its own `.review.md` file, and its own status update. Present a summary table at the end:

```
Architecture Review Summary

| Spec | Verdict | Blockers | Warnings | Suggestions |
|------|---------|----------|----------|-------------|
| card-ordering | PASS | 0 | 0 | 1 |
| drag-drop | BLOCK | 2 | 1 | 0 |

1 of 2 specs ready for planning.
```

## API reference

Library functions this skill wraps, for reference when reading its CLI verbs.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/review-specs/references/api-reference.md` for the full instructions. Do not act on this section from the summary above.

## Next Step in the Lifecycle

Review complete. The next step depends on the verdict:
- **PASS / PASS_WITH_NOTES** → **`/adev:plan`**
- **BLOCK** → **`/adev:specify --revise`** to address the blockers, then re-review.

If invoked via `/adev:work`, offer to continue to the appropriate next step. The user can stop here.
