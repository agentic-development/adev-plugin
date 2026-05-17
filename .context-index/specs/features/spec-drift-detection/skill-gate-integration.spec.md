# Live Spec: Skill Gate Integration

---
charter: spec-drift-detection
status: validated
risk_level: medium
milestone:
revision: 1
charter-revision: 2
created: 2026-05-02
updated: 2026-05-02
source-manifest:
  files:
    - skills/plan/SKILL.md
    - skills/validate/SKILL.md
    - skills/hygiene/SKILL.md
    - lib/spec-drift.mjs
    - lib/source-manifest.mjs
  computed-at: "2026-05-10T23:51:35.315Z"
drift_detected: true
drift_source: lib/source-manifest.mjs
drift_at: 2026-05-17T15:09:48.592Z
---

## Behavioral Contract

### Preconditions

- `lib/spec-drift.mjs` exports `hasDrift(specPath)` returning a boolean
- `lib/source-manifest.mjs` exports `verifyManifest()` for host-portable fallback
- The target spec has YAML frontmatter that may contain `drift_detected: true`

### Behaviors

#### Plan Gate (must-have)

1. **When** `/adev:plan` is invoked for a spec and `hasDrift(specPath)` returns `true` **then** planning is blocked with: `"CODE_DRIFT: Spec \"<name>\" has drift_detected: true. Source file <drift_source> was modified since last validation. Run /adev:validate or update the spec before planning new work."`

2. **When** `/adev:plan` is invoked for a spec and `hasDrift(specPath)` returns `false` **then** the drift check passes and planning proceeds to the next gate (existing git-drift-detection check).

3. **When** `/adev:plan` is invoked on a non-Claude-Code host (no hook fired to set the flag) **then** the plan skill calls `verifyManifest()` as a fallback to detect code-side drift by SHA comparison. If the SHA mismatches, planning blocks with the same `CODE_DRIFT` message. If `verifyManifest()` also fails (e.g., missing files), planning blocks with: `"CODE_DRIFT_VERIFY_ERROR: Cannot verify source manifest for spec \"<name>\" — <N> files missing. Run /adev:hygiene to diagnose, or /adev:implement to re-stamp the manifest."`

#### Validate Integration (should-have)

4. **When** `/adev:validate` runs on a spec and `hasDrift(specPath)` returns `true` **then** it emits a warning in the validation report: `"⚠ WARN: drift_detected flag set. Source file <drift_source> was modified at <drift_at>. Verify that spec still reflects implementation behavior."` This is non-blocking — validation continues.

5. **When** `/adev:validate` runs on a spec and `hasDrift(specPath)` returns `false` **then** no drift warning is emitted.

6. **When** `/adev:validate` runs on a non-Claude-Code host **then** it calls `verifyManifest()` as a fallback. If SHA mismatches, the same warning is emitted.

#### Hygiene Integration (should-have)

7. **When** `/adev:hygiene` scans all specs **then** it includes a "Code Drift" audit pass that reports all specs with `drift_detected: true`, listing the spec path, drift source file, and drift timestamp.

8. **When** `/adev:hygiene` finds no specs with drift flags **then** the Code Drift pass reports PASS with no findings.

### Postconditions

- `/adev:plan` never plans work on a spec with detected code-side drift
- `/adev:validate` surfaces drift warnings without failing the validation
- `/adev:hygiene` provides a project-wide view of all drifted specs
- All three skills work on non-Claude-Code hosts via `verifyManifest()` fallback

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `hasDrift()` throws (malformed frontmatter) | Plan: fail-closed (blocks). Validate/hygiene: emit explicit warning "drift check skipped — frontmatter unreadable", then continue | CODE_DRIFT_READ_ERROR |
| `verifyManifest()` fails (missing files) | Plan: block with recovery guidance (run /adev:hygiene or /adev:implement). Validate/hygiene: report as drift warning | CODE_DRIFT_VERIFY_ERROR |
| Spec has `drift_detected: true` but missing `drift_source` or `drift_at` | Block/warn with generic message: "drift detected, source unknown". Treated as INCOMPLETE_DRIFT uniformly regardless of which field is missing | CODE_DRIFT_INCOMPLETE |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — All integration is done via skill-markdown edits to SKILL.md files. The SKILL.md instructions direct the agent to invoke `hasDrift()` via inline Node.js or the existing `lib/spec-drift.mjs` interface. No new companion code files are introduced — the functions already exist in `lib/spec-drift.mjs`.
- **Principle:** "Hook protocol compliance" — No hook changes. Skills read frontmatter directly.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add drift check to plan SKILL.md | Add CODE_DRIFT gate before existing git-drift-detection check, with `verifyManifest()` fallback | small |
| Add drift warning to validate SKILL.md | Add non-blocking drift warning step using `hasDrift()`, with `verifyManifest()` fallback | small |
| Add Code Drift pass to hygiene SKILL.md | Scan all specs for `drift_detected: true`, report findings | small |
| Write content-presence tests | Verify SKILL.md files contain the expected drift check instructions | small |

## Acceptance Criteria

- [ ] `/adev:plan` blocks on `drift_detected: true` with CODE_DRIFT message
- [ ] `/adev:plan` uses `verifyManifest()` fallback on non-Claude-Code hosts
- [ ] `/adev:validate` warns (non-blocking) on `drift_detected: true`
- [ ] `/adev:validate` uses `verifyManifest()` fallback on non-Claude-Code hosts
- [ ] `/adev:hygiene` reports all specs with `drift_detected: true` in a Code Drift pass
- [ ] `/adev:hygiene` reports PASS when no drifted specs exist
- [ ] Plan gate is fail-closed on `hasDrift()` errors (blocks if unreadable)
- [ ] Validate/hygiene emit explicit "drift check skipped — frontmatter unreadable" warning on `hasDrift()` errors
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
