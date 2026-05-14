---
charter: lifecycle-artifacts
kind: action
status: review-passed
risk_level: low
milestone: spec-and-charter-taxonomy
revision: 2
charter-revision: 2
created: 2026-05-14

plan-ref: .context-index/specs/features/lifecycle-artifacts/smoke-validation.plan.md
---

# Action Spec: Smoke Validation

<!-- One-shot validation procedure that verifies the spec mode taxonomy and
     template matrix work end-to-end after Layer 1 ships. -->

## Postconditions

After this action runs and passes, the following are true:

1. **Kind coverage:** At least one spec exists with each of the six spec kinds — `behavioral`, `refactor`, `action`, `skill`, `integration`, `artifact`. (The lifecycle-artifacts charter's eleven specs already provide this coverage at v1; this postcondition is verified, not produced.)
2. **Charter kind coverage:** At least one charter exists with each of the four charter kinds — `module`, `feature`, `cross-cutting`, `initiative`. (Layer 1 does not pre-author these; the smoke validation produces them as throwaway demonstration charters, or by retroactively classifying existing charters once Layer 2 lands. For Layer 1 close-out, throwaway charters are sufficient.)
3. **Template usability:** Each of the four new spec templates and three new charter templates has been used at least once to author a real or throwaway artifact, and the resulting file parses without error.
4. **`/adev:hygiene` cleanliness:** Running `/adev:hygiene` on `.context-index/specs/features/lifecycle-artifacts/` reports zero `INVALID_KIND` findings and zero `MISSING_KIND` findings.
5. **Skill routing:** `/adev:specify --kind <each>` and `/adev:brainstorm --kind <each>` complete end-to-end without exceptions for every valid kind.

## Procedure

Ordered, executable steps. Each step is a manual command or a check.

### Step 1: Verify lifecycle-artifacts spec coverage

For each spec kind in `SPEC_KINDS`, confirm at least one spec in `lifecycle-artifacts/` carries that kind:

Use a YAML-quoting-tolerant grep that accepts unquoted, single-quoted, or double-quoted values:

```bash
for kind in behavioral refactor action skill integration artifact; do
  count=$(grep -l -E "^kind:[[:space:]]+['\"]?${kind}['\"]?[[:space:]]*$" .context-index/specs/features/lifecycle-artifacts/*.spec.md | wc -l)
  echo "$kind: $count spec(s)"
done
```

Expected: each kind shows count ≥ 1.

### Step 2: Verify each new spec template can author a throwaway spec

For each new kind (`action`, `skill`, `integration`, `artifact`), invoke `/adev:specify` in a throwaway scratch charter:

```
/adev:specify --kind action --charter <scratch-charter>
/adev:specify --kind skill --charter <scratch-charter>
/adev:specify --kind integration --charter <scratch-charter>
/adev:specify --kind artifact --charter <scratch-charter>
```

Each invocation should produce a spec file with the correct H2 section structure for its kind. Delete the throwaway specs after verification.

### Step 3: Verify each new charter template can author a throwaway charter

For each new charter kind (`module`, `cross-cutting`, `initiative`), invoke `/adev:brainstorm`:

```
/adev:brainstorm --kind module
/adev:brainstorm --kind cross-cutting
/adev:brainstorm --kind initiative
```

Each invocation should produce a charter file with the correct H2 section structure for its kind. **Delete all throwaway artifacts from Steps 2 and 3 before proceeding to Step 4** — leaving them in place will cause Step 4's hygiene audit to misclassify them as orphans. Verify deletion:

```bash
git status --porcelain .context-index/specs/features/ | grep -E '^\?\? ' || echo "no untracked throwaway artifacts remain"
```

### Step 4: Run hygiene on lifecycle-artifacts

```bash
/adev:hygiene --module lifecycle-artifacts
```

Expected: zero `INVALID_KIND` findings; zero `MISSING_KIND` findings on the eleven Layer 1 specs (all should have explicit `kind:` fields per the strict-on-write posture).

### Step 5: Run the test suite

```bash
npm test
```

Expected: all tests pass, including new tests for `lib/kinds.mjs`, `lib/template-resolution.mjs`, parser integration, and skill kind-routing.

### Step 6: Verify ADR-0009 landed

Confirm `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` exists and documents both taxonomies (six spec kinds + four charter kinds), the unified `kind:` field, the active+default+soft-validate posture, and the template-resolution mechanism.

### Step 7: Verify charter Capability Map all-`specified`-or-better

```bash
grep -E "^\| " .context-index/specs/features/lifecycle-artifacts/charter.md | grep -i capability
```

Manually inspect: every must-have capability row's `Status` column reads `specified`, `implemented`, or `validated`. None should read `—`.

### Step 8: Sign off

If all steps pass, mark Layer 1 of `epic-73` complete in the issue board by closing the Layer 1 tracking issue (`issue-465`, established by `/adev:issues` during charter setup on 2026-05-14) with reason "Smoke validation passed". Update the milestone `spec-and-charter-taxonomy` toward `ship` when all milestone ship_criteria are also met.

The Layer 1 close-out issue is `issue-465` (not `issue-463` or `issue-464`, which are the Layer 2 and Layer 3 follow-up trackers). The charter's "Out of Scope" sections reference the follow-up issues; this spec references the close-out issue for Layer 1 specifically.

## Idempotency

This action is **safe to re-run.** All checks (Steps 1, 4, 5, 6, 7) are read-only on production artifacts. Steps 2 and 3 author throwaway artifacts that are deleted at the end of each invocation. Step 8 is a one-way state transition (close issue, advance milestone); re-running after sign-off is a no-op because the issue is already closed.

If a step fails:
- Steps 1, 4, 7 — production gap. Fix the underlying spec/charter, re-run from Step 1.
- Steps 2, 3 — template or routing bug. Open a fix spec, re-run.
- Step 5 — test failure. Open a fix spec, re-run.
- Step 6 — ADR missing. Author it, re-run.

## Rollback

This action does not modify production artifacts. Throwaway artifacts from Steps 2 and 3 are deleted as part of the procedure. If sign-off (Step 8) is performed prematurely, reopen `issue-465` and rerun.

There is no destructive operation in this procedure; rollback is implicit by re-running.

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown"** — Applies; this action spec describes a procedure executed by a human or Claude, not by companion code.
- **Architecture Boundaries: Autonomous — "Adding tests"** — Step 5 (test execution) is autonomous.

## Acceptance Criteria

- [ ] All 8 procedure steps pass
- [ ] All four new spec templates used successfully at least once
- [ ] All three new charter templates used successfully at least once
- [ ] Zero `INVALID_KIND` or `MISSING_KIND` findings on lifecycle-artifacts
- [ ] `npm test` passes
- [ ] ADR-0009 exists and is complete
- [ ] Charter Capability Map shows no `—` for must-have rows
- [ ] `issue-465` closed with sign-off reason
