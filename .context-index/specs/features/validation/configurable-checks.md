# Live Spec: Configurable Validate Check Registry

---
charter: validation
status: draft
risk_level: medium
revision: 1
charter-revision: 1
created: 2026-04-19
updated: 2026-04-19
depends-on:
  - .context-index/adrs/0003-configurable-review-registry.md
  - .context-index/specs/features/unified-gates/unified-gate-system.md
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `manifest.yaml`, `constitution.md`, and (optionally) governance files.
- `governance/gates.yaml` governs Check 1 (unchanged, owned by `unified-gates` charter).
- `plugin:validate/defaults.yaml` is shipped with the plugin and encodes today's Checks 2-12.
- Checks 2-12 in `skills/validate/SKILL.md` are currently described in prose with implicit IDs; this spec formalizes them.

### Behaviors

#### Registry Loading and Merge

1. **When** `/adev:validate` runs **then** before Check 2 it calls `loadValidateConfig(repoRoot)` from `lib/governance/validate-config.mjs`. The function reads bundled defaults from `plugin:validate/defaults.yaml` first, then overlays any project-level `governance/validate.yaml`. Entries merge by `id`: a project entry with a matching `id` overrides the default field-by-field; a project entry with a new `id` is appended.

2. **When** `governance/validate.yaml` does not exist **then** the merged config equals the bundled defaults and Checks 2-12 behave identically to today's hardcoded prose. No warning is emitted.

3. **When** `governance/validate.yaml` exists and contains a `checks:` list **then** each entry is validated. Required fields: `id`, `kind`. Optional fields: `enabled` (default: `true`), `severity` (default: `error` for `quality-gate`/`subagent-review`/`deterministic-check`; `info` for `observational`), `fail_fast` (default: `false`), `tier`, `command`, `prompt`, `context_pack`, `after`.

4. **When** a check entry has `enabled: false` **then** it is skipped with note: `"Check '<id>' skipped — disabled by governance/validate.yaml"`. Skipped checks do not contribute to the overall verdict.

#### Canonical Check IDs

5. **When** bundled defaults load **then** the following IDs correspond to today's prose checks:
   - `validate.check-1.5-source-manifest` (today's Check 1.5)
   - `validate.check-2-spec-compliance`
   - `validate.check-3-charter-consistency`
   - `validate.check-4-constitution`
   - `validate.check-5-adrs`
   - `validate.check-6-cross-cutting`
   - `validate.check-7-specialist-review`
   - `validate.check-8-boundaries`
   - `validate.check-9-transition-gates`
   - `validate.check-10-platform-drift`
   - `validate.check-11-visual-verification`
   - `validate.check-12-heuristic-extraction`
   - Check 1 (quality gates) is **not** in this registry; it remains sourced from `governance/gates.yaml`.

#### Check Kinds

6. **When** a check has `kind: quality-gate` **then** it behaves like a `governance/gates.yaml` entry but runs outside the tiered gate pipeline. It executes `command` in a shell and treats exit code as PASS/FAIL. This kind exists so projects can add one-off gates that are not part of the fast/integration/e2e tier model.

7. **When** a check has `kind: subagent-review` **then** it resolves `prompt` (supporting the `plugin:<skill>/<file>` scheme from the reviewer spec) and `context_pack`, dispatches a subagent with the rendered prompt, and treats the returned verdict as PASS/FAIL/WARN. The subagent uses the Agent tool with `subagent_type: general-purpose`. This kind is how Checks 2, 3, 4, 5, 6, 7, 8, 9, 10 are migrated.

8. **When** a check has `kind: deterministic-check` **then** it runs a bundled library function (identified by `id`) that reads files and returns PASS/FAIL. Example: `validate.check-1.5-source-manifest` calls `verifyManifest(specPath)` from `lib/source-manifest.mjs`. Projects may not add new `deterministic-check` entries in v1 — this kind is reserved for bundled defaults that wrap library calls.

9. **When** a check has `kind: observational` **then** it runs but never affects the verdict. Its output is attached to the report under "Observations." Example: `validate.check-12-heuristic-extraction` is observational — it extracts heuristics for future retrieval but never blocks.

10. **When** a check has `kind` not in `{quality-gate, subagent-review, deterministic-check, observational}` **then** load fails with error: `"Check '<id>': unknown kind '<value>'."`

#### Ordering and `after`

11. **When** all checks are loaded **then** they are topologically sorted: each check runs after any check named in its `after` field. Default checks declare `after` to preserve current ordering (e.g. `validate.check-3-charter-consistency` has `after: [validate.check-2-spec-compliance]` for reporting purposes, though execution is not strictly sequential for non-dependent checks).

12. **When** two checks' `after` fields form a cycle **then** load fails with error: `"Check ordering cycle detected: <a> -> <b> -> <a>"`.

13. **When** a check references an `after` ID that does not exist (after merge) **then** load emits WARN and treats the `after` as empty: `"Check '<id>': 'after' references unknown check '<ref>' — ignored."`

#### Fail-Fast and Severity

14. **When** Check 1 (quality gates) fails with error severity **then** today's behavior is preserved: Checks 2-10 are skipped, Check 11 still runs per its UI trigger rules, Check 12 is skipped. This is enforced in `skills/validate/SKILL.md`, not by the registry.

15. **When** a registry check has `fail_fast: true` and fails with `severity: error` **then** all checks that declare it in their `after` chain are skipped with note: `"Skipped — prerequisite '<id>' failed."`

16. **When** a registry check has `severity: warning` **then** a failure records WARN in the report but does not trigger fail-fast or affect the verdict (verdict degrades to PASS_WITH_NOTES).

17. **When** a registry check has `severity: info` **then** any output is informational only (used for observational kinds).

#### Prompt and Context Pack (for `subagent-review`)

18. **When** a `subagent-review` check resolves its `prompt` field **then** the same resolution rules as reviewers apply: `plugin:<skill>/<file>` maps into the plugin `skills/` tree; project-relative paths resolve from `.context-index/`; absolute paths are rejected.

19. **When** a `subagent-review` check references a `context_pack` **then** it is resolved via the same context pack machinery used by reviewers (`lib/governance/context-pack.mjs`). Context packs defined in `governance/review.yaml` and `governance/validate.yaml` are merged into a single namespace; duplicate names cause load WARN with second definition winning.

#### Registry Emission in Report

20. **When** `/adev:validate` completes **then** the report's check summary lists every registered check by ID, its status (PASS/FAIL/WARN/SKIP/SKIPPED-DISABLED), its kind, and (for `subagent-review`) the prompt source path.

### Postconditions

- Verdict computation is unchanged: FAIL on any `severity: error` failure, PASS_WITH_NOTES on warnings-only, PASS if all checks pass or skip. Observational checks never contribute.
- Projects without `governance/validate.yaml` see identical output to today's flow (modulo the new summary table, which may add an extra section).
- The `defaults.yaml` file is the single source of truth for bundled check behavior; prose in SKILL.md references the registry rather than re-describing each check.

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `governance/validate.yaml` malformed YAML | Load fails with line-cited parse error. Skill exits non-zero before running any check beyond Check 1. |
| `subagent-review` check missing `prompt` field | Load fails with error: `"Check '<id>' (subagent-review): missing required field 'prompt'."` |
| `deterministic-check` added by project (not bundled) | Load fails with error: `"Check '<id>': projects may not define 'deterministic-check' entries in v1 — use 'subagent-review' or 'quality-gate'."` |
| Ordering cycle | Load fails with error citing the cycle. |
| All checks disabled | Skill runs Check 1 only, then reports: `"No Checks 2-12 enabled — validation is quality-gates-only."` Exit 0 if gates pass. |

## System Constitution Reference

- **Principle #1 (Minimize external dependencies):** Shared YAML parser and context-pack library with the reviewer spec. No new dependencies.
- **Principle #2 (Skills are primarily markdown):** SKILL.md prose for Checks 2-12 is replaced by a single "Step N: Load and run registered checks" section that delegates to the registry. The prose-per-check approach is preserved in `defaults.yaml` as the `name` and `description` fields of each entry so the intent is still readable.
- **Principle #5 (Version parity):** This change bumps `package.json` and `.claude-plugin/plugin.json` together at implementation time; the spec does not dictate the version bump.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Extract `plugin:validate/defaults.yaml` | Encode Checks 1.5 and 2-12 as registry entries. Each entry gets a `name`, `description`, `kind`, `after`, and (for `subagent-review`) `prompt` + `context_pack`. Extract the per-check prompt text from `skills/validate/SKILL.md` into separate prompt files under `skills/validate/prompts/`. | large |
| Implement `lib/governance/validate-config.mjs` | Load, validate, merge, topologically sort. Exposes `loadValidateConfig(repoRoot)`. Reuses `lib/governance/context-pack.mjs` from the reviewer spec. | medium |
| Rewrite Checks 2-12 section of `skills/validate/SKILL.md` | Replace 500+ lines of prose with a single section describing the registry-driven loop. Keep the fail-fast rules, severity semantics, and Check 1 handling unchanged. | medium |
| `/adev:init` scaffolding | Write a commented-out `governance/validate.yaml` template. | small |
| Tests | `tests/governance/validate-config.test.mjs` covers load/merge/validate/topo-sort; integration test proves zero-config behavior equals pre-change behavior via a fixture project. | large |

## Acceptance Criteria

- [ ] `loadValidateConfig(repoRoot)` returns bundled defaults identical to current prose behavior when no `governance/validate.yaml` exists.
- [ ] A project `governance/validate.yaml` that disables `validate.check-10-platform-drift` via `enabled: false` causes the check to appear in the report as `SKIPPED-DISABLED` and the overall verdict to be unaffected by any drift.
- [ ] A project-added `subagent-review` check with `after: [validate.check-2-spec-compliance]` runs after Check 2 in the report, with its prompt rendered from the project-relative path.
- [ ] A project cannot register a `deterministic-check` (rejected at load time with a clear error).
- [ ] `severity: warning` downgrades a FAIL to WARN in the report without affecting the verdict.
- [ ] Malformed YAML fails load with a line-cited error and exits non-zero before Check 2.
- [ ] `validate.check-12-heuristic-extraction` (observational kind) never contributes to verdict regardless of outcome.
- [ ] Integration test: `/adev:validate --spec <fixture>` with and without `governance/validate.yaml` produces byte-identical reports when the governance file declares only defaults with no overrides.
- [ ] Context packs are shared between `governance/review.yaml` and `governance/validate.yaml`; a pack defined in one is resolvable from the other.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
