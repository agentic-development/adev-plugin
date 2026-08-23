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

**Domain-Aware Authoring Guidance:** Load illustrative examples for the Behaviors and Error Cases prompts below:

```bash
adev domain load-guidance --module <charter-module> [--charter <charter-path>]
```

Reuse the same `--module`/`--charter` values resolved for `adev domain resolve` earlier in this skill (Step 2). Stdout is a JSON object whose `guidance` field is either a markdown string or `null`.

- If `guidance` is non-null, render its content as the source of illustrative examples for both the Behaviors and Error Cases prompts below, in place of any hardcoded example.
- If `guidance` is `null`, print: *"No domain-specific authoring guidance available for this project; falling back to generic prompts."* and use domain-neutral generic prompts (no HTTP status codes, no drag-and-drop language) for both prompts.

**Behavioral Contract:**
Ask focused questions: what triggers this behavior, expected outcomes, failure scenarios. Write behaviors as an **unordered** list, each item opening with a bolded behavior ID, in the **When...then** format:

```markdown
### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** <trigger> **then** <outcome>.
- **BEH-2** — **When** <trigger> **then** <outcome>.
```

Draw the illustrative Behaviors example from the loaded guidance above, or ask generically if none was loaded (no HTTP status codes, no drag-and-drop UI language in the fallback).

A behavior ID is `BEH-<n>`, `<n>` a positive integer unique within *this* spec. IDs are spec-scoped — `BEH-3` in two specs are unrelated. The list is unordered deliberately: an ordered list re-renders `1. 2. 3.` alongside the IDs, leaving two competing referents for the same behavior.

**Allocation.** The next ID is one greater than the highest number ever used in this spec — counting live IDs *and* every ID listed in the `retired-behavior-ids` comment. Numbers are never reused; gaps carry no meaning.

**Tombstones.** The `<!-- retired-behavior-ids: … -->` comment sits immediately under the Behaviors heading and records every withdrawn ID. It is the allocator's memory: without it, deleting `BEH-5` and later inserting a behavior would resurrect `BEH-5` under new text.

**Revising behaviors.** Inserting a behavior at any position gives it the next unused ID and **no other behavior's ID changes** — never renumber to close a gap. Rewriting a behavior's wording *without changing which condition it governs* keeps its existing ID, so a finding already filed against that ID still resolves. If a rewrite changes *which* condition the behavior governs (different trigger, different subject), retire the old ID and mint a new one, so a citation against the old ID resolves to a tombstone rather than to unrelated text. A deleted behavior's ID is appended to `retired-behavior-ids` and is never reassigned.

Specs authored before this convention landed keep their ordinal behaviors and are **not retro-migrated**. Read a legacy spec as-is; do not mint IDs into it as a side effect of an unrelated revision.

Aim for 3-8 directly testable behavior statements.

**Preconditions and Postconditions:**
Derive from behavioral statements. Preconditions = what must be true before. Postconditions = what must be true after.

**Error Cases:**
Build an error case table (condition, expected behavior, status code). Draw the illustrative Error Cases example from the loaded guidance above, or ask generically if none was loaded:
```
→ Any additional error cases?
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

**Incremental authoring (`.partial` pattern).** Per `incremental-artifact-writes.spec.md`, the spec body MUST be authored incrementally to `<spec-path>.partial` and atomically renamed to `<spec-path>` on completion. The first authored chunk MUST carry a `partial_schema: spec@1` marker as a **YAML frontmatter key**, so the `---` delimiter stays the first non-blank line:

```markdown
---
partial_schema: spec@1
... rest of frontmatter ...
---

# Live Spec: ...
```

Do NOT put the marker in an HTML comment above the frontmatter. `adev/frontmatter-present` (severity: **error**, `.context-index/governance/diagnostics.yaml`) requires the first non-blank line of a `.spec.md` to be `---`, and the marker survives the atomic rename into the final artifact — anything above the frontmatter makes every spec you author violate an error-severity diagnostic on write. The frontmatter key satisfies SA-6 ("marker in the first authored chunk") because the frontmatter *is* the first chunk, and `adev partial inspect` reads it unchanged: its scan matches the `partial_schema: <marker>` token anywhere in the first 4 KB, regardless of surrounding syntax. Leave the key in place on the final artifact — it is the resume contract, not scaffolding.

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
