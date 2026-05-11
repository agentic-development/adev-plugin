# Live Spec: Drift Flag Clearing

---
charter: spec-drift-detection
status: validated
risk_level: low
milestone: v1
revision: 1
charter-revision: 2
created: 2026-05-02
updated: 2026-05-02
source-manifest:
  files:
    - lib/spec-drift.mjs
    - skills/implement/SKILL.md
  computed-at: "2026-05-10T23:51:35.315Z"
---

## Behavioral Contract

### Preconditions

- A spec has `drift_detected: true` in its frontmatter
- `/adev:implement` has completed all plan tasks and tests pass (GREEN phase)
- `lib/spec-drift.mjs` exports `clearDrift(specPath)`
- `lib/source-manifest.mjs` exports `computeManifest()` for re-stamping

### Behaviors

1. **When** `/adev:implement` reaches the GREEN phase (all tests pass) and re-stamps the source manifest via `computeManifest()` **then** it also calls `clearDrift(specPath)` to remove `drift_detected`, `drift_source`, and `drift_at` from the spec's frontmatter.

2. **When** `clearDrift()` is called on a spec that has no drift fields **then** it returns silently without modifying the file (no-op, idempotent).

3. **When** `clearDrift()` is called on a spec with `drift_detected: true` **then** all three fields (`drift_detected`, `drift_source`, `drift_at`) are removed from the frontmatter in a single write operation. The source manifest block is not modified by `clearDrift()` — that is `computeManifest()`'s responsibility.

4. **When** `/adev:implement` re-stamps the source manifest but `clearDrift()` fails (e.g., write error) **then** the source manifest is still updated. The stale drift flag is reported as a warning but does not block implementation completion.

### Postconditions

- After a successful GREEN + re-stamp, the spec has an updated `source-manifest` and no drift fields
- The spec is ready for `/adev:validate` without false drift warnings

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Spec file is read-only or write fails | Log warning, continue with implementation | CLEAR_WRITE_ERROR |
| Spec has no drift fields | No-op, return silently | — |
| Spec frontmatter is malformed | Log warning, skip clearing | CLEAR_PARSE_ERROR |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — `clearDrift()` uses only Node.js built-ins for frontmatter manipulation.
- **Principle:** "Skills are primarily markdown" — The clearing instruction is a one-line addition to the implement SKILL.md; the logic lives in `lib/spec-drift.mjs`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add `clearDrift()` call to implement SKILL.md | After source manifest re-stamp in GREEN phase, call `clearDrift(specPath)` | small |
| Test clearing behavior | Test clear on drifted spec, clear on clean spec (no-op), clear with write error | small |

## Acceptance Criteria

- [ ] `/adev:implement` calls `clearDrift(specPath)` after re-stamping the source manifest
- [ ] `clearDrift()` removes all three drift fields from frontmatter
- [ ] `clearDrift()` is idempotent — no-op on specs without drift fields
- [ ] Write failures in `clearDrift()` do not block implementation completion
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
