---
charter: lifecycle-artifacts
kind: skill
status: validated
risk_level: low
milestone: spec-and-charter-taxonomy
revision: 2
charter-revision: 2
created: 2026-05-14

plan-ref: .context-index/specs/features/lifecycle-artifacts/hygiene-kind-validity.plan.md

source-manifest:
  sha: "17d1951"
  files:
    - lib/hygiene/kind-validity.mjs
    - skills/hygiene/SKILL.md
    - tests/lib/hygiene-kind-validity.test.mjs
  computed-at: "2026-05-15T16:48:47.137Z"
drift_detected: true
drift_source: skills/hygiene/SKILL.md
drift_at: 2026-05-16T02:20:26.515Z
---

# Live Spec: Hygiene Kind Validity Audit

<!-- Defines the new audit pass added to /adev:hygiene that validates the kind:
     field on every spec and charter in the repository. -->

## Invocation Modes

The new audit pass runs as part of the default `/adev:hygiene` flow alongside the existing passes (stale specs, drift detection, coverage gaps, etc.).

| Invocation | Behavior |
|---|---|
| `/adev:hygiene` | Runs all audit passes, including the new kind-validity pass |
| `/adev:hygiene --pass kind-validity` | Runs ONLY the kind-validity pass (assuming the existing skill supports per-pass invocation; otherwise this argument is added) |
| `/adev:hygiene --module <name>` | Runs the kind-validity pass scoped to the named module's specs/charters |

## Arguments

No new arguments required beyond standard hygiene flags. The pass discovers artifacts via the existing `*.spec.md` and `charter.md` glob patterns.

## Output Contract

The audit pass emits findings into the standard hygiene report. Each finding has a severity, a code, a path, and a brief reason.

**Finding severities and codes:**

Severity vocabulary (Layer 1): `error` (non-blocking, indicates a structural defect that should be fixed), `warn` (advisory, may indicate drift or incomplete work), `info` (purely informational). **None of these severities cause `/adev:hygiene` to exit non-zero in Layer 1** — the kind-validity pass is entirely non-blocking. The severity name conveys priority for human triage; it does not gate the audit. (A future Layer 2 enhancement may upgrade `error` to gate-blocking after the legacy backfill completes.)

| Severity | Code | Trigger | Resolution Hint |
|---|---|---|---|
| `warn` | `MISSING_KIND` | `kind:` field absent from frontmatter AND the artifact's git creation timestamp is after the Layer 1 cutover date (configurable; defaults to the date this audit lands) | Run `/adev:specify` or `/adev:brainstorm` to re-author with explicit kind, or backfill manually |
| `warn` | `MODULE_KIND_NO_MANIFEST` | `charter.md` has `kind: module` but the module slug doesn't appear in `manifest.yaml:modules[]` | Add the module to manifest.yaml, or change the charter kind to `feature` |
| `error` | `INVALID_KIND` | `kind:` field is present but the value is not in `SPEC_KINDS` (for `*.spec.md`) or `CHARTER_KINDS` (for `charter.md`) | Fix the value to one of the valid kinds (or report a bug if the value should be valid) |
| `error` | `PARSE_ERROR` | Artifact's frontmatter cannot be parsed (malformed YAML, etc.) | Inspect the artifact manually; the file is unreadable by the parser |
| `info` | `LEGACY_DEFAULTED` | `kind:` field absent AND the artifact's git creation timestamp is before the cutover date | Backfill is part of Layer 2 (`issue-463`); no action required now |

**Aggregate report row format:**

```
| Path | Layer | Kind | Severity | Code | Reason |
|---|---|---|---|---|---|
| .context-index/specs/features/foo/bar.spec.md | spec | <value or "missing"> | warn | MISSING_KIND | File modified after cutover; explicit kind required |
```

**Exit code policy:**

- All findings from this audit pass — regardless of severity — are non-blocking in Layer 1. Hygiene reports them but does not exit non-zero on the kind-validity pass alone.
- `error` findings (INVALID_KIND, PARSE_ERROR) are counted in the hygiene error total for triage prioritization but do not gate the run.
- Layer 2 may upgrade `error` findings to gate-blocking after the legacy backfill completes (see `issue-463`).

## Failure Modes

| Condition | Audit Behavior |
|---|---|
| Frontmatter parser throws on an artifact (unparseable) | Skip the artifact; emit a `PARSE_ERROR` finding (severity `error`) with the path and parser error message; continue with remaining artifacts |
| `lib/kinds.mjs` not available (broken install) | Skip the pass entirely; emit a hygiene-skill-level error in the report header; do not block other passes |
| `manifest.yaml` missing or malformed (for `MODULE_KIND_NO_MANIFEST` check) | Skip just the manifest cross-reference; still emit `INVALID_KIND` and `MISSING_KIND` findings; emit a one-line note in the report header |
| Git unavailable or artifact uncommitted (for `MISSING_KIND` cutover classification) | Fall back to `mtime`; attach a `WARNING` note to the finding indicating the timestamp basis. See `read-time-defaulting.spec.md` Interaction Contract for the canonical timestamp-source policy. |
| No specs/charters found | Pass reports zero findings; this is not itself a finding |

## System Constitution Reference

- **Architecture Boundaries: Autonomous — "Editing skill markdown content"** — Applies; `skills/hygiene/SKILL.md` edit is autonomous.
- **Principle 2: "Skills are primarily markdown"** — Applies.

## Acceptance Criteria

- [ ] `skills/hygiene/SKILL.md` documents the kind-validity audit pass
- [ ] Pass produces findings with the documented codes and severities
- [ ] Pass is non-blocking (no non-zero exit on findings)
- [ ] Pass cross-references `kind: module` charters against `manifest.yaml:modules[]`
- [ ] Pass uses the cutover date to distinguish `MISSING_KIND` (post-cutover warn) from `LEGACY_DEFAULTED` (pre-cutover info)
- [ ] Tests cover all four finding codes on representative fixtures
- [ ] No constitutional violations introduced
