---
spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
date: 2026-08-15
verdict: BLOCK
tier: full
last-reviewed-revision: 2
file-sha: a6f5f921fdcf711348eb77921ac8e1b31d87caaf075d8650734831d47cccefcb
reviewers: [structural-architect, security-reviewer, consistency-analyzer]
---

# Architecture Review: explicit-governance-registries

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/cross-cutting/explicit-governance-registries.spec.md`
> **Charter:** cross-cutting (affects: validation, unified-gates, review, cli-driver-surface, domain-extensions)
> **Tier:** full (explicit `--tier full`; `risk_level: medium` → `review_mode: full`)
> **Revision reviewed:** 2 (re-review; revision 1 returned BLOCK with 5 blockers)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Domain resolution: `software` (source level: default). Governance overlay `.context-index/governance/review.yaml` contributes no entries (`reviewers: []`), so the three domain reviewers are the effective set — itself an instance of the problem this spec addresses.

## Revision-1 blocker disposition

| Rev-1 blocker | Disposition in rev 2 |
|---|---|
| SA-1 `structural-architect:missing-migration-behavior:69893770` | **Partially resolved.** The "upgrade window" subsection and Behavior 12 do real work (explicit un-materialized state, fail-closed, rejected alternative recorded), but the predicate closes only the fully-empty case. Re-raised in narrowed form as rev-2 SA-1 and SEC-3. |
| SA-2 `structural-architect:undefined-contract:23a59bf4` | **Resolved.** Behavior 4 defines the populated case (reads recorded gate outcomes, never executes) and draws the Check 9 / `requireGate` boundary citing ADR-0010 decision-flow step 1. A residual signature gap is filed as rev-2 SA-4 (warning), not a blocker. |
| SEC-1 `security-reviewer:authorization:c4456237` | **Partially resolved.** Source forgery and the `enabled: false` injection are properly closed (Behaviors 13/14, `GOVERNANCE_SOURCE_FORGED`, `GOVERNANCE_FIELD_NOT_ALLOWED`, matching ACs). The protected-key set is too narrow — re-raised as rev-2 SEC-1. |
| SEC-2 `security-reviewer:path-traversal:8fd4d9bf` | **Resolved.** Step 3 names the concrete `resolve()` + `startsWith(dir + '/')` pattern mirroring `installSamples`, adds the registry allowlist, a distinct `PATH_TRAVERSAL` code, Behavior 15, and an AC that reproduces the escape. Symlink hardening filed as SEC-7 (suggestion). |
| SEC-3 `security-reviewer:input-validation:c511c411` | **Not genuinely resolved.** Behavior 16 and its AC state the requirement, but the System Constitution Reference asserts a mechanism that cannot satisfy it. Re-raised as rev-2 SEC-2. |
| SA-3, SA-4, SEC-4 (warnings) | **Resolved.** |
| SA-5, SA-6, CON-1 (suggestions) | **Resolved** (SA-5 partially — see rev-2 SA-5). |

## Structural Architect (structural-architect)

**Verdict:** BLOCK

- **SA-1 — blocker** — *Migration Path / Step 5 "The upgrade window" + Behavior 12* — `structural-architect:incomplete-precondition:0063478e`
  `section_anchor: migration-path-step-5`
  The fail-closed predicate fires only when "its entry list is empty while bundled/domain defaults exist." Registries compose additively, not replace-wise: `review-config.mjs:80-83` merges project reviewers **on top of** the bundled/domain base. A project with one project-authored reviewer plus the three bundled ones has a non-empty `reviewers:` list, so it is not un-materialized by the spec's definition — yet removing the overlay drops the three bundled reviewers silently. Same shape for `gates.yaml`, which today has a non-empty `gates:` list and can carry domain-contributed gates. The upgrade window is therefore closed only for the fully-empty case, and the partially-populated case is exactly the silent loss Invariant 2 forbids.
  **Recommendation:** Define the un-materialized condition on presence/absence of the `materialized_at` marker independent of list emptiness, or otherwise state a condition covering partially-populated registries, with a matching acceptance criterion.

- **SA-2 — blocker** — *Behavior 12 vs Changes Catalog MODIFIED (`lib/domains/merge-gates.mjs`) / REMOVED* — `structural-architect:internal-contradiction:c5b04b09`
  `section_anchor: behaviors-12`
  Behavior 12's precondition — "has bundled or domain defaults" — is a run-time question about the merged set. But MODIFIED states the merge machinery is "retained for `adev governance materialize` and `/adev:init` scaffolding; **no longer consulted at run time**," and REMOVED deletes run-time domain merging and bundled-reviewer injection. The loader cannot evaluate the precondition without the dependency the same step removes; the dependency direction points back outward at the overlay this spec exists to delete.
  **Recommendation:** State the un-materialized condition as a property the loader can decide from the project file alone (e.g. the marker), or explicitly declare that defaults remain readable at load time and reconcile that with the REMOVED entry.

- **SA-3 — warning** — *Step 5 (`materialized_at` marker) vs Behavior 6*
  `materialized_at` is introduced in Step 5 prose as the state discriminator but appears in neither the Changes Catalog ADDED list (which enumerates `enabled`, `disabled_reason`, `source:`), nor the Error Cases table, nor the Acceptance Criteria. It also collides with Behavior 6: "running it twice produces byte-identical output" cannot hold if materialize writes a fresh timestamp on each run.
  **Recommendation:** Declare the field in ADDED with its shape and ownership, and state whether re-materialization preserves or refreshes it so Behavior 6's idempotency claim stays true.

- **SA-4 — warning** — *Changes Catalog ADDED (`adev gate transitions check [--json]`) / Behavior 4*
  The verb's contract is underspecified in two ways the check's meaning depends on: (a) the declared signature takes no argument naming *which* transition to evaluate, while Behavior 4 speaks of "a lifecycle transition"; (b) "no passing record" is unscoped — Behavior 4 says the event log "for the current spec" without stating how the current spec is determined or how stale a passing record may be. A gate that passed many commits ago would satisfy the check as written.
  **Recommendation:** Give the verb an explicit transition argument in the ADDED entry and state the record-scoping rule (which spec, which window) in Behavior 4.

- **SA-5 — suggestion** — *Current State / Structure table, `gates.yaml` row*
  "1 uncommented gate (`test`); `integration-test` present" — `integration-test` is commented out in `.context-index/governance/gates.yaml`, exactly like `lint` and `typecheck`. Since Step 5's safety argument rests on a byte-identical before/after equality test, the stated baseline should be exact.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

- **SEC-1 — blocker** — *Migration Path / Step 3* — `security-reviewer:authorization:646c1b8e`
  `section_anchor: migration-path-step-3`
  Step 3's protected-key set for the collision fill-gap loop is `enabled`, `disabled_reason`, `severity`, `source` — it omits the fields that execute. `gates.yaml` entries carry `command:`, run through `spawnSync("sh", ["-c", command])` (`lib/gates/doctor.mjs:965`, the same set Check 1 executes). The live fill-gap loop is `if (!(key in projectEntry)) projectEntry[key] = value` (`lib/extensions/content-install.mjs:206-210`), so an extension declaring `{id: test, command: "curl … | sh"}` against a gate id whose project entry has no `command` (the commented `lint`/`typecheck` scaffolds, and any gate seeded without one) injects a shell command into a **project-owned** entry. The per-registry field allowlist does not help: `command` is a legitimate `gates.yaml` field. Behavior 11 makes it permanent — the mutated entry's `source` is `project`, so uninstall leaves it — and the widened Pass 19 excludes nothing here because the entry looks project-authored. This is arbitrary code execution at every `post-task` / `post-implement` trigger from an extension install, and Steps 4-5 raise the stakes by making `gates.yaml` the materialized single source.
  **Recommendation:** Add a behavior stating the fill-gap merge never introduces *any* new key onto an existing entry — extension entries colliding on id are recorded as skipped, not merged (fill-gap's only current value is filling absent optional fields, which single-source makes unnecessary). If fill-gap is retained, extend the protected set to every execution-bearing field per registry (`command`, `argv`, `prompt`, `runner`, `pattern`) and add an AC: "an extension cannot introduce a `command` onto an existing `gates.yaml` entry."

- **SEC-2 — blocker** — *Behaviors / Behavior 16 vs System Constitution Reference* — `security-reviewer:input-validation:23f20212`
  `section_anchor: behaviors-16`
  Behavior 16 and its AC ("fails closed within its time budget rather than hanging") are contradicted by the System Constitution Reference (line 310): "the regex evaluation needs nothing beyond `RegExp` and existing glob helpers." A synchronous `RegExp.exec` on `(a+)+$` cannot be interrupted in-process; no timer, `AbortSignal`, or wall-clock check runs while the regex backtracks. Implemented as line 310 directs, the AC is untestable by construction and the DoS lever rev-1 SEC-3 identified stays open on a merge gate that extensions can write to.
  **Recommendation:** Name the enforcement mechanism in Step 2 / Behavior 16 — evaluate each rule in a `node:worker_threads` worker (Node built-in, constitution-compliant) with `worker.terminate()` on budget expiry, or pre-screen patterns with a static backtracking check (reject nested unbounded quantifiers) plus an input-size cap. Correct line 310 to name the chosen built-in. State the budget value (e.g. 250 ms per rule per file) so the AC is pinnable.

- **SEC-3 — blocker** — *Migration Path / Step 5 + Behavior 12* — `security-reviewer:authorization:35f96c52`
  `section_anchor: migration-path-step-5`
  Behavior 12 / Step 5 define un-materialized as "no `materialized_at` marker **and** its entry list is empty while bundled/domain defaults exist." The conjunction makes the fail-closed guard trivially defeatable: **one** entry in `review.yaml` flips the registry to "materialized," and the loader — with the overlay removed — then runs exactly that one reviewer, silently dropping the three bundled reviewers including `security-reviewer`. Two reachable paths: (a) an extension declaring `provides.governance` with a single benign `review.yaml` entry, installed before the project materializes — an unprivileged way to disable security review that leaves no `enabled: false` for Step 6's audit to catch; (b) any project that hand-adds one custom reviewer pre-upgrade, which is the documented workflow in `review.yaml`'s own header. This is the exact silent loss Invariant 2 forbids, merely narrowed rather than closed. It is the security-facing face of SA-1.
  **Recommendation:** Make `materialized_at` the sole discriminator: absent marker + bundled/domain defaults exist ⇒ `REGISTRY_NOT_MATERIALIZED`, regardless of entry count. Add a behavior and AC: "a registry holding entries but no `materialized_at` marker still raises `REGISTRY_NOT_MATERIALIZED`." Additionally, forbid extension install into a registry lacking the marker (`REGISTRY_NOT_MATERIALIZED` at install time), so install cannot pre-empt materialization.

- **SEC-4 — warning** — *Changes Catalog MODIFIED (hygiene Pass 19) / Step 6*
  "Entries with a non-`project` `source` are excluded from drift findings" (line 134, AC line 329) makes every extension- and domain-contributed entry permanently invisible to the only audit channel the spec provides. Step 6 inspects non-project entries for exactly one condition (`enabled: false`). A newly-arrived `source: extension:foo` gate carrying a shell command, or a `source: domain:x` reviewer pointing at an attacker-chosen prompt path, surfaces nowhere — and `materialize` (line 120) actively pulls domain-contributed entries into the executable set.
  **Recommendation:** Exclude non-project entries from *stale/unadopted* drift findings only. Add a Pass 19 sub-finding reporting non-project entries whose execution-bearing fields (`command`, `prompt`, `runner`) changed or first appeared since the last recorded install ledger, and list them in the install summary at merge time.

- **SEC-5 — warning** — *Behaviors / Behavior 11*
  Behavior 11 ("entries carrying its `source` are removed and no other entry is touched") makes uninstall incomplete by design: fields the fill-gap loop injected into project-owned entries at install are never reversed, because those entries carry `source: project`. Uninstall therefore cannot restore pre-install state, and the residue is exactly the class SEC-1 exploits.
  **Recommendation:** Either adopt SEC-1's skip-on-collision rule (making residue impossible), or record injected keys per entry in an install ledger under `.context-index/extensions/` and strip them on uninstall, with an AC: "uninstalling an extension restores a collided project entry byte-identically to its pre-install form."

- **SEC-6 — suggestion** — *Step 2 / Behavior 2*
  The evaluation budget is specified per rule only. Nothing bounds bytes read per file, total files, or binary/minified content — `boundaries check` runs at plan, implement, *and* validate time, so cost multiplies by rules × changed files × three lifecycle points. Specify a per-file byte cap (skip + record the skip above it), a binary-content skip, and an aggregate wall-clock budget after which the check records SKIP naming unevaluated rules rather than continuing.

- **SEC-7 — suggestion** — *Behaviors / Behavior 15*
  `resolve()` + prefix check (the `installSamples` pattern the spec cites) does not resolve symlinks; a `.context-index/governance/gates.yaml` symlinked outside the tree still passes containment and `writeFileSync` follows it. After containment, `realpathSync` the resolved target when it exists and re-assert containment; refuse with `PATH_TRAVERSAL` on mismatch.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

All verifiable line-level claims were re-checked against source and confirmed accurate: `validate-config.mjs:74` (single-source comment), `:110` (`project.checks`), `review-config.mjs:53-79` (three-layer overlay), `content-install.mjs:101-119` (`validateGovernanceEntry`, id-only validation; fill-gap loop at 204-212), `content-install.mjs:235` (`inferRootKey` → `'validators'`), `:307-318` / `:383-384` (sibling resolve+containment pattern), `install.mjs:91` (`govEntry.target || 'review.yaml'`), `doctor.mjs:1109` (`loadGates`), `example-validation-check-install.test.mjs:206-208` (`validate.validators || validate.checks`), ADR-0010 decision-flow step 1 and the line-68 deferral quotes, Check 8/9 current `kind` / `severity` in `validate.yaml`, and the `check-8-boundaries.md` body quoted verbatim. Rev-1 CON-1 is fixed — all instances now read "materialize."

Not flagged: `adev boundaries check` (plural-noun namespace has precedent in `adev issues`), `adev extension uninstall --name <n>` (flag-based target selection matches `adev worktree remove --slug`), and the reuse of the `PATH_TRAVERSAL` code (matches the code already used by the sibling installers in the same file — consistency, not drift). No conflicts found with `check-id-enum.spec.md`, `measurement-integrity.spec.md`, `graduated-rigor-tiers.spec.md`, or `lifecycle-gate.spec.md`.

- **CON-1 — warning** — category: terminology / domain-model — *Extension contribution*
  **This Spec:** "`review-config.mjs` already tracks provenance via `__source` … the install-time path needs the same field, which is also what makes the two paths consistent," and the Changes Catalog fixes the persisted `source:` enum to `project | bundled | domain:<slug> | extension:<name>`.
  **Conflicts With:** The actual `__source` vocabulary in `lib/governance/review-config.mjs:107,315,326,328` and `lib/domains/merge-reviewers.mjs:72,91` / `merge-gates.mjs:66,82` is `bundled`, `project`, `project-override`, `manifest-specialist`, `domain` (bare, no slug), `governance` — none of which match the four-value closed enum this spec proposes to persist; `domain:<slug>` / `extension:<name>` formats do not exist anywhere today.
  **Recommendation:** Reword "the same field" to "an analogous but distinct field" (or reconcile the two vocabularies explicitly) so an implementer does not literally reuse `__source`'s runtime values for the on-disk `source:` enum.

- **CON-2 — warning** — category: pattern — *Changes Catalog / ADDED*
  **This Spec:** Adds `adev gate transitions check` as a new CLI verb.
  **Conflicts With:** Every existing verb in `docs/cli-reference.md` follows a flat two-token `adev <noun> <verb>` shape (`adev gate doctor`, `adev gate require`, `adev extension install`, `adev domain load-gates`, `adev state current`, `adev artifact commit`, `adev route render-sidecar`, `adev worktree add`) — `gate` is already a two-token namespace. `gate transitions check` is a three-token verb with no precedent in the corpus.
  **Recommendation:** Either fold it into the existing `gate` namespace as a two-token verb (e.g. `adev gate transitions`) or document the nesting as intentional; as written it is a silent pattern break future verb authors may copy.

---

## Summary

**Total findings:** 14 (5 blockers, 6 warnings, 3 suggestions)

**Verdict: BLOCK** — `blocker_threshold: 1`.

**Action required:** Revise the spec via `/adev:specify --revise --spec .context-index/specs/cross-cutting/explicit-governance-registries.spec.md`, then re-review.

### Convergence note

Revision 2 is a real improvement, not a restatement: SA-2, SA-3, SA-4, SEC-2, SEC-4, SA-5 (partly), SA-6 and CON-1 are all genuinely closed, and the security remediations in Step 3 are concrete enough to test. The blocker count is unchanged at 5, but only two of the five are continuations, and both are **narrowed**:

- The un-materialized guard (rev-1 SA-1) went from *absent* to *present but defeated by one entry*. Rev-2 SA-1 and SEC-3 are the same underlying defect seen from the structural and security sides; both propose the identical one-line fix — make `materialized_at` the sole discriminator. Rev-2 SA-2 is the second half of that fix (the loader must be able to decide the predicate without the overlay the same step deletes). These three collapse into one edit.
- The field allowlist (rev-1 SEC-1) went from *absent* to *present but missing execution-bearing fields*. Rev-2 SEC-1 extends the same list.
- Rev-2 SEC-2 is the one place where rev 2 asserted a fix it cannot deliver as written: the regex time budget is stated as a behavior but the Constitution Reference forbids the only mechanism that could implement it. This is a two-line reconciliation, not a design reopen.

No blocker in this revision re-raises a rev-1 blocker verbatim, and no `blocker_id` repeats. Three of the five blockers share one root cause; a single targeted revision should close them.

### Scope judgement

The retained scope still reads as one contract ("what a governance file contains is what runs"). The three documented exclusions sit at defensible seams and the rev-2 rewrite of the boundaries→diagnostics rationale (now citing ADR-0010:68's runner-template precondition) removed the invitation to re-open. ADR-0010's role assignments continue to be respected — no check moves surface, and Behavior 4 now explicitly routes workflow preconditions to `requireGate` per decision-flow step 1.

### Cross-cutting note

Rev-2 SEC-1 and SEC-5, like rev-1 SEC-1/SEC-2, describe defects in **already-shipped code** (`lib/extensions/content-install.mjs`'s fill-gap loop) rather than in this spec's proposed design; the spec's error is depending on that code path without fully specifying its repair. They warrant board issues independent of this spec's fate — `adev-plugin-xg1f.1` / `adev-plugin-xg1f.2` already cover the rev-1 pair.

### Governance footer

`.context-index/governance/gates.yaml` declares `transitions: {}` — no `spec-to-plan` `approver_role` applies. Informational only.
