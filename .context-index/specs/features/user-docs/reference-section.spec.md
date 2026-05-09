# Live Spec: Reference Section

---
charter: user-docs
status: implemented
risk_level: low
milestone: 1
revision: 1
charter-revision: 2
created: 2026-05-09
updated: 2026-05-09
---

## Behavioral Contract

### Preconditions

- SKILL.md files exist for all skills in the plugin
- `hooks/hooks.json` and hook scripts exist
- `manifest.yaml`, `constitution.md`, and `platform-context.yaml` exist as source material

### Behaviors

1. **When** a user opens `docs/skill-reference.md` **then** they find a table listing every skill in the plugin, organized by lifecycle phase, with columns for skill name, purpose, prerequisites, and arguments.

2. **When** a user reads a skill entry in the reference **then** they find: the skill name, a one-paragraph purpose description, prerequisites, supported arguments with descriptions, example invocation, expected output summary, and links to related workflow guides.

3. **When** a new skill is added to the plugin **then** the reference is incomplete until a corresponding entry is added — the charter invariant "every skill has exactly one Skill Entry" is violated and detectable.

4. **When** a user opens `docs/configuration.md` **then** they find field-level documentation for `manifest.yaml` (all sections: project, sync, modules, specialists, gates, completion, tasks, provenance, repomap, hygiene, integrations), `constitution.md` (all sections: Identity, Principles, Coding Standards, Architecture Boundaries, Context Routing, Quality Gates), and `platform-context.yaml` (all fields).

5. **When** a configuration field has a default value **then** the reference documents the default and explains when to override it.

6. **When** a user opens `docs/hooks.md` **then** they find a table of all hooks organized by trigger point (SessionStart, PreToolUse, PostToolUse), with columns for hook name, trigger condition, purpose, and whether it blocks or advises.

7. **When** a hooks entry describes a blocking hook **then** it explains what triggers the block, what the user sees, and how to resolve it.

8. **When** a reference page mentions a concept explained in the Concepts guide **then** it links back rather than re-explaining.

### Postconditions

- `docs/skill-reference.md` exists with one entry per skill (enumerated from the `skills/` directory)
- `docs/configuration.md` exists with field-level docs for manifest, constitution, and platform-context
- `docs/hooks.md` exists with entries for every hook registered in `hooks/hooks.json`
- All three pages are linked from the Table of Contents under "Reference"

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| A skill exists in skills/ but has no reference entry | Detectable gap — the completeness invariant is violated | MISSING_SKILL_ENTRY |
| A hook exists in hooks.json but has no reference entry | Detectable gap — the hooks reference is incomplete | MISSING_HOOK_ENTRY |
| A manifest.yaml field is undocumented | Detectable gap — the configuration reference is incomplete | MISSING_CONFIG_FIELD |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Reference entries are sourced directly from SKILL.md files.
- **Principle:** "Hook protocol compliance" — Hooks reference documents the stdin/stdout JSON protocol and exit codes.
- **Principle:** "Version parity" — Configuration reference documents the version sync requirement.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Enumerate skills from filesystem | Scan `skills/` directory to produce authoritative skill list | small |
| Write skill reference structure | Create docs/skill-reference.md with phase groupings and table format | small |
| Write skill entries — setup & triage | Entries for work, init, sync | medium |
| Write skill entries — design | Entries for brainstorm, specify, review-specs, prototype | medium |
| Write skill entries — build | Entries for plan, route, implement, write-test, build | medium |
| Write skill entries — validation | Entries for validate, debug, eval, recover | medium |
| Write skill entries — maintenance | Entries for issues, status, hygiene, retro, codehealth, repomap, reconcile, sample, document | large |
| Write skill entries — meta | Entries for research, learn, assess | small |
| Write docs/configuration.md | Field-level docs for manifest, constitution, platform-context | large |
| Write docs/hooks.md | All 11 hooks with trigger, purpose, blocking behavior | medium |
| Link from TOC | Add all three pages to docs/README.md under Reference | small |

## Acceptance Criteria

- [ ] `docs/skill-reference.md` has an entry for every skill in the plugin
- [ ] Each skill entry includes purpose, prerequisites, arguments, example, and guide links
- [ ] `docs/configuration.md` documents every section of manifest.yaml
- [ ] `docs/configuration.md` documents every section of constitution.md
- [ ] `docs/configuration.md` documents every field of platform-context.yaml
- [ ] Default values are documented for all configuration fields that have them
- [ ] `docs/hooks.md` covers every hook in hooks.json (count derived from registry, not hardcoded)
- [ ] Blocking hooks document trigger conditions and resolution steps
- [ ] All three pages are reachable from docs/README.md
- [ ] No constitutional violations introduced
