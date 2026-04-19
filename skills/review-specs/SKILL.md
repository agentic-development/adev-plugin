---
name: adev:review-specs
description: "Run parallel specialist reviews (structural, security, consistency) on Live Specs before planning. Use for architecture review and expert evaluation."
allowed-tools: [Read, Glob, Grep, Agent]
---

# Review Specs

Run an architecture review on one or more Live Specs using parallel specialist subagents. This is the gate between specification and planning. No code gets planned until specs pass review.

**Announce at start:** "I'm using the adev:review-specs skill to run an architecture review."

## Arguments

- No arguments: review all unreviewed specs (specs without a `.review.md` file, or where the spec is newer than the review)
- `--spec <path>`: review a specific spec file
- `--charter <module>`: review all specs under a feature charter

## Step 1: Identify Target Specs

Determine which specs need review:

1. If `--spec <path>` is provided, use that file directly.
2. If `--charter <module>` is provided, glob `.context-index/specs/features/<module>/*.md` excluding `charter.md` and any `*.review.md` files.
3. If no arguments, scan all `.context-index/specs/features/` and `.context-index/specs/cross-cutting/` directories. A spec needs review if:
   - No adjacent `.review.md` file exists (e.g., `card-ordering.md` expects `card-ordering.review.md`)
   - The spec file is newer than its `.review.md` file (spec was modified after last review)

If no specs need review, report that and exit.

## Step 2: Load Context for Each Spec

For each spec to be reviewed, gather the context package that all reviewers will receive:

1. **The spec itself:** Read the full Live Spec file.
2. **Parent charter:** Read `.context-index/specs/features/<module>/charter.md` (the charter that owns this spec).
3. **Constitution:** Read `.context-index/constitution.md`.
4. **Sibling specs:** Read other specs under the same charter (for cross-reference checks).
5. **Cross-cutting specs:** Read all files in `.context-index/specs/cross-cutting/` (for contract compatibility).
6. **ADRs:** Read all files in `.context-index/adrs/` (for decision compliance).
7. **Platform context:** Read `.context-index/platform-context.yaml` (for technology constraints).
8. **External references:** If `.context-index/references/` exists and has files, read `.context-index/references/**/*.md`. Note external reference charters and contracts that specs must comply with.
9. **Governance policies:** If `.context-index/governance/risk-policies.yaml` exists, read it.
   Check the spec's `risk_level` frontmatter field (default: "medium"). If the policy allows
   skipping review for this level (`require_review: false`), inform the user and offer to skip.
   If skipped, write a `.review.md` with verdict PASS and note "Review skipped per risk policy."

   If `.context-index/governance/gates.yaml` exists, read the `transitions` section. If a
   `spec-to-plan` transition defines an `approver_role`, note it in the review report footer
   (informational only, do not block).

   If `.context-index/governance/overrides/<charter-slug>.yaml` exists, let it override the
   base risk policy for this charter's specs.

   If governance files do not exist, proceed normally (all specs require review).

If a charter or constitution file is missing, warn the user and ask whether to proceed with reduced context or abort.

## Step 2b: Validate Cross-Repo `depends-on` References

After loading the spec, inspect its `depends-on` frontmatter field for cross-repo references. A cross-repo reference uses the format `@repo-slug/spec-slug`.

**Workspace detection:** Walk the directory tree upward from the spec file's location, looking for `adev-workspace.yaml`. If found, a workspace is active; use `resolveRef` from `lib/workspace.mjs` to resolve each cross-repo reference.

**If cross-repo references are present and a workspace is detected:**

For each `depends-on` entry that matches the `@repo-slug/spec-slug` pattern:

1. Call `resolveRef(ref, workspaceConfig)` to locate the referenced spec.
2. If the reference cannot be resolved (repo or spec not found), flag a **warning**:
   `"Cross-repo reference '@repo-slug/spec-slug' could not be resolved — repo or spec not found."`
3. If resolved successfully, read the referenced spec's `status` frontmatter field:
   - If `status: draft`, flag a **warning**: `"Cross-repo dependency '@repo-slug/spec-slug' is in draft status"`
   - If `status: superseded`, flag a **warning**: `"Cross-repo dependency '@repo-slug/spec-slug' is superseded"`
4. Include all cross-repo reference warnings in the context package passed to reviewer subagents (Step 4), so the Structural Architect can factor them into the review.

**If cross-repo references are present but no workspace detected:**

Skip cross-repo validation with a note to the user:
`"Cross-repo references found but no workspace detected — skipping validation."`

Do not treat missing workspace as a blocking error; proceed with the rest of the review using only locally available context.

**If no cross-repo references are present:** skip this step entirely.

## Step 3: Load Reviewer Registry

Call `loadReviewConfig(repoRoot)` from `lib/governance/review-config.mjs`. The loader:

- Reads bundled defaults from `templates/review-specs/defaults.yaml` (the three core reviewers: structural-architect, security-reviewer, consistency-analyzer).
- Overlays `.context-index/governance/review.yaml` if present. Matching `id` overrides field-by-field; new `id` appends.
- Resolves each reviewer's execution profile via `lib/profiles/` and **rejects any reviewer whose profile is not read-only-compatible** (no `filesystem-write`/`shell` categories, no literal tools, fs write/execute must be `deny`, network must be `deny` or `read-only`). A reviewer referencing `implementer` fails load.
- Validates `prompt` / `package.skill` / `package.adapter` paths: `plugin:<skill>/<file>` scheme resolves inside the plugin `skills/` tree; relative paths resolve under `.context-index/` with traversal guard (`..` rejected, `fs.realpath` used for symlink escape); absolute paths rejected; cross-plugin (`plugin:<other>:...`) deferred to v2.
- Migrates `manifest.yaml:specialists` in-memory to `dispatch: triggered` reviewer entries and emits a deprecation note (scheduled for removal in 0.19.0).

If `loadReviewConfig` returns any errors, abort with the error list. Warnings are surfaced in the report header.

## Step 4: Dispatch Reviewers

For each reviewer returned by the registry, call `shouldDispatch(reviewer, { targetSpecPath, specContent })` from the same module. Reviewers with `dispatch: always` always dispatch; `triggered` compute a score (2 points per matching glob + 1 per path segment beyond root, 1 point per keyword) and dispatch when score ≥ `min_score` (default 1); `never` are skipped.

Launch all dispatched reviewers in parallel. Each runs in a clean context window.

### Subagent-mode reviewer (reviewer entry has `prompt`)

For each subagent-mode reviewer:

1. Call `resolveProfile(reviewer.profile, { profiles, consumerRepoRoot, workspaceRoot, adapter, mcpAvailable })` from `lib/profiles/`.
2. Render the reviewer's context pack via `renderPack(reviewer.context_pack, contextPacks, { repoRoot })`. The denylist (`.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`, `**/secrets/**`) is enforced — matching globs fail load, not WARN.
3. Read `reviewer.promptPath` contents.
4. Dispatch a subagent with:
   - `description`: `"<reviewer.name> review of <spec-slug>"`
   - `prompt`: `<prompt contents>\n\n---\n<rendered context pack>\n\n---\n## Target Spec\n<target spec contents>`
   - Tool restrictions, model, env, redaction set all from the adapter's `prepareForDispatch` return.

### Package-mode reviewer (reviewer entry has `package`)

Run the two-stage pipeline:

1. **Stage 1 (runner):** dispatch a subagent under `reviewer.profile` with the resolved skill's `SKILL.md` contents plus a framing note (*"You are running as a reviewer subagent. Follow the instructions faithfully. The arguments and context for this run are appended."*) and the args from `package.args` (with `<target>` substituted for the spec path). Rendered context pack is appended. Tool restrictions from the profile apply.
2. **Stage 2 (adapter):** dispatch a second subagent with the runner's full output + the adapter prompt (`reviewer.adapterPath`, defaults to `plugin:review-specs/adapters/generic.md`). The adapter extracts findings in the standard YAML format.

### Severity cap and parse-failure fallback

After each reviewer returns, apply `applySeverityCap(finding, reviewer)` to every finding (from `lib/governance/review-config.mjs`). This clamps `finding.severity` to `reviewer.severity_cap` and prefixes demoted messages with `[capped from <orig> to <cap>]`.

If a package-mode adapter returns output that does not parse as the findings YAML block:

- Apply the reviewer's `redactionSet` to the raw runner output via the redactor returned by `resolveProfile`.
- Truncate to 8 KiB; replace the tail with `"…[truncated <N> bytes of adapter output — see dispatch record for full text]"`.
- Normalize any absolute paths under `.context-index/`, plugin root, or `$HOME` to repo-relative or `plugin:` form.
- Wrap as a single `suggestion` finding with message: `"Adapter did not parse output into structured findings — sanitized runner output below (redacted and truncated)."`
- Write the full redacted (untruncated) output to the dispatch record, **never** to `.review.md`.

If a subagent-mode or package-mode runner attempts a tool call disallowed by its profile (as surfaced by the harness), the reviewer is recorded as a `warning` finding.

### Tier note

Tier assignment now flows from each reviewer's `profile.model.tier` (resolved via `platform-context.yaml:model_tiers` as today). Bundled defaults continue to use reasoning/capable/fast for architect/security/consistency respectively.

## Step 5: Collect and Consolidate Findings

Wait for all subagents to return. Merge findings into a single consolidated report.

### Verdict Logic

Determine the overall verdict for each spec:

| Condition | Verdict |
|-----------|---------|
| All reviewers returned zero findings or only `suggestion` severity | **PASS** |
| At least one `warning` finding but zero `blocker` findings | **PASS_WITH_NOTES** |
| At least one `blocker` finding from any reviewer | **BLOCK** |

### Consolidated Report Format

Produce one section per dispatched reviewer, in registry order. For each reviewer record the dispatch mode (`subagent` or `package`), the resolved profile, and the prompt source (`plugin:` URI or repo-relative). For package-mode reviewers also record the skill path and the adapter path.

```markdown
# Architecture Review: <spec-slug>

> **Date:** YYYY-MM-DD
> **Spec:** <path to spec>
> **Charter:** <path to charter>
> **Verdict:** PASS | PASS_WITH_NOTES | BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| <reviewer-id> | <reviewer-name> | subagent | <profile-name> | <plugin: URI or repo-relative path> |
| <package-id>  | <package-name>  | package  | <profile-name> | <skill path> (adapter: <adapter path>) |

## <Reviewer Name> (<id>)

**Verdict:** PASS | PASS_WITH_NOTES | BLOCK

<findings list, or "No findings.">

(repeat for each dispatched reviewer)

---

## Summary

**Total findings:** N (B blockers, W warnings, S suggestions)
**Action required:** <what the user must do next, based on verdict>
```

Verdict consolidation uses `computeVerdict(findings, verdictRules)` from `lib/governance/review-config.mjs`. Default `verdictRules.blocker_threshold: 1` matches today's behavior.

## Step 6: Save Review Report

Write the consolidated report to a `.review.md` file adjacent to the spec:

- Feature spec at `.context-index/specs/features/<module>/<task>.md` gets its review at `.context-index/specs/features/<module>/<task>.review.md`
- Cross-cutting spec at `.context-index/specs/cross-cutting/<topic>.md` gets its review at `.context-index/specs/cross-cutting/<topic>.review.md`

**Lifecycle tracking fields:** In the `.review.md` file, also record:
- `last-reviewed-revision: <spec's current revision value>` — the spec's `revision` frontmatter field at the time of review.
- `file-sha: <git hash-object output>` — run `git hash-object <spec-file-path>` and record the SHA. This enables drift detection: if the file changes without a revision bump, `/adev:plan` can detect it.

## Step 7: Update Spec Status

After saving the review report, update the spec's status based on the verdict:

**If verdict is PASS or PASS_WITH_NOTES:**
1. Read the spec file
2. Parse YAML frontmatter
3. Update status: `review-pending` → `review-passed`
4. Write the spec file back

**If verdict is BLOCK:**
1. Read the spec file
2. Parse YAML frontmatter
3. Update status: `review-pending` → `review-blocked`
4. Write the spec file back

Log the status change to the user.

**Charter Capability Map update (PASS or PASS_WITH_NOTES only):** After updating the spec status to `review-passed`, also update the parent charter's Capability Map. Find the capability row corresponding to this spec and set its `Status` column to `review-passed`.

**Note:** Do not increment the spec's `revision` field on status-only changes. The `revision` field tracks content changes, not workflow transitions.

## Step 8: Report to User

Present the consolidated verdict and findings summary.

**If PASS:**
```
Review complete. All specs passed.

  <spec-slug>: PASS (0 findings)

The spec is ready for planning. Run /adev:plan --spec <path> to proceed.
```

**If PASS_WITH_NOTES:**
```
Review complete. Specs passed with notes.

  <spec-slug>: PASS_WITH_NOTES (2 warnings, 1 suggestion)

  Warnings:
  - SA-2: [brief description]
  - SEC-1: [brief description]

Review the full report at <path to .review.md>.
You can proceed to /adev:plan or address the warnings first.
```

**If BLOCK:**
```
Review complete. Specs blocked.

  <spec-slug>: BLOCK (1 blocker, 2 warnings)

  Blockers:
  - SA-1: [brief description]
  - CON-3: [brief description]

These issues must be resolved before planning can begin.
Review the full report at <path to .review.md>.
Run /adev:specify to revise the spec, then /adev:review-specs to re-review.
```

## Gate Behavior

This skill produces the gate artifact that `/adev:plan` checks. The plan skill will:

1. Look for a `.review.md` file adjacent to the target spec.
2. Read the `Verdict` line from the review file header.
3. Compare the spec file modification time against the review file modification time.
4. Block planning if: no review exists, verdict is BLOCK, or spec is newer than review.

This skill also updates the spec's `status` frontmatter field:
- PASS → `review-passed`
- PASS_WITH_NOTES → `review-passed`
- BLOCK → `review-blocked`

When a blocked spec is revised and re-reviewed, the status will be updated from `review-blocked` back to `review-passed` upon a passing verdict.

## Multiple Specs

When reviewing multiple specs (no arguments or `--charter`), process each spec independently. Each gets its own set of parallel subagents, its own `.review.md` file, and its own status update. Present a summary table at the end:

```
Architecture Review Summary

| Spec | Verdict | Blockers | Warnings | Suggestions |
|------|---------|----------|----------|-------------|
| card-ordering | PASS | 0 | 0 | 1 |
| drag-drop | BLOCK | 2 | 1 | 0 |

1 of 2 specs ready for planning.
```
