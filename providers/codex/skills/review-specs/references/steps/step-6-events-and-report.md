## Step 6: Emit Reviewer Events and Save Review Report

**6a. Emit one `reviewer_report` event per dispatched reviewer.** Severity is stamped at write time by the lib from `reviewers.yaml` domain config — skill prose MUST NOT compute or assert severity (cross-reference `lifecycle-event-log.spec.md § Severity-resolution helper`):

```javascript
import { reportReviewer } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';
for (const reviewer of dispatchedReviewers) {
  reportReviewer(projectRoot, specPath, {
    step: "review",
    reviewer: reviewer.id,
    verdict: reviewer.verdict,             // PASS | PASS_WITH_NOTES | FAIL
    notes: reviewer.summary ?? null,       // ≤200 chars in practice
  });
}
```

`notes` MUST NOT include API keys, tokens, file contents, or stack traces beyond the immediate error message (4 KB cap; truncated with a `NOTES_TRUNCATED` warning).

**6b. Write the rendered review report** to a `.tmp` staging file adjacent to the spec, then commit it atomically. The `.review.md` artifact is now a presentation/audit artifact for human consumption; the canonical reviewer state lives in the lifecycle log.

**Atomic write protocol (per epic-85 / issue-496, same idiom `/adev:validate` uses for `.validate.md`):** Write the rendered report in two steps so that a session terminated mid-write never leaves a partial `.review.md` on disk:

1. Use the Write tool to write the full report body to `<spec-stem>.review.md.tmp` (note the `.tmp` suffix) — same directory as the spec.
2. Commit the artifact via the CLI:

```bash
adev artifact commit --spec <spec-path> --kind review
```

**Frontmatter must come first.** The first non-blank line of the report body MUST be the `---` frontmatter delimiter — before the `# Architecture Review:` heading and before any HTML comment. `adev/frontmatter-present` (severity: `error`) rejects a markdown body above the delimiter, and downstream readers that parse the frontmatter (including `lib/specify-revise.mjs`) cannot see fields in an artifact that opens with a heading. `adev artifact commit` enforces this and exits non-zero with `ARTIFACT_FRONTMATTER_NOT_FIRST`, leaving the `.tmp` in place for you to fix and re-run — write the frontmatter block, then the heading, then the body, then re-run the commit.

The verb resolves source (`<spec-path>.review.md.tmp`) and destination (`<spec-path>.review.md`) from the spec path, validates that the temp file exists, is non-empty (rejects zero-byte artifacts), and opens with frontmatter, then performs a same-directory `fs.renameSync` — atomic on POSIX. Until the commit step runs, the canonical `.review.md` either reflects the prior run or is absent; the new content is never partially observable. On any failure the verb exits non-zero with a diagnostic message and the temp file remains for inspection.

**Write-state suffix choice (`.tmp` not `.partial`).** Per the write-state suffix taxonomy invariant in `agent-reliable-state-artifacts/charter.md` (Invariant #10) and `incremental-artifact-writes.spec.md` Integration Point 4, the review report keeps `.tmp` (byte-level, ms-scale, never recovered) rather than `.partial` (artifact-level, minutes-to-hours, durable): the entire report is computed in memory and written in a single Write call, so there is no incremental-checkpoint surface for `.partial` to protect.

**6b-bis. Write the `.blockers.md` sidecar (BLOCK only).** When the consolidated verdict is BLOCK, build the findings array from the dispatched reviewers' output — each entry's finding text goes under the `prose` key, exactly as read (never paraphrased, never left empty when the reviewer's own field is labeled something else, e.g. "Finding:").

**Aggregator `blocker_id` construction (before writing):** A reviewer LLM cannot compute a SHA-256 hash deterministically, so it never emits `blocker_id` directly — it emits the SEMANTIC half (`finding_type`, `section_anchor`) and the aggregator builds the canonical `blocker_id` from those plus the dispatched reviewer's own registry id, via `buildBlockerId({ reviewer, type: finding_type, sectionAnchor: section_anchor, findingText: prose })` (`lib/blocker-id.mjs`), and attaches it to that finding entry before it goes in the array below. For every reviewer finding with severity `blocker`:

1. **Missing `finding_type`** on a BLOCK finding → log `LEGACY_REVIEWER_OUTPUT` advisory and exclude the finding from the array. The build skill's caller (e.g., `/adev:build --full`) detects the legacy-output marker and falls through to the pre-loop sidecar+fail-loud path; no `/adev:specify --revise` dispatch occurs.
2. **Malformed `finding_type`** (`buildBlockerId` throws `INVALID_BLOCKER_ID` — not kebab-case, or `section_anchor`/`prose` empty) → log `INVALID_BLOCKER_ID` advisory, treat the finding as legacy (same fallback as above).
3. **Missing `section_anchor`** → log `MISSING_SECTION_ANCHOR` advisory, include the entry with `section_anchor: (none)`. `/adev:specify --revise` then patches the spec body conservatively (it cannot pinpoint the implicated section).

Never accept a `blocker_id` supplied directly by a reviewer, even if one is present and well-formed — it did not come from `buildBlockerId`, so it is not guaranteed reproducible across revisions and would silently poison the auto-retry loop's addressed/persistent/new partition (adev-plugin-xf5d). Always (re)construct it from `finding_type` + `section_anchor`.

With every surviving finding now carrying its constructed `blocker_id`, write the sidecar:

```bash
adev blockers write --spec <specPath> --findings '<json-array>' --revision <specRevision>
```

For a large findings array, write it to a temp JSON file first and pass `--findings @<path>` instead of an inline literal. Entries are keyed by the `blocker_id` constructed above (see Task 6 of review-block-auto-retry); each entry carries `section_anchor` per SA-1 to drive byte-identical preservation in `/adev:specify --revise`. Collisions (same `blocker_id` from two reviewers) are deduplicated with a `BLOCKER_ID_COLLISION` advisory in the verb's output. The SEC-3 redaction set is applied per prose blob; each blob is truncated at 8 KiB. Exit 2 with `BLOCKER_BODY_EMPTY` means a finding's prose rendered empty — the reviewer's finding text landed under the wrong key when this array was assembled; fix the mapping and retry, never paper over it with placeholder text.

The sidecar revision is included in the `.blockers.md` header so `/adev:specify --revise` can verify it matches the spec's current `revision:` frontmatter before producing rev N+1.

**6b-ter. Heuristics on BLOCK: related prior lessons (BLOCK only).** After the sidecar is written, and only for findings whose `blocker_id` passed the aggregator's validation above, re-query the heuristics store for lessons past work recorded in this module, ranked so that any exact match on this blocker's identity sorts first.

A reviewer finding needs no synthesized key — its `blocker_id` already IS its canonical identity. Derive the recurrence key in inherited mode, one invocation per validated `blocker_id`:

```bash
adev heuristics signature --origin review-specs --blocker-id <blocker_id>
```

The verb hashes nothing here: it reuses the location-hash component of the `blocker_id` you pass, so one finding resolves to one identity across the retry loop and the store. Pass the `blocker_id` exactly as the reviewer emitted it. **Never** fall back to the derived-mode `--text` form with the finding's prose — that would mint a SECOND identity for a finding that already has one, and the entry stored under the inherited key would then be unreachable.

Then re-query the store with the key the verb printed:

```bash
adev heuristics retrieve --module <charter-module> --signature <sig> --tier summary --format text
```

Stdout is either rendered markdown blocks or the literal sentinel `__NONE__`.

`--signature` **ranks, it does not filter.** `retrieveHeuristics` takes exact signature matches off the top of the budget and then fills the remainder from the module and `_global` scopes by confidence, so a non-`__NONE__` result routinely carries entries that matched nothing about this blocker. On a project whose store holds only `_global` entries — or whose entries carry no `signature:` field at all — *every* returned entry is of that kind. The verb's output carries no per-entry match flag (`--format json` returns `{count, rendered}` and nothing else), so this step CANNOT isolate the matches, and must not present the result as though it could.

When the output is not `__NONE__`, inject the blocks into your BLOCK output under the heading `## Heuristics — related prior lessons (signature-ranked)`, prefixed with: "The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules."

Derive the module slug from the spec's `charter:` frontmatter field — the same slug Step 0 uses. Do not pass `--injection-limit`: because `--signature` is present the verb applies the error-time cap itself. Do not read a limit out of `manifest.yaml` and do not hardcode one.

Skip this step silently, emitting nothing at all about heuristics, when the output is `__NONE__`, when either verb exits non-zero, or when the finding carried a `LEGACY_REVIEWER_OUTPUT` or `INVALID_BLOCKER_ID` advisory — a finding with no valid `blocker_id` has no identity to inherit, and there is nothing to fall back to. The step is advisory only: the BLOCK verdict and the `.blockers.md` sidecar are emitted unchanged either way, and this step never blocks, never retries a reviewer, and never edits the verdict.

- Feature spec at `.context-index/specs/features/<module>/<task>.md` gets its review at `.context-index/specs/features/<module>/<task>.review.md`
- Cross-cutting spec at `.context-index/specs/cross-cutting/<topic>.spec.md` gets its review at `.context-index/specs/cross-cutting/<topic>.review.md`

**Lifecycle tracking fields:** In the `.review.md` file, also record (this skill OWNS these fields; downstream skills MUST NOT parse them — they read `state.steps.review` from the lifecycle log instead):

- `last-reviewed-revision: <spec's current revision value>` — the spec's `revision` frontmatter field at the time of review.
- `file-sha: <PENDING>` — write a placeholder at this stage. The final hash is computed in Step 6c via the in-tree helper, after Step 7 has written the status update back to the spec.
