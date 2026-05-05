# Implementation Plan: Configurable Reviewer Registry

> **Methodology:** adev
> **Charter:** .context-index/specs/features/review/charter.md
> **Spec:** .context-index/specs/features/review/configurable-reviewers.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-19)
> **Platform:** JavaScript (ESM), Node.js, npm, node:test

**Goal:** Replace the hardcoded three-reviewer flow in `/adev:review-specs` with a governance-driven registry. Projects declare reviewers in `governance/review.yaml`; bundled defaults ship in `templates/review-specs/defaults.yaml`. Package-mode lets a reviewer wrap an external skill. All dispatch goes through the `lib/profiles/` primitive.

**Architecture:** Pure-data loader merges bundled defaults with project overlay, validates, resolves profiles via `lib/profiles/`, and emits a normalized list for the skill to iterate. Context-pack rendering is shared with configurable-checks via `lib/governance/context-pack.mjs`. The SKILL.md loses the per-reviewer prose and gains a single registry loop with package-mode branch.

---

## File Structure

**Create:**
- `lib/governance/review-config.mjs` — loader, validator, merger, dispatch selector
- `lib/governance/context-pack.mjs` — shared pack resolution with traversal guard + denylist
- `templates/review-specs/defaults.yaml` — the three bundled reviewers + base context pack
- `skills/review-specs/adapters/generic.md` — default adapter prompt for package-mode
- `tests/governance/review-config.test.mjs`
- `tests/governance/context-pack.test.mjs`

**Modify:**
- `skills/review-specs/SKILL.md` — Steps 3-4 registry-driven; package-mode in Step 4
- `package.json` + `.claude-plugin/plugin.json` → already at 0.18.0 (no bump needed for in-development work)

**Reference (do not modify):**
- `lib/profiles/index.mjs` — consumed via `loadProfiles`, `resolveProfile`, `getEffectivePosture`
- `.context-index/specs/features/review/configurable-reviewers.spec.md` — the contract

---

## Task Map

### Task 1: Context-pack library
`lib/governance/context-pack.mjs` exports:
- `loadContextPacks(sources)` — merges bundled + project packs, resolves `extends` chains
- `renderPack(name, { targetSpecPath, repoRoot })` — renders pack as a concatenated string with per-file prefixes and `<no matches>` marker on empty globs
- Applies denylist: `.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`, `**/secrets/**` — fail load on match
- Traversal guard: every resolved file must remain under `repoRoot`; `..` segments pre-resolution rejected; `fs.realpath` used

### Task 2: review-config loader
`lib/governance/review-config.mjs` exports:
- `loadReviewConfig(repoRoot, { pluginRoot })` returning `{ reviewers, contextPacks, verdictRules, warnings, errors, notes }`
- Reads `templates/review-specs/defaults.yaml` first, overlays `governance/review.yaml`, field-by-field merge on matching `id`
- Validates: required fields (`id`, `dispatch`, either `prompt` or `package`); `dispatch` in {always, triggered, never, {object}}; `severity_cap` in {blocker, warning, suggestion}; `enabled` bool
- Resolves `prompt` paths: `plugin:<skill>/<file>` inside plugin skills/; relative under `.context-index/` with traversal guard (path.resolve + `..` rejection + realpath); absolute rejected; cross-plugin `plugin:<other>:...` rejected
- Resolves `package.skill` and `package.adapter` paths with the same rules
- Enforces read-only-compatibility (Behavior 11a): for each reviewer, call `getEffectivePosture` on its effective profile; reject if any of: `filesystem-write`/`shell` category present, literal tool present, fs write/execute != deny, network not in {deny, read-only}. `implementer` fails load.
- Manifest specialists deprecation: if `manifest.yaml:specialists` present, convert each to a reviewer entry in-memory with `dispatch: triggered`; emit one-time advisory note
- Severity cap + verdict consolidation helpers

### Task 3: Bundled defaults YAML
`templates/review-specs/defaults.yaml` — encodes the three reviewers (structural-architect, security-reviewer, consistency-analyzer), their prompts, default profiles, default context pack. Preserves today's dispatch model.

### Task 4: Generic adapter prompt
`skills/review-specs/adapters/generic.md` — adapter prompt instructing a subagent to extract findings-YAML from an arbitrary skill's output.

### Task 5: SKILL.md rewrite
Update `skills/review-specs/SKILL.md` Step 3 (specialist registry) and Step 4 (dispatch):
- Step 3: additionally load reviewers from `loadReviewConfig(repoRoot)`
- Step 4: iterate reviewers, for each run dispatch-selection (always / triggered / never); subagent-mode dispatches as today; package-mode runs the two-stage runner+adapter pipeline; severity-cap applied to findings; sanitized-output fallback on adapter-parse failure

### Task 6: Tests
- `tests/governance/review-config.test.mjs`: zero-config behavior (bundled defaults only), project overlay wins, invalid profile (posture) rejected, traversal-guard on prompt path, cross-plugin rejection, package-mode schema, severity-cap clamping
- `tests/governance/context-pack.test.mjs`: extends resolution, glob rendering, denylist enforcement, traversal guard, empty glob marker

### Task 7: Commit + push

---

## Acceptance Criteria Mapping

| AC | Task |
|----|------|
| Zero-config byte-identical to pre-change | 3, 5 |
| `enabled: false` excludes reviewer | 2, 5 |
| Project triggered reviewer dispatches correctly | 2, 5 |
| Package-mode runner + adapter | 2, 4, 5 |
| Severity cap clamping | 2, 5 |
| Profile reference resolved at load | 2 |
| Profile-disallowed tool surfaces as warning | 5 |
| Sanitized fallback on adapter parse failure | 5 (spec says 8 KiB redacted) |
| Specialists deprecation advisory | 2 |
| Cross-plugin references fail load | 2 |
| Multi-repo env resolution via consumer repo | uses profiles primitive already |
| Profile not read-only-compatible fails load | 2 (Behavior 11a) |
| Path traversal rejected | 1, 2 (Behaviors 17, 30, 30a) |

---

## Quality Gates

- [ ] `npm test` passes
- [ ] No new external dependencies
