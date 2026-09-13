### Check 1.6: Code-Side Drift Warning

Check for code-side drift via the `drift_detected` frontmatter flag. This check is **non-blocking** -- validation continues regardless of result.

Run the drift check via the CLI:

```bash
adev verify spec --spec <specPath> --check-drift
```

The `--check-drift` mode reads the spec's inline `drift_detected` boolean from frontmatter and sources the `drift_source` / `drift_at` payload from the spec's latest unresolved `code_drift_detected` event in `.context-index/lifecycle-state/<slug>.jsonl`. It emits a single JSON object on stdout:

```json
{ "drifted": <bool>, "drift_source": "<path|null>", "drift_at": "<timestamp|null>" }
```

If `drifted === true`, emit a WARN: "drift_detected flag set. Source file `<drift_source>` was modified at `<drift_at>`. Verify that spec still reflects implementation behavior."

Legacy fallback: pre-migration specs may return `drift_source: null` / `drift_at: null` when the spec has the inline boolean but no JSONL event yet. The drift is still real; the historical source is recoverable from `git log <spec>`.

If the verb exits non-zero (spec unreadable or path containment violation), record `CODE_DRIFT_READ_ERROR` and emit: "WARN: drift check skipped — spec unreadable".

Also run `adev source-manifest verify --spec <specPath>` (see Check 1.5) as a fallback for non-Claude-Code hosts where the hook never fired. If SHA mismatches, emit the same warning.

This check is **non-blocking** — validation continues regardless. Record WARN if drift is detected, PASS otherwise.
