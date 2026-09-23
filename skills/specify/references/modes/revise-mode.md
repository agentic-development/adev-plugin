## Revise Mode (`--revise <spec-path>`)

Sixth workflow axis. Reads a BLOCKED spec at revision N together with the reviewer's `<spec-stem>.review.md` + `<spec-stem>.blockers.md` sidecars and produces revision N+1 as a **targeted patch**.

**Preconditions:**

1. The spec exists on disk and ends with `.spec.md`.
2. `<spec-stem>.review.md` exists alongside the spec (latest reviewer findings).
3. `<spec-stem>.blockers.md` exists alongside the spec (canonical `blocker_id` set that triggered BLOCK).
4. The spec's `status:` frontmatter field is `review-blocked` (in `--auto` mode this is enforced; in interactive mode a warning is printed and the operator confirms).

**Steps:**

1. **Gate** the prior step via the lifecycle log (the `review` step must have completed; the revise workflow only makes sense after a BLOCK).
2. **Per-anchor authoring dispatch (BEH-4).**

   > **Conditional loading:** Read `skills/specify/revise-mode-authoring-dispatch.md` — the `group-blockers` call, per-anchor `Agent({...})` fan-out, and `authoredSections` collection. Load it every time Revise Mode runs.

3. **Run the CLI verb**, passing the collected authored sections:

   ```bash
   adev specify revise --spec <spec-path> [--auto] [--authored-sections <json-or-@path>]
   ```

   `--authored-sections` accepts a JSON object literal or `@<path>` naming a JSON file (argv limits). Omit when step 2 produced no entries.

   The verb wraps `lib/specify-revise.mjs::reviseSpec` and:
   - Bumps `revision:` N→N+1 (`REVISION_NOT_INCREMENTED` is a hard stop); sets `updated:` to today; `status: review-blocked → review-pending`.
   - Preserves frontmatter/body not implicated byte-identically.
   - Per anchor: validates the body (BEH-5a), splices it, computes `addressed`/`unresolved` from a real pre/post diff (BEH-5) — never blanket-acknowledged. A final whole-document reparse gates atomicity: on failure nothing writes and every implicated anchor is `unresolved`.
   - Writes atomically; clears `.blockers.md`; keeps `.review.md`; emits `spec_revised` with `{ from_revision, to_revision, addressed_blocker_ids, unresolved_blocker_ids }`.

4. **Path containment (SEC-1):** the CLI verb re-asserts `assertWithin(projectRoot, specPath)` and rejects path-traversal with `INVALID_SPEC_PATH`. The skill MUST NOT pre-validate paths.

5. **Mutual-exclusion contract:** combining `--revise` with any of `--extract`, `--refactor`, `--from-diff`, or `--cross-cutting` exits non-zero with `CONFLICTING_FLAGS`.

6. **Report** the result to the user (read from the verb's JSON stdout):

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
| `--authored-sections` invalid JSON / non-string value | 1 | `INVALID_AUTHORED_SECTIONS` | Stop; report the malformed entry |
| Authored body matched no heading anchor | advisory | `ANCHOR_NOT_FOUND` | Non-fatal; skip, blocker stays `unresolved` |
| Authored body has a fence line or control char (BEH-5a) | advisory | `SPLICE_VALIDATION_FAILED` | Non-fatal; prior text kept, blocker stays `unresolved` |
| Combining `--revise` with another workflow flag | 1 | `CONFLICTING_FLAGS` | Stop; report which flags conflict |

**Constitution alignment:** names CLI verbs `adev specify group-blockers`/`revise`; no inline Node.

---
