# Live Spec: Standalone Invocation

<!-- Live Spec within the adev:write-test charter.
     Parent Charter: .context-index/specs/features/adev:write-test/charter.md -->

---
charter: adev:write-test
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-05-04
source-manifest:
  sha: "794bc64"
  files:
    - skills/write-test/SKILL.md
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
drift_source: skills/write-test/SKILL.md
drift_at: 2026-05-16T01:03:25.954Z
---

## Behavioral Contract

### Preconditions

- The user invokes `adev:write-test` directly (not dispatched by `adev:implement`)
- At least one of the following is provided: `--spec <path>`, `--file <path>`, or a free-form behavioral description as positional argument

### Behaviors

1. **When** invoked with `--spec <path>` standalone **then** the skill behaves identically to when dispatched by `adev:implement` — it reads the spec, derives Test Contracts, runs all enforcement rules, and produces a Handoff Block. No `adev:implement` context is required.

2. **When** invoked with `--file <path>` **then** the skill reads the file's exported public interface (functions, classes, constants) and derives Test Contracts that cover: the happy path for each export, at least one error/edge case per export, and any documented invariants in the file's JSDoc or comments.

3. **When** invoked with a free-form description as a positional argument (e.g., `adev:write-test "a function that validates email addresses"`) **then** the skill treats the description as the behavioral specification, derives Test Contracts from it, and notes in the Handoff Block that the spec source is `inline-description` rather than a file path.

4. **When** invoked standalone **then** the skill presents a brief pre-flight summary before authoring: detected framework, target (spec / file / description), estimated number of Test Contracts to write, and the output path for the Handoff Block. The user can confirm or cancel.

5. **When** invoked standalone and `.context-index/` does not exist in the project **then** the skill proceeds without constitution or spec context, applying its built-in enforcement rules (gaming violations, mocking boundaries, seed data) independently of the adev framework.

6. **When** invoked with `--verify --packet <path>` standalone **then** the skill runs post-GREEN semantic verification identically to when dispatched by `adev:implement`.

### Postconditions

- A Handoff Block is produced at `.context-index/packets/<slug>-tests.md` (or `./packets/<slug>-tests.md` if `.context-index/` does not exist)
- All enforcement rules (gaming violations, mocking boundaries, pre-existing failure protocol) apply equally in standalone and dispatched modes

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| No input provided (no spec, file, or description) | Block with usage instructions | MISSING_INPUT |
| `--spec` and `--file` both provided | Block — modes are mutually exclusive | AMBIGUOUS_INPUT |
| `--file` path is a directory | Block with "Expected a file, got a directory: <path>" | INVALID_TARGET |
| Free-form description is too vague to derive testable behaviors | Ask one clarifying question before proceeding | — |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Standalone invocation requires no code changes beyond what the SKILL.md documents. The skill's instructions cover both standalone and dispatched contexts equally.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add standalone invocation section to `SKILL.md` | Document `--spec`, `--file`, and free-form description modes with pre-flight summary behavior | Small |
| Document `.context-index/`-free operation | Note fallback packet path and rule behavior when no context index exists | Small |

## Acceptance Criteria

- [ ] `--spec <path>` produces identical output whether invoked standalone or by `adev:implement`
- [ ] `--file <path>` produces Test Contracts covering happy path, error cases, and documented invariants for each exported symbol
- [ ] Free-form description produces Test Contracts with `spec: inline-description` in the Handoff Block
- [ ] Pre-flight summary is shown before authoring in standalone mode
- [ ] All enforcement rules apply in standalone mode (gaming violations, mocking boundaries, seed data, pre-existing failure protocol)
- [ ] Works without `.context-index/` present — uses `./packets/` as fallback output directory
- [ ] `--verify --packet <path>` works standalone
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
