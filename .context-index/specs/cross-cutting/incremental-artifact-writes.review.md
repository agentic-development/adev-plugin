---
spec: .context-index/specs/cross-cutting/incremental-artifact-writes.spec.md
charter: cross-cutting
verdict: PASS_WITH_NOTES
date: 2026-05-17
last-reviewed-revision: 2
file-sha: afe4ebf3ef2945518f2f87a1874748f6ea11a470cb3edb16f9b9980216e64c78
---

# Architecture Review: incremental-artifact-writes (revision 2)

> **Date:** 2026-05-17
> **Spec:** rev 2 (`kind: behavioral`, `mode: cross-cutting`, `risk_level: medium`)
> **Verdict:** **PASS_WITH_NOTES** (0 blockers, 2 warnings, 7 suggestions)
> **Prior:** rev 1 returned BLOCK (2 blockers, 6 warnings, 8 suggestions). All blockers + 6 of 6 warnings RESOLVED in rev 2. 2 new warnings introduced by the rev-2 lock-stealing logic.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer    | Security Reviewer    | subagent | reviewer-capable   | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast      | plugin:review-specs/consistency-analyzer-prompt.md |

---

## Structural Architect (structural-architect) — PASS_WITH_NOTES

**Rev-1 findings:** SA-1, SA-2, SA-3, SA-6, SA-7 all RESOLVED. SA-4, SA-5, SA-8, SA-9 were suggestions, no required change.

**New findings (rev 2):**

- **SA-10 — warning — Lock-stealing TOCTOU on the `.partial` file.** Behavior 6 "pid dead + age > threshold" branch unlinks both `.partial.lock` AND `.partial`, then retries `openSync(O_EXCL)`. Between the staleness check and `unlink(.partial)`, a third party could acquire the lock under a fresh pid, OR the "dead" pid could have been reused. `kill(pid, 0) === ESRCH` does not prove the original writer crashed — pid reuse is real, and `started_at` only narrows the window. The destructive op (unlink `.partial`) precedes the synchronisation point.
  **Recommendation:** Define steal ordering as an invariant: re-stat the lock right before unlink and abort if `mtime`/`pid` changed; only unlink `.partial` AFTER successfully re-creating `.partial.lock` under a new owner. OR weaken the contract to "stolen → discarded" (acknowledge the stolen artifact's bytes are not recoverable; the steal IS the discard).

- **SA-11 — warning — `partial_stale_seconds` vs `partial_stale_hours` overlap.** Two thresholds gate overlapping conditions: `partial_stale_seconds` (default 30) for lock-stealing in Behavior 6; `partial_stale_hours` (default 24) for orphan-content sweeps in Behavior 7. A `.partial` with missing lock but young content falls between. Behavior 7 says the orchestrator "MAY" sweep — the only non-deterministic word in an otherwise prescriptive spec.
  **Recommendation:** Add a precedence rule: "Behavior 6 governs when a lock file exists; Behavior 7 governs when a `.partial` exists without any lock. The two never overlap." Promote `MAY` to `MUST` (with interactive vs `--auto` split, which exists implicitly).

- **SA-12 — suggestion — `currentState()` projection field deferred.** AC line 201 defers the projection-shape decision (`interventions[]` vs `partialRecoveries[]`) to plan time. A behavioural spec deferring projection shape weakens the contract for downstream readers. Recommend: pick `partialRecoveries[]` now (matches "one helper per variant" discipline).

- **SA-13 — suggestion — Invariants section silently shadows charter Invariant #6.** Cross-cutting spec introducing a system-wide invariant (write-state suffix taxonomy) without an owning charter is a governance gap. Recommend: hoist into `agent-reliable-state-artifacts/charter.md` as a paired amendment, OR document where retro/hygiene tooling anchors it.

---

## Security Reviewer (security-reviewer) — PASS

**Rev-1 findings:** SEC-1, SEC-2, SEC-3, SEC-4 ALL RESOLVED. SEC-5 was acknowledgment only.

**New findings (rev 2):** All `suggestion` severity (no blockers, no warnings).

- **SEC-6 — suggestion — `partial_schema` marker injection surface.** Marker is parsed before validation. A crafted value like `../../../etc/passwd` or `plan@1; rm -rf` becomes an injection surface if interpolated into dynamic dispatch (`loadResumeParser('plan@1')`). Recommend: explicit grammar in Preconditions (`/^[a-z][a-z0-9-]{0,31}@[0-9]{1,3}$/`); allowlist map from validated `{skill, version}` tuples to parser callables; reject oversized/malformed markers BEFORE dispatch lookup.

- **SEC-7 — suggestion — Lock payload validation.** `{pid, started_at}` is JSON-parsed without schema. If `pid` is `0`, `-1`, negative, float, or string, `process.kill` semantics diverge (`kill(0, 0)` targets process group; `kill(-1, 0)` broadcasts). Locally-attacker-writable lock could pivot a stale-check into unintended liveness probe. Recommend: AC requires lock payload to validate `pid` as a positive finite integer ≤ `2**22` and `started_at` as a past ISO-8601. Schema failure → treat as orphaned (steal path), do NOT invoke `process.kill`.

- **SEC-8 — suggestion — `dispatch_mode` in committed events.** Marginal data exposure. Combined with `artifact_path` + timestamps, lets a repo reader infer which paths were prone to upstream API drops. Acceptable under local-CLI threat model. Recommend: document the disclosure boundary in the paired `lifecycle-event-log.spec.md` amendment so adopters know what's persisted.

### Threat-model verification (per re-review prompt)

- **PID recycling:** theoretical concern; `started_at` floor + 30s window makes the race vanishingly improbable on a developer laptop. **Realistic? No.**
- **Deliberate non-exit by attacker:** attacker that can keep a process alive can write arbitrary files; out of scope.
- **`started_at` forgery:** trivial via direct lock-file write, but attacker also owns the partial then; the lock-steal pathway adds no novel surface. Schema-validation (SEC-7) limits unintended consequences.
- **`partial_schema` forgery:** main risk is dispatch-path injection; mitigated by SEC-6 allowlist.

---

## Consistency Analyzer (consistency-analyzer) — PASS_WITH_NOTES

**Rev-1 findings:** CON-1, CON-2, CON-3, CON-4, CON-5 RESOLVED. CON-6 PARTIALLY RESOLVED (knob family coherent but namespace question sidestepped). CON-7 n/a. CON-8 NOT ADDRESSED intentionally (kept per SA-8; disagreement documented in spec).

**New findings (rev 2):** All `suggestion` severity.

- **CON-9 — suggestion — Manifest knob namespace.** `manifest.lifecycle.partial_*` puts artifact write-state under `lifecycle.*`. Existing `lifecycle.*` knobs (`lifecycle.gate_mode`, `lifecycle.gate_*`) govern gate enforcement, not artifact byte management. Spec's own Invariants section calls these "write-state" concepts orthogonal to lifecycle gates. Recommend: move to `artifacts.partial_*`, OR explicitly defend the `lifecycle.*` choice inline. Currently silent on the choice. (Carries forward the unresolved thread from CON-6.)

- **CON-10 — positive verification (no finding).** `.partial.lock` naming is consistent with JsonAdapter's `<file>.lock` pattern. The lock pairs with `.partial`, not with the final artifact. Clean.

- **CON-11 — suggestion — Projection field name deferred.** AC line 201 defers `interventions[]` vs new `partialRecoveries[]` to plan time. Same finding as SA-12. Recommend: pin to `partialRecoveries[]` now (matches one-helper-per-variant discipline).

- **CON-12 — suggestion — `partial_schema: <skill>@<version>` syntax has no precedent.** No existing spec uses `@`-versioned schema markers. Closest is source-manifest stamping (different pattern). Recommend: either cite a sibling that uses `@`, or downgrade to a JSON/YAML-frontmatter marker `{partial_schema: "plan", partial_schema_version: 1}` to match prevailing style.

---

## Summary

**Total findings (rev 2):** 9 new (0 blockers, 2 warnings, 7 suggestions). All rev-1 blockers + 6 rev-1 warnings RESOLVED.

| Reviewer | Verdict (rev 2) | Verdict (rev 1) | Resolved | New |
|---|---|---|---|---|
| Structural Architect | PASS_WITH_NOTES | BLOCK         | SA-1/2/3/6/7 | SA-10 (W), SA-11 (W), SA-12 (S), SA-13 (S) |
| Security Reviewer    | PASS            | PASS_WITH_NOTES | SEC-1/2/3/4 | SEC-6 (S), SEC-7 (S), SEC-8 (S) |
| Consistency Analyzer | PASS_WITH_NOTES | BLOCK         | CON-1/2/3/4/5 | CON-9 (S), CON-11 (S), CON-12 (S); CON-10 positive |
| **Consolidated**     | **PASS_WITH_NOTES** | **BLOCK** | **all blockers + all warnings** | **2 W, 7 S** |

### Two warnings worth addressing (cluster: lock-stealing semantics)

Both warnings are about the lock-stealing logic I introduced in rev 2 to fix SEC-1. Worth tightening before merge but not blocking:

- **SA-10 — TOCTOU on the `.partial` unlink.** The destructive op precedes the synchronisation point. Either re-stat-before-unlink with an abort path, OR weaken the contract to "stolen → discarded." The "discarded" framing is cleaner: a stolen lock means the prior partial's content is unrecoverable by definition, so trying to preserve it is the wrong contract.
- **SA-11 — `partial_stale_seconds` vs `partial_stale_hours` overlap.** Add a precedence rule (Behavior 6 governs lock-present; Behavior 7 governs lock-absent; never overlap). Promote `MAY` to `MUST` with split on interactive/`--auto`.

### Suggestions worth folding into rev 3 (if there is one)

| Theme | Suggestions |
|---|---|
| **Input validation** (security-driven) | SEC-6 (`partial_schema` regex + allowlist), SEC-7 (lock payload `{pid, started_at}` schema validation) |
| **Contract pinning** (defer fewer decisions to plan) | SA-12 / CON-11 (projection field name), CON-9 (manifest knob namespace) |
| **Governance** | SA-13 (invariant ownership), SEC-8 (document data-exposure boundary in paired amendment), CON-12 (schema marker syntax precedent) |

### Action required

Spec status moves to **`review-passed`**. Two paths forward:

1. **Land rev 2 as-is**, fold the 2 warnings + 7 suggestions into the plan tasks during `/adev:plan`. The plan can include "tighten lock-steal contract per SA-10" and "add precedence rule per SA-11" as explicit task items. Faster overall.
2. **Revise to rev 3** addressing at minimum the 2 warnings (SA-10, SA-11). Cleaner spec going into plan but adds another review round-trip.

Either path is defensible. SA-10 in particular is a real design hole I introduced (the unlink ordering matters under contention) but it's addressable in the plan with a clearer task description than another spec revision would provide.

### Risk-Policy / Approval Footer

- **Risk level:** `medium` (declared in spec frontmatter)
- **Policy:** standard review required; no HITL approval at medium
- **Required approver:** (none declared)
