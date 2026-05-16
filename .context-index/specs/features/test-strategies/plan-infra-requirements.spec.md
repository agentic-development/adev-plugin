---
charter: test-strategies
status: validated
revision: 2
charter-revision: 2
created: 2026-04-27
updated: 2026-04-27
source-manifest:
  files:
    - skills/plan/SKILL.md
  computed-at: "2026-05-10T23:51:01.456Z"
drift_detected: true
drift_source: skills/plan/SKILL.md
drift_at: 2026-05-16T01:02:42.713Z
---

# Live Spec: Plan Infrastructure Requirements

**Capability:** When plan decomposes a spec into tasks that require real external infrastructure for testing, it emits a consolidated "Test Infrastructure Requirements" section that explicitly lists what accounts, credentials, pre-provisioned state, and connectivity are needed — surfacing unresolved requirements for human review.

> This spec extends the `plan-integration` spec (which adds `strategy` fields to tasks). It adds an output section emitted at the plan level, derived from the strategies assigned to tasks.
>
> Behavior 5 (specify phase integration) is a cross-cutting concern that also affects the specify skill. The specify-side behavior is captured here for lifecycle coherence; implementation of the specify-skill changes must reference this spec as the authority for the `infra_requirements:` frontmatter contract.

## Behavioral Contract

### Preconditions

- The plan skill is decomposing a Live Spec into tasks (spec mode)
- Strategy assignments have been resolved per the strategy assignment protocol (plan-integration spec)
- At least one of: the spec frontmatter contains `infra_requirements:`, OR one or more tasks are assigned a strategy that implies real infrastructure (anything other than `unit`)

> **Lifecycle note:** Infrastructure requirements are ideally captured during `/adev:specify` (see Behavior 5) so that plan can read a complete `infra_requirements:` block from the spec frontmatter rather than relying on auto-detection. Auto-detection is the fallback for specs authored before this convention was adopted.

### Behaviors

**1. Infrastructure requirements section emission**

When plan produces a task list and **either** of the following is true, plan appends a `## Test Infrastructure Requirements` section to the plan output after the task table:
- The spec frontmatter contains an `infra_requirements:` field (regardless of strategy assigned)
- One or more tasks are assigned a strategy other than `unit`

When all tasks are `unit` strategy AND the spec has no `infra_requirements:` field, no infrastructure requirements section is emitted (backward compatible — no noise for pure unit-test tasks).

This trigger is intentionally strategy-agnostic: a `visual` spec that needs a running Storybook server, a `fixture` spec that needs a real BigQuery table, a `threshold` spec that needs a load-test environment — all emit the section when `infra_requirements:` is declared. The section exists to surface real operational prerequisites, not to classify test types.

**2. Per-strategy requirements derivation**

For each task with a non-unit strategy, OR for any task in a spec with `infra_requirements:` frontmatter, plan derives requirements by:

1. Loading the strategy profile for the assigned strategy (if the strategy has a defined profile)
2. Reading the `infra_requirements:` field declared in the task's associated spec frontmatter — **if present, use as authoritative source and skip step 3**
3. Auto-detecting external system dependencies from the task's file paths using path-based heuristics (e.g., files under `src/adapters/aws/` → AWS credentials likely needed; task paths matching `**/s3-client.*` → AWS S3 credentials likely needed). Detection uses file globbing only — no import scanning or content parsing.
4. Combining into a deduplicated requirements list grouped by category

When auto-detection confidence is `low`, plan emits an advisory: "⚠ Infrastructure requirements auto-detected with low confidence — review and confirm before proceeding."

**3. Requirements section format**

The emitted section follows this format:

```markdown
## Test Infrastructure Requirements

> These requirements must be satisfied before integration/infrastructure tests can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| AWS S3 | Task 1.2 (upload adapter), Task 1.4 (delete adapter) | integration |
| Postgres 15 | Task 2.1 (migration), Task 2.3 (query layer) | schema, integration |
| SQS | Task 1.3 (queue producer) | integration |

### Credentials / Environment Variables

| Variable | Required For | Where to Get It |
|----------|-------------|-----------------|
| `AWS_ACCESS_KEY_ID` | AWS S3, SQS | AWS IAM console — dedicated test account |
| `AWS_SECRET_ACCESS_KEY` | AWS S3, SQS | AWS IAM console — inject as CI secret |
| `AWS_REGION` | AWS S3, SQS | Set to your region |
| `DATABASE_URL` | Postgres (schema, integration) | Provision test DB — inject as CI secret (contains password) |

### Pre-Provisioned State

- [ ] AWS test account with IAM permissions scoped to specific actions and test resource ARNs (least privilege — avoid wildcards like `s3:*`)
- [ ] S3 bucket for integration tests (created by test setup, destroyed by teardown)
- [ ] Postgres 15 instance accessible from test runner, database `adev_test` created
- [ ] SQS queue provisioned in test account (created by test setup, destroyed by teardown)

### Connectivity

- Test runner must reach AWS service endpoints for the declared region
- Test runner must reach Postgres host on port 5432

### CI Configuration

These tests are excluded from the default `npm test` run. To execute:
```bash
# Set credentials via CI secrets, then:
npm run test:integration
# or: node --test --test-name-pattern "integration"
```

> **Local runs:** Create a `.env.test` file with credential values. This file MUST be listed in
> `.gitignore` — add `.env.test` or `.env*` if not already present. Never commit `.env.test`.
> In CI, inject credentials as secrets — never hardcode them in workflow files.

### Unresolved Requirements

If plan cannot determine requirements for any task, it emits an `### Unresolved Requirements` subsection:

| Task | Issue | Action Required |
|------|-------|-----------------|
| Task 3.1 | External system not identifiable from file paths | Declare `infra_requirements:` in the spec frontmatter or add strategy override |
```

**4. Non-blocking on unresolved requirements**

When plan detects that a task is assigned strategy `integration` but neither the spec frontmatter nor the task file paths provide enough information to determine what external systems are involved, plan emits a `PLAN_INFRA_UNKNOWN` warning for that task and marks it with `⚠ INFRA UNRESOLVED`.

Plan does NOT block entirely — it completes the task list and surfaces all unresolved items in the `### Unresolved Requirements` table so the human can provide declarations before running `/adev:implement`.

**5. Specify phase integration**

> **Cross-cutting note:** This behavior also governs the specify skill. Implementation of changes to specify SKILL.md must treat this spec as the authority for the `infra_requirements:` frontmatter contract.

When `/adev:specify` is authoring a spec for a capability that involves an external system (cloud API, database, message queue, third-party HTTP service), it prompts the author for infrastructure requirements before completing the spec:

```
→ Does this capability interact with any external systems (cloud APIs, databases, queues)?
  Examples: AWS S3, Postgres, Stripe API, SQS, Redis

If yes:
  → Which external systems? (list each)
  → What env vars are needed to connect? (names only — never record actual values)
  → Is any state pre-provisioned (bucket, database, queue) or created by tests?
  → What IAM/permission scope is needed? (least privilege — avoid wildcards)
  → Should these tests be excluded from the default test run? (recommended: yes)
```

Specify writes the answers into the spec frontmatter as `infra_requirements:`. If the author skips or is unsure, specify notes the field as `infra_requirements: unknown` and adds a comment: `# Fill in before /adev:plan — plan will warn if missing`.

When `infra_requirements: unknown` is present, plan emits a `PLAN_INFRA_UNKNOWN` advisory for all tasks in that spec.

**6. Spec-level infra declaration**

A Live Spec may declare infrastructure requirements explicitly in frontmatter:

```yaml
infra_requirements:
  systems:
    - name: "AWS S3"
      env_vars: [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION]
      notes: "Dedicated test account. Scope IAM to s3:PutObject, s3:GetObject, s3:DeleteObject, s3:ListBucket on test bucket ARN only."
    - name: "Postgres 15"
      env_vars: [DATABASE_URL]
      notes: "DATABASE_URL contains credentials — inject as CI secret. Test DB must be migrated before running schema tests."
  ci_tag: "integration"
  on_fail: "fail"  # Optional: 'fail' (default) or 'skip'. When 'fail', tests fail hard if infra is unavailable. 'skip' requires explicit user approval — the agent must never set this autonomously.
```

> **Security invariant:** `infra_requirements:` MUST contain only env var NAMES and human-readable guidance. Actual credential values, tokens, connection strings with embedded passwords, or any secret material MUST NOT appear in this block. It is committed to the repository as part of the spec file.

When `infra_requirements:` is present in the spec, plan uses it as the authoritative source and skips auto-detection (Behavior 2 step 3).

**7. Strategy distribution summary update**

> **Amendment note:** This behavior amends `plan-integration` Behavior 4. When this spec is active, the strategy distribution summary includes a fourth "infrastructure" column.

The strategy summary includes infrastructure requirements:

```
Strategy Distribution:
  unit        ·  8 tasks   (source: fallback)      — no external infra needed
  integration ·  4 tasks   (source: detected/high)  — requires: AWS S3, SQS, Postgres
  schema      ·  2 tasks   (source: detected/high)  — requires: Postgres
  visual      ·  1 task    (source: spec-declared)  — requires: Storybook server (from infra_requirements:)
```

### Error Cases

| Code | Trigger | Behavior |
|---|---|---|
| `PLAN_INFRA_UNKNOWN` | `infra_requirements: unknown` in frontmatter, or non-unit strategy but external systems cannot be determined | Emit warning and `INFRA UNRESOLVED` marker on task; include in Unresolved Requirements table. Do not block plan completion. |
| `PLAN_INFRA_NO_ACCOUNT` | Spec frontmatter declares a system but no env vars and no account provisioning notes | Emit advisory: "No account or credential source documented for <system>. Add to spec frontmatter or team onboarding docs." |
| `PLAN_STRATEGY_PROFILE_MISSING` | Strategy assigned but no profile exists and fallback to unit occurs | Emit advisory inherited from write-test-dispatch fallback behavior: "Profile for '<strategy>' not found — using unit profile as fallback. Infrastructure requirements section omitted for this task." |

## Constitution Reference

- **"Skills are primarily markdown"** — The infrastructure requirements section is a markdown artifact in the plan output. No new code is required to parse or generate it — the plan skill follows these instructions and renders the section inline.
- **"Minimize external dependencies"** — Requirements are derived from spec frontmatter and file path heuristics already used by the strategy detection system. No new dependencies.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add infra section to plan SKILL.md | Instruct plan to emit `## Test Infrastructure Requirements` section when non-unit strategies are present | medium |
| Implement per-strategy derivation | Load strategy profile's external system and credential fields per task; deduplicate across tasks; use frontmatter as authoritative source when present | medium |
| Add spec frontmatter `infra_requirements` field | Document the schema in the Live Spec template (not manifest-schema-extension — this field lives on spec files, not manifest.yaml) | small |
| Update strategy summary table | Add "infrastructure" column to the distribution summary, amending plan-integration Behavior 4 | small |
| Add `PLAN_INFRA_UNKNOWN` advisory | Emit unresolved requirements table for tasks where auto-detection is insufficient | small |
| Update plan-reviewer-prompt | Instruct the plan reviewer subagent to verify infrastructure requirements completeness | small |
| Add infra prompt to specify SKILL.md | Add Behavior 5 prompt to specify: detect external systems in capability description, collect infra requirements into frontmatter (names only — no actual values) | medium |

## Acceptance Criteria

- [ ] `/adev:specify` prompts for infrastructure requirements when a capability involves external systems
- [ ] Specify prompt explicitly instructs: record env var names only, never actual credential values
- [ ] Spec frontmatter `infra_requirements: unknown` triggers `PLAN_INFRA_UNKNOWN` advisory on all tasks in that spec
- [ ] Spec frontmatter `infra_requirements:` block MUST NOT contain actual credential values — plan skill warns if pattern-matched secrets are detected
- [ ] Plan emits `## Test Infrastructure Requirements` section when: the spec frontmatter contains `infra_requirements:`, OR any task has a non-unit strategy
- [ ] No infrastructure section emitted when all tasks are `unit` AND no `infra_requirements:` in spec frontmatter (backward compatible)
- [ ] Section lists: external systems (with owning tasks), required env vars, pre-provisioned state checklist, connectivity requirements, CI run command
- [ ] CI Configuration section uses `node:test`-compatible invocation (`npm run test:integration` or `--test-name-pattern`) — no `--tag` flag
- [ ] Spec frontmatter `infra_requirements` field takes precedence over auto-detection (auto-detection skipped when frontmatter present)
- [ ] Low-confidence auto-detection is flagged with an advisory
- [ ] Tasks where external systems cannot be determined appear in `### Unresolved Requirements` table
- [ ] Strategy distribution summary includes an "infrastructure" column for non-unit strategies
- [ ] Plan does not block when infra requirements are unresolved — it surfaces them for human review
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
