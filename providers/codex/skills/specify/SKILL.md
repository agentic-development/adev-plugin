---
name: adev:specify
description: "Author Live Specs within a Feature Charter's scope. Supports modes for new features, extraction from existing code, refactoring, diff-driven changes, and cross-cutting concerns. Use when the user says 'write a spec', 'define the behavior', 'create a contract', 'specify the feature', or needs to formalize requirements into a behavioral specification before planning. In Codex, invoke with $adev:specify"
---

# Write a Live Spec

Author a Live Spec that defines a behavioral contract for implementation, scoped to an existing Feature Charter. The spec becomes the single source of truth for what `/adev:plan` decomposes and `/adev:implement` builds.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(positional)* | No | Feature module name or capability hint (e.g., `task-boards` or `"add drag-and-drop reordering"`) |
| `--charter <module>` | No | Explicit parent charter. Required when multiple charters exist and the positional arg is ambiguous. |
| `--title <title>` | No | Spec title. Prompted interactively if omitted. |
| `--kind <kind>` | No | Artifact shape from the closed enumeration in `SPEC_KINDS`: `behavioral`, `refactor`, `action`, `skill`, `integration`, `artifact`. If omitted, the skill prompts via the ask-first menu (Step 3.5). Strict-on-write: missing or invalid values re-prompt — there is no default at write time. |
| `--extract` | No | Extract mode: reverse-engineer a spec from existing code. |
| `--refactor` | No | Refactor mode: current state + target state + migration path. |
| `--from-diff` | No | From-diff mode: generate a retroactive spec from a git diff or PR. |
| `--cross-cutting` | No | Cross-cutting mode: spec spans multiple charters (auth, logging, error handling, etc.). |
| `--revise <spec-path>` | No | Revise mode: read a BLOCKED spec at revision N together with its `<spec-stem>.review.md` + `<spec-stem>.blockers.md` sidecars and produce revision N+1 as a targeted patch. Bumps `revision:` N → N+1, sets `updated:` to today, transitions `status: review-blocked → review-pending`, clears `.blockers.md`, and emits a `spec_revised` lifecycle event. The actual work runs in the CLI verb `adev specify revise --spec <path>` (see Step-set: Revise below). |
| `--amend <base-spec>` | No | Amend mode: scaffold a **new co-located amendment** of an already-shipped (validated) base spec **without mutating the base**. Produces `<base-stem>-rev-<target>-<descriptor>.spec.md` carrying `amends:` + `target-revision:` frontmatter (inherited/overridable `kind:`, `revision: 1`, `status: review-pending`) and emits a `spec_amended` lifecycle event on the **base** spec's log. Distinct from `--revise` (which bumps a not-yet-shipped, review-blocked spec in place). The actual work runs in the CLI verb `adev specify amend --spec <base-spec>` (see Amend Mode below). |

**Workflow axis vs. kind axis (orthogonality).** `--extract`, `--refactor`, `--from-diff`, `--cross-cutting`, `--revise`, and `--amend` are **direct boolean flags** describing the *workflow* used to author the spec. `--kind` is a **separate axis** describing the *artifact shape* the spec takes. The two axes combine independently — any workflow flag may pair with any `--kind` value. No `--mode <name>` flag is introduced; the existing direct-flag syntax is preserved verbatim. Note that **amendment is not a `kind:` value** — it is the `amends:` relationship overlay; `--kind amendment` is rejected with `INVALID_KIND`.

Examples:
- `/adev:specify --extract --kind artifact` — extract an artifact-kind spec from existing static deliverables
- `/adev:specify --kind skill` — greenfield-author a skill-kind spec (standard workflow, skill shape)
- `/adev:specify --refactor --kind refactor` — refactor workflow producing a refactor-kind spec (natural pairing)

Workflow flags remain mutually exclusive with each other. If no workflow flag is supplied, standard mode is used. The `--kind` axis is independent of workflow flag selection.

`--revise` is mutually exclusive with `--extract`, `--refactor`, `--from-diff`, and `--cross-cutting`. Combining any two of these flags exits non-zero with `CONFLICTING_FLAGS`.

`--amend` is likewise mutually exclusive with `--revise`, `--extract`, `--refactor`, `--from-diff`, and `--cross-cutting`. Combining `--amend` with any of these exits non-zero with `CONFLICTING_FLAGS`.

## Prerequisites

1. `.context-index/` exists. If not, tell the user to run `/adev:init` first.
2. `.context-index/constitution.md` exists and is non-empty.
3. At least one Feature Charter exists under `.context-index/specs/features/` (except for `--cross-cutting` mode, which only needs the constitution and product charter).

If any prerequisite fails, stop and explain what is missing. Do not generate a spec without a charter anchor (cross-cutting excepted).

---

## Shared: Resolve Charter

Used by Standard, Extract, Refactor, and From-Diff modes. Cross-Cutting skips this.

1. Scan `.context-index/specs/features/*/charter.md` to find all charters.
2. If `--charter <module>` is provided, load directly (error if missing).
3. If positional arg provided, match against charter module names (ask if ambiguous).
4. If no arg and one charter exists, use it. If multiple, list and ask:

```
Found 3 Feature Charters:
  1. task-boards — Task management with drag-and-drop boards
  2. user-management — User profiles, roles, and permissions
  3. notifications — Real-time notification system

→ Which charter should this spec belong to? (number or name)
```

## Shared: Workspace-Mode Detection

Before resolving charters, detect workspace context:

1. Call `detectWorkspace(cwd)`. This returns `{ root, config, currentRepoSlug }` or `null`.
   - `currentRepoSlug` is the `slug` field of the registered repo containing `cwd`, from the `detectWorkspace()` return value. It is `null` when `cwd` is the workspace root itself (not inside any registered repo).

2. **If `detectWorkspace()` returns `null`:** No workspace. Proceed with existing single-repo flow unchanged. No workspace-related prompts or frontmatter appear.

3. **If `detectWorkspace()` returns non-null AND `currentRepoSlug !== null`:** Inside a registered repo. Proceed with existing single-repo flow unchanged. The spec is written to the repo's own `.context-index/`. No `target-repo:` prompt appears.

4. **If `detectWorkspace()` returns non-null AND `currentRepoSlug === null`:** At the workspace root. Enter **workspace mode**:
   - Resolve charters from the workspace `.context-index/specs/features/` directory (not from any registered repo).
   - If the workspace `.context-index/` does not exist, suggest: "No workspace context directory found. Run `/adev:init --workspace` to set up workspace-level context." and stop.
   - Specs will be written to the workspace `.context-index/`, not to any registered repo.
   - Continue to "Shared: Load Context" with workspace paths.

### Workspace Mode: target-repo Prompt

After the user selects a capability (Step 3) in workspace mode, prompt for the implementation target:

```
This is a workspace-level spec. Which repo owns the implementation?
Registered repos: <list of repo slugs from adev-workspace.yaml config.repos>
→ target-repo: (slug or "workspace" if no single repo owns it)
```

**Validation:**

1. If the user enters `"workspace"` — accept as-is. This is a reserved token for specs that span repos without a single owner. No slug validation is performed.
2. If the user enters a string matching a registered repo slug — accept. Validate the slug with `validateModuleName()` from `lib/workspace.mjs` to ensure it matches `[a-zA-Z0-9_-]+`.
3. If the user enters an unknown value — reject and re-prompt:
   ```
   Unknown repo slug '<input>'. Available repos: <comma-separated slug list>.
   → target-repo: (try again)
   ```
4. If the value contains characters outside `[a-zA-Z0-9_-]` and is not `"workspace"` — reject:
   ```
   Invalid repo slug: must match [a-zA-Z0-9_-]+
   → target-repo: (try again)
   ```

Re-prompt until a valid value is given.

**Note:** Error codes in the Error Cases table (`INVALID_TARGET_REPO`, `INVALID_MODULE_NAME`, etc.) are for human and agent reference only — they are not emitted programmatically since this is a markdown skill.

### Workspace Mode: Reference Context and Isolation

In workspace mode, load sibling repo context via `resolveWorkspaceContext()` for reference:

- Use `resolveWorkspaceContext(workspaceRoot, null).siblingRepos[]` to get sibling repo `.context-index/` paths.
- These paths are available for reference (e.g., checking if a spec name conflicts with an existing spec in a sibling repo) but the skill never writes to any registered repo's `.context-index/`.

**Isolation invariant:** The skill never writes to any registered repo's `.context-index/`. All workspace-mode output goes to the workspace `.context-index/` only. This is a charter-level invariant (multi-repo-workspace charter, Quality Attributes: Isolation).

## Shared: Load Context

Used by all modes (Cross-Cutting loads only constitution and product charter).

- `.context-index/constitution.md` — for principle references and gate validation
- `.context-index/platform-context.yaml` — for technology-aware decisions
- The resolved Feature Charter — for scope boundaries and capability list
- `.context-index/specs/product.md` — for cross-module awareness
- Any existing specs in the same module directory — to avoid duplication
- `.context-index/references/**/*.md` — if the references directory exists, read external reference charters and contracts. Note external interfaces this module must comply with.

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill specify
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

**Heuristics:** Load module-scoped heuristics for the charter module via the CLI:

```bash
adev heuristics retrieve --module <charter-module> --tier summary --format text
```

Derive the module slug from the resolved Feature Charter's module name (the `charter:` field or directory name).
Stdout is either rendered markdown blocks (one per heuristic, separated by blank lines) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — retrieval failures degrade to `__NONE__` so heuristic injection stays non-blocking.

When heuristics are present (output is not `__NONE__`), include them in the working context alongside the charter and existing specs and prepend: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

**Domain-Aware Spec Template:** After loading context, resolve the active domain via the CLI. This provides the resolved domain name needed to pick the correct spec template:

```bash
adev domain resolve --module <charter-module> [--charter <charter-path>]
```

The verb resolves the active domain (charter frontmatter → manifest.modules[].domain → manifest.project.domain → 'software'). Stdout is a single JSON object whose `domain.resolved_domain` field names the domain.

Load the domain spec template from `templates/domains/<resolved_domain>/spec-template.md` under the plugin root. If the file does not exist, fall back to `${CLAUDE_PLUGIN_ROOT}/templates/spec-template.behavioral.md`.
The loaded template defines the spec's section structure. Use the template's H2 headings and table columns as the structure for this spec. Do not use hardcoded section names -- the template is the single source of truth for section structure.

## Shared: Frontmatter

```yaml
charter: <module-name>          # omit for cross-cutting (use affects: instead)
status: draft                   # always starts as draft
milestone: <milestone from charter> # standard mode only
created: <today's date YYYY-MM-DD>
# mode: extract | refactor | from-diff | cross-cutting
# extracted-from: [...]         # extract mode
# diff-source: "..."            # from-diff mode
# affects: [...]                # cross-cutting (replaces charter:)
# target-repo: <slug>            # workspace mode only — which repo owns the implementation
# charter-extension: true       # if capability not in charter
# constitutional-exception: "." # if user chose explicit exception
# test_strategy: <strategy-id>  # optional — pins the test strategy (schema, contract, unit, ...) at spec level
# test_depth: minimal | standard | thorough  # optional — overrides the depth chain's stage 1 (spec-declared) — see test-depth-policy.spec.md
```

**Milestone inheritance (standard mode):** Inherit from the capability's Milestone in the parent charter. Tell the user and allow override:
```
→ Keep milestone "v1", or override? (enter to confirm / type new value)
```

**Advisory milestone validation:** After the milestone value is confirmed (inherited or overridden), call `warnIfMilestoneUndefined(projectRoot, name)` from `lib/milestones.mjs`. If it returns a warning string, print it to the user. This is advisory only — never block spec creation based on this check.

## Shared: Summary Template

After writing any spec, output the path, mode-specific stats (see each mode), and next steps: review the spec, `/adev:review-specs`, or write another spec.

## Shared: Lifecycle Events

Every mode (Standard, Extract, Refactor, From-Diff, Cross-Cutting) MUST emit a lifecycle entry event before writing any spec content and a matching exit event after the spec is saved. Without these events, the lifecycle log has no record of the specify step and `/adev:review-specs` blocks with `step "review" requires prior step "specify" to be completed`.

**Entry event** (emit before Step 1 / earliest spec-related action):

```bash
adev report --type step --spec <spec-path> --step specify --status started
```

**Exit event** (emit at the end of the Summary step):

```bash
adev report --type step --spec <spec-path> --step specify --status completed --verdict PASS --from-summary
```

The `--verdict PASS` is required — downstream gates require the prior step to have completed with PASS or PASS_WITH_NOTES. The specify step has no failure path that reaches the Summary step (success implies the spec was written, status set to `review-pending`, and the Feature work item created or skipped), so success implies PASS.

**Failure-path exit event.** Whenever the skill stops after the entry event without reaching the exit event, emit the terminal event before surfacing the error to the operator:

```bash
adev report --type step --spec <spec-path> --step specify --status failed --verdict FAIL
```

`--verdict FAIL` is required, not decorative. The projection's aggregation pass in `lib/lifecycle-state.mjs` only treats a step terminal as explicit when it carries a string verdict; a `step_failed` emitted without one is overwritten by the verdict synthesized from the actor reports already on the log, so the step projects as `{status: "completed", verdict: "PASS"}` and opens the `review` gate on a spec that was never finished.

**Ordering constraint — read before adding an emission.** `adev report` requires `<spec-path>` to exist on disk and exits `1` with `spec not found` otherwise. Every abort earlier than the atomic-rename commit in Step 5 therefore *cannot* emit a step event, because at that point only `<spec-path>.partial` exists:

| Abort | Emit? |
|---|---|
| Step 2.5 `CHARTER_CLOSED` | No — spec file does not exist yet. |
| Step 3.5 invalid `kind` | No — spec file does not exist yet. |
| Step 5 `PARTIAL_ARTIFACT_OVERSIZE`, or the operator choosing **abort** at the prior-`.partial` prompt | No — only the `.partial` exists. |
| Step 5 `resolveTemplate` throwing `TEMPLATE_NOT_FOUND` / `UNSAFE_TEMPLATE_PATH` / `INVALID_KIND` | No — spec file does not exist yet. |
| Step 5.5 failing to read back or rewrite the saved spec's `status:` frontmatter | **Yes** — the atomic rename has committed, so the spec is on disk and a stop here strands the step. |
| Step 5.6 issue-board adapter throwing | No — this is explicitly non-blocking; the run continues to Step 6 and exits `completed`. |

Be precise about what that single **Yes** row is: Step 5.5 is written as a plain read-modify-write with no documented halt, so this skill currently has **no prose-level abort that both follows the entry event and reaches a spec that exists on disk**. The instruction above is therefore a standing rule for any future edit that introduces one — not a description of a path that fires today. Every abort this skill *does* document is a pre-write abort whose entry event could not land either: the same `spec not found` guard rejects the `--status started` emission at Step 0 in every mode that authors a new spec, so nothing is stranded and there is nothing to close out. Recording pre-write specify aborts requires either a spec-less event channel or relaxing the existence check in `lib/cli/report.mjs`; both are library changes and out of scope here.

`--revise` mode is unaffected: it emits `spec_revised` rather than step entry/exit events, so its error cases (`NO_REVIEW_SIDECARS`, `SPEC_NOT_BLOCKED`, `INVALID_SPEC_PATH`, `REVISION_NOT_INCREMENTED`, `CONFLICTING_FLAGS`) strand no step and must not emit `--status failed`.

**Known gap (not this skill's to fix):** `adev report --type step` accepts no `--error` flag, so the abort's error code cannot be carried on the event even though the `step_failed` schema has an `error` field. Name the code in operator-facing output; widening the CLI surface is a follow-up.

For `--cross-cutting` mode, the spec path is `.context-index/specs/cross-cutting/<slug>.spec.md` rather than `.context-index/specs/features/<module>/<slug>.spec.md`. The events are otherwise identical.

---

## Standard Mode (default)

The primary path. Takes a Feature Charter and produces a Live Spec for one capability.

### Step 0: Lifecycle entry event

Before any spec authoring, emit a `lifecycle_step` event so the projection's `currentStep` reflects the active phase:

```bash
adev report --type step --spec <spec-path> --step specify --status started
```

This skill does NOT carry severity stamping, gate adoption, or issue board adoption — it only emits step entry/exit. Charter capability-map mutation (acknowledged dual-write in the charter's Out-of-Scope) remains a markdown edit and is not migrated here.

### Step 1: Resolve Charter

Use the shared Resolve Charter section above.

### Step 2: Load Context

Load context per the shared section above.

### Step 2.5: Charter Status Gate

Before creating any spec, check the parent charter's `status` frontmatter field:
- If `status: closed`, **block** with error:
  ```
  CHARTER_CLOSED: The charter for <module> has status "closed".
  A closed charter does not accept new specs. To reopen it, run /adev:brainstorm --module <module>.
  ```
- If the charter has no `status` field or any other status value, proceed normally.

### Step 3: Identify Capability

Present the charter's Capability Map and list existing specs in the module. Ask which capability to cover:

```
Charter: task-boards
Capabilities:
  1. Create and manage boards
  2. Drag-and-drop card reordering
  3. Board sharing and permissions
  4. Card labels and filtering
  5. Board activity feed

Existing specs in this module:
  ✓ create-manage-boards.md (status: review-passed)
  ✓ board-sharing.md (status: draft)

→ Which capability should this spec cover? (number, name, or describe a new one)
```

If the user describes something not in the charter, warn them:

```
⚠ "<capability>" is not listed in the <module> charter.
  Options:
  1. Add it to the charter first (recommended — run /adev:brainstorm --module <module>)
  2. Proceed anyway (the spec will note it extends beyond the current charter scope)

→ Your choice?
```

If option 2, add `charter-extension: true` to frontmatter and a comment at the top of the spec noting the charter divergence.

### Step 3.5: Resolve Kind

Determine the artifact shape (`kind:`) for the spec being authored. This step is **orthogonal** to the workflow flag (Standard / `--extract` / `--refactor` / `--from-diff` / `--cross-cutting`) — both axes combine independently. No `--mode` flag is introduced.

**If `--kind <value>` was supplied on invocation:**

```javascript
import { isValidKind } from '<ADEV_ROOT>/lib/kinds.mjs';

if (!isValidKind('spec', kind)) {
  // Reject with the closed-enumeration list and stop.
  // Message must list the 6 valid kinds so the user can correct their invocation:
  //   "Invalid --kind 'xxx'. Valid options: behavioral, refactor, action, skill, integration, artifact."
}
```

If `isValidKind('spec', kind)` returns `false`, reject the invocation with a message naming the 6 valid options and halt. Do not proceed to spec authoring.

**If `--kind` was NOT supplied:** present the ask-first menu and have the user pick:

```
What kind of spec is this?

  1. behavioral (default) — runtime behavior of a feature
  2. refactor — current→target migration with steps and invariants
  3. action — one-shot operational task (cleanup, backfill, migration tool)
  4. skill — defines /adev:* CLI surface
  5. integration — wires two skills or modules together
  6. artifact — static deliverable (package, template, fixture, schema)

→ Pick a number or name (default: behavioral)
```

**Strict-on-write semantics.** The kind axis is required at write time. If the user presses enter without picking a value, re-prompt with:

```
Kind is required for new specs. Pick a number or name.
```

Continue re-prompting until a valid kind is supplied. **There is no silent defaulting at write time** — the chosen value is written verbatim to frontmatter. (Read-time defaulting applies only to legacy artifacts authored before this taxonomy landed; new artifacts must carry an explicit `kind:`.)

After resolution, the `kind` variable is available for Step 5's `resolveTemplate('spec', kind, domain)` call.

### Step 4: Interactive Spec Authoring

Guide the user through each section defined in the loaded domain template. Do not dump a blank template. Use the template's section names and structure -- do not substitute or rename sections. **Persona adaptation:** Frame questions at the level appropriate for the active persona. Product persona: ask about user outcomes and business rules, not implementation details. Developer/Architect: include technical specifics.

**Behavioral Contract:**
Ask focused questions: what triggers this behavior, expected outcomes, failure scenarios. Write behaviors as an **unordered** list, each item opening with a bolded behavior ID, in the **When...then** format:

```markdown
### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** a user drags a card within the same column **then** the card's `position` updates and affected cards reindex.
- **BEH-2** — **When** a user drags a card to a different column **then** the card moves and both columns reindex.
```

A behavior ID is `BEH-<n>`, `<n>` a positive integer unique within *this* spec. IDs are spec-scoped — `BEH-3` in two specs are unrelated. The list is unordered deliberately: an ordered list re-renders `1. 2. 3.` alongside the IDs, leaving two competing referents for the same behavior.

**Allocation.** The next ID is one greater than the highest number ever used in this spec — counting live IDs *and* every ID listed in the `retired-behavior-ids` comment. Numbers are never reused; gaps carry no meaning.

**Tombstones.** The `<!-- retired-behavior-ids: … -->` comment sits immediately under the Behaviors heading and records every withdrawn ID. It is the allocator's memory: without it, deleting `BEH-5` and later inserting a behavior would resurrect `BEH-5` under new text.

**Revising behaviors.** Inserting a behavior at any position gives it the next unused ID and **no other behavior's ID changes** — never renumber to close a gap. Rewriting a behavior's wording *without changing which condition it governs* keeps its existing ID, so a finding already filed against that ID still resolves. If a rewrite changes *which* condition the behavior governs (different trigger, different subject), retire the old ID and mint a new one, so a citation against the old ID resolves to a tombstone rather than to unrelated text. A deleted behavior's ID is appended to `retired-behavior-ids` and is never reassigned.

Specs authored before this convention landed keep their ordinal behaviors and are **not retro-migrated**. Read a legacy spec as-is; do not mint IDs into it as a side effect of an unrelated revision.

Aim for 3-8 directly testable behavior statements.

**Preconditions and Postconditions:**
Derive from behavioral statements. Preconditions = what must be true before. Postconditions = what must be true after.

**Error Cases:**
Build an error case table (condition, expected behavior, status code). Ask:
```
→ Any additional error cases? I have: lacks permission → 403, column not found → 404, conflict → 409
```

**Constitution Reference:**
Select 2-4 relevant principles from the constitution and explain why each applies:
```
→ Any other principles I should reference? (enter to confirm)
```

**Actionable Task Map:**
Preliminary task breakdown (not the full plan — that is `/adev:plan`'s job). Table with task, description, estimated complexity.

**Acceptance Criteria:**
Concrete, checkable criteria. Every behavior maps to at least one criterion. Always include: all quality gates pass, no constitutional violations.

### Step 4.5: Infrastructure Requirements Prompt

Before writing the spec, check whether this capability touches any external systems. Ask:

```
→ Does this capability interact with any external systems (cloud APIs, databases, message queues, third-party HTTP services)?
  Examples: AWS S3, Postgres, Stripe API, SQS, Redis, BigQuery
```

**If yes:**
```
→ Which external systems? (list each, e.g. "AWS S3", "Postgres 15")
→ What env vars are needed to connect? (names only — never record actual values)
→ Is any state pre-provisioned (bucket, DB, queue) or created/destroyed by test setup?
→ What IAM / permission scope is needed? (least privilege — avoid wildcards like s3:*)
→ Should these tests be excluded from the default test run? (recommended: yes → ci_tag: integration)
```

Write the answers into the spec frontmatter as `infra_requirements:`:

```yaml
infra_requirements:
  systems:
    - name: "AWS S3"
      env_vars: [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION]
      notes: "Dedicated test account. IAM scoped to specific actions/ARNs."
  ci_tag: "integration"
```

**Security invariant:** `infra_requirements:` MUST contain only env var NAMES and human-readable guidance. Never record actual credential values, tokens, or connection strings with embedded passwords.

**If the author skips or is unsure:** write `infra_requirements: unknown` and add a comment: `# Fill in before /adev:plan — plan will warn if missing`.

**If the capability has no external systems:** proceed to Step 5 without writing the field.

### Step 5: Write the Spec

**Incremental authoring (`.partial` pattern).** Per `incremental-artifact-writes.spec.md`, the spec body MUST be authored incrementally to `<spec-path>.partial` and atomically renamed to `<spec-path>` on completion. The first authored chunk MUST begin with a `partial_schema: spec@1` marker placed in an HTML comment:

```markdown
<!-- partial_schema: spec@1 -->

---
... frontmatter ...
---

# Live Spec: ...
```

Cadence: one section (H2 boundary — Behavioral Contract, System Constitution Reference, Module Impact Map, Integration Points, Acceptance Criteria, etc.) per append. Each section, once written, is durable: a kill/crash mid-write leaves the prior sections on disk and only the in-flight section is lost.

**Runaway-write guard (PARTIAL_ARTIFACT_OVERSIZE).** Before each append, run `adev partial check-size --artifact <spec-path>` to verify the in-progress partial has not exceeded `partial_oversize_multiplier × expected` bytes (defaults: 3× max(prior spec size, 50 KB)). Exit code 2 with `PARTIAL_ARTIFACT_OVERSIZE` is a hard stop: do NOT continue appending, do NOT commit the rename, preserve the partial for inspection, surface the error.

Before writing, check for a prior `.partial`: run `adev partial inspect --artifact <spec-path>.partial`. If `partial_exists` is true and the schema marker is `spec@1`, offer the user **resume / discard / abort**. In `--auto` mode, default to resume; on a schema-mismatched marker, discard with a logged warning via `adev partial discard --artifact <spec-path>.partial --spec <spec-path>`.

After writing the final section, the atomic rename `commit` step finalises the artifact. Use the CLI verb to drive this — SKILL.md stays markdown-only per the `cli-driver-surface` charter (no inline Node).

1. Generate slug: lowercase, kebab-case, no special characters.
2. **Resolve the template via `resolveTemplate('spec', kind, domain)`.** Call `resolveTemplate` from `<ADEV_ROOT>/lib/template-resolution.mjs`, passing the kind selected in Step 3.5 as the second argument and the active domain from `resolveDomain(...)` (loaded in Step 2) as the third. Use the returned absolute path as the template body. **Do not hardcode a template filename.** This replaces the previous fall-back-to-`spec-template.behavioral.md` behavior for new specs.

   ```javascript
   import { resolveTemplate } from '<ADEV_ROOT>/lib/template-resolution.mjs';
   const templatePath = await resolveTemplate('spec', kind, domain.resolved_domain ?? null);
   const templateBody = readFileSync(templatePath, 'utf8');
   ```

   **Error handling:**
   - If `resolveTemplate` throws `TEMPLATE_NOT_FOUND`: fail with a diagnostic listing the attempted paths (the error's `attempted` array). Suggest checking that the bundled `templates/spec-template.<kind>.md` exists or that the domain extension provides the matching override.
   - If `resolveTemplate` throws `UNSAFE_TEMPLATE_PATH`: fail with the offending path (the error's `offendingPath` field). This indicates a symlink or path-traversal escape and must be reported to the user verbatim — do not silently fall back.
   - If `resolveTemplate` throws `INVALID_KIND` or `INVALID_LAYER`: re-run Step 3.5; this indicates the kind value was corrupted between resolution and write.

3. Set frontmatter per shared section (including milestone inheritance). Additionally set:
   - `kind: <chosen value>` — **explicit, no defaulting at write time.** Write the value resolved in Step 3.5 verbatim. Specs authored after Layer 1 must carry an explicit `kind:` field — read-time defaulting applies only to legacy specs that pre-date this taxonomy.
   - `revision: 1`
   - `charter-revision: <the parent charter's current revision value>`
   - `updated: <today's date YYYY-MM-DD>`
   - (Optional) Ask the user if there is an external tracker reference. If so, add `tracker-ref: <value>` to frontmatter.
4. Save location:
   - **Workspace mode:** Save to workspace `.context-index/specs/features/<module>/<spec-slug>.spec.md`. Include `target-repo: <slug>` (or `target-repo: workspace`) in the YAML frontmatter.
   - **Repo mode / single-repo:** Save to `.context-index/specs/features/<module>/<spec-slug>.spec.md` as before. No `target-repo:` field.
5. **Update charter Capability Map:** Read the parent charter, find the capability row that this spec covers in the Capability Map table, and update its `Status` column to `specified`.

### Step 5.5: Update Spec Status

> Legal status values are defined in `lib/spec-status.mjs::SPEC_STATUSES`. The
> `adev/status-enum-legal` diagnostic enforces this enum at write time.

After saving the spec:

1. Read the spec file you just created
2. Parse the YAML frontmatter
3. Update the `status` field to `review-pending`
4. Write the file back with the updated status

Example:
```
---
charter: task-boards
status: review-pending
milestone: v1
created: 2026-03-24
---
```

### Step 5.6: Create Feature Work Item

After Step 5.5 flips the spec status to `review-pending`, bind the spec to a Feature work item on the issue board. This step is **idempotent**: re-running `/adev:specify` on an existing spec updates the Feature rather than creating a duplicate.

#### 5.6-0: Guard — tasks.backend

Check `manifest.yaml` for a `tasks.backend` entry. If absent, skip this entire step silently and add a one-line note to the Step 6 Summary output:

```
Issue board not configured; skipping Feature work item creation.
```

#### 5.6-1: Look Up Issue Manager

Call `getIssueManager(manifest)` to obtain the configured issue board adapter.

#### 5.6-2: Idempotency Check

Query the issue board for any existing item where `spec_ref` equals the absolute path of the spec file just written (e.g., `.context-index/specs/features/<module>/<spec-slug>.spec.md`). If exactly one Feature already exists with that `spec_ref`, skip creation and **update** it (refresh `next_action` and `updated`) — do not create a duplicate. If multiple items share the same `spec_ref`, update the most recently created one and log a warning.

#### 5.6-3: Resolve Parent Epic

Query the issue board for items with `type: "epic"` whose `notes` field begins with the literal string `"Charter: <module-slug>"` (where `<module-slug>` is the charter module name, e.g., `"Charter: task-boards"`). This convention is established when `/adev:plan --feature <module>` creates the Epic.

- If exactly one matching Epic is found → use its `id` as `parent_id`.
- If multiple matching Epics are found → use the most recently updated one and log a warning.
- If zero matching Epics are found → create the Feature as a root item (no `parent_id`). A later `/adev:plan --feature <module>` invocation can create the Epic and re-parent the Feature.

#### 5.6-4: Build Feature Fields

Assemble the Feature work item fields:

| Field | Value |
|-------|-------|
| `title` | Copied from the spec's `# Live Spec: <title>` heading |
| `type` | `"feature"` |
| `spec_ref` | Absolute path to the spec file |
| `next_action` | `"Run /adev:review-specs --module <module>"` (for `review-pending` status) |
| `parent_id` | Resolved Epic ID from 5.6-3, or absent for root |
| `notes` | `"Bound 1:1 to spec at <spec_ref>. Created by /adev:specify on <date>."` |

#### 5.6-5: Create or Update

Call `getIssueManager(manifest).create({ title, type: "feature", spec_ref, next_action, parent_id, notes })` (or update if the idempotency check in 5.6-2 found an existing Feature).

**Board granularity invariant.** The Feature work item carries `spec_ref` only. It MUST NOT carry `planRef` or `planTask` — those fields belong to the lifecycle event log (`plan_task` events), not to the issue board. The `JsonAdapter` rejects `create()` calls that include both `planRef` and `planTask` with `BOARD_GRANULARITY_VIOLATION`. See `agent-reliable-state-artifacts/charter.md`.

If the issue board adapter throws, log the error to the summary output but **do not block** spec completion — the spec is already written and status is already `review-pending`.

#### 5.6 — Mode Variants

**Cross-cutting specs** (`--cross-cutting`): The spec file lives at `.context-index/specs/cross-cutting/<slug>.spec.md`. Skip the Epic lookup (5.6-3) — cross-cutting specs have no module Epic. Create the Feature with `parent_id` absent and append to `notes`: `"Cross-cutting spec. Affects: <affects-list from frontmatter>."`.

**Refactor specs** (`--refactor`): Create the Feature with `type: "feature"` (refactors are still Features in the model). Append to `notes`: `"Refactoring spec. Review migration steps before planning."` and include a note in `next_action` referencing the migration steps if applicable.

**Backfill (legacy specs)**: If `/adev:specify` is re-invoked on a spec file that was authored before this step landed (no bound Feature), Step 5.6-2 will find no existing Feature and 5.6-5 will create one. No automatic migration sweep — Features are created lazily as specs are touched.

### Step 6: Summary

Output path, charter, status, counts of behaviors/error cases/tasks/acceptance criteria, and next steps. Include any notes from Step 5.6 (Feature created/updated, skipped, or failed).

Emit the lifecycle exit event with an explicit `--verdict PASS`. Downstream gates (`/adev:review-specs::adev gate require`) require the prior step to have completed with a passing verdict; omitting it forces the operator to re-emit the event manually. The `specify` step has no failure path that reaches this point (the spec was written, status set to `review-pending`, Feature work item created or skipped), so success implies PASS.

```bash
adev report --type step --spec <spec-path> --step specify --status completed --verdict PASS --from-summary
```

---

## Extract Mode (`--extract`)

For brownfield codebases. Reads existing source code and produces a "snapshot spec" that captures current behavior. Documents what IS, not what SHOULD BE.

### Step 0: Lifecycle entry event

Emit the entry event from the Shared: Lifecycle Events section before any other action in this mode.

### Step 1: Resolve Charter

Use the shared Resolve Charter section above.

### Step 2: Identify Code to Extract

If the user provides a module name, scan the codebase for associated files using the charter's file references, directory conventions, and `platform-context.yaml`. If the user provides specific file paths, use those directly.

```
Analyzing module: user-management

Found relevant files:
  src/app/api/users/route.ts          (API routes, 142 lines)
  src/lib/auth/permissions.ts          (Permission checks, 89 lines)
  src/components/user-profile.tsx      (Profile UI, 201 lines)

→ Extract a spec from all of these, or select specific files? (all / select)
```

### Step 3: Read and Analyze Code

Read each selected file. For each, identify:
- Public interface (exports, API endpoints, component props)
- State mutations (database writes, state updates, side effects)
- Error handling (try/catch, error responses, validation)
- Dependencies (imports, external services, database queries)

### Step 4: Generate Snapshot Spec

Produce a Live Spec where:

- **Behavioral Contract** describes observed behavior. Use comment: `<!-- Extracted from existing code. Describes current behavior as of YYYY-MM-DD. -->`
- **Behaviors** are derived from code paths. Each public function or API endpoint becomes one or more behavior statements. Render them with behavior IDs exactly as standard mode's *Step 4: Interactive Spec Authoring* describes: an unordered list, each item opening with a bolded `BEH-<n>`, under a `<!-- retired-behavior-ids: (none) -->` comment.
- **Error Cases** come from existing error handling code. Flag unhandled cases:
  ```
  | Missing auth token | Returns 401 | 401 |
  | Invalid user ID | ⚠ UNHANDLED — throws raw Prisma error | 500 |
  ```
- **Actionable Task Map** is replaced with a **Coverage Gaps** section:
  ```
  ## Coverage Gaps
  - No rate limiting on user creation endpoint
  - Permission checks bypass for admin role is implicit, not tested
  - Profile image upload has no size validation
  ```
- **Constitution Reference** flags observed violations:
  ```
  - "All database queries use parameterized statements" — ✓ Compliant
  - "Error responses use standard error envelope" — ⚠ VIOLATION: /api/users/[id] returns raw error strings
  ```

Add `mode: extract` and `extracted-from: [<file list>]` to frontmatter per the shared section.

Load context per the shared section above. Save to `.context-index/specs/features/<module>/<spec-slug>.spec.md`.

### Step 4.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 5: Summary

Emit the lifecycle exit event from the Shared: Lifecycle Events section (`--status completed --verdict PASS`).

Output the shared summary template with these stats:
```
  Extracted from: <N> files (<N> lines analyzed)
  Behaviors documented: <count>
  Error cases: <count> (<N> unhandled)
  Coverage gaps: <count>
  Constitutional violations: <count>

  This spec captures current behavior. It does NOT prescribe changes.
  To plan improvements, use:
  - /adev:specify --refactor <module> (for structural changes)
  - /adev:specify <module> (for new capabilities)
```

---

## Refactor Mode (`--refactor`)

Produces a refactoring spec with current state analysis, target state definition, a step-by-step migration path, and invariants.

### Step 0: Lifecycle entry event

Emit the entry event from the Shared: Lifecycle Events section before any other action in this mode.

### Step 1: Resolve Charter

Use the shared Resolve Charter section above.

### Step 2: Load Context and Identify Scope

Load context per the shared section above. Ask the user:

```
→ What code do you want to refactor? (module, files, or describe the area)
→ What is the problem with the current code?
→ What should the code look like after refactoring?
```

### Step 3: Analyze Current State

Read the identified code. Build the Current State section:

- **Structure table:** file, role, line count, notes
- **Problems:** specific, measurable issues (e.g., "`processOrder` is 340 lines with cyclomatic complexity of 28, handling 4 unrelated concerns.")
- **Dependencies:** what other code relies on code being refactored — these are migration constraints.

If an extract spec already exists for this module, load it instead of re-analyzing.

### Step 4: Define Target State

Based on user description and analysis:

- **Structure table:** target file layout with roles
- **Improvements:** how each problem from Current State is resolved

Validate the target state against the constitution. Flag violations:

```
⚠ Your target state introduces a direct database call from a UI component.
  This violates: "Database access only through server actions or API routes."

→ Revise the target state, or note this as a constitutional exception?
```

### Step 5: Build Migration Path

Each migration step must be independently deployable, have clear verification criteria, include risk assessment, and follow safe ordering (extract before modify, tests before refactor).

Use the template at `${CLAUDE_PLUGIN_ROOT}/templates/spec-template.refactor.md`.

```
Proposed migration path (4 steps):

  Step 1: Extract shared validation logic
    Move validation into validators/order-validators.ts.
    Risk: Low — pure extraction, no behavior change.
    Verify: All existing order tests pass.

  Step 2: Split processOrder into pipeline stages
    Break into: validate → enrich → persist → notify.
    Risk: Medium — behavior must remain identical.
    Verify: Existing tests pass + new unit tests per stage.

  Step 3: Add integration test for the full pipeline
    Risk: Low — adding tests only.

  Step 4: Update entry points to use the pipeline
    Risk: Medium — all callers must be updated.
    Verify: All tests pass, no remaining references to old function.

→ Does this migration path look right? (yes / reorder / add step / remove step)
```

### Step 6: Define Invariants

Invariants are properties that must remain true at every migration step. Always include:

- All existing tests continue to pass at every step
- Public API contracts do not change (unless the spec explicitly permits it)
- No data loss or corruption during migration

Ask for domain-specific invariants:

```
→ Any additional invariants? For example:
  - "Response times must stay under 200ms"
  - "The audit log format must not change"
```

### Step 7: Write Behavioral Contract and Spec

Define the target behavior (what the system does AFTER refactoring). This gives `/adev:validate` something to verify against.

1. **Resolve kind first** (apply Step 3.5 of Standard mode if not already supplied): if `--kind` was not passed, prompt with the ask-first menu. The natural pairing for a refactor workflow is `--kind refactor`, but any kind is permitted — the workflow and kind axes are orthogonal.
2. **Resolve the template via `resolveTemplate('spec', kind, domain)`** (see Standard mode Step 5). Do not hardcode the template filename. Handle `TEMPLATE_NOT_FOUND` and `UNSAFE_TEMPLATE_PATH` the same way Standard mode does.
3. Set frontmatter per the shared section with `mode: refactor` AND an explicit `kind: <chosen value>` field (no defaulting).
4. Save to `.context-index/specs/features/<module>/<spec-slug>.spec.md`.

### Step 7.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 8: Summary

Emit the lifecycle exit event from the Shared: Lifecycle Events section (`--status completed --verdict PASS`).

Output the shared summary template with these stats:
```
  Current state: <N> files, <N> problems identified
  Target state: <N> files (<N> new, <N> modified, <N> unchanged)
  Migration steps: <count>
  Invariants: <count>
  Behaviors: <count>
  Acceptance criteria: <count>

  Review the migration path carefully — this is the highest-risk section.
```

---

## From-Diff Mode (`--from-diff`)

Generates a retroactive Live Spec from a git diff or PR. Useful for documenting work done before adev was adopted, or hotfixes that skipped the spec milestone.

### Step 0: Lifecycle entry event

Emit the entry event from the Shared: Lifecycle Events section before any other action in this mode.

### Step 1: Identify the Diff

1. If no argument: use `git diff --cached`, or if nothing staged, `git diff`.
2. If a commit range (e.g., `HEAD~3..HEAD`): use `git diff <range>`.
3. If a branch name: diff against main: `git diff main..<branch>`.
4. If a PR number: fetch the PR diff.

```
Analyzing diff...

Changes:
  Modified: src/app/api/tasks/route.ts (+45, -12)
  Created:  src/lib/tasks/priority-engine.ts (+89)
  Modified: prisma/schema.prisma (+8)

Total: 3 files, 142 additions, 12 deletions

→ Generate a retroactive spec for these changes? (yes / narrow scope / cancel)
```

### Step 2: Resolve Charter

Analyze the changed files to determine which module they belong to. Match against existing charters. If changes span multiple modules:

```
These changes touch 2 modules:
  - task-boards (3 files)
  - notifications (1 file)

→ Create one spec under task-boards? Or separate specs per module?
```

### Step 3: Analyze the Diff

Load context per the shared section above. Read the full diff content. For each changed file, identify:
- Behavior added (new functions, endpoints, UI elements)
- Behavior modified (changed logic, updated validation)
- Behavior removed (deleted functions, removed endpoints)

### Step 4: Generate Retroactive Spec

Produce a Live Spec where:

- **Behavioral Contract** describes behavior as it exists after the diff.
- **Behaviors** map to changes in the diff — each significant code change becomes a behavior statement. Render them with behavior IDs exactly as standard mode's *Step 4: Interactive Spec Authoring* describes: an unordered list, each item opening with a bolded `BEH-<n>`, under a `<!-- retired-behavior-ids: (none) -->` comment.
- **Error Cases** extracted from new or modified error handling.
- **Actionable Task Map** replaced with **Changes Summary**:
  ```
  ## Changes Summary
  | File | Change Type | Description |
  |------|------------|-------------|
  | src/lib/tasks/priority-engine.ts | Created | New priority scoring algorithm |
  | src/app/api/tasks/route.ts | Modified | Added priority field to task creation |
  ```
- **Acceptance Criteria** use checked boxes for existing behaviors, unchecked for missing:
  ```
  - [x] Priority field accepted on task creation
  - [ ] Priority validation (no validation found in diff — may be missing)
  - [ ] Test coverage for priority engine (no tests found in diff)
  ```

Set frontmatter per the shared section with `mode: from-diff` and `diff-source`. Save to `.context-index/specs/features/<module>/<spec-slug>.spec.md`.

### Step 4.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 5: Summary

Emit the lifecycle exit event from the Shared: Lifecycle Events section (`--status completed --verdict PASS`).

Output the shared summary template with these stats:
```
  Diff source: <source>
  Files analyzed: <count>
  Behaviors documented: <count>
  Gaps identified: <count> (details)

  This spec documents existing changes. Review the gaps — they may
  need follow-up specs or immediate fixes.
```

---

## Cross-Cutting Mode (`--cross-cutting`)

Produces specs for concerns spanning multiple features: authentication, error handling, API versioning, logging, etc.

### Step 0: Lifecycle entry event

Emit the entry event from the Shared: Lifecycle Events section before any other action in this mode. Note that for cross-cutting specs, the `--spec` path is `.context-index/specs/cross-cutting/<slug>.spec.md`, not `.context-index/specs/features/<module>/<slug>.spec.md`.

### Step 1: Prerequisites

Cross-cutting specs do not require a Feature Charter. They require:
- `.context-index/constitution.md` (mandatory)
- `.context-index/specs/product.md` (recommended, for module awareness)

### Step 2: Identify the Concern

```
→ What cross-cutting concern do you want to spec?
  Examples: authentication flow, error handling, API versioning,
  logging/observability, rate limiting, caching strategy

→ Which modules does this concern touch? (all / list specific modules)
```

### Step 3: Load Affected Charters

Load context per the shared section above (constitution, product charter). If specific modules are named, load their charters. Identify existing references to the concern.

### Step 4: Interactive Spec Authoring

Same process as standard mode (behavioral contract, constitution reference, task map, acceptance criteria), with these additions:

**Module Impact Map:**
```
| Module | Impact | Changes Required |
|--------|--------|-----------------|
| task-boards | High | Add auth checks to all task mutations |
| user-management | Medium | Expose permission API for other modules |
| notifications | Low | Read-only, only needs auth token validation |
```

**Integration Points:**
```
1. task-boards ↔ auth: Task mutations call checkPermission(userId, boardId, 'edit') before writes.
2. notifications ↔ auth: Notification reads validate session token via middleware.
3. user-management ↔ auth: Canonical permission definitions live here. Other modules import.
```

### Step 5: Write the Spec

1. **Resolve kind first** (apply Step 3.5 of Standard mode): if `--kind` was not passed, prompt with the ask-first menu. Any kind is permitted; the workflow and kind axes are orthogonal.
2. **Resolve the template via `resolveTemplate('spec', kind, domain)`** (see Standard mode Step 5). Do not hardcode the template filename. Handle `TEMPLATE_NOT_FOUND` and `UNSAFE_TEMPLATE_PATH` the same way Standard mode does.
3. Add Module Impact and Integration Points after the standard template sections.
4. Set frontmatter per the shared section with `mode: cross-cutting`, `affects: [<modules>]` instead of `charter:`, AND an explicit `kind: <chosen value>` field (no defaulting).
5. Save to `.context-index/specs/cross-cutting/<spec-slug>.spec.md`.

### Step 5.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 6: Summary

Emit the lifecycle exit event from the Shared: Lifecycle Events section (`--status completed --verdict PASS`). The spec path is `.context-index/specs/cross-cutting/<slug>.spec.md`.

Output the shared summary template with these stats:
```
  Affects: <N> modules
  Behaviors: <count>
  Integration points: <count>
  Acceptance criteria: <count>

  Review the module impact with each module's maintainer.
```

---

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

## Amend Mode (`--amend <base-spec>`)

Seventh workflow axis. Scaffolds a **new co-located amendment** of an already-shipped (validated) base spec **without editing the base in place**. This formalizes the ad-hoc `<base>-rev-N-<descriptor>.spec.md` pattern into a governed relationship field plus a scaffolding verb.

**Distinct from `--revise`:** `--revise` bumps a *not-yet-shipped, review-blocked* spec in place (N → N+1, clears `.blockers.md`). `--amend` produces a *new artifact* that amends a *shipped/validated* spec while keeping the base immutable.

**Preconditions:**

1. The base spec exists on disk and ends with `.spec.md`.
2. The base is resolvable within the project root.

**Steps:**

1. **Resolve the descriptor.** `<descriptor>` is a kebab-case slug naming the amendment (e.g., `drop-coupon-field`). If the author did not supply `--descriptor`, prompt for it:

   ```
   → Descriptor for this amendment (kebab-case, e.g. drop-coupon-field):
   ```

   The descriptor is sanitized by the CLI verb against a strict kebab-case allowlist (SEC-1); illegal or path-traversal values are rejected with `INVALID_AMENDMENT_DESCRIPTOR`.

2. **Run the CLI verb** that does the amend work:

   ```bash
   adev specify amend --spec <base-spec> [--descriptor <slug>] [--kind <kind>] [--target-revision <N>]
   ```

   The verb wraps `lib/specify-amend.mjs::amendSpec` and:
   - Computes the co-located path `<base-dir>/<base-stem>-rev-<target>-<descriptor>.spec.md`.
   - Writes frontmatter `amends: <base path>`, `target-revision: <N>`, an inherited/overridable `kind:`, `revision: 1`, `status: review-pending` (keeps the `.spec.md` extension).
   - Sets `target-revision` to `base.revision + 1` by default; an explicit `--target-revision` must be strictly greater than the base revision, else `INVALID_TARGET_REVISION`.
   - Writes the amendment atomically (temp-then-rename) and never modifies the base spec.
   - Emits a `spec_amended` lifecycle event on the **base** spec's log carrying `{ amendment_slug, amendment_path, target_revision }`.

3. **Path containment (SEC-1):** the CLI verb re-asserts `assertWithin(projectRoot, specPath)` and rejects path-traversal with `INVALID_SPEC_PATH`. The skill MUST NOT pre-validate paths.

4. **Kind contract:** `--kind amendment` is rejected with the closed-enum `INVALID_KIND` — amendment is the `amends:` relationship overlay, not a kind.

5. **Mutual-exclusion contract:** combining `--amend` with any of `--revise`, `--extract`, `--refactor`, `--from-diff`, or `--cross-cutting` exits non-zero with `CONFLICTING_FLAGS`.

6. **Report** the result to the user (read from the verb's JSON stdout):

   ```
   Amended <base-spec>: new amendment <amendment-path> targeting rev <N>
   Next step: run /adev:review-specs --spec <amendment-path> to review the amendment.
   ```

**Error cases:**

| Condition | CLI exit | Error code | Action |
|-----------|----------|------------|--------|
| Base spec missing on disk | 1 | `INVALID_AMENDMENT_BASE` | Stop; report the missing base |
| Path traversal or spec outside `projectRoot` | 1 | `INVALID_SPEC_PATH` | Stop; report the malformed path |
| Illegal / traversal descriptor | 1 | `INVALID_AMENDMENT_DESCRIPTOR` | Re-prompt for a kebab-case descriptor |
| `--target-revision` ≤ base `revision:` | 1 | `INVALID_TARGET_REVISION` | Stop; report; the target must be strictly greater |
| `--kind amendment` supplied | 1 | `INVALID_KIND` | Stop; amendment is not a kind |
| Combining `--amend` with another workflow flag | 1 | `CONFLICTING_FLAGS` | Stop; report which flags conflict |

**Constitution alignment:** The skill names the CLI verb (`adev specify amend`) and contains no inline Node — all amend control flow (base resolution, target-revision computation, descriptor sanitization, event emission) lives in `lib/specify-amend.mjs` per the `cli-driver-surface` charter. The library uses only Node.js built-ins.

---

## Constitution Validation (All Modes)

Before writing any spec, scan the constitution for conflicts:

1. Read `.context-index/constitution.md`.
2. Check that the proposed spec does not contradict any principle.
3. If a conflict is found:

```
⚠ Constitutional conflict detected:

  Your spec proposes direct client-side database queries.
  Constitution principle: "All database access goes through server actions."

  Options:
  1. Revise the spec to comply with the constitution
  2. Propose a constitutional amendment (creates an ADR draft)
  3. Proceed with an explicit exception (noted in spec frontmatter)

→ Your choice?
```

If option 2, create an ADR draft at `.context-index/adrs/NNNN-<title>.md` and note the pending ADR in the spec. If option 3, add `constitutional-exception: "<principle text>"` to frontmatter.

## Duplicate Detection (All Modes)

Before creating a spec, check existing specs in the target directory:

1. Read all `.md` files in the target directory.
2. Compare the proposed spec title and behavioral contract against existing specs.
3. If a potential duplicate is found:

```
⚠ Possible duplicate:

  Existing spec: drag-and-drop-reordering.md (status: draft)
  Your new spec: card-position-management.md

  The behavioral contracts overlap significantly.

  Options:
  1. Extend the existing spec instead
  2. Create a new spec anyway (different scope)
  3. Cancel

→ Your choice?
```

## API reference

Lifecycle event log:

- `reportStep(projectRoot, specPath, { step: "specify", status })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits a `lifecycle_step` event at skill entry (`status: "started"`) and exit (`status: "completed"`). This skill does not carry severity, gate, or board adoption beyond `reportStep`.

Issue board:

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active adapter for Feature work-item binding (Step 5.6). The Feature carries `spec_ref` only; `planRef` / `planTask` belong to the lifecycle log.
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.

## Next Step in the Lifecycle

Spec authored. The next step is **`/adev:review-specs`** — architecture review before planning.

If invoked via `/adev:work`, offer to continue: *"Spec ready. Continue to `/adev:review-specs`?"* The user can stop here.
