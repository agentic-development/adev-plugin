<!-- partial_schema: spec@1 -->

---
mode: cross-cutting
kind: behavioral
status: validated
risk_level: low
revision: 1
created: 2026-05-30
updated: 2026-05-30
source-manifest:
  sha: "51c8c31"
  files:
    - CLAUDE.md
    - docs/extensions.md
    - skills/assess/SKILL.md
    - skills/brainstorm/SKILL.md
    - skills/build/SKILL.md
    - skills/codehealth/SKILL.md
    - skills/debug/SKILL.md
    - skills/deploy/SKILL.md
    - skills/document/SKILL.md
    - skills/eval/SKILL.md
    - skills/hygiene/SKILL.md
    - skills/init/SKILL.md
    - skills/issues/SKILL.md
    - skills/learn/SKILL.md
    - skills/plan/SKILL.md
    - skills/prototype/SKILL.md
    - skills/reconcile/SKILL.md
    - skills/recover/SKILL.md
    - skills/repomap/SKILL.md
    - skills/research/SKILL.md
    - skills/retro/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/route/SKILL.md
    - skills/sample/SKILL.md
    - skills/specify/SKILL.md
    - skills/standalone/SKILL.md
    - skills/status/SKILL.md
    - skills/sync/SKILL.md
    - skills/using-adev/SKILL.md
    - skills/validate/SKILL.md
    - skills/work/SKILL.md
    - skills/write-test/SKILL.md
    - tests/skills-extension-coverage.test.mjs
  computed-at: "2026-05-30T17:18:24.892Z"
affects:
  - cli
  - extensions
  - implementation
  - planning
  - spec-lifecycle
  - review
  - validation
  - debug-playbooks
  - prototype-brainstorm
  - work
  - write-test
  - strategic-planning
  - heuristics
  - assess
  - codehealth
  - maintenance
  - task-management
  - sample
  - hooks
  - document
  - repomap-eval
  - research
  - retro
  - route
  - deploy
  - standalone
  - session-awareness
  - setup
  - eval-projects
infra_requirements: none
---

# Live Spec: Universal Skill Extensions

<!-- Cross-cutting spec. Extends the existing `skill-ext load` mechanism
     (defined in `cli/skill-ext-load.spec.md`) to every adev skill, so
     project-level and extension-pack instructions can append to any skill's
     execution context, not only `/adev:implement`. -->

## Behavioral Contract

Today the `adev skill-ext load --skill <name>` CLI verb is universal — it accepts any skill name and reads project-level and extension-layer markdown from `.context-index/skill-extensions/{,_*/}<skill>.md`. However, only `/adev:implement` actually calls the verb (`skills/implement/SKILL.md:60`). All other skills silently ignore project-level extensions, even when relevant content exists in `.context-index/skill-extensions/<skill>.md`.

This spec defines the universal wiring: every adev skill must call `adev skill-ext load --skill <bare-slug>` during its earliest context-loading step and, when output is not `__NONE__`, incorporate the content as additional standing instructions for the skill's entire execution. The framing prose is uniform across all skills. Extension content is purely additive — it cannot replace, remove, or reorder existing skill sections.

The contract has three parts:

1. **Universal coverage.** All 31 skills under `skills/<name>/SKILL.md` must contain a `Load Skill Extensions` block that invokes the verb with the skill's bare slug (`specify`, `plan`, `implement`, etc. — never namespaced as `adev-specify`).

2. **Uniform framing.** Every skill uses the same prose template when extension content is present: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."*

3. **Forward enforcement.** New skills added to the plugin after this spec lands MUST include the Load Skill Extensions block. This is enforced as a contributor rule in `CLAUDE.md` Anti-Patterns. A future diagnostic check may upgrade this from documentation to lint-level enforcement, but that work is out of scope here.

## System Constitution Reference

- **Principle 2 — Skills are primarily markdown.** The change is a uniform markdown insertion across all SKILL.md files. No new executable surface; the existing `adev skill-ext` verb already wraps the logic.
- **Principle 4 — Hook protocol compliance.** The verb already exits 0 for `__NONE__` so universal wiring is non-blocking: skills with no extension content proceed unchanged.
- **Anti-pattern: No `Run inline Node.js` blocks in SKILL.md.** The inserted block names the CLI verb (`adev skill-ext load --skill <name>`) and prose instructions — never inline Node. Matches the `cli-driver-surface` charter.
- **Anti-pattern: No fenced JavaScript executable directives.** The insertion block contains a fenced bash code block (verb call) and prose instructions. No JavaScript is added.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `cli` | None | Verb already exists; no change. |
| `extensions` | None | Install-side already supports `provides.skill_extensions`; no change. |
| All 30 remaining skills | High (mechanical) | Insert uniform `Load Skill Extensions` block into each `skills/<name>/SKILL.md`. |
| Contributor docs (`CLAUDE.md`) | Low | Add a contributor rule under Patterns to Follow / Anti-Patterns requiring new skills to include the block. |
| `templates/skill-extensions/` | None | Directory already exists with `.gitkeep`; no change. |
| `.gitignore` | None | `_*/` rule already in place. |

## Integration Points

1. **All skills ↔ `adev skill-ext`:** Each skill calls the verb during its earliest context-loading step. The skill MUST treat `__NONE__` output as a no-op and any other output as standing instructions appended to its working context for the rest of the invocation.

2. **Extension packs ↔ all skills:** A domain extension declaring `provides.skill_extensions: { plan: "...", validate: "..." }` in its `adev-extension.yaml` now lands content for ANY skill name, not only `implement`. The install-side (`lib/extensions/content-install.mjs::installSkillExtensions`) already handles arbitrary skill keys; no change needed there.

3. **Project-level overrides ↔ all skills:** A project author can drop a hand-written `.context-index/skill-extensions/<skill>.md` for any skill, and that skill will pick it up automatically.

## Insertion Placement Rules

For each skill, the `Load Skill Extensions` block is inserted at the **earliest context-loading step** present in the skill:

- **If the skill has a "Load Context" step** (19 skills): insert the block immediately after the primary context bundle is loaded, before the skill begins interactive work. Match the placement pattern used by `/adev:implement` today (`skills/implement/SKILL.md:57-63`).
- **If the skill has a numbered Step 1 / Step 2 that does setup or prerequisite checks** but no explicit Load Context: insert the block as a sub-step at the end of that setup step.
- **If the skill has no setup step at all** (e.g., `/adev:using-adev`, `/adev:init`, `/adev:assess`): insert the block as a new H3 sub-step titled `### Load Skill Extensions` near the top of the skill body, after Prerequisites if present.

The inserted block uses this exact form:

```markdown
**Load Skill Extensions:** Load any skill extension instructions before proceeding:

\`\`\`bash
adev skill-ext load --skill <bare-slug>
\`\`\`

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.
```

Replace `<bare-slug>` with the skill's directory name under `skills/` (e.g., `specify`, `plan`, `implement`, `using-adev`, `init`, `work`).

## Behaviors

- **When** any of the 30 currently-unwired skills runs, **then** it calls `adev skill-ext load --skill <bare-slug>` as part of its earliest context-loading step.
- **When** the verb returns `__NONE__` for a given skill, **then** the skill proceeds normally with no behavior change versus the pre-wiring state.
- **When** the verb returns non-`__NONE__` content for a given skill, **then** the skill incorporates the content as additional standing instructions framed by the uniform prose template defined in Insertion Placement Rules.
- **When** a project author writes `.context-index/skill-extensions/<skill>.md` for any wired skill, **then** the next invocation of that skill loads and applies the content.
- **When** an installed extension pack declares `provides.skill_extensions: { <skill>: "..." }`, **then** the content lands under `.context-index/skill-extensions/_<ext-name>/<skill>.md` and the next invocation of `<skill>` loads it (in lexicographic order with any other extension layers).
- **When** a new skill is added to the plugin under `skills/<new-name>/SKILL.md`, **then** the contributor MUST include the Load Skill Extensions block per the rule in `CLAUDE.md` Anti-Patterns.
- **When** `/adev:implement` runs, **then** its existing skill-ext load call (already in `skills/implement/SKILL.md:57-63`) continues to function unchanged. The wiring sweep MUST NOT touch the existing block.

## Preconditions

- The `adev skill-ext load` CLI verb is registered and functional (already true — see `cli/skill-ext-load.spec.md`).
- `.context-index/skill-extensions/` directory exists in the project (created by `/adev:init`; the verb degrades to `__NONE__` if absent).
- Every skill's `<bare-slug>` matches the directory name under `skills/`.

## Postconditions

- All 31 skills contain a Load Skill Extensions block (one for `/adev:implement` pre-existed; 30 added by this spec's implementation).
- `CLAUDE.md` Anti-Patterns section contains a contributor rule requiring new skills to include the block.
- No existing functionality of any skill is removed or reordered.
- The existing `skill-ext-load.spec.md` continues to define the verb's per-call behavior; this spec only defines coverage.

## Error Cases

| Condition | Expected Behavior | Notes |
|-----------|-------------------|-------|
| A skill's wiring sweep accidentally omits a skill | The omitted skill silently ignores project-level extensions | Caught by an acceptance check that greps every `skills/*/SKILL.md` for the block. |
| A skill's `<bare-slug>` is misspelled in the insertion | `adev skill-ext load` reads from a nonexistent path → returns `__NONE__` → skill behaves as if unwired | Caught by an acceptance check that asserts the slug in each block matches the parent directory name. |
| A new skill is added without the block | Contributor docs in `CLAUDE.md` flag the violation | Future diagnostic check (out of scope) could enforce automatically. |
| Extension content for a skill contains conflicting instructions | The skill treats both project and extension content as additive standing instructions in load order (extension first, project last) | Matches the existing `skill-ext-load.spec.md` contract — no change. |

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|----------------------|
| Insert Load Skill Extensions block into 30 SKILL.md files | Apply the uniform block to every skill except `implement` (already wired). Use the placement rules above. Bare-slug naming. | medium |
| Add contributor rule to `CLAUDE.md` Anti-Patterns | Document that new skills MUST include the block. Reference this spec. | small |
| Add a test asserting universal coverage | New test in `tests/` that globs `skills/*/SKILL.md` and asserts each file contains an `adev skill-ext load --skill <dir-name>` substring matching its directory. | small |
| Update `docs/extensions.md` or equivalent | Note that all skills now support extension content; remove any wording implying `/adev:implement` is special. | small |
| Verify `/adev:implement` existing block is unchanged | Manual diff check during implementation. | trivial |

## Acceptance Criteria

- [ ] All 31 skills under `skills/*/SKILL.md` contain a Load Skill Extensions block.
- [ ] Each block's `--skill <slug>` argument exactly matches its parent directory name (`skills/<dir>/SKILL.md` → `--skill <dir>`).
- [ ] Each block uses the uniform framing prose verbatim ("The following skill extension instructions apply to this invocation...").
- [ ] The existing `/adev:implement` block at `skills/implement/SKILL.md:57-63` is unchanged byte-for-byte.
- [ ] `CLAUDE.md` Anti-Patterns section contains a contributor rule requiring new skills to include the block, referencing this spec.
- [ ] A new test exists that globs `skills/*/SKILL.md` and asserts universal coverage; it passes.
- [ ] `npm test` passes overall.
- [ ] No existing test fails or is modified (the sweep is purely additive to SKILL.md content; no executable behavior changes).
- [ ] The no-inline-Node pre-commit hook continues to pass on all modified SKILL.md files (the inserted block contains only a bash fence + prose).
- [ ] Manual verification: a hand-authored `.context-index/skill-extensions/specify.md` file is loaded when `/adev:specify` runs in a test project.
- [ ] Manual verification: a hand-authored `.context-index/skill-extensions/plan.md` file is loaded when `/adev:plan` runs in a test project.
