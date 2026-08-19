## Audit Pass 21: Amendment Graph

**Goal:** Audit first-class spec amendments (specs carrying the `amends:` + `target-revision:` relationship overlay) for malformed links. Detects dangling bases, incomplete (one-of-pair) links, and `amends:` cycles across every `*.spec.md` under `.context-index/`.

**Layer 1 posture (non-blocking):** All findings are advisory. The pass never throws and never mutates `process.exitCode`. Severity conveys triage priority only.

**Steps:**

1. Import `runAmendmentAuditPass` from `<ADEV_ROOT>/lib/hygiene/amendment-audit.mjs`.
2. Invoke `await runAmendmentAuditPass(projectRoot)`. The pass wraps `lib/amendment-graph.mjs::auditAmendments`, which resolves each amendment's `amends:` chain (cycle-safe, bounded depth) and classifies malformed states.
3. Render each finding in the standard hygiene table:

```
| Path | Severity | Code | Reason |
|---|---|---|---|
```

4. Surface `result.headerNotes` in the report header (only present when the audit degraded on a pathological input).

**Finding codes:**

| Severity | Code | Trigger | Resolution Hint |
|---|---|---|---|
| `error` | `INCOMPLETE_AMENDMENT_LINK` | A spec declares exactly one of `amends:` / `target-revision:` | Add the missing field — an amendment must declare both its base and the revision it targets |
| `error` | `AMENDMENT_CYCLE` | An `amends:` chain contains a cycle | Break the cycle — amendments must form an acyclic chain back to a non-amendment base |
| `warn` | `DANGLING_AMENDMENT` | An amendment's `amends:` target does not resolve to an existing spec | Restore the base spec or fix the `amends:` path; non-fatal |

**Exit code policy:** None of the codes gate the `/adev:hygiene` exit code in Layer 1. The returned `findings` array is the sole signal.

**Output format:**
```
## Amendment Graph

- PASS: All amendment links resolve and form acyclic chains (or)
- FINDINGS: N amendment-graph findings (non-blocking)

| Path | Severity | Code | Reason |
|---|---|---|---|
| .context-index/specs/cross-cutting/checkout-rev-4-x.spec.md | warn | DANGLING_AMENDMENT | amends: target does not resolve to an existing spec: .context-index/specs/cross-cutting/gone.spec.md |
```

**Actions:**
- [ ] Resolve `INCOMPLETE_AMENDMENT_LINK` findings — add the missing paired field
- [ ] Break any `AMENDMENT_CYCLE` chains
- [ ] Reconcile `DANGLING_AMENDMENT` findings by restoring the base or fixing the path

**Integration with summary table:**
```
| Amendment Graph | WARN | 1 dangling amendment |
```
