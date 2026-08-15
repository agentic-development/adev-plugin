---
spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
date: 2026-08-14
verdict: BLOCK
tier: full
last-reviewed-revision: 1
file-sha: 8be3cd144fed8960f9da3af21f064238a873a74d62611464e887022a5be00b0e
reviewers: [structural-architect, security-reviewer, consistency-analyzer]
---

# Architecture Review: explicit-governance-registries

> **Date:** 2026-08-14
> **Spec:** `.context-index/specs/cross-cutting/explicit-governance-registries.spec.md`
> **Charter:** cross-cutting (affects: validation, unified-gates, review, cli-driver-surface, domain-extensions)
> **Tier:** full (explicit `--tier full`; `risk_level: medium` → `review_mode: full`)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

## Structural Architect (structural-architect)

**Verdict:** BLOCK

- **SA-1 — blocker** — *Step 5: Materialize the three implicit registries* — `structural-architect:missing-migration-behavior:69893770`
  Step 5 couples a plugin-shipped change (removing run-time overlay in `review-config.mjs`, `merge-gates.mjs`) to a project-repo change (running `adev governance materialize`). These deploy from different artifacts at different times, so on upgrade the plugin change lands first and registries are empty until someone materializes. Concretely: `review.yaml:27` is `reviewers: []` and `review-config.mjs:53-79` is the only thing putting the three bundled reviewers into the effective set — drop the overlay before materialize runs and `/adev:review-specs` dispatches **zero reviewers**. That is precisely the silent loss Invariant 2 forbids, and no behavior covers the un-materialized state (Behavior 5 covers materialize, Behavior 6 covers drift *after* it). Specify the pre-materialization behavior — refuse-and-instruct, auto-materialize-on-first-read, or a version-gated fallback — with an acceptance criterion.

- **SA-2 — blocker** — *Behaviors* — `structural-architect:undefined-contract:23a59bf4`
  `adev gate transitions check` appears in the Changes Catalog and Step 4 populates `transitions`, but the contract specifies only the empty case (Behavior 3 → SKIP). Boundaries gets both halves (Behaviors 1 and 2); transitions gets only the first. Nothing states what the verb evaluates once populated — whether it reads prior gate results, executes gates, or consults lifecycle state. This matters because ADR-0010's decision-flow step 1 routes workflow preconditions to `requireGate` rather than a governance file, so the Check 9 / `requireGate` boundary needs stating.

- **SA-3 — warning** — *Out of Scope*
  The stated reason for excluding the boundaries→diagnostics subsumption ("its precondition, a regex-runner template, does not exist") is falsified by the spec's own Step 2, which builds a regex engine. ADR-0010:68 defers on a regex runner *inside the diagnostic registry* (`plugin:diagnostics/runners/regex-boundary.mjs`) — a narrower precondition. The seam is right; the rationale invites re-opening. Restate it as the diagnostics runner-template contract and note `boundaries.mjs` is built so the later consolidation wraps it.

- **SA-4 — warning** — *Extension contribution*
  Two step cross-references point at the wrong step, both load-bearing for ordering. "Step 3 populates `transitions:`" — Step 3 fixes the merge, Step 4 populates. And "Step 3 lands rules at `warning` before `error`" — that is Step 4's mitigation. As written the Extension-contribution section and the Migration Path disagree about which step introduces the write the destructive merge would destroy, which is the whole argument for the ordering.

- **SA-5 — suggestion** — *Current State* — Table says `gates.yaml` has "2 gates explicit"; the live file has one uncommented gate (`test`). Since Step 5's safety argument rests on a before/after equality test, the baseline should be exact.

- **SA-6 — suggestion** — *Step 2* — Risk line claims behaviour is "observably unchanged", but Behaviors 1 and 3 require PASS → SKIP. Only the pass/fail outcome is unchanged. An implementer could pin PASS-preservation and contradict the contract.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

- **SEC-1 — blocker** — *Extension contribution* — `security-reviewer:authorization:c4456237`
  `validateGovernanceEntry` (`content-install.mjs:101-119`) validates only `id` — no field allowlist. Two consequences from one root cause: (1) an extension can declare `source: project` on its own entry; new-id entries are copied verbatim (`byId.set(extEntry.id, {...extEntry})`), so the forged entry survives uninstall and is excluded from the widened drift pass — it looks project-authored forever. (2) On id collision the fill-gap loop (`if (!(key in projectEntry))`) injects `enabled: false` + `disabled_reason` whenever `enabled` is absent from the project entry — the default-on, most-common case — letting an extension silently disable any enabled check, including the security reviewer's own row. Fix: stamp `source` from install context and reject/strip extension-supplied `source`; protect a closed set of keys (`enabled`, `disabled_reason`, `severity`, `source`) from the fill-gap path.

- **SEC-2 — blocker** — *Error Cases* — `security-reviewer:path-traversal:8fd4d9bf`
  `install.mjs:91` reads `target = govEntry.target || 'review.yaml'` from the extension manifest; `mergeGovernanceEntries` then does `join(govDir, targetFile)` + `writeFileSync` with **no containment check** — unlike `installSamples` and `installSkillExtensions` in the same file, which both `resolve()` and verify `startsWith(resolvedDir + '/')`. **Confirmed empirically during this review:** `target: '../../ESCAPED.yaml'` wrote outside `.context-index/governance/` with no error. The proposed `UNKNOWN_GOVERNANCE_TARGET` covers only unmapped registry names, not a target escaping the directory. Fix: apply the same resolve+containment pattern used by the sibling installers, with its own error code.

- **SEC-3 — blocker** — *Error Cases* — `security-reviewer:input-validation:c511c411`
  `adev boundaries check` evaluates `boundaries.yaml` regexes against changed-file contents at plan/implement/validate time. Only `INVALID_BOUNDARY_PATTERN` (syntactic) is specified — nothing covers a syntactically-valid but catastrophically-backtracking pattern (`(a+)+$`) against a large file. Since `boundaries.yaml` is itself extension-writable, this is a DoS lever on a merge gate, not merely an author-carelessness risk. Fix: bound each rule's evaluation with a hard timeout and treat timeout as `INVALID_BOUNDARY_PATTERN` — fail closed naming the rule, never hang.

- **SEC-4 — warning** — *Behavioral Contract*
  Behavior 4 / Invariant 5 distinguish disabled from absent, but nothing detects a project-owned entry being switched to `enabled: false` in an ordinary PR. The widened drift pass flags new *unadopted bundled* entries, not an existing check being turned off. Extend Pass 19 to flag `enabled: false` on entries whose `source` is `bundled`/`domain:*`.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

Every factual claim was checked against source and verified: 7 checks under `checks:` in `validate.yaml`; `boundaries: []` and `transitions: {}` empty; `validate-config.mjs:74` single-source comment; `validate-config.mjs:110` reads `project.checks`; `review-config.mjs:53-79` three-layer overlay; `content-install.mjs:235` maps `validate.yaml` → `validators`; `gates/doctor.mjs:1109` loads raw; `example-validation-check-install.test.mjs:206` encodes the defect; ADR-0010's two deferrals quoted accurately; validation charter's single-source behavior supports rather than contradicts the spec. No conflict with `check-id-enum.spec.md` or `check-set-restructure.spec.md`.

- **CON-1 — suggestion** — *Target State / Structure* — "materialised" (line 59) vs "materialize" elsewhere (9 instances). Use American spelling per project convention.

---

## Summary

**Total findings:** 11 (5 blockers, 3 warnings, 3 suggestions)

**Verdict: BLOCK** — `blocker_threshold: 1`.

**Action required:** Revise the spec via `/adev:specify --revise`, then re-review.

Two blockers (SEC-1, SEC-2) describe defects in **already-shipped code**, not in the spec's proposed design — the spec's error is failing to specify their fix while depending on that code path. SEC-2 was reproduced during review. Both warrant board issues independent of this spec's fate.

The retained scope was judged coherent: the structural architect confirmed it reads as one contract ("what a governance file contains is what runs"), the three exclusions sit at defensible seams, the six steps are correctly ordered and individually deployable within the repo, and ADR-0010's role assignments are respected — no check moves surface. SA-1's ordering defect is between the plugin artifact and consumer projects, not between steps.
