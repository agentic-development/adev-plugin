---
spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
date: 2026-08-15
verdict: BLOCK
tier: full
last-reviewed-revision: 3
file-sha: 941b6849c312c0091dee79e9e5a0154d4ba3f8b71cc3e531071f74a3f6f86a42
reviewers: [structural-architect, security-reviewer, consistency-analyzer]
---

# Architecture Review: explicit-governance-registries

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/cross-cutting/explicit-governance-registries.spec.md`
> **Charter:** cross-cutting (affects: validation, unified-gates, review, cli-driver-surface, domain-extensions)
> **Tier:** full (explicit `--tier full`; `risk_level: medium` → `review_mode: full`)
> **Revision reviewed:** 3 (second and final auto-retry; revisions 1 and 2 each returned BLOCK with 5 blockers)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Domain resolution: `software` (source level: default). Governance overlay `.context-index/governance/review.yaml` contributes no entries (`reviewers: []`), so the three domain reviewers are the effective set — itself an instance of the problem this spec addresses.

## Revision-2 blocker disposition

**All five revision-2 blockers are genuinely closed.** Each has a normative Behavior, an Error Case row where applicable, and at least one matching Acceptance Criterion — not merely prose acknowledgement. Verified independently by the structural and security reviewers.

| Rev-2 blocker | Disposition in rev 3 |
|---|---|
| SA-1 `structural-architect:incomplete-precondition:0063478e` | **Closed.** Step 5 states the biconditional ("un-materialized **if and only if** its project file lacks a `materialized_at` marker"); Behavior 12 adds "regardless of how many entries the file holds"; AC line 357 pins the non-empty-`review.yaml` case the emptiness predicate would have missed. |
| SA-2 `structural-architect:internal-contradiction:c5b04b09` | **Closed.** Behavior 12 adds "without consulting bundled or domain defaults"; AC line 358 asserts the verdict is unchanged when the defaults are removed. The predicate is now decidable from the project file alone, so the loader no longer depends on machinery the same step deletes. |
| SEC-3 `security-reviewer:authorization:35f96c52` | **Closed.** Sole discriminator + install-time refusal into an unmarked registry + two `REGISTRY_NOT_MATERIALIZED` Error Case rows + AC line 359. The one-entry defeat path (extension-installed or hand-added reviewer) is shut. |
| SEC-1 `security-reviewer:authorization:646c1b8e` | **Closed, and more strongly than recommended.** Behavior 14 removes fill-gap merging outright ("introduces no key onto an existing entry — not an absent one, not an optional one, none"), with a general AC (363) and a `command`-onto-`gates.yaml` ACE-specific AC (364). Rev-2 SEC-5 (uninstall cannot restore a mutated project entry) is thereby **moot** — no residue can exist. |
| SEC-2 `security-reviewer:input-validation:23f20212` | **Closed.** Step 3 names `node:worker_threads` + `worker.terminate()`, 250 ms per rule per file, 1 MB input cap; Behavior 16, the `BOUNDARY_PATTERN_TIMEOUT` row, AC 365 (pinned to `(a+)+$`, "a test that would hang without worker termination") and the corrected Constitution Reference (line 336) all agree. Independently confirmed: a synchronous `RegExp.exec` cannot be interrupted mid-backtrack, and `node:worker_threads` is a Node built-in, so the zero-dependency principle holds. |

**Both new blockers below are prior *warnings* whose consequence rev 3 elevated**, not repeats. No rev-2 `blocker_id` recurs.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

- **SA-1 — blocker** — *Behaviors / Behavior 6 vs Migration Path Step 5* — `structural-architect:undefined-contract:50848539`
  `section_anchor: behaviors-6`
  Rev 3 makes `materialized_at` the **sole** discriminator of a fail-closed guard that halts every calling skill, but no section says what writes it. It appears only in Step 5 prose, Behavior 12, two Error Case rows, and ACs 357–359 — never in the Changes Catalog ADDED (which enumerates `enabled`, `disabled_reason`, `source:`), and never with a shape, location (root key vs entry field), or owner. The only candidate writer is contradicted by its own contract: Behavior 6 says `adev governance materialize` "writes the currently-effective merged set into the project's yaml **and makes no other change**; running it twice produces byte-identical output." Read literally, materialize never stamps the marker, so no registry can leave the un-materialized state and every registry read raises `REGISTRY_NOT_MATERIALIZED` permanently — with a remedy that cannot work. Read the other way (materialize stamps a timestamp), Behavior 6's byte-identical claim is false on the second run. Both readings are reachable and one of them bricks the system. The same gap covers `/adev:init`: Integration Point 3 keeps `merge-gates`/`merge-reviewers` at scaffold time but does not say the scaffold stamps the marker, so a freshly-initialized project would be born un-materialized.
  This is rev-2 SA-3 (warning) with its consequence elevated: as one conjunct of a predicate that also keyed on emptiness it was cosmetic; as the whole predicate it is load-bearing.
  **Recommendation:** Declare `materialized_at` in ADDED with its shape, location and owner; state in Behavior 6 which writers stamp it (materialize, and `/adev:init` scaffolding) and whether re-materialization preserves or refreshes it, so the idempotency claim stays true; add an AC pinning the round trip (un-materialized → materialize → loader proceeds). The security reviewer's SEC-2 adds the hardening half of the same edit (installer-immutable, rejected in extension-supplied entries).

- **SA-2 — warning** — *Behavior 12 / Error Cases (last two rows) vs Step 5 and AC line 353*
  Behavior 12 and both `REGISTRY_NOT_MATERIALIZED` rows are unqualified over "a registry," but Step 5 materializes only `review`, `diagnostics` and `gates`; the Target State table leaves `validate.yaml` and `boundaries.yaml` "unchanged." Under the unqualified reading `/adev:validate` and `adev boundaries check` halt forever, and AC line 353 fails outright — the reference extension targets `validate.yaml` (`example-validation-check-install.test.mjs:49`), which the install gate would refuse. Step 5's title ("the three implicit registries") supplies a coherent narrow reading, which is why this is not a blocker, but the normative sections do not carry it.
  **Recommendation:** Name the marker's applicable registry set in Behavior 12 and both Error Case rows, and state that `validate.yaml` / `boundaries.yaml` are exempt.

- **SA-3 — warning** — *Step 4 → Step 5 ordering vs Behavior 6 / `MATERIALIZE_WOULD_DROP`*
  Step 4 writes `transitions:` into `gates.yaml`; Step 5 then materializes `gates`. The spec reasoned about exactly this hazard for the extension path ("that is why the merge fix is sequenced as Step 3, ahead of any step that writes to a governance file") and gave it `MERGE_WOULD_TRUNCATE`, but materialize gets no parallel sibling-key guarantee — `MATERIALIZE_WOULD_DROP` is scoped to "an entry present in the effective set," not to sibling root keys or comments. Behavior 6's "makes no other change" implies preservation, but the extension path needed it stated explicitly and materialize is the step that runs *after* `transitions:` exists.
  **Recommendation:** State in Behavior 6 that materialize preserves sibling root keys and comments byte-identically, with an AC mirroring line 354.

- **SA-4 — warning** — *Changes Catalog ADDED (`adev gate transitions check [--json]`) / Behavior 4* — carried unaddressed from rev 2
  Still no argument naming which transition to evaluate, and "no passing record" remains unscoped — Behavior 4 says the event log "for the current spec" without stating how the current spec is resolved or how stale a passing record may be. See CON-1, which raises the deeper substrate problem in the same behavior.

- **SA-5 — warning** — *Extension contribution / Step 3, `source:` enum* — carried unaddressed from rev 2 (rev-2 CON-1)
  The four-value on-disk enum (`project | bundled | domain:<slug> | extension:<name>`) does not exist in code; today's `__source` values are `bundled`, `project`, `project-override`, `manifest-specialist`, `domain` (bare), `governance`. Rev 3 leaves "the install-time path needs the same field" in place. Behavior 14's collision rule and Step 6's `bundled`/`domain:*` audit both key off this enum, so the mismatch is now load-bearing for two behaviors.

- **SA-6 — suggestion** — *Current State / Structure table, `gates.yaml` row*
  Still reads "1 uncommented gate (`test`); `integration-test` present." `integration-test` is commented out in `.context-index/governance/gates.yaml`, exactly like `lint` and `typecheck`. Step 5's safety argument rests on a byte-identical before/after equality test, so the stated baseline should be exact.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

All three rev-2 security blockers are genuinely closed (see disposition table). No new blocker.

- **SEC-1 — warning** — authorization — *Migration Path / Step 3*
  The field-allowlist bullet (lines 181–185) still instructs: "exclude `enabled`, `disabled_reason`, `severity` and `source` from the collision fill-gap loop, which today injects any key absent from the project entry." That is the narrow protected-key list Behavior 14 explicitly repudiates ("Fill-gap merging is removed outright rather than protected by a key list"). Step 3 is the section an implementer executes; following it re-creates the exact ACE path AC 364 exists to forbid. Not a blocker because Behavior 14 is normative and names the key-list approach as the rejected alternative — but it is the highest-priority one-line fix in the spec.
  **Recommendation:** Delete the third clause of that bullet and replace with "on id collision the extension entry is skipped (Behavior 14); the allowlist governs *newly appended* entries only." Keep the `source`-stamping and rejection clauses.

- **SEC-2 — warning** — authorization — *Step 5 / Behavior 6*
  `materialized_at` is now the sole gate on a fail-closed security control, yet the spec never states its location, its writer, or its immutability, and it is absent from ADDED. Consequence for the threat model: the extension-facing field allowlist has no stated rule for the key, and `mergeGovernanceEntries` today auto-creates absent files (`content-install.mjs:156,170`), so whether an install can produce a *marked* file is undecided by the spec. (Extension reach appears closed in practice via the install-time refusal plus the sibling-key-preserving serializer — but by the interaction of two other rules, not by statement.) This is the security face of SA-1.
  **Recommendation:** Declare `materialized_at` in ADDED as a **root-level, ISO-8601, installer-immutable** key written only by `adev governance materialize` (and `/adev:init` scaffolding); add it to the rejected-field set alongside `source` (reusing `GOVERNANCE_SOURCE_FORGED` or a sibling code); state that extension install never creates an absent registry file; and amend Behavior 6 to "byte-identical apart from `materialized_at`, which is preserved on re-materialization if already present."

- **SEC-3 — warning** — rate-limiting — *Behavior 16*
  The two over-budget paths in one behavior disagree on direction: a timeout "fails closed naming the rule," but "files above the 1 MB input cap record SKIP rather than being scanned" — silently, fail-**open**. Once Step 4 promotes rules to `severity: error`, padding a file past 1 MB (generated bundles, vendored blobs, minified output routinely exceed it) makes every boundary rule silently pass on that file. This is a bypass of a merge gate rev 3 itself introduces.
  **Recommendation:** Make the cap fail closed like the timeout — record the skip as a finding at the rule's own severity, naming file and rule, so an oversized file is a visible WARN/FAIL rather than silence. Apply the cap via `statSync().size` before reading, not after.

- **SEC-4 — warning** — authorization — *Changes Catalog MODIFIED (Pass 19) / Step 6* — carried, half-addressed from rev 2
  Step 6 adopted the `enabled: false` sub-audit but line 134 / AC line 355 still exclude **all** non-`project` entries from drift findings. With fill-gap removed, appending a new entry is now the *only* extension write path — and for `gates.yaml` an appended `{id: x, command: "curl … | sh"}` is schema-legal, allowlist-legal (`command` is a legitimate gates field), and runs through `spawnSync("sh", ["-c", command])` (`doctor.mjs:965`) at every post-task/post-implement trigger. It carries `source: extension:foo`, so the only audit channel the spec provides is blind to it, and `materialize` (line 120) pulls domain-contributed entries into the executable set the same way.
  **Recommendation:** Scope the exclusion to *stale/unadopted* drift findings only, and add a Pass 19 sub-finding listing non-`project` entries whose execution-bearing fields (`command`, `prompt`, `runner`, `pattern`) first appeared or changed since the last install ledger entry — plus an install-time summary line naming any appended entry that carries one.

- **SEC-5 — suggestion** — input-validation — *Migration Path / Step 3*
  The worker mechanism is named but its construction is not, and the pattern string is extension-writable. `new Worker(src, { eval: true })` with the pattern interpolated into worker source would turn a config value into executed JavaScript — a code-injection surface rev 3 introduces alongside the fix. Specify: a static worker file (`lib/governance/boundary-worker.mjs`), pattern and file contents passed as `workerData`, compiled inside the worker with `new RegExp(pattern, flags)` only — never `eval`/`Function`/`{ eval: true }`.

- **SEC-6 — suggestion** — rate-limiting — carried; per-file byte cap adopted, remainder open
  Still no aggregate ceiling: cost is rules × changed files × 250 ms at plan, implement, *and* validate, and every timing-out rule fails the gate. Add an aggregate wall-clock budget after which the check records SKIP naming unevaluated rules, a changed-file count ceiling, and a binary-content skip.

- **SEC-7 — suggestion** — path-traversal — carried unaddressed from rev 2
  Step 3 still cites only `resolve()` + `startsWith(dir + '/')` (the `installSamples` pattern at `content-install.mjs:307-318`), which does not resolve symlinks; a `governance/gates.yaml` symlinked outside the tree passes containment and `writeFileSync` follows it. After containment, `realpathSync` the resolved target when it exists and re-assert containment, refusing with `PATH_TRAVERSAL`. Also worth enumerating the "known registry set" (line 179) explicitly rather than leaving it implicit.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

Rev-3 material verified accurate: Step 5's additive-composition argument is substantively correct (`review-config.mjs:83-85` merges project reviewers on top of the domain/bundled base); `node:worker_threads` is a Node built-in and `worker.terminate()` exists, so the Step 3 mechanism and the corrected Constitution Reference are now factually true; `inferRootKey`'s stem fallthrough is correct for `boundaries`/`diagnostics` and wrong for `validate` as claimed; `check-14-gate-executability` really does call `adev gate doctor --json`; Behavior 4's ADR-0010 routing to `requireGate` is accurate (`lib/lifecycle-state.mjs`). `materialized_at` now appears in Error Cases and ACs rather than prose only. The constitution self-correction narration was **not** flagged — in-spec review narration has corpus precedent (`incremental-artifact-writes.spec.md:242`, `measurement-integrity.spec.md:24`) and the claim is now accurate.

- **CON-1 — blocker** — category: contract — *Behaviors / Behavior 4* — `consistency-analyzer:contract:8be5ee5c`
  `section_anchor: behaviors-4`
  **This Spec:** `adev gate transitions check` "reads the recorded outcome of each named gate from the lifecycle event log for the current spec and records FAIL naming any gate that has no passing record."
  **Conflicts With:** The lifecycle event log has no per-gate record, so the check reads a substrate that no writer produces. `CANONICAL_EVENTS` (`lib/lifecycle-events.mjs:36-79`) contains no gate-outcome variant; `reportValidator` (`lib/lifecycle-state.mjs:866-891`) is keyed by `validator` (a check id) and its payload carries no per-gate breakdown; `skills/validate/SKILL.md:383,399` confirms Check 1 emits a **single** `validator_report` (`validate.check-1-quality-gates`) for the whole gate run, so gate ids (`test`, `lint`, `integration-test`) are never event subjects. An independent grep for `gate_result` / `gate_outcome` / `gates_passed` across `lib/`, `skills/` and `.context-index/specs/` returns nothing. As written every transition check would FAIL every required gate — and once Step 4 promotes rules from `warning` to `error`, that is a build-breaking outcome. Supplying the missing record means extending `CANONICAL_EVENTS`, which is a `[BOUNDARY: human-approved]` change governed by ADR-0009 (see the annotated precedents at `lifecycle-events.mjs:61-63` and `:74-77`) and is not declared anywhere in this spec's Changes Catalog.
  **Recommendation:** Either add the gate-outcome record to ADDED and declare the ADR-0009 boundary crossing explicitly, or restate Behavior 4 against a substrate that exists (e.g. extend Check 1's `validator_report` payload to carry per-gate outcomes, and say so in MODIFIED). Pair the fix with SA-4's two gaps — the transition argument and the record-staleness window — since all three live in the same behavior.

- **CON-2 — warning** — category: terminology / domain-model — *Extension contribution* — carried unaddressed from rev 2
  Lines 105–106 are unchanged: "`review-config.mjs` already tracks provenance via `__source` … the install-time path needs **the same field**." The runtime `__source` vocabulary is `bundled` / `project` / `project-override` (`review-config.mjs:314,322,325`), `manifest-specialist` (`:107`), `domain` / `governance` (`merge-reviewers.mjs:72,91`) — none matching the on-disk enum at line 123.
  **Recommendation:** As rev 2 — "an analogous but distinct field," or reconcile the two vocabularies explicitly. (Same finding as SA-5.)

- **CON-3 — warning** — category: domain-model — *Dependencies (line 45) vs REMOVED (line 141)*
  The spec cites `lib/domains/merge-reviewers.mjs` as "the overlay machinery this spec makes explicit," while REMOVED targets "implicit bundled-reviewer injection in `review-config.mjs`." These are two different functions: `review-config.mjs` defines its own private `mergeReviewers` at `:312` and never imports the domains module; `lib/domains/merge-reviewers.mjs` has exactly one lib consumer, `lib/cli/domain.mjs:53`.
  **Recommendation:** Name the local `review-config.mjs::mergeReviewers` in Dependencies; removing the run-time reviewer overlay does not touch `merge-reviewers.mjs`.

- **CON-4 — warning** — category: contract — *Behavior 6 vs Step 5 (`materialized_at`)* — carried unaddressed from rev 2 (rev-2 SA-3)
  Same defect as SA-1/SEC-2, seen from the contract side: `materialized_at` is absent from ADDED, and Behavior 6's "byte-identical on re-run" cannot hold if materialize writes a timestamp. Counted once in the totals below, under SA-1.

- **CON-5 — suggestion** — category: pattern — *Changes Catalog / ADDED* — carried from rev 2
  `adev gate transitions check` remains three-token. Confirmed against `docs/cli-reference.md`: every verb is flat two-token (`adev gate doctor`, `adev gate require`, `adev domain load-gates`, `adev test-policy resolve`, `adev route render-sidecar`, `adev worktree remove`); there is no three-token precedent. `adev gate transitions` would fit.

- **CON-6 — suggestion** — category: contract — *Current State / Structure, `gates.yaml` row*
  `integration-test` is fully commented out in `.context-index/governance/gates.yaml:57-66`, exactly like `lint` and `typecheck`. Baseline should read "`test` only; `lint`, `typecheck`, `integration-test` commented out." (Same finding as SA-6.)

- **CON-7 — suggestion** — category: pattern — *Behaviors 10 and 14*
  Behavior 14 now restates Behavior 10's collision rule in substance. Not a conflict, but two behaviors owning one contract invites divergence on revision. Fold 14's "introduces no key onto an existing entry" clause into Behavior 10.

---

## Summary

**Total findings:** 16 (2 blockers, 8 warnings, 6 suggestions) — deduplicated across reviewers; SA-1/SEC-2/CON-4 are one defect, SA-5/CON-2 are one, SA-6/CON-6 are one.

**Verdict: BLOCK** — `blocker_threshold: 1`.

**Action required:** This was the second and final auto-retry (`build.max_review_retries` = 2). The build halts here for operator decision. To proceed manually: revise via `/adev:specify --revise --spec .context-index/specs/cross-cutting/explicit-governance-registries.spec.md`, then re-review.

### Convergence note

**Addressed: 5. Persistent: 0. New: 2.** Revision 3 is a genuine convergence, not a restatement — every one of revision 2's five blockers is closed with normative text (Behavior + Error Case + Acceptance Criterion), and two of the closures are *stronger* than what review recommended: Behavior 14 removes fill-gap merging outright rather than extending a protected-key list, and the `materialized_at` biconditional plus install-time refusal shuts both the structural and the security face of the un-materialized guard in one edit. The blocker count fell 5 → 5 → 2.

Neither new blocker is a fresh design problem. Both are prior **warnings** whose consequence the revision itself elevated:

- **SA-1** is rev-2 SA-3 (`materialized_at` undeclared, colliding with Behavior 6's idempotency claim). At rev 2 the marker was one conjunct of a predicate that also keyed on emptiness, so leaving its writer unstated was cosmetic. Rev 3 promoted the marker to the *sole* discriminator of a fail-closed guard that halts every calling skill — which makes the undeclared writer load-bearing, and makes Behavior 6's "makes no other change / byte-identical on re-run" a live contradiction rather than a nit. The fix is two clauses: declare the field in ADDED with owner and shape, and state materialize's stamping/refresh semantics.
- **CON-1** is the substrate half of rev-2 SA-4 (`adev gate transitions check` underspecified). Rev 3 did not touch Behavior 4, and closer verification this round found the deeper problem: the per-gate outcome record it reads is never written by anything in the tree, and creating it crosses an ADR-0009 `[BOUNDARY: human-approved]` line the Changes Catalog does not declare.

Both are spec-text edits in two adjacent sections (Behavior 4/6 plus one ADDED row each), not design reopens. Together with the security reviewer's SEC-1 (Step 3 still carries the fill-gap key-list wording that Behavior 14 repudiates — the single highest-value one-line fix in the document) they constitute a small, bounded revision. An operator resuming this build should expect a fourth revision to converge.

### Scope judgement

The retained scope still reads as one contract — "what a governance file contains is what runs." ADR-0010 compliance is intact: no check moves surface (Invariant 3, AC 367), Behavior 4 routes workflow preconditions to `requireGate` per decision-flow step 1, and the boundaries→diagnostics exclusion correctly cites ADR-0010:68's runner-template precondition. The three documented exclusions sit at defensible seams and none was re-raised. The only ADR tension found is CON-1's undeclared ADR-0009 boundary crossing, which is a declaration gap rather than a conflict with the decision itself.

### Cross-cutting note

SEC-4 and SEC-7, like their rev-1 and rev-2 predecessors, describe defects in **already-shipped code** (`lib/extensions/content-install.mjs`, the hygiene drift pass) rather than in this spec's proposed design; the spec's error is depending on those code paths without fully specifying their repair. `adev-plugin-xg1f.1` / `adev-plugin-xg1f.2` already cover the rev-1 pair. SEC-3 (the 1 MB fail-open cap) and SEC-5 (worker construction) are new-in-rev-3 design surface and belong to this spec, not to a board issue.

### Governance footer

`.context-index/governance/gates.yaml` declares `transitions: {}` — no `spec-to-plan` `approver_role` applies. Informational only.
