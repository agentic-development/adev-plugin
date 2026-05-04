## Mode: Phase

When `--phase <name>` is invoked (without `--resume`), the skill discovers and builds multiple specs in batch.

### Spec Discovery

1. Scan all `.md` files under `.context-index/specs/features/` (excluding `charter.md`, `*.plan.md`, `*.review.md`).
2. Parse YAML frontmatter for the `milestone` field.
3. Select specs whose `milestone` matches `<name>` (case-insensitive).
4. **Filter by pipeline mode:**
   - **Implement Pipeline** (no `--full`): include only specs with `status` of `review-passed`, `implemented`, or `validated`. Skip specs with any other status with a visible note per spec:
     > Skipped `<spec>` (status: `<status>`): not ready for Implement Pipeline. Run `/adev:review-specs` first, or use `--full` to include review.
     Explicitly: `review-pending` and `review-blocked` specs are skipped in Implement Pipeline.
   - **Full Pipeline** (`--full`): include specs with `status` of `review-pending`, `review-passed`, `implemented`, `validated`, and `review-blocked`. Specs with `review-blocked` status are included so the blocker-fix loop can attempt to resolve prior blockers. Skip only `draft` specs.
5. If no specs are found, print:

   > No specs found for milestone '<name>'. Verify that your specs have `milestone: <name>` in their frontmatter.

   And stop.

### Dependency Ordering

Check each spec's frontmatter for a `depends-on` field (list of spec paths). Build specs in dependency order: specs with no dependencies first, then specs whose dependencies have been built.

If circular dependencies are detected, print a warning and build in discovery order.

### Independent Execution

Each spec is built independently through the full pipeline. **Failure of one spec does not block others** unless they have an explicit `depends-on` referencing the failed spec. If a dependency failed:

- Skip the dependent spec.
- Mark it as `skipped` with reason: "Dependency `<spec>` failed."

### Issue Board Integration

If `tasks.backend` is configured in `manifest.yaml`:

- At the start of phase mode, find the milestone epic on the issue board and mark it as `in_progress`.
- During the build, delegate issue updates to child skills (each skill manages its own issue board interactions).
- At the end of phase mode, do **not** automatically close the milestone epic. That is a manual decision.

If `tasks.backend` is not configured, skip all issue board operations.

### Phase Summary

After all specs are processed, print:

```
Phase '<name>' complete.

  N specs attempted, N passed, N failed, N skipped

  Passed:
    - <spec-path>
    - <spec-path>

  Failed:
    - <spec-path>: <failure reason>

  Skipped:
    - <spec-path>: <skip reason>
```
