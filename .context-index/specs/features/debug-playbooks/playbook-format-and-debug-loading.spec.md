# Live Spec: Playbook Format and Debug Loading

---
charter: debug-playbooks
status: validated
risk_level: low
milestone: 1
revision: 2
charter-revision: 2
created: 2026-04-24
updated: 2026-04-24
source-manifest:
  sha: "54a8482"
  files:
    - skills/debug/SKILL.md
    - templates/debug-playbook-template.md
    - tests/skills/debug-playbook-loading.test.mjs
    - tests/templates/debug-playbook-template.test.mjs
  computed-at: "2026-04-24T23:00:36.167Z"
drift_detected: true
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with a valid manifest
- `/adev:debug` has completed Phase 1 (symptoms identified, module determined)

### Diagnostic Step Schema

Each diagnostic step in a failure mode contains these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `description` | yes | What this step investigates and why |
| `command` | no | Shell command or script reference to execute (e.g., `git log --oneline -5`, `./scripts/check-db.sh`) |
| `expected` | when `command` present | What healthy and unhealthy output looks like — used to interpret command results |
| `order` | yes | Numeric position in the diagnostic sequence (1-based) |

### Behaviors

1. **When** a playbook file exists at `.context-index/specs/features/<module>/debug-playbook.md` **then** `/adev:debug` Phase 2 reads it after step 5 (repo map) and before step 6 (gather evidence).

2. **When** a cross-cutting playbook exists at `.context-index/specs/cross-cutting/debug-playbook.md` **then** Phase 2 also reads it, in addition to any module-scoped playbook.

3. **When** both a module playbook and cross-cutting playbook exist and both contain failure modes whose triggers match the same Phase 1 symptom (trigger overlap) **then** only the module-scoped failure mode is presented for that symptom; non-overlapping cross-cutting failure modes are still included.

4. **When** Phase 1 symptoms (error messages, stack traces, behavioral descriptions) match one or more playbook triggers **then** the matched failure modes are presented with their diagnostic steps as the recommended investigation path. Trigger matching is an LLM-side operation: the debug skill reads each trigger's pattern text and compares it semantically against the Phase 1 symptom descriptions. No helper library or code-based matcher is used.

5. **When** no triggers match but a playbook exists for the module **then** the full list of failure mode titles is presented as a menu for the user to select from.

6. **When** no playbook exists for the affected module and no cross-cutting playbook exists **then** Phase 2 proceeds identically to today — no warnings, no degradation.

7. **When** a diagnostic step includes a `command` field **then** the debug skill executes it via the Bash tool. Command execution is subject to Claude Code's standard tool approval — the user sees and approves each command before it runs. Command output is ephemeral session data: it is used to inform the current investigation but is not written to disk, not appended to any log file, and not included in escalation reports beyond a one-line summary.

8. **When** the escalation condition of a failure mode is met during diagnostic steps **then** the debug skill stops following the playbook and reports the escalation target (human, ADR review, or architecture reassessment) before proceeding to Phase 3.

### Playbook Structure

A valid playbook file must contain:
- A YAML frontmatter block with `last-verified` date
- One or more failure mode sections, each with: `id` (unique slug), `title`, `triggers` (list of symptom patterns), ordered `steps` (following the Diagnostic Step Schema above), and `escalation` (condition + target)

A playbook missing any of these required sections is considered malformed.

### Postconditions

- Matched failure modes and their diagnostic steps are available as structured context for Phase 3 (Hypothesize)
- Any diagnostic step command outputs are used within the session only — not persisted
- Escalation conditions, if triggered, are reported before Phase 3 begins

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| Playbook file exists but is malformed (missing required sections per Playbook Structure above) | Log a warning, skip the playbook, proceed with standard Phase 2 |
| Failure mode has no triggers defined | The failure mode is excluded from automatic matching but appears in the manual menu |
| Failure mode has no escalation defined | Log a warning during loading; the failure mode is still usable but has no stop condition |
| Diagnostic step command fails or times out | Report the failure as a diagnostic finding, continue to next step |

## System Constitution Reference

- **"Skills are primarily markdown"** — Applies because playbooks are structured markdown files, not executable code. Trigger matching and failure mode selection are LLM-side operations within the debug SKILL.md instructions. The template is consumed by `cpSync()` like all other templates.

- **"Minimize external dependencies"** — Applies because this feature requires no new dependencies. Playbooks are plain markdown files read by the skill; no parser, matcher, or helper library is needed.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. Create playbook template | `templates/debug-playbook-template.md` with failure mode structure, triggers, steps, escalation sections | small |
| 2. Add Phase 2 playbook loading to debug SKILL.md | New step 5.5 between repo map and gather evidence — load module + cross-cutting playbooks, match triggers, present failure modes | medium |
| 3. Add playbook scaffold to /adev:init | When initializing, mention playbooks in the debug-related output; optionally scaffold an example playbook | small |
| 4. Tests | Eval tests verifying: template is valid markdown, playbook loading instructions are present in debug SKILL.md, template follows charter domain model | small |

## Acceptance Criteria

- [ ] `templates/debug-playbook-template.md` exists with sections for: frontmatter (`last-verified`), failure modes, triggers, diagnostic steps (ordered), expected findings, escalation criteria
- [ ] Template follows the domain model: each failure mode has a unique `id`, ordered steps, and escalation
- [ ] `/adev:debug` SKILL.md Phase 2 includes a new step loading module playbook at `.context-index/specs/features/<module>/debug-playbook.md`
- [ ] Phase 2 also loads cross-cutting playbook at `.context-index/specs/cross-cutting/debug-playbook.md`
- [ ] Phase 2 instructions describe trigger matching: compare Phase 1 symptoms against trigger patterns, present matched failure modes
- [ ] Phase 2 instructions describe fallback: when no triggers match, present failure mode titles as a selection menu
- [ ] Phase 2 instructions describe graceful absence: when no playbook exists, proceed with no warnings
- [ ] Phase 2 instructions describe command execution: run diagnostic step commands via Bash, compare against expected output
- [ ] Phase 2 instructions describe escalation: stop following playbook when escalation condition is met, report target
- [ ] Module-scoped playbook takes precedence over cross-cutting when triggers overlap
- [ ] All quality gates pass (npm test)
- [ ] No constitutional violations introduced
