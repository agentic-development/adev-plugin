---
charter: agent-reliable-state-artifacts
kind: behavioral
status: review-pending
risk_level: high
revision: 3
charter-revision: 3
amends: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md
target-revision: 5
created: 2026-08-17
updated: 2026-08-18
tracker-ref: adev-plugin-j7pq.3
---

# Amendment: Live Spec: Lifecycle Event Log (targeting rev 5)

> This spec **amends** `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` targeting revision 5.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

The review gate accepts two classes of verdict it should reject. Both are gaps
in this spec's own contract, which is why they are amended here rather than
fixed as implementation bugs.

**1. The gate never checks that the reviewed artifact is the current artifact.**
`requireGate` asserts only that the prior step is `completed` with a passing
verdict. The `reviewer_report` payload records `step`, `reviewer`, `severity`,
`verdict`, `notes` and an optional `revision` — but nothing identifying *which
bytes* the reviewer read. A spec can therefore pass review, be rewritten
arbitrarily, and still satisfy the gate on the strength of a review of text that
no longer exists. `revision:` does not close this: it is author-declared, not
content-derived, and a rewrite that does not bump it is invisible.

**2. A terminal step event can be forged with no preceding start.**
`adev report --type step --status completed` validates `--status` against the
legal set and nothing else. Emitting `completed` for a step that never started
produces a projection indistinguishable from genuine completion, opening every
downstream gate. The base spec's own failure-path guidance leans on this
channel, so the hole is reachable through documented usage.

Bounding the claim: BEH-7 delivers a **sequencing invariant, not authenticity**.
`--status started` stays unvalidated, so `report --status started` followed by
`--status completed` still forges a completion — the bar rises by one CLI call.
Neither event carries actor or session provenance, so a `completed` event remains
unauthenticated and downstream gates MUST NOT treat it as attested. Adding actor
provenance is separate scope, not amended here.

Scope note: the third defect on the originating issue (`adev-plugin-j7pq.3`) —
a skipped review emitting verdict `PASS` — is **not** amended here.
`graduated-rigor-tiers.spec.md` already replaced the legacy
`require_review: false` with `review_mode: quick`, so that escape hatch is
closed by an existing approved decision; the residual work is drift in
`skills/review-specs/SKILL.md` against that spec, not a change to this contract.

## Behavioral Delta

<!-- retired-behavior-ids: (none) -->

> These `BEH-<n>` IDs are **amendment-scoped**: they name behaviors of this delta, not of the base spec (whose
> behaviors are unnumbered bullets). A citation of `BEH-3` against the base resolves to nothing.

Both changes follow the mechanism this spec has already used twice — an
**optional** per-variant field plus a fail-soft fold — so no `CANONICAL_EVENTS`
variant is added and the ADR-0009 `[BOUNDARY: human-approved]` line is not
crossed. Field naming is `snake_case` on the event and camelCase on the
projection, per the base spec's Naming Conventions (CON-1).

- **BEH-1** — **When** `reportReviewer(projectRoot, specPath, args)` is called and the target spec is readable **then** the helper computes `sha256` over a **canonical attested region**: the spec's frontmatter with an explicit denylist of lifecycle-machine-written keys removed (`status`, `updated`, `drift_detected`, `source-manifest`), the surviving keys serialized `key: value` one per line sorted by key name in UTF-8, then the literal byte `\n`, then the body below the closing frontmatter delimiter — NOT the raw whole file and NOT the body alone — and stamps it on the `reviewer_report` payload as an optional `spec_sha` (full 64-char lowercase hex). The digest input is the exact byte range following the second `---` line, taken from the `Buffer` returned by `readFile` with no decode step, hashed via `createHash("sha256").update(buf)` — the same primitive `lib/source-manifest.mjs` uses at line 83, and the emitter and every enforcing caller MUST obtain it from one shared exported helper so the two can never diverge on encoding. The denylist — not wholesale frontmatter exclusion — is load-bearing in **both** directions. Excluding those four keys is required because the lifecycle machine-rewrites them after review (`status` in `/adev:review-specs` Step 7, `updated`, `drift_detected`, and the `source-manifest` restamp under ADR-0011), so a raw whole-file digest would be stale the instant the reviewing skill finished its own status write and BEH-4 would reject every honest spec. Retaining every OTHER frontmatter key is equally required: `risk_level`, `charter`, `amends` and `target-revision` drive governance decisions, so leaving them unattested would let a spec reviewed at `risk_level: high` be flipped to `low` after review — yielding `require_hitl_approval: false`, `review_mode: quick`, `test_depth: minimal` from `risk-policies.yaml` — while an unchanged body digest still satisfies the strict gate. That is the same CWE-345 insufficient-verification surface this amendment exists to close, one level up, and an earlier revision of this amendment had exactly that hole.
- **BEH-1a** — **When** the digest is stamped **then** it attests the spec bytes as of `reportReviewer` time, which is AFTER the reviewer subagent returned, not the bytes handed to the reviewer at dispatch. A spec edited during the review window is therefore stamped post-edit and satisfies BEH-4. Closing that window requires the dispatcher to capture the digest before dispatch and pass it through, which this amendment does not specify; the Rationale's claim is bounded accordingly.
- **BEH-2** — **When** `reportReviewer` cannot read the target spec (deleted, permission, race) **then** `spec_sha` is **omitted**, a one-time `SPEC_SHA_UNAVAILABLE` warning naming the path is emitted, and the event is still appended. Durability of the log outranks completeness of the stamp — the same trade-off the base spec makes for `DOMAIN_CONFIG_DEGRADED`.
- **BEH-3** — **When** the fold encounters a `reviewer_report` carrying `spec_sha` **then** it projects the value onto `steps.<step>.specSha`, and onto `byRevision[N].specSha` for the revision that event folds into. Reports without the field leave the projection key absent (not `null`), so "never stamped" stays distinguishable from "stamped empty". `byRevision` already carries a legacy snake_case member (`completed_at`); `specSha` follows the projection's camelCase rule (CON-1 of the base Naming Conventions) and does not license further snake_case additions.
- **BEH-3a** — **When** a step folds MORE THAN ONE `reviewer_report` carrying `spec_sha` — the normal case, since `--tier full` dispatches three reviewers — **then** the projection reconciles **only the reports belonging to the latest revision of that step**, never the step's whole history. Within that set: if every present `spec_sha` is byte-identical, that single value projects onto `steps.<step>.specSha`; if any two differ, the key projects the sentinel `"divergent"`. `byRevision[N].specSha` independently carries each revision's own reconciled value and is audit-only. Revision scoping is mandatory, not a refinement: the top-level `steps.<step>` fields follow a latest-revision-wins rule (`lifecycle-event-log.spec.md` byRevision row), and the BLOCK→revise→re-review loop in `review-block-auto-retry.spec.md` **guarantees** differing digests across revisions for one step. A history-wide reconciliation would therefore latch `"divergent"` on the first retry, and because the log is append-only nothing could ever clear it — every spec that converged through the designed retry path would become permanently un-plannable under `gate_mode: strict`, with `advisory` the only escape. This amendment is itself at `revision: 2` and would have blocked itself. Reports that omit the field do not participate and do not force divergence. Neither last-write-wins nor first-write-wins is acceptable: the former lets a reviewer who read the rewritten bytes launder a review of the old text, the latter does the inverse, and both are exactly the mid-review-rewrite this amendment exists to catch.
- **BEH-3b** — **When** `requireGate` reads a prior step whose `specSha` projects `"divergent"` **then** it treats the step as a mismatch under BEH-4 rather than as a match or as absent — the reviewers disagreed about what they read, which is a stronger signal of drift than a plain digest difference, not a weaker one.
- **BEH-4** — **When** `requireGate(state, stepName, { mode, currentSpecSha })` is called, the prior step projects a `specSha` at the top-level `steps.<step>.specSha` (NOT `byRevision[N].specSha`, which is retained for audit only), and `currentSpecSha` differs from it **then** the gate is blocked: under `mode === "strict"` a `GateError` is thrown whose `code` remains `"GATE_BLOCKED"` and which carries `{requiredStep, currentStatus, mode, reason: "GATE_SPEC_SHA_MISMATCH", expectedSpecSha, currentSpecSha}`. The `code` MUST NOT change: `cli/index.mjs` detects a gate block via `err.code === "GATE_BLOCKED"` and maps it to exit 2 while every other exception exits 1, and every gate consumer — `skills/review-specs/SKILL.md` Step 0 included — keys on exit 2. A distinct `code` would silently convert a gate block into a crash. The mismatch identity therefore travels in the `reason` discriminator, and `GateError`'s constructor widens from the three-field form documented at `lifecycle-event-log.spec.md:196` to accept `reason`, `expectedSpecSha` and `currentSpecSha`; under `mode === "advisory"` a `console.warn` with the same payload is emitted and the function returns normally. This is evaluated only after the existing status/verdict assertion passes — a spec that fails the old gate keeps failing it, with the old error code.
- **BEH-5** — **When** the prior step projects **no** `specSha` (every review predating this amendment) **then** the sha comparison is skipped, a one-time `SPEC_SHA_UNVERIFIABLE` warning is emitted, and the gate's outcome is decided by the status/verdict assertion alone. Missing provenance is **never** blocking. This preserves the base spec's stated doctrine of failing soft on history and never on verdicts, and keeps the existing review history of every spec in the corpus valid; enforcement begins with reviews recorded after this amendment ships.
- **BEH-6** — **When** `requireGate` is called **without** `currentSpecSha` **then** the sha comparison is skipped under the same `SPEC_SHA_UNVERIFIABLE` advisory as BEH-5. `requireGate` MUST NOT read the spec file itself: the base spec requires it to perform no I/O and to receive resolved inputs from its caller (the same contract already used for `mode`). Callers that want enforcement compute the digest and pass it; callers that do not are unchanged and keep working.
- **BEH-7** — **When** `adev report --type step` is invoked with `--status completed` or `--status failed` and the folded state for that spec records no `started` event for the named `--step` **then** the command appends **nothing** and exits non-zero with `ORPHAN_STEP_TERMINAL`, naming the step and the statuses actually present. A terminal event may only close a step that was opened.
- **BEH-8** — **When** the same invocation targets a step that *is* open, or uses `--status started` **then** behavior is unchanged, including the existing `--from-summary` aggregation path. The check reads the projection only; it adds no new write.
- **BEH-9** — **When** `adev gate require --skill <s> --spec <p>` runs **then** the CLI arm (`lib/cli/gate.mjs`) MUST read the resolved spec, compute the BEH-1 body digest via the shared helper, and pass it as `currentSpecSha` to `requireGate`. This is the named mandatory enforcement point, and it is what makes BEH-4 reachable at all: `lib/cli/gate.mjs:144` is today the sole enforcement caller and passes no sha, so without this behavior every gate in the shipping system takes the BEH-5/BEH-6 `SPEC_SHA_UNVERIFIABLE` path forever and defect 1 in the Rationale stays open. The read happens in the CLI arm, never inside `requireGate` — BEH-6's no-I/O constraint on the library function is unchanged. Callers other than `adev gate require` remain free to omit the argument under BEH-6.
- **BEH-9a** — **When** `adev gate require` cannot read the spec to compute the digest **then** it omits `currentSpecSha` and proceeds under the BEH-6 advisory rather than failing the gate, preserving the never-block-on-missing-provenance doctrine.

## Preconditions Delta

- `requireGate`'s caller is responsible for computing `currentSpecSha` when it wants stale-artifact enforcement, exactly as it is already responsible for resolving `mode`.
- `adev report --type step` already requires `<spec-path>` to exist on disk; BEH-7 adds no new filesystem precondition, only a projection read.

## Postconditions Delta

- After a strict-mode `requireGate` throw on a sha mismatch, **no side effect has occurred** — no log write, no file mutation. The base spec's existing abort-safety postcondition is extended verbatim to the new rejection, and the sha comparison is a pure computation over inputs the caller supplied.
- After a rejected orphan terminal event, the log is **byte-identical** to its pre-invocation state.
- After a successful `reportReviewer`, `spec_sha` — like `severity` — is immutable on disk for the life of the file.

## Error Cases Delta

These rows are **added** to the base spec's Error Cases table. No existing row
is modified or removed.

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `requireGate` with a prior-step `specSha` that differs from the caller-supplied `currentSpecSha`, `gate_mode: strict` | Throws `GateError` with `code: "GATE_BLOCKED"` (preserving the dispatcher's exit-2 contract) and `{requiredStep, currentStatus, mode, reason, expectedSpecSha, currentSpecSha}` | `reason: GATE_SPEC_SHA_MISMATCH` |
| Same mismatch under `gate_mode: advisory` | Emit `console.warn` with the same payload; return normally | — (no error) |
| `requireGate` where the prior step projects no `specSha`, or the caller supplied no `currentSpecSha` | Skip the comparison, emit one-time warning, decide on status/verdict alone — never block | SPEC_SHA_UNVERIFIABLE (warning) |
| `requireGate` where the LATEST REVISION's reviewer reports carried two or more differing `spec_sha` values (projected `"divergent"`) | Treated as a mismatch: `GateError` with `code: "GATE_BLOCKED"` under strict, `console.warn` under advisory — same payload shape, with `expectedSpecSha: "divergent"` | `reason: GATE_SPEC_SHA_MISMATCH` |
| `adev gate require` cannot read the resolved spec to compute `currentSpecSha` | Omit the argument and proceed under the BEH-6 advisory; never fail the gate on an unreadable spec | SPEC_SHA_UNVERIFIABLE (warning) |
| `reportReviewer` cannot read the target spec to compute the digest | Omit `spec_sha`, emit one-time warning naming the path, append the event anyway | SPEC_SHA_UNAVAILABLE (warning) |
| `adev report --type step --status completed\|failed` for a step with no `started` event in the projection | Append nothing, exit non-zero, name the step and the statuses present | ORPHAN_STEP_TERMINAL |

## Acceptance Criteria

- [ ] A spec whose current **body** bytes differ from the `spec_sha` recorded at review time does not satisfy the review gate under `gate_mode: strict` **when reached through `adev gate require`**, which supplies `currentSpecSha` per BEH-9.
- [ ] A spec that passes review and then receives ONLY lifecycle frontmatter writes — `status`, `updated`, `drift_detected`, `source-manifest` — still satisfies the strict-mode gate. This is the regression AC for SA-1/SEC-1.
- [ ] `adev gate require` computes and passes `currentSpecSha`; a test asserts the digest reaching `requireGate` equals the shared helper's output for the same spec body.
- [ ] Three `reviewer_report` events for one step carrying two distinct `spec_sha` values project `steps.<step>.specSha === "divergent"`, and `requireGate` treats that step as a mismatch under strict mode.
- [ ] Three `reviewer_report` events carrying one identical `spec_sha` project that value, not `"divergent"`.
- [ ] The emitter and the gate caller obtain the digest from the same exported helper (asserted by test, not by inspection).
- [ ] Mutating `risk_level` alone — no body change — changes `spec_sha` and blocks the strict-mode gate. This is the SEC-1 regression AC and is the exact counterpart of the lifecycle-frontmatter AC above: the four denylisted keys must NOT affect the digest, and every other frontmatter key MUST.
- [ ] Re-pointing `amends` or `target-revision` after review changes `spec_sha` and blocks the strict-mode gate.
- [ ] A rev-1 review and a rev-2 review whose reports carry different digests do NOT project `"divergent"`; `steps.<step>.specSha` projects the rev-2 value and `byRevision["1"].specSha` retains the rev-1 value. This is the SA-1/CON-1 regression AC — a spec that converges through the BLOCK→revise loop stays plannable.
- [ ] `"divergent"` projects only when two reports WITHIN the latest revision disagree.
- [ ] A sha-mismatch `GateError` carries `code === "GATE_BLOCKED"`, so `adev gate require` exits 2 (not 1), and carries `reason === "GATE_SPEC_SHA_MISMATCH"` for callers that need to distinguish it from a status/verdict block.
- [ ] The same mismatch under `gate_mode: advisory` warns and returns, blocking nothing.
- [ ] `reviewer_report` events written after this amendment carry a 64-char lowercase-hex `spec_sha`; the digest matches `lib/source-manifest.mjs`'s per-file hash for the same bytes.
- [ ] A `reviewer_report` written when the spec is unreadable omits `spec_sha` and still lands on the log.
- [ ] A projection built from reports with no `spec_sha` leaves `steps.<step>.specSha` **absent**, and `requireGate` passes such a step on status/verdict alone while warning once.
- [ ] `requireGate` performs no filesystem read — verified by test, not by inspection.
- [ ] Every pre-existing `requireGate` call site continues to compile and pass without supplying `currentSpecSha`.
- [ ] `adev report --type step --status completed` exits non-zero with `ORPHAN_STEP_TERMINAL` when no matching `started` exists, and the target log is byte-identical afterwards.
- [ ] `adev report --type step --status started`, and `completed` for a genuinely open step, are unaffected — including `--from-summary`.
- [ ] No new `CANONICAL_EVENTS` variant is introduced; `spec_sha` is an optional field on the existing `reviewer_report` variant.
- [ ] All quality gates pass; no constitutional violations.
