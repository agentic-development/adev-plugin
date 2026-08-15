---
spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
spec-revision: 1
review-date: 2026-08-14
blocker-count: 5
---

# Blockers: explicit-governance-registries (revision 1)

## structural-architect:missing-migration-behavior:69893770

- **reviewer:** structural-architect
- **section_anchor:** Step 5: Materialize the three implicit registries

Step 5 couples a plugin-shipped change (removing the run-time overlay in `review-config.mjs` and
`merge-gates.mjs`) to a project-repo change (running `adev governance materialize`). They ship from
different artifacts at different times, so on upgrade the plugin change lands first and the
registries are empty until someone materializes. `review.yaml` is `reviewers: []` and
`review-config.mjs:53-79` is the only thing that puts the three bundled reviewers into the effective
set — drop the overlay before materialize runs and `/adev:review-specs` dispatches zero reviewers.
Invariant 2 forbids exactly this. No behavior covers the un-materialized state.

**Required:** specify the pre-materialization behavior (refuse-and-instruct, auto-materialize on
first read, or version-gated fallback) and give it an acceptance criterion.

## structural-architect:undefined-contract:23a59bf4

- **reviewer:** structural-architect
- **section_anchor:** Behaviors

`adev gate transitions check` is in the Changes Catalog and Step 4 populates `transitions`, but the
contract specifies only the empty case (Behavior 3 → SKIP). Nothing states what the verb evaluates
once populated — whether it reads prior gate results, executes gates, or consults lifecycle state.
ADR-0010's decision-flow step 1 routes workflow preconditions to `requireGate`, so the Check 9 /
`requireGate` boundary must be stated.

**Required:** add the populated-case behavior for transitions, with its error and verdict mapping.

## security-reviewer:authorization:c4456237

- **reviewer:** security-reviewer
- **section_anchor:** Extension contribution

`validateGovernanceEntry` (`lib/extensions/content-install.mjs:101-119`) validates only `id` — there
is no field allowlist. An extension can therefore declare `source: project` on its own entry
(surviving uninstall and evading the drift pass), and on id collision the fill-gap loop
(`if (!(key in projectEntry))`) injects `enabled: false` whenever `enabled` is absent from the
project entry — the default-on case — silently disabling any enabled check.

**Required:** stamp `source` from install context and reject extension-supplied `source`; protect a
closed key set (`enabled`, `disabled_reason`, `severity`, `source`) from the fill-gap path.

## security-reviewer:path-traversal:8fd4d9bf

- **reviewer:** security-reviewer
- **section_anchor:** Error Cases

`lib/extensions/install.mjs:91` takes `target` from the extension manifest; `mergeGovernanceEntries`
does `join(govDir, targetFile)` + `writeFileSync` with no containment check, unlike `installSamples`
and `installSkillExtensions` in the same file. **Reproduced during review:** `target:
'../../ESCAPED.yaml'` wrote outside `.context-index/governance/` without error. The proposed
`UNKNOWN_GOVERNANCE_TARGET` covers unmapped registry names only, not directory escape.

**Required:** apply the resolve + `startsWith` containment pattern already used by the sibling
installers, with a distinct error code.

## security-reviewer:input-validation:c511c411

- **reviewer:** security-reviewer
- **section_anchor:** Error Cases

`adev boundaries check` evaluates `boundaries.yaml` regexes against changed-file contents at plan,
implement and validate time. Only syntactic validation (`INVALID_BOUNDARY_PATTERN`) is specified;
a valid but catastrophically-backtracking pattern against a large file can hang a merge gate. Since
`boundaries.yaml` is extension-writable, this is a DoS lever rather than only an author risk.

**Required:** bound each rule's evaluation with a hard timeout; treat timeout as
`INVALID_BOUNDARY_PATTERN` and fail closed naming the rule.
