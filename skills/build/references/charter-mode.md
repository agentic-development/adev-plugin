## Mode: Charter

When `--charter <module>` (or `--module <module>`) is invoked (without `--resume`), the skill discovers and builds all specs under a single feature charter.

### Spec Discovery

1. Glob `.context-index/specs/features/<module>/*.spec.md`.
2. If no specs are found, print:

   > No specs found under `.context-index/specs/features/<module>/`. Verify the module name and that specs exist.

   And stop.

3. **Filter by pipeline mode:**
   - **Implement Pipeline** (no `--full`): include only specs with `status` of `review-passed`, `implemented`, or `validated`. Skip specs with any other status with a visible note per spec:
     > Skipped `<spec>` (status: `<status>`): not ready for Implement Pipeline. Run `/adev:review-specs` first, or use `--full` to include review.
     Explicitly: `review-pending` and `review-blocked` specs are skipped in Implement Pipeline.
   - **Full Pipeline** (`--full`): include specs with `status` of `review-pending`, `review-passed`, `implemented`, `validated`, and `review-blocked`. Specs with `review-blocked` status are included so the blocker-fix loop can attempt to resolve prior blockers. Skip only `draft` specs.

### Dependency Ordering

Check each spec's frontmatter for a `depends-on` field (list of spec paths). Build specs in dependency order: specs with no dependencies first, then specs whose dependencies have been built.

If no `depends-on` fields are present, build in the order specs appear in the charter's Capability Map (read `charter.md` and match spec filenames to capability rows). If the Capability Map cannot be parsed or does not list the specs, fall back to alphabetical order.

If circular dependencies are detected, print a warning and build in discovery order.

### Independent Execution

Each spec is built independently through the full pipeline. **Failure of one spec does not block others** unless they have an explicit `depends-on` referencing the failed spec. If a dependency failed:

- Skip the dependent spec.
- Mark it as `skipped` with reason: "Dependency `<spec>` failed."

### Issue Board Integration

If `tasks.backend` is configured in `manifest.yaml`:

- During the build, delegate issue updates to child skills (each skill manages its own issue board interactions).
- At the end of charter mode, do **not** automatically close any epic. That is a manual decision.

If `tasks.backend` is not configured, skip all issue board operations.

### Charter Summary

After all specs are processed, print:

```
Charter '<module>' build complete.

  N specs attempted, N passed, N failed, N skipped

  Passed:
    - <spec-path>
    - <spec-path>

  Failed:
    - <spec-path>: <failure reason>

  Skipped:
    - <spec-path>: <skip reason>
```
