# ADR 0011: Source-Manifest Re-stamping Authority

## Status

**Proposed**

> **Proposed 2026-05-17**: Articulates which lifecycle skill may overwrite an existing `source-manifest` block in a spec's frontmatter. Resolves an ambiguity in `spec-lifecycle/charter.md` (which says the manifest is "recomputable by any skill") versus `source-manifest.spec.md` (which only describes `/adev:implement` as the writer). Without an explicit rule, auditing tools and validation tools are unclear on whether they may re-stamp drifted manifests or must escalate to a manual workflow.

## Date

2026-05-17

## Context

The spec-lifecycle charter establishes that the `source-manifest` block stamped into a spec's YAML frontmatter is the **authoritative link** between a spec and the code that implements it. The block has three fields:

- `sha` — SHA-256 fingerprint of the concatenated sorted file contents
- `files` — the canonical list of implementation files
- `computed-at` — ISO 8601 timestamp of the stamping

The stamp is written by `/adev:implement` after the GREEN phase. Two complementary mechanisms detect when the stamp goes stale:

1. **Hook-side drift detection** (`hooks/spec-drift.sh`) stamps `drift_detected: true` on the spec frontmatter when any file in `source-manifest.files[]` is edited.
2. **Skill-side drift gate** (`/adev:plan`, `/adev:validate`) reads `drift_detected` and blocks workflows until the drift is resolved.

Today, the only documented way to clear a drift flag is to re-run `/adev:implement` — which expects an unfinished plan and a TDD cycle. This is mismatched against the actual common case:

- A developer makes a small targeted change to a file already in the manifest (a typo fix, a refactor, a dependency bump).
- Tests still pass against the spec.
- Validation passes.
- But the manifest is stale and the spec is now flagged as drifted.

Re-running `/adev:implement` for this case is heavyweight (it expects to dispatch subagents, follow a plan, run reviewers). Patching the manifest by hand is error-prone (operator must compute a SHA over sorted file contents). The hygiene report falsely flags the spec until someone resolves it.

The charter says the manifest is "recomputable by any skill," but the implementation spec only describes `/adev:implement` doing the writing. The result: tooling authors don't know whether they may legitimately re-stamp, and end-users don't know which skill to invoke to clear a drift flag.

This ADR makes the rule explicit.

## Decision

**We will allow `/adev:validate` to re-stamp the `source-manifest` block on operator opt-in when validation passes against the current code. `/adev:hygiene` remains advisory and never writes to spec frontmatter. `/adev:implement` continues to be the only skill that creates an initial stamp.**

### Authority matrix

| Skill | May create initial stamp? | May re-stamp on drift? | Conditions |
|---|---|---|---|
| `/adev:implement` | **Yes** | Yes (transitively, by re-running the lifecycle) | After GREEN phase; full TDD cycle |
| `/adev:validate` | No | **Yes (opt-in)** | All `/adev:validate` checks pass against current code; operator passes `--restamp` flag |
| `/adev:hygiene` | No | No | Advisory only — reports drift, never writes |
| `/adev:reconcile` | No | Yes (transitively, by invoking `/adev:validate --restamp`) | Same conditions as `/adev:validate` |
| Manual edit | No | Discouraged | Operator must compute SHA correctly; no tooling support |

### Why `/adev:validate` is the right surface

`/adev:validate` is uniquely positioned: it actually runs the test suite, checks spec compliance, and applies the constitution. If validation passes against the drifted code, the code is verified — re-stamping records that verification. Allowing `/adev:validate` to re-stamp is recording what already happened.

`/adev:hygiene` is fundamentally an audit skill. Its semantics are "report current state without modifying it." Letting it re-stamp would conflate auditing with state mutation and erode the user's trust that running hygiene is a safe, read-only operation.

`/adev:implement` retains exclusive authority over initial stamps because creating the first stamp implies committing to a plan, a set of files, and a test contract — heavyweight obligations that match the implementation lifecycle. Re-stamping an existing manifest is a lighter operation.

### Alternatives Considered

#### Option A: Stay advisory everywhere; require manual `/adev:implement` re-run

- **Pros:** Simplest mental model. Single skill owns all stamping. Manifest stamps remain semantically heavy ("this was reviewed during implementation").
- **Cons:** Punishes legitimate small edits with a heavyweight workflow. Encourages operators to bypass the manifest entirely or to disable drift detection. False-positive hygiene findings accumulate.
- **Rejected because:** The cost of false positives outweighs the simplicity. Operators will either ignore the warnings (eroding the system's signal) or disable the hook (eroding the entire drift-detection feature).

#### Option B: Auto re-stamp on every successful `/adev:validate` run

- **Pros:** Zero friction. Drift flags clear themselves whenever validation passes.
- **Cons:** Silent mutation of authoritative metadata. The `computed-at` timestamp loses meaning as a "this was reviewed at this time" marker — every validation run resets it. Operators lose visibility into when the link was last manually confirmed.
- **Rejected because:** The stamp is meant to be a deliberate, dated record. Silent re-stamping erodes its trust value. Opt-in preserves the visibility.

#### Option C: Both `/adev:validate` and `/adev:hygiene` may re-stamp

- **Pros:** Maximum flexibility. Operators can resolve drift in whichever skill they happen to be running.
- **Cons:** Breaks the "hygiene is read-only" invariant that users currently rely on. Two skills writing the same metadata makes drift causation hard to trace.
- **Rejected because:** The clarity of "hygiene reports, validation writes" is more valuable than the marginal convenience of two write sites.

### Why This Decision

The decision aligns the re-stamping authority with the skill that has actually verified the code. Validation runs the gates; validation knows whether the code matches the spec; validation is the right place to record that fact. Hygiene observes; observation should not mutate the thing being observed.

Opt-in (rather than auto-on) preserves the semantic weight of the stamp — operators see what's about to be re-stamped and confirm. The `--restamp` flag is loud enough to require deliberate intent.

## Consequences

### Positive

- Legitimate small edits have a low-friction path to clear drift: run `/adev:validate --restamp`.
- `/adev:hygiene` remains a safe, read-only audit — operators can run it without fear of side effects.
- The stamp's `computed-at` field retains semantic meaning ("the last time validation confirmed the link").
- `/adev:reconcile` gains a clear delegate for the "drifted but still correct" case rather than needing its own stamping logic.

### Negative

- `/adev:validate` gains a write capability it didn't have before. Implementations must ensure the re-stamp only fires after all gates pass and only when explicitly requested.
- Operators must remember the `--restamp` flag. A drift flag will not clear itself; running validation without the flag is still advisory.
- The stamp's "this was reviewed during implementation" semantics weakens slightly — a re-stamped manifest is from validation, not from implementation. Distinguishing the two would require a separate `re-stamped-at` field if it matters to downstream tooling.

### Neutral

- The hook-side drift detection (`hooks/spec-drift.sh`) is unchanged. It continues to flag `drift_detected: true` whenever a manifest file is edited. The flag is cleared at re-stamping time by `/adev:validate`.
- The initial-stamp path through `/adev:implement` is unchanged.
- This decision does not address the related open questions: (a) precedence between spec-side and code-side drift gates when both fire, (b) host portability when hooks don't run, (c) whether session summaries should carry a manifest snapshot. Those remain open.

## Related

- `.context-index/specs/features/spec-lifecycle/charter.md` — establishes source-manifest as authoritative
- `.context-index/specs/features/spec-lifecycle/source-manifest.spec.md` — defines the stamping behavior of `/adev:implement`
- `.context-index/specs/features/spec-drift-detection/charter.md` — drift detection charter
- `.context-index/specs/features/spec-drift-detection/hook-side-drift-detection.spec.md` — write-time drift hook
- `.context-index/specs/features/spec-drift-detection/skill-gate-integration.spec.md` — skill-side drift gate
- `lib/source-manifest.mjs` — manifest computation and verification primitives
- `lib/reality-check.mjs` — consumes the manifest for codebase-verified confidence scoring (PR #123)
