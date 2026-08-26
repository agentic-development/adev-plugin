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
- `--tier <full|quick>`: rigor tier (graduated-rigor-tiers spec). `full` (default) dispatches the three parallel specialists; `quick` dispatches a single synthesized reviewer. Overrides any routing/risk-policy signal. Invalid value → `INVALID_TIER`.

## Step 0: Specify-step gate (FIRST action)

Before identifying targets, gate on the prior step via the lifecycle log, then emit the step-started event:

```bash
adev gate require --skill review-specs --spec <spec-path>
adev report --type step --spec <spec-path> --step review --status started --revision <spec-revision>
```

`<spec-revision>` is the spec's own `revision:` frontmatter value, read once here and reused for every `adev report --type step` call in this skill (Step 8, Step 0-fail below). Without it, `currentState().steps.review.byRevision` folds every hand-authored revision's events into bucket 1 regardless of which revision actually produced them — the only path currently available while `adev specify revise --auto` has open convergence bugs (adev-plugin-656e).

In strict mode (default — resolved from `manifest.yaml`'s `lifecycle.gate_mode`), `adev gate require` exits `2` if the `specify` step has not been recorded as completed (the spec must exist and have a `lifecycle_step: specify, status: completed` event). In advisory mode, it emits a warning and exits `0`. Do NOT catch the failure — surface the helper's stderr unchanged. Path-containment is enforced by the helper.

When reviewing in bulk (`--charter` or no-args), apply the gate per-spec inside the loop.

In Step 8, emit the matching exit event with the consolidated review verdict:

```bash
adev report --type step --spec <spec-path> --step review --status completed --verdict <consolidated-verdict> --from-summary --revision <spec-revision>
```

### Step 0-fail: Failure-path exit event

A BLOCK verdict is **not** a failure — it is a completed review whose consolidated verdict happens to block downstream steps, and it exits through the `--status completed --verdict BLOCK` line above. This section covers the *other* case: the review aborts before it can produce any verdict at all.

Whenever the skill stops after the `--status started` event above without reaching the Step 8 exit event, emit the terminal event before surfacing the error to the operator:

```bash
adev report --type step --spec <spec-path> --step review --status failed --verdict FAIL --revision <spec-revision>
```

`--verdict FAIL` is required, not decorative. The projection's aggregation pass in `lib/lifecycle-state.mjs` only treats a step terminal as explicit when it carries a string verdict; a `step_failed` emitted without one is overwritten by the verdict synthesized from whatever `reviewer_report` events already landed, so a partial review whose first reviewer passed would project as `{verdict: PASS, status: completed}` and open the `plan` gate. This is the same class of bug fixed for BLOCK in `aggregateReports`.

Abort paths in this skill that MUST emit it:

| Step | Abort |
|---|---|
| Step 2 | The parent charter or the constitution is missing and the operator chooses **abort** rather than proceeding with reduced context. |
| Step 3 | `loadReviewConfig` returns errors — the reviewer registry could not be loaded, so no reviewer can be dispatched. |
| Step 4 | Rigor tier `quick` and the bundled `plugin:review-specs/quick-synthesized-reviewer-prompt.md` is missing (the documented fail-loud path — do not silently fall back to a weaker review). |

Argument-level rejections (`INVALID_TIER`) and the "no specs need review" no-op exit in Step 1 happen *before* the `--status started` event and therefore strand nothing — do not emit for those.

**Known gap (not this skill's to fix):** `adev report --type step` accepts no `--error` flag, so the abort's error code cannot be carried on the event even though the `step_failed` schema has an `error` field. Name the code in operator-facing output; widening the CLI surface is a follow-up.

## Step 1: Identify Target Specs

Determine which specs need review:

1. If `--spec <path>` is provided, use that file directly.
2. If `--charter <module>` is provided, glob `.context-index/specs/features/<module>/*.spec.md`.
3. If no arguments, scan all `.context-index/specs/features/` and `.context-index/specs/cross-cutting/` directories. A spec needs review if:
   - The lifecycle projection does not yet have a `review` step recorded, OR
   - `state.steps.review.lastReviewedRevision` is less than the spec's current `revision`, OR
   - `hasDrift(specPath)` from `<ADEV_ROOT>/lib/spec-drift.mjs` returns `true` (content hash mismatch).

If no specs need review, report that and exit.

## Step 2: Load Context for Each Spec

For each spec to be reviewed, gather the context the orchestrator needs. **Not all of it reaches the reviewers.** Items 1-7 are delivered to a reviewer only insofar as that reviewer's context pack includes them (see Step 4 — packs are per-reviewer, so a category listed here may reach one reviewer and not another). Items 8 and 9 are orchestrator-only and are never forwarded to a reviewer subagent.

1. **The spec itself:** Read the full Live Spec file. *Delivered to every reviewer — appended as the fenced target spec, not as a pack include (see Step 4).*
2. **Parent charter:** Read `.context-index/specs/features/<module>/charter.md` (the charter that owns this spec). *Delivered via the reviewer's context pack (see Step 4) — in `review-base`, so all three bundled reviewers get it.*
3. **Constitution:** Read `.context-index/constitution.md`. *Delivered via the reviewer's context pack (see Step 4) — in `base`.*
4. **Sibling specs:** Read other specs under the same charter (for cross-reference checks). *Delivered via the reviewer's context pack (see Step 4) — in `review-base`, with the target spec itself excluded.*
5. **Cross-cutting specs:** Read all files in `.context-index/specs/cross-cutting/` (for contract compatibility). *Delivered via the reviewer's context pack (see Step 4) — in `consistency` only, so the Consistency Analyzer gets these and the other two bundled reviewers do not.*
6. **ADRs:** Read all files in `.context-index/adrs/` (for decision compliance). *Delivered via the reviewer's context pack (see Step 4) — in `architecture` and `security`, not in `consistency`.*
7. **Platform context:** Read `.context-index/platform-context.yaml` (for technology constraints). *Delivered via the reviewer's context pack (see Step 4) — in `base`.*
8. **External references:** If `.context-index/references/` exists and has files, read `.context-index/references/**/*.md`. Note external reference charters and contracts that specs must comply with. *Orchestrator-only — not passed to reviewers.* No bundled pack includes `.context-index/references/`, so reviewer prompts must not promise them as input. The Consistency Analyzer's "External Reference Compliance" review scope stays conditional (*"If external references are provided"*) precisely because the default packs do not provide them; a project that wants that scope active must add the include to a project-level pack in `.context-index/governance/review.yaml`.
9. **Governance policies:** *Orchestrator-only — not passed to reviewers.* The reads below drive the orchestrator's own risk gating and report footer, and their results are not forwarded to any reviewer subagent. Note the distinction: the `security` pack separately enumerates `.context-index/governance/risk-policies.yaml` and `.context-index/governance/gates.yaml` as **content** for the Security Reviewer to read as material — that is the pack delivering the files, not this step forwarding its decisions.

   If `.context-index/governance/risk-policies.yaml` exists, read it.
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

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill review-specs
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

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

## Step 2.5: Resolve Rigor Tier

Resolve the **rigor tier** (`full` | `quick`) that governs how this spec is reviewed. Per `graduated-rigor-tiers.spec.md`, `quick` never skips the gate — it dispatches a single synthesized reviewer instead of the three specialists, still producing the `.review.md` and the `review` lifecycle event.

Resolution precedence (highest first) — this is the `resolveRigorMode(...)` contract in `lib/governance/rigor-mode.mjs`:

1. **Explicit `--tier <full|quick>`** on invocation. Reject any other value with `INVALID_TIER`.
2. **Routing signal** — if the caller (`/adev:route`, `/adev:work`, or `/adev:build`) passed `--tier quick` because the work is "easy" (low blast-radius, high pattern coverage).
3. **Risk policy** — read `.context-index/governance/risk-policies.yaml`; map the spec's `risk_level` frontmatter (default `medium`) to `policies.<level>.review_mode`.
4. **Default** — `full`.

When reviewing in bulk, resolve the tier per spec. Record the resolved tier in the review report header.

## Step 3: Load Reviewer Registry

**The dispatching set.** Run this FIRST — its output is the reviewer set you dispatch:

```bash
adev governance reviewers --json
```

The envelope is `{ reviewers, disabled, context_packs, verdict_rules, warnings, errors, notes }`. Abort on any `errors` entry; surface `warnings` and `notes` in the report header. This verb wraps `loadReviewConfig` (`lib/governance/review-config.mjs`), which reads the project's MATERIALIZED `.context-index/governance/review.yaml` and **nothing else**, and fails closed with `REGISTRY_NOT_MATERIALIZED` when the file exists without its marker.

**Comparison view (optional).** To see what the active domain WOULD contribute, so the report can name reviewers the project has not adopted:

```bash
adev domain load-reviewers --module <module-slug> [--charter <charter-path>]
```

The verb resolves the active domain (charter frontmatter → manifest.modules[].domain → manifest.project.domain → 'software'), loads `templates/domains/<domain>/reviewers.yaml`, and merges `.context-index/governance/review.yaml` on top (governance wins on `id` conflict). Stdout is a single JSON object:

```json
{ "domain": { "resolved_domain": "...", "source_level": "..." }, "reviewers": [...], "warnings": [...] }
```

Log any warnings from the `warnings` field.

`adev domain load-reviewers` is a COMPARISON VIEW ONLY. It merges the domain overlay over the project file, and none of that merge dispatches: the set that runs is the one `adev governance reviewers` printed above. Neither the bundled defaults nor the domain overlay contributes at run time: a domain's reviewers are adopted once, by `adev governance materialize --registry review`, which writes them into the project's own file and stamps its write-once marker. The `adev domain load-reviewers` output above is therefore a comparison view — reviewers it lists that the project file does not declare are NOT dispatched, and hygiene Pass 19 is where that divergence is reported. The loader:

- Fails closed (`REGISTRY_NOT_MATERIALIZED`) when `review.yaml` exists without its `materialized_at` marker; a project with no `review.yaml` at all runs no reviewers.
- Reads `templates/review-specs/defaults.yaml` for `context_packs` and `verdict_rules` only, with the project's values winning field-by-field.
- Resolves each reviewer's execution profile via `lib/profiles/` and **rejects any reviewer whose profile is not read-only-compatible** (no `filesystem-write`/`shell` categories, no literal tools, fs write/execute must be `deny`, network must be `deny` or `read-only`). A reviewer referencing `implementer` fails load.
- Validates `prompt` / `package.skill` / `package.adapter` paths: `plugin:<skill>/<file>` scheme resolves inside the plugin `skills/` tree; relative paths resolve under `.context-index/` with traversal guard (`..` rejected, `fs.realpath` used for symlink escape); absolute paths rejected; cross-plugin (`plugin:<other>:...`) deferred to v2.
- Migrates `manifest.yaml:specialists` in-memory to `dispatch: triggered` reviewer entries and emits a deprecation note (scheduled for removal in 0.19.0).

If `adev governance reviewers` reported any `errors`, abort with the error list. Warnings are surfaced in the report header.

## Step 4: Dispatch Reviewers

**Heuristics:** Before dispatching reviewers, load module-scoped heuristics for the spec's charter module via the CLI:

```bash
adev heuristics retrieve --module <charter-module> --tier summary --format text
```

Derive the module slug from the spec's `charter:` frontmatter field. Stdout is either rendered markdown blocks (one per heuristic) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — retrieval failures degrade to `__NONE__` so heuristic injection stays non-blocking.

When heuristics are present (output is not `__NONE__`), include them in each reviewer's context pack under a `## Heuristics` section, prepended with: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

**Quick tier branch (Step 2.5).** If the resolved rigor tier is `quick`, **skip the registry loop below** and dispatch exactly one subagent — the synthesized reviewer — using the bundled prompt `plugin:review-specs/quick-synthesized-reviewer-prompt.md` under the `reviewer-capable` profile, with the same rendered context pack and target spec appended. Pass `run_in_background: false` on this dispatch, exactly as the full-tier reviewers do (see the parallel-dispatch note below): the harness backgrounds Agent dispatches by default, and review-specs frequently runs as a build-step subagent where a backgrounded dispatch never re-invokes the caller and stalls the review. It returns `SA-`/`SEC-`/`CON-` findings in the standard format plus a consolidated verdict. Apply the same severity cap, `blocker_id` validation, and parse-failure fallback as any other reviewer, then proceed to Step 5. Do not dispatch the three specialist defaults in `quick` mode. If the bundled prompt file is missing, fail loud (do not silently fall back to a weaker or empty review). Otherwise (tier `full`, the default), dispatch the registry reviewers as described next.

For each reviewer returned by the registry, call `shouldDispatch(reviewer, { targetSpecPath, specContent })` from the same module. Reviewers with `dispatch: always` always dispatch; `triggered` compute a score (2 points per matching glob + 1 per path segment beyond root, 1 point per keyword) and dispatch when score ≥ `min_score` (default 1); `never` are skipped.

Launch all dispatched reviewers in parallel. Each runs in a clean context window. Dispatch every reviewer with `run_in_background: false`, issuing the Agent calls in a single message so they still run concurrently. The harness backgrounds Agent dispatches by default, and background completion notifications do not re-invoke a nested caller (review-specs frequently runs as a build-step subagent) — a backgrounded reviewer therefore stalls the review. Synchronous parallel calls return all reviewer reports directly in the tool results.

**Never end your turn to wait for a dispatched subagent.** A synchronous dispatch (`run_in_background: false`) returns its final result directly in the tool call — there is nothing to wait for. If a dispatch ever returns a task ID instead of a result, that is a bug in the dispatch (the rule above was violated, or the harness backgrounded it anyway): fix the dispatch and re-run it synchronously. Do not end the turn hoping a completion notification will resume you — in a nested subagent context it will not. If this skill is itself running as a dispatched subagent (e.g., a build pipeline step), your own caller is waiting on a result contract — for build pipeline steps this is the `STEP_RESULT` format defined in `skills/build/SKILL.md`. Ending your turn without that result to report is a protocol violation, not a valid pause point.

### Subagent-mode reviewer (reviewer entry has `prompt`)

For each subagent-mode reviewer:

1. Call `resolveProfile(reviewer.profile, { profiles, consumerRepoRoot, workspaceRoot, adapter, mcpAvailable })` from `lib/profiles/`.
2. Render the reviewer's context pack via `renderPack(reviewer.context_pack, contextPacks, { repoRoot, targetSpecPath })`. Every review-time pack is **target-anchored**: the `review-base` pack (which `architecture`, `security`, and `consistency` all extend) uses the `<charter-dir>` and `<target-spec>` tokens, so a render without `targetSpecPath` fails with `CONTEXT_PACK_NO_TARGET` rather than emitting a literal token. The denylist (`.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`, `**/secrets/**`) is enforced — matching globs fail load, not WARN.
3. Read `reviewer.promptPath` contents.
4. Dispatch a subagent with:
   - `description`: `"<reviewer.name> review of <spec-slug>"`
   - `prompt`: the provenance preamble, then the prompt body, then the rendered context pack, then the target spec — the pack sections and the target spec each wrapped in a nonce-scoped fence (`<<<ADEV-PACK-<nonce> …>>>`) so the reviewer can tell repository-sourced content from text the artifact under review merely claims is a delimiter. Both use the **same** nonce from the `renderPack` call, and the preamble names that token.
   - Tool restrictions, model, env, redaction set all from the adapter's `prepareForDispatch` return.

   This composition is owned by `buildReviewerDispatches(...)` in `lib/governance/dispatch-shape.mjs` — that function is the single source of truth for prompt assembly, fencing, and preamble text. The description above is reference only; do not hand-assemble the prompt.

   When the reviewer's context pack resolves to `delivery: manifest`, that same preamble additionally carries the **manifest read contract**: it states that a `role="path-manifest"` fence lists repository paths whose contents were not inlined, that the reviewer is expected to read them on demand, and which read tools its resolved profile grants (the names are derived through the harness adapter, so they are correct per harness). It also restates that only paths inside a fence carrying this render's token are repository-sourced. The wording lives in `buildReviewerDispatches`; do not restate or hand-assemble it.

**What each reviewer actually receives** is exactly its `context_pack` (Step 3 registry entry) plus the target spec. The nine context categories in Step 2 are *not* uniformly forwarded — see the per-item labels there.

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

**Disabled reviewers get a report row, not silence.** `adev governance reviewers` keeps a reviewer declared with `enabled: false` in `reviewers` and also returns it on `disabled`, each entry carrying `disabled_reason`. Emit one `## Disabled Reviewers` table row per entry on that list, naming the reviewer id and its `disabled_reason` — or the literal text `no reason given` when the registry stated none (the loader also raises a `DISABLED_WITHOUT_REASON` warning in that case, which belongs in the report header with the other warnings). Omit the whole section when nothing is disabled. A reviewer that was deliberately switched off must read differently from one the project never declared; dropping it from the report collapses the two.

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

## Disabled Reviewers

| ID | Reason |
|----|--------|
| <reviewer-id> | <disabled_reason, or "no reason given"> |

## <Reviewer Name> (<id>)

**Verdict:** PASS | PASS_WITH_NOTES | FAIL

<findings list, or "No findings.">

(repeat for each dispatched reviewer)

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated*
> verdict in the header above, computed from post-cap findings across all
> reviewers — PASS (zero warnings/blockers), PASS_WITH_NOTES (>=1 warning,
> zero blockers), BLOCK (>= `verdict_rules.blocker_threshold` blockers,
> default 1). See `configurable-reviewers.spec.md` behaviors 37-38. An
> individual reviewer signals a blocker by emitting FAIL with a
> blocker-severity finding, which is what the `reportReviewer` snippet in
> Step 6a records.

---

## Summary

**Total findings:** N (B blockers, W warnings, S suggestions)
**Action required:** <what the user must do next, based on verdict>
```

Verdict consolidation uses `computeVerdict(findings, verdictRules)` from `lib/governance/review-config.mjs`. Default `verdictRules.blocker_threshold: 1` matches today's behavior.

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

## Step 7: Update Spec Status

> Legal status values are defined in `lib/spec-status.mjs::SPEC_STATUSES`. The
> seven legal transitions are tracked there; if a future review introduces a
> new status, extend that module first, then this skill.

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

**Charter Capability Map update (PASS or PASS_WITH_NOTES only):** After updating the spec status to `review-passed`, also update the parent charter's Capability Map. Find the capability row corresponding to this spec, then write the update via the CLI rather than editing the table directly:

```bash
adev capability-map set-status --charter <charterPath> --capability "<capability name>" --status review-passed
```

Stdout is a single JSON object `{ updated, previousStatus, newStatus, reason }`. The write is monotonic: on a **re-review** of a spec whose capability row already reads `planned`, `implementing`, `implemented`, or `validated` (e.g. after `/adev:validate` FAILs and the spec is revised, or any other re-entry through this step), the row is already past `review-passed` in the lifecycle order, so the verb reports `updated: false, reason: "NOT_MONOTONIC"` and leaves the charter untouched instead of regressing the record that the capability was already built further. Log this outcome to the user the same as a normal update — it is expected behavior on re-review, not an error. `reason: "CAPABILITY_NOT_FOUND"` or `"PARSE_ERROR"` are non-blocking; log and continue.

**Note:** Do not increment the spec's `revision` field on status-only changes. The `revision` field tracks content changes, not workflow transitions.

## Step 6c: Stamp Final file-sha

After Step 7 has written the status update to the spec file, compute the final SHA-256 of the on-disk spec content and update the `.review.md`:

```javascript
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const buf = await readFile(specPath);
const sha = createHash('sha256').update(buf).digest('hex');
// Replace `file-sha: <PENDING>` in the .review.md with `file-sha: <sha>`.
```

Do NOT shell out for hashing — the in-tree `crypto.createHash('sha256')` computation is the canonical hash for spec content, consistent with `lib/source-manifest.mjs` and `lib/spec-drift.mjs`.

**Why after Step 7:** Step 7 writes `review-pending → review-passed` (or `review-blocked`) back to the spec file, which changes the file's content and hash. If the SHA were captured in Step 6 (before Step 7), the stored SHA would immediately diverge from the on-disk spec, causing `/adev:plan` to report false drift on the very next invocation.

## Step 8: Report to User

Present the consolidated verdict and findings summary. **Do NOT echo the full .review.md content** — it is already on disk. Present ONLY the summary format below. **Persona adaptation:** The formats below are defaults for the Developer persona. If a different persona is active, adapt the chat summary to its output rules (e.g., Product persona: show pass/fail only, omit blocker codes and file paths). Artifacts written to disk (`.review.md`) always use the full technical format.

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

This skill produces the canonical reviewer events in the lifecycle log that `/adev:plan` (and `/adev:implement`, `/adev:validate`) gate on. The `.review.md` artifact is a rendered presentation of those events for human inspection.

Downstream skills MUST call `requireGate(state, "review", { mode })` against `currentState(projectRoot, specPath)` — they MUST NOT parse `.review.md` frontmatter for verdict or grep for `status:` fields. The lifecycle log is the source of truth; the rendered artifact is a view.

This skill also updates the spec's `status` frontmatter field (Step 7):
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

## API reference

Lifecycle event log:

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — read the projection; this skill writes the `review` step entries that downstream skills gate on.
- `requireGate(state, "specify", { mode })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — hard-blocks (or warns) when the prior step is not complete.
- `resolveGateMode(loadManifest(projectRoot))` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — resolves `manifest.lifecycle.gate_mode`.
- `reportStep(projectRoot, specPath, { step: "review", status, verdict? })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits skill entry/exit. The exit event carries the consolidated verdict.
- `reportReviewer(projectRoot, specPath, { step: "review", reviewer, verdict, notes })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits one event per dispatched reviewer; severity is stamped at write time from `reviewers.yaml`.

Spec drift:

- `hasDrift(specPath)` from `<ADEV_ROOT>/lib/spec-drift.mjs` — detects spec-content drift since last validation; used in Step 1 to identify specs needing re-review.

Rigor tiers:

- `resolveRigorMode({ skill: "review", riskLevel, policies, tierOverride, routingEasy })` from `<ADEV_ROOT>/lib/governance/rigor-mode.mjs` — resolves `full` | `quick` (Step 2.5). Precedence: tier override > routing signal > risk policy > `full`.
- `loadRigorPolicies(projectRoot)` from `<ADEV_ROOT>/lib/governance/rigor-mode.mjs` — reads `risk-policies.yaml` `policies` map (`review_mode` / `validate_mode`).

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.

## Next Step in the Lifecycle

Review complete. The next step depends on the verdict:
- **PASS / PASS_WITH_NOTES** → **`/adev:plan`**
- **BLOCK** → **`/adev:specify --revise`** to address the blockers, then re-review.

If invoked via `/adev:work`, offer to continue to the appropriate next step. The user can stop here.
