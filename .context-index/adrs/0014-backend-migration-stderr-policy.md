# ADR 0014: `br` stderr Passthrough Policy for `adev issues migrate`

## Status

**Accepted (amended)**

> **Proposed 2026-05-19**: Establishes that the `adev issues migrate` verb forwards `br` stderr verbatim — both to the operator's terminal and in the `errors[]` field of the `MIGRATE_PARTIAL_FAILURE` JSON report. Resolves review note SEC-1 on `backend-migration.spec.md` (rev 1).

> **Accepted with amendment, 2026-08-17**: The core policy is implemented exactly as decided — `lib/cli/issues-migrate.mjs` forwards `br` output verbatim into both `errors[]` and the terminal, with no scrubbing or truncation, citing SEC-1 in an inline comment. Amendment: `issues-migrate.mjs` and `beads-adapter.mjs` were extended to fall back to `err.stdout` when stderr is empty, because `br` reports structured failures as JSON on stdout in practice, leaving stderr blank. The no-scrubbing/no-truncation spirit of this ADR is unchanged; only the source-field selection is broader than the original text (`err.stderr || err.message`) — it should read `err.stderr || err.stdout || err.message`.

## Date

2026-05-19

## Context

The `adev issues migrate` CLI verb (specified in `.context-index/specs/features/task-management/backend-migration.spec.md`) converts an issue board between backends — most commonly `json → beads` — by composing the existing `BeadsAdapter` and `JsonAdapter` create / addDependency contracts. When the target is `beads`, each item creation triggers a `br create` subprocess invocation through `BeadsAdapter._runBr()`.

`BeadsAdapter._runBr()` already wraps `execFileSync` failures in a `BEADS_COMMAND_FAILED` error whose `.message` interpolates the underlying `err.stderr || err.message` verbatim (see `lib/issues/beads-adapter.mjs:62`). The migrate verb must decide how to surface this stderr when a `br` invocation aborts the run mid-loop, producing `MIGRATE_PARTIAL_FAILURE`. Three plausible policies exist:

1. **Verbatim passthrough.** Forward `err.stderr || err.message` unchanged into the JSON report's `errors[]` field and to the operator's terminal.
2. **Path-scrubbing.** Strip absolute paths or known sensitive prefixes from the stderr before reporting (e.g., replace `/Users/<name>/…` with `<HOME>/…`).
3. **Truncation only.** Cap the stderr length but otherwise pass it through.

The verb is operator-local — invoked from a developer's shell against their own project tree. The existing `BEADS_COMMAND_FAILED` contract already passes raw stderr to the caller (it is the caller's responsibility to handle). There is no transport boundary (no network egress, no log-aggregation pipeline) introduced by `migrate` that would call for an additional redaction layer beyond what `BeadsAdapter` already exposes.

Review note SEC-1 on `backend-migration.spec.md` requested an explicit decision rather than an implicit one inherited from the adapter.

## Decision

**The `adev issues migrate` verb forwards `br` stderr verbatim.**

- On `MIGRATE_PARTIAL_FAILURE`, the `errors[]` array in the JSON report carries the underlying adapter error's `.stderr || .message` unchanged.
- The same content is written to the operator's terminal (stderr) at failure time so they see it without re-parsing the JSON report.
- No path-scrubbing, no truncation beyond what the underlying error message already carries, no field-level redaction.

This matches the policy that `BeadsAdapter._runBr()` already exposes via `BEADS_COMMAND_FAILED`. The verb does not introduce a new transport boundary that would call for stricter handling than its dependency.

## Alternatives Considered

### Alternative A: Path-scrubbing for absolute paths

Replace `/Users/<name>/…` (or platform-equivalent prefixes) with `<HOME>/…` before forwarding stderr. **Rejected** because:

- The verb is operator-local. The operator's own paths are not sensitive to them.
- Absolute paths in `br` stderr are necessary diagnostic context — knowing which `.beads` database failed which item is the operator's primary debugging signal.
- Scrubbing introduces a new failure mode (regex misfire mangles legitimate output) for no operator-facing benefit.
- The existing `BEADS_COMMAND_FAILED` contract does not scrub; introducing scrubbing only in `migrate` would create an inconsistent surface.

### Alternative B: Truncation to a fixed length (e.g., 4 KB)

Cap the stderr to a known size before forwarding. **Rejected** because:

- `br` stderr is normally short (one error line plus a short context). Truncation rarely fires in practice.
- When truncation does fire (e.g., a verbose error dump), losing the tail removes the operator's diagnostic signal.
- The lifecycle log already caps `notes` at 4 KB; `errors[]` is a transient stdout JSON shape, not a persisted log line, so the same constraint does not apply.

### Alternative C: Structured error parsing

Parse `br` stderr into a typed object (`{ code, message, cause }`) and forward the structured form. **Rejected** because:

- `br`'s stderr is not a stable structured format.
- The verb has no business inventing a `br`-error-code taxonomy that the underlying tool does not expose.
- The operator already sees the raw stderr on their terminal — they do not need a re-shaping pass.

## Consequences

### Positive

- **Consistent with existing surface.** The verb's stderr-forwarding policy matches what `BeadsAdapter` already exposes, so operators see one consistent error shape across adapter calls and the migrate verb.
- **Maximum diagnostic signal.** Operators get the unaltered `br` output, which is the primary debugging artifact when `br create` fails mid-migration.
- **No new redaction code path.** The verb is implementation-light here: it pulls `err.stderr || err.message` and writes it through. No regex, no transform, no test surface for scrubbing edge cases.

### Negative

- **Stderr may contain operator-local paths.** If the operator shares the JSON report verbatim (e.g., pastes into a public bug tracker), those paths are visible. This is the operator's choice at sharing time, not a property of the verb itself.

### Neutral

- **`/adev:hygiene` and `/adev:reconcile` callers** of the migrate verb see the same stderr passthrough — those skills should redact at their own boundary if they introduce one (they do not today).
- **Future workspace-mode invocations** may run the verb across multiple repos. Each invocation is still operator-local; the cross-repo boundary does not change the redaction calculus.

## References

- Spec: `.context-index/specs/features/task-management/backend-migration.spec.md` (Behavior 17, Live-Run Output Shape, Error Cases — `MIGRATE_PARTIAL_FAILURE`)
- Review: `.context-index/specs/features/task-management/backend-migration.review.md` (SEC-1)
- Adapter: `lib/issues/beads-adapter.mjs:62` (`BEADS_COMMAND_FAILED` carries `err.stderr` verbatim)
