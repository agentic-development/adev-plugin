## Audit Pass 18: Kind Validity

**Goal:** Validate the `kind:` discriminator on every `*.spec.md` and `charter.md` artifact under `.context-index/`. Detect missing, invalid, or cross-layer kind values, and cross-reference `kind: module` charters against `manifest.yaml:modules[]`.

**Layer 1 posture (non-blocking):** All findings emitted by this pass — regardless of severity — are advisory in Layer 1. The pass never causes `/adev:hygiene` to exit non-zero on its own. Severity (`error` / `warn` / `info`) conveys human-triage priority, not gate-blocking semantics. A future Layer 2 enhancement (tracked under `issue-463`) may upgrade `error` findings to gate-blocking after the legacy backfill completes.

**Steps:**

1. Import `runKindValidityPass` from `<ADEV_ROOT>/lib/hygiene/kind-validity.mjs`.
2. Invoke `await runKindValidityPass(projectRoot, { cutover, moduleFilter })`. Both options are optional:
   - `cutover`: ISO 8601 timestamp distinguishing `MISSING_KIND` (warn, post-cutover) from `LEGACY_DEFAULTED` (info, pre-cutover). Defaults to `2026-05-14T00:00:00.000Z` (the date this audit landed).
   - `moduleFilter`: when invoked as `/adev:hygiene --module <slug>`, restrict the audit to artifacts under `features/<slug>/`.
3. Render each finding in the standard hygiene table:

```
| Path | Layer | Kind | Severity | Code | Reason |
|---|---|---|---|---|---|
```

4. Surface `result.headerNotes` in the report header (e.g., when `manifest.yaml` is missing and the `MODULE_KIND_NO_MANIFEST` cross-reference was skipped).
5. Attach the `timestampWarning` (when non-null) inline beside the relevant finding so reviewers can see when classification fell back from git to mtime.

**Finding codes:**

| Severity | Code | Trigger | Resolution Hint |
|---|---|---|---|
| `error` | `INVALID_KIND` | `kind:` present but value is not in `SPEC_KINDS` (for `*.spec.md`) or `CHARTER_KINDS` (for `charter.md`) — including cross-layer values | Fix the value to one of the valid kinds (see `lib/kinds.mjs`) |
| `error` | `PARSE_ERROR` | Artifact's frontmatter cannot be parsed (missing fence, malformed YAML, etc.) | Inspect the artifact manually; the file is unreadable by the discriminator parser |
| `warn` | `MISSING_KIND` | `kind:` field absent AND the artifact's creation timestamp is at or after the cutover | Run `/adev:specify` or `/adev:brainstorm` to re-author with explicit kind, or backfill manually |
| `warn` | `MODULE_KIND_NO_MANIFEST` | `charter.md` has valid `kind: module` but the module slug (derived from `features/<slug>/charter.md`) is not declared in `manifest.yaml:modules[]` | Add the module to `manifest.yaml`, or change the charter kind to `feature` |
| `info` | `LEGACY_DEFAULTED` | `kind:` field absent AND the artifact's creation timestamp is before the cutover | Backfill is part of Layer 2 (`issue-463`); no action required now |

**Exit code policy:** None of the codes above gate the `/adev:hygiene` exit code in Layer 1. `error` findings are counted in the hygiene error total for triage prioritization only. The returned `findings` array is the sole signal — the pass does not throw and does not mutate `process.exitCode`.

**Output format:**
```
## Kind Validity

- PASS: All specs and charters have valid kind discriminators (or)
- FINDINGS: N kind-validity findings (non-blocking)

Header notes:
- manifest.yaml is missing or has no modules[] — MODULE_KIND_NO_MANIFEST cross-reference skipped

| Path | Layer | Kind | Severity | Code | Reason |
|---|---|---|---|---|---|
| .context-index/specs/features/foo/bar.spec.md | spec | nonsense | error | INVALID_KIND | kind 'nonsense' is not in the closed enumeration for layer 'spec' |
| .context-index/specs/features/foo/baz.spec.md | spec | — | warn | MISSING_KIND | kind: field absent and artifact was created after the Layer 1 cutover |
| .context-index/specs/features/orphan/charter.md | charter | module | warn | MODULE_KIND_NO_MANIFEST | charter declares kind:module but slug 'orphan' is not declared in manifest.yaml:modules[] |

**Actions:**
- [ ] Resolve `error`-severity findings (INVALID_KIND, PARSE_ERROR) — these indicate structural defects
- [ ] Backfill `MISSING_KIND` artifacts via `/adev:specify` or `/adev:brainstorm` re-authoring
- [ ] Reconcile `MODULE_KIND_NO_MANIFEST` charters by updating manifest.yaml or downgrading kind to `feature`
```

**Integration with summary table:**
```
| Kind Validity | WARN | 3 findings (1 error, 2 warn) |
```
