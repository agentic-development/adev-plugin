---
name: adev:specify
description: "Author Live Specs within a Feature Charter's scope. Supports modes for new features, extraction from existing code, refactoring, diff-driven changes, and cross-cutting concerns. Use when the user says 'write a spec', 'define the behavior', 'create a contract', 'specify the feature', or needs to formalize requirements into a behavioral specification before planning. In OpenCode, invoke with skill({ name: 'adev:specify' })"
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

How the skill decides it is running at a multi-repo workspace root, and what changes when it is.

> **Conditional loading:** Read `skills/specify/references/shared/workspace-mode-detection.md` for the full instructions. Do not act on this section from the summary above.

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

The lifecycle events every mode emits, and their required payload fields.

> **Conditional loading:** Read `skills/specify/references/shared/lifecycle-events.md` for the full instructions. Do not act on this section from the summary above.

## Standard Mode (default)

The default path: author a new Live Spec inside an existing Feature Charter. Runs when no mode flag is passed.

> **Conditional loading:** Read `skills/specify/references/modes/standard-mode.md` for the full instructions. Do not act on this section from the summary above.

## Extract Mode (`--extract`)

Snapshot a spec from code that already exists. Runs only with --extract.

> **Conditional loading:** Read `skills/specify/references/modes/extract-mode.md` for the full instructions. Do not act on this section from the summary above.

## Refactor Mode (`--refactor`)

Spec a migration from a current state to a target state. Runs only with --refactor.

> **Conditional loading:** Read `skills/specify/references/modes/refactor-mode.md` for the full instructions. Do not act on this section from the summary above.

## From-Diff Mode (`--from-diff`)

Author a retroactive spec from a diff. Runs only with --from-diff.

> **Conditional loading:** Read `skills/specify/references/modes/from-diff-mode.md` for the full instructions. Do not act on this section from the summary above.

## Cross-Cutting Mode (`--cross-cutting`)

Spec a concern that spans several charters. Runs only with --cross-cutting.

> **Conditional loading:** Read `skills/specify/references/modes/cross-cutting-mode.md` for the full instructions. Do not act on this section from the summary above.

## Revise Mode (`--revise <spec-path>`)

Revise an existing spec in place, bumping its revision. Runs only with --revise.

> **Conditional loading:** Read `skills/specify/references/modes/revise-mode.md` for the full instructions. Do not act on this section from the summary above.

## Amend Mode (`--amend <base-spec>`)

Author a first-class amendment carrying amends: + target-revision:. Runs only with --amend.

> **Conditional loading:** Read `skills/specify/references/modes/amend-mode.md` for the full instructions. Do not act on this section from the summary above.

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
