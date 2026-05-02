# Live Spec: Hook-Side Drift Detection

---
charter: spec-drift-detection
status: review-pending
risk_level: medium
milestone: v1
revision: 1
charter-revision: 2
created: 2026-05-02
updated: 2026-05-02
---

## Behavioral Contract

### Preconditions

- The project has a `.context-index/` directory
- `sync-trigger.sh` is registered as a PostToolUse:Edit hook
- `lib/spec-drift.mjs` is available at the plugin root
- `lib/source-manifest.mjs` exports `buildReverseIndex()`

### Behaviors

1. **When** `sync-trigger.sh` fires on PostToolUse:Edit and the edited file path matches a file in any spec's `source-manifest.files[]` **then** `stampDrift()` writes `drift_detected: true`, `drift_source: <edited file>`, and `drift_at: <ISO timestamp>` to that spec's YAML frontmatter.

2. **When** `stampDrift()` writes the drift flag **then** the hook emits an advisory warning to stdout: `"⚠ Spec drift: <file> is tracked by spec \"<spec-name>\". Consider updating the spec if behavior changed, or run /adev:hygiene to review."` The hook exits 0 (advisory, non-blocking).

3. **When** the edited file is not tracked by any spec's source manifest **then** no drift flag is stamped and no warning is emitted. The hook exits 0.

4. **When** the edited file matches multiple specs' source manifests **then** all matching specs are stamped independently and a warning is emitted for each.

5. **When** a spec already has `drift_detected: true` and the same or a different tracked file is edited **then** `drift_source` and `drift_at` are overwritten with the latest values. The flag remains `true`. This is an idempotent re-stamp.

6. **When** a spec has no `source-manifest` block **then** the hook emits a one-time advisory per session: `"Spec \"<name>\" has no source manifest — drift detection unavailable. Run /adev:implement to stamp one."` The warning is suppressed for the remainder of the session after first emission, tracked via the execution state file.

7. **When** `.context-index/` does not exist in the project root **then** the drift scan is skipped entirely (non-adev project). No warning emitted.

8. **When** `scanForDrift()` is called **then** it delegates to `buildReverseIndex()` from `lib/source-manifest.mjs` to build the file-to-spec mapping, then looks up the edited file path in the resulting map.

### Postconditions

- Every spec whose source manifest tracks the edited file has `drift_detected: true`, `drift_source`, and `drift_at` in its frontmatter
- The advisory warning is visible to the agent in the same conversation turn as the edit
- The hook always exits 0 (never blocks edits)
- Specs without source manifests are warned about once per session

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Spec frontmatter is malformed YAML | Skip that spec, continue scanning others | PARSE_ERROR |
| Spec file is read-only or write fails | Log warning to stdout, do not stamp, continue with other specs | WRITE_ERROR |
| `source-manifest.files` is not an array | Skip that spec, continue scanning | INVALID_MANIFEST |
| Spec has no `source-manifest` block | Emit one-time advisory per session recommending `/adev:implement` | NO_MANIFEST |

## System Constitution Reference

- **Principle:** "Hook protocol compliance" — The hook reads JSON from stdin + env vars, exits 0 (allow), and outputs JSON to stdout. No protocol change — this extends an existing hook.
- **Principle:** "Minimize external dependencies" — `lib/spec-drift.mjs` uses only Node.js built-ins (`fs`, `path`). Delegates to existing `buildReverseIndex()` rather than duplicating scan logic.
- **Principle:** "Skills are primarily markdown" — The drift detection logic lives in companion code (`lib/spec-drift.mjs`), not in any SKILL.md file.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create `lib/spec-drift.mjs` | Implement `scanForDrift`, `stampDrift`, `clearDrift`, `hasDrift` functions using Node.js built-ins and delegating to `buildReverseIndex()` | medium |
| Extend `sync-trigger.sh` | Add drift detection call after existing sync logic; call `lib/spec-drift.mjs` via inline Node.js | medium |
| Add session-scoped warning suppression | Track emitted NO_MANIFEST warnings in execution state to suppress duplicates | small |
| Write tests for `lib/spec-drift.mjs` | Test scan, stamp, clear, hasDrift, idempotency, multi-spec match, malformed YAML, missing manifest | medium |
| Write tests for hook integration | Test sync-trigger.sh drift detection path with fixture specs | medium |

## Acceptance Criteria

- [ ] `scanForDrift(filePath, contextIndexRoot)` returns matching specs by delegating to `buildReverseIndex()`
- [ ] `stampDrift(specPath, driftSource)` writes `drift_detected`, `drift_source`, `drift_at` to frontmatter
- [ ] `clearDrift(specPath)` removes all three drift fields from frontmatter
- [ ] `hasDrift(specPath)` returns boolean from frontmatter
- [ ] `sync-trigger.sh` calls drift detection on every PostToolUse:Edit
- [ ] Advisory warning is emitted to stdout when drift is detected
- [ ] Hook always exits 0 (never blocks edits)
- [ ] Multiple matching specs are all stamped independently
- [ ] Re-stamping an already-drifted spec overwrites `drift_source` and `drift_at`
- [ ] Specs without `source-manifest` trigger a one-time session advisory
- [ ] Malformed specs are skipped without crashing the hook
- [ ] Non-adev projects (no `.context-index/`) are silently skipped
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
