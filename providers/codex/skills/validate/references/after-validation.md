## After Validation

> Legal status values are defined in `lib/spec-status.mjs::SPEC_STATUSES`. The
> `adev/status-enum-legal` diagnostic enforces this enum at write time; the
> specific transition this skill drives is `implemented → validated`.

If PASS:

1. Update the spec's status to `validated`:
   - Read the spec file that was validated
   - Parse YAML frontmatter
   - Update status: `implemented` → `validated`
   - Write the spec file back
   - Log: "Updated spec status: implemented → validated"

2. **Update charter Capability Map:** Read the parent charter and update the Capability Map. For each capability covered by this spec, set its `Status` column to `validated`.

3. **Record validation outcome on issue board with confidence:** Read `tasks.backend` from `manifest.yaml`. If configured:
   - Find all issues with `plan-ref` matching the validated spec's plan file.
   - For each issue, run reality-check verification via the CLI (pass the issue JSON object and the desired confidence-note action):
     ```bash
     adev verify issue --issue-json '<issue-object-json>' \
       --note Validated \
       --report-path <validation-report-path> \
       [--files-verified <n>] [--tests-pass <true|false>]
     ```
     The verb wraps `verifyIssueCompleted` + `formatConfidenceNote` and emits JSON `{ completed, confidence, reason, note }`.
   - Update each issue with the confidence-annotated note:
     - PASS + HIGH confidence: `update(id, { status: "closed", notes: "<confidence note>" })`
     - PASS + MEDIUM confidence: `update(id, { notes: "<confidence note>. Manual verification recommended." })`
     - FAIL: `update(id, { notes: "Validated: FAIL (YYYY-MM-DD) — <validation-report-path>" })`
   - Only close issues automatically when confidence is HIGH (files committed, tests pass, spec criteria met). MEDIUM confidence adds a note but does not close.
   If `tasks.backend` is not configured, skip.
   If `adev verify issue` exits non-zero, fall back to the previous behavior (add note without confidence scoring).

4. Read `completion.merge_policy` from manifest.yaml (default: "pr").

If "pr" (or target branch is in `completion.protected_branches`):
```
Validation passed. All dispatched checks green.

The implementation satisfies the spec, stays within charter scope,
respects the constitution, and passes all quality gates.

Ready for PR. Run: gh pr create --base <target-branch>
Do NOT merge directly to protected branches.
```

If "merge" (and target branch is NOT protected):
```
Validation passed. All dispatched checks green.

The implementation satisfies the spec, stays within charter scope,
respects the constitution, and passes all quality gates.

Ready to merge or proceed to the next feature.
```

If "ask":
```
Validation passed. All dispatched checks green.

The implementation satisfies the spec, stays within charter scope,
respects the constitution, and passes all quality gates.

Ready to integrate. Open a PR or merge directly?
```

If FAIL:
```
Validation failed. [N] check(s) need attention.

[List the failed checks with a one-line summary each]

Fix the issues above and re-run: /adev:validate --spec <path>
```
