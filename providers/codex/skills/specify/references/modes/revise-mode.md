## Revise Mode (`--revise <spec-path>`)

Sixth workflow axis. Reads a BLOCKED spec at revision N together with the reviewer's `<spec-stem>.review.md` + `<spec-stem>.blockers.md` sidecars and produces revision N+1 as a **targeted patch**.

**Preconditions:**

1. The spec exists on disk and ends with `.spec.md`.
2. `<spec-stem>.review.md` exists alongside the spec (latest reviewer findings).
3. `<spec-stem>.blockers.md` exists alongside the spec (canonical `blocker_id` set that triggered BLOCK).
4. The spec's `status:` frontmatter field is `review-blocked` (in `--auto` mode this is enforced; in interactive mode a warning is printed and the operator confirms).

**Steps:**

1. **Gate** the prior step via the lifecycle log (the `review` step must have completed; the revise workflow only makes sense after a BLOCK).
2. **Run the CLI verb** that does the revise work:

   ```bash
   adev specify revise --spec <spec-path> [--auto]
   ```

   The verb wraps `lib/specify-revise.mjs::reviseSpec` and:
   - Reads `revision:` from the spec frontmatter and increments it through the `adev/revision-monotonic` diagnostic (`REVISION_NOT_INCREMENTED` is a hard stop).
   - Sets `updated:` to today and transitions `status: review-blocked → review-pending`.
   - Preserves frontmatter fields not implicated by blocker entries byte-identically.
   - Preserves spec body sections whose anchor is NOT in any blocker entry byte-identically.
   - Writes the new spec atomically (temp-then-rename).
   - Clears `<spec-stem>.blockers.md` (the next `/adev:review-specs` invocation re-evaluates and rewrites if any blockers remain).
   - Does NOT clear `<spec-stem>.review.md` — the next review invocation rewrites it.
   - Emits a `spec_revised` lifecycle event with `{ from_revision, to_revision, addressed_blocker_ids, unresolved_blocker_ids }`.

3. **Path containment (SEC-1):** the CLI verb re-asserts `assertWithin(projectRoot, specPath)` and rejects path-traversal with `INVALID_SPEC_PATH`. The skill MUST NOT pre-validate paths.

4. **Mutual-exclusion contract:** combining `--revise` with any of `--extract`, `--refactor`, `--from-diff`, or `--cross-cutting` exits non-zero with `CONFLICTING_FLAGS`.

5. **Report** the result to the user (read from the verb's JSON stdout):

   ```
   Revised <spec-path>: rev <N> → <N+1>
     Addressed blockers: <count>
     Unresolved blockers: <count>
   Next step: run /adev:review-specs --spec <spec-path> to re-evaluate.
   ```

**Error cases:**

| Condition | CLI exit | Error code | Action |
|-----------|----------|------------|--------|
| Missing `<spec-stem>.review.md` or `<spec-stem>.blockers.md` | 1 | `NO_REVIEW_SIDECARS` | Tell the user to run `/adev:review-specs` first |
| Spec status not `review-blocked` under `--auto` | 2 | `SPEC_NOT_BLOCKED` | Stop; ask the user to confirm explicit revision intent |
| Path traversal or spec outside `projectRoot` | 1 | `INVALID_SPEC_PATH` | Stop; report the malformed path |
| `revision:` did not increment by exactly 1 | 1 | `REVISION_NOT_INCREMENTED` | Stop; report — usually a bug in the library, not user input |
| Combining `--revise` with another workflow flag | 1 | `CONFLICTING_FLAGS` | Stop; report which flags conflict |

**Constitution alignment:** The skill names the CLI verb (`adev specify revise`) and contains no inline Node — the CLI verb wraps the library per the `cli-driver-surface` charter. The library uses only Node.js built-ins.

---
