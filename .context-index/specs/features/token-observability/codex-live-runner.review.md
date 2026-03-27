# Spec Review: codex-live-runner

- Spec: `.context-index/specs/features/token-observability/codex-live-runner.md`
- Charter: `token-observability`
- Reviewed: 2026-03-26
- Verdict: `PASS_WITH_NOTES`

## Summary

The spec fits the token-observability charter and is consistent with the existing live-provider execution and shared normalization specs. The review found no blockers, but there are several contract gaps around the exact Codex invocation boundary, how partial delegation data should be handled, and how artifacts and provider output should be sanitized before they are persisted.

## Consolidated Findings

### Warnings

1. The spec does not define the `runPhase(context)` boundary precisely enough.
   Behaviors 1, 2, 4, and 5 describe the runner at a high level, but they do not pin down the exact context shape or the provider-native return object shape tightly enough to prevent incompatible implementations or weak tests.

2. The Codex invocation contract is underspecified for deterministic and safe execution.
   Behavior 3 requires a deterministic non-interactive request, but it does not explicitly require argv/stdin-based invocation, input normalization or escaping, working-directory assumptions, or stream capture obligations. That leaves room for shell interpolation risk and inconsistent runner behavior across environments.

3. The spec does not define the fallback for partial subagent or delegation data.
   Behavior 7 says subagent activity should only be emitted when it can be represented losslessly, but it does not state whether partial delegation data should be omitted, downgraded to run-scoped metadata, or treated as a phase failure.

4. Artifact persistence rules do not explicitly cover secret redaction.
   Behavior 9 and the postconditions allow transcripts and diagnostics to be written under the eval artifact root, but the spec does not require redaction or exclusion of secrets, credentials, or other sensitive environment-derived content before those artifacts are persisted.

### Notes

1. Artifact containment language should explicitly require canonical path resolution and symlink-traversal protection.
   The current `unsafe_artifact_path` wording is directionally correct, but it should be explicit that containment checks are performed on canonical resolved paths rather than string prefixes alone.

2. The consistency review found no additional cross-spec naming or schema conflicts.

## Reviewer Breakdown

- Structural Architect: `PASS_WITH_NOTES`
- Security Reviewer: `PASS_WITH_NOTES`
- Consistency Analyzer: `PASS`

## Recommendation

Proceed to `$adev-plan` if you want to keep momentum, but tightening the spec first will reduce implementation ambiguity and test churn. The highest-value edits are:

1. Define the exact `runPhase(context)` input and provider-native result boundary.
2. Require argv/stdin-based Codex invocation and explicit escaping or normalization of authored inputs.
3. Specify the fallback behavior for partial delegation data.
4. Require redaction or exclusion of sensitive data in persisted artifacts.
