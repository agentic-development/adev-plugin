## Audit Pass 17: Code Drift

**Goal:** Detect specs with `drift_detected: true` in their frontmatter (the rolled-up view), indicating implementation source files have been modified since the source manifest was last stamped. The authoritative per-detection payload lives in the spec's lifecycle JSONL as `code_drift_detected` events.

**Steps:**

1. Scan all specs matching `.context-index/specs/**/*.spec.md`.
2. For each spec, read the YAML frontmatter and check if `drift_detected: true` is present.
3. If drifted specs are found, run `adev verify spec --spec <path> --check-drift` to extract the latest unresolved `code_drift_detected` event's `drift_source` and `drift_at` fields from the spec's JSONL, then report WARN with a list:
   - Spec path
   - `drift_source` (the file that triggered the latest unresolved drift detection)
   - `drift_at` (timestamp of that detection)
   - Legacy fallback: pre-migration specs may return `drift_source: null` / `drift_at: null`. The drift is still real — the historical source is recoverable from `git log <spec>`.
4. If no drifted specs are found, report PASS.

**Output format:**
```
## Code Drift

- PASS: No specs with drift_detected flags (or)
- WARN: N specs with code-side drift detected:
  - .context-index/specs/features/auth/login.spec.md — drift_source: lib/login.mjs, drift_at: 2026-05-01T10:00:00Z
  - .context-index/specs/features/dashboard/widgets.spec.md — drift_source: lib/widgets.mjs, drift_at: 2026-05-02T14:00:00Z

**Actions:**
- [ ] Run `/adev:validate --spec <path>` to verify spec still reflects implementation
- [ ] Run `/adev:implement` to re-stamp source manifests and clear drift flags
```

**Integration with summary table:**
```
| Code Drift | WARN | 2 drifted specs |
```
