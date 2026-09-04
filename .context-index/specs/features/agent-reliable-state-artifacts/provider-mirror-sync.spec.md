# Live Spec: Provider Mirror Sync (Codex + OpenCode)

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

---
charter: agent-reliable-state-artifacts
status: review-passed
risk_level: low
milestone: 0.26.0
revision: 1
charter-revision: 3
created: 2026-05-12
updated: 2026-05-12
---

## Behavioral Contract

This spec ensures the Codex (`providers/codex/skills/`) and OpenCode (`providers/opencode/skills/`) mirror trees stay in lock-step with the canonical lifecycle skills in `skills/` after the rewrites in `lifecycle-skill-instruction-updates.spec.md`. Mirrors are not a separate authoring surface — they are mechanical adaptations of the canonical skill prose, with provider-specific framing for tool dispatch and Markdown vs. XML output conventions. After this spec lands, every lifecycle skill rewrite in this charter has been mirrored to both providers, every provider mirror references the same JSON / JSONL APIs as the canonical skill, and an automated parity check catches drift in CI.

The skills in scope mirror the canonical list from `lifecycle-skill-instruction-updates.spec.md` (all lifecycle skills affected by the format change). Each canonical SKILL.md rewrite triggers a corresponding mirror update under both providers.

## Sync Methodology

For each canonical skill `skills/<name>/SKILL.md` rewritten by `lifecycle-skill-instruction-updates.spec.md`:

1. **Re-port the substantive content** — Translate the canonical skill's instructions into the provider's voice. Codex skills use the Codex tool-dispatch conventions; OpenCode skills use OpenCode's. The substantive content (which APIs to call, what the gate semantics are, what events to emit) is identical.
2. **Preserve provider-specific scaffolding** — Frontmatter format, slash-command registration, agent personality preambles, and tool-naming references that differ between Claude Code and the mirror provider are preserved verbatim from the existing mirror files. Only the body content describing lifecycle behavior changes.
3. **Replace removed-prose patterns** — Apply the same audit-target removals from `lifecycle-skill-instruction-updates.spec.md`'s "Removed Prose" list:
   - `tasks\.md` parsing instructions outside of `/adev:status --render` and `/adev:issues` deprecated read prose
   - `build-state` directory references
   - Inline YAML frontmatter parsing of `.execution-state.md`
   - Markdown-table column lists describing the issue board format
   - Instructions to grep `.review.md` for `verdict:` or `status:`
4. **Add the API reference appendix** — Match the canonical skill's appendix verbatim (same API names, same one-line descriptions). Mirrors do not embed adapter code samples; they reference the API names so the operator's provider can dispatch the right call.

## Parity Test

A new architectural test, `tests/providers/mirror-parity.test.mjs`, enforces parity at three levels:

1. **API reference parity** — For every lifecycle skill in scope, the API names listed in the canonical `skills/<name>/SKILL.md` "API reference" appendix MUST appear in both `providers/codex/skills/<name>/SKILL.md` and `providers/opencode/skills/<name>/SKILL.md`. The test fails if any canonical API name is missing from either mirror.
2. **Stale-format pattern parity** — The same grep-based audit-target list from `lifecycle-skill-instruction-updates.spec.md` runs against the mirror files. Zero matches required in both mirror trees.
3. **Skill-set parity** — The set of skill directory names under `providers/codex/skills/` and `providers/opencode/skills/` MUST match the canonical set under `skills/` (intersected with the lifecycle-skills list — non-lifecycle skills that exist only in canonical, like `using-adev`, are skipped). The test fails if a lifecycle skill is missing from a mirror.

Provider-specific divergence (frontmatter syntax, tool-name aliases) is **out of scope** for the parity test. The test only enforces shared substance: API names, removed legacy formats, and skill-set presence.

## Per-Skill Sync Sequencing

Mirror updates are sequenced **after** the corresponding canonical skill rewrite lands, not interleaved with it. The charter's enumerated list ("Synced per-skill as each source-skill PR lands") implies one mirror PR per canonical PR; the implementation order for this spec is:

1. Wait for each canonical lifecycle-skill rewrite to land in the main branch.
2. Run the parity test (it will fail for the just-rewritten skill — that's expected).
3. Update both mirror files for the skill.
4. Re-run the parity test (must pass).
5. Land the mirror updates as a single follow-on PR per canonical PR, or batched at most once per charter milestone, at the implementer's discretion.

If `lifecycle-skill-instruction-updates.spec.md` lands as a single PR covering all skills, mirror updates may also be batched into a single PR. The parity test must be green at the tip of every PR in the batch.

## Naming Conventions (CON-1)

- API names referenced in mirror prose match canonical exactly (case-sensitive): `appendEvent`, `currentState`, `requireGate`, etc.
- Provider-specific tool-name aliases (e.g., Codex's `shell` vs. Claude Code's `Bash`) are preserved per the mirror's own conventions and not normalized.
- Skill directory names mirror the canonical kebab-case (`issues`, `plan`, `implement`, etc.).

## Mirror-Specific Bash / Helper References

Where a canonical skill references `<ADEV_ROOT>` for plugin-root resolution, the mirrors continue to use the mirror-specific plugin-root variable. The substantive helper path under the plugin root is identical (`lib/lifecycle-state.mjs`, `lib/issues/json-adapter.mjs`, etc.), so the only variation is the prefix. The parity test does not check prefix forms; it checks the suffix (`lib/lifecycle-state.mjs` appears in both mirror skills if it appears in canonical).

## Edge Cases

- **`using-adev` skill** — Canonical-only (the gateway skill is injected at session start). No mirror equivalent; the parity test's skill-set check excludes it.
- **`hooks/` content** — Hooks are not skills; they live under `hooks/` and are not mirrored. The session-capture hook rewrite from `direct-fs-consumer-migration.spec.md` is canonical-only.
- **Templates and CLI** — `templates/` and `cli/` are canonical-only. Mirrors reference templates indirectly via the canonical plugin-root convention.

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Applies directly. This spec is markdown synchronization.
- **Architecture Boundary (Autonomous):** "Editing skill markdown content" — Applies. Mirror edits are autonomous within the module.
- **Architecture Boundary (Requires Human Approval):** "Changing the plugin registration format" — Does NOT apply. Mirror plugin-registration manifests are unchanged.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Codex mirror sync — `issues`, `plan`, `implement`, `work` | Re-port canonical rewrites to `providers/codex/skills/<name>/SKILL.md`. | medium |
| Codex mirror sync — `specify`, `validate`, `reconcile`, `debug` | Same as above for the next four skills. | medium |
| Codex mirror sync — `status`, `hygiene`, `research`, `sync`, `build`, `review-specs` | Same as above for the remaining six skills. | medium |
| OpenCode mirror sync — `issues`, `plan`, `implement`, `work` | Re-port canonical rewrites to `providers/opencode/skills/<name>/SKILL.md`. | medium |
| OpenCode mirror sync — `specify`, `validate`, `reconcile`, `debug` | Same as above for the next four skills. | medium |
| OpenCode mirror sync — `status`, `hygiene`, `research`, `sync`, `build`, `review-specs` | Same as above for the remaining six skills. | medium |
| Plan-mode files mirror | Sync `feature-mode.md`, `epic-mode.md`, `release-mode.md` for `plan` in both mirrors. Sync `resume-mode.md` for `build` in both mirrors. | small |
| API-reference appendix mirror | Append the canonical "API reference" appendix verbatim to each mirrored skill. | small |
| `tests/providers/mirror-parity.test.mjs` | New architectural test covering API reference parity, stale-format pattern parity, and skill-set parity. | medium |
| Parity-test CI wiring | Confirm `npm test` runs the parity test by default. | small |
| Mirror PR sequencing playbook | One-paragraph note (committed alongside this spec's first mirror PR or in the charter's review.md) describing the "wait for canonical → run parity test → mirror → re-run" sequence for operator clarity. | small |

## Acceptance Criteria

- [ ] Every lifecycle skill rewritten by `lifecycle-skill-instruction-updates.spec.md` has corresponding updates in both `providers/codex/skills/<name>/SKILL.md` and `providers/opencode/skills/<name>/SKILL.md`.
- [ ] All plan-mode and build-mode files are mirrored.
- [ ] Every mirrored skill carries the API-reference appendix matching the canonical version.
- [ ] `tests/providers/mirror-parity.test.mjs` exists, runs in CI, and passes.
- [ ] The grep audit-target patterns return zero matches across `providers/codex/skills/**/SKILL.md` and `providers/opencode/skills/**/SKILL.md` for the in-scope skills.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
