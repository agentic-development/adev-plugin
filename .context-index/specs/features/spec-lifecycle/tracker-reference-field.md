# Live Spec: Tracker Reference Field

---
charter: spec-lifecycle
status: review-passed
risk_level: low
milestone: v1
created: 2026-03-27
---

## Behavioral Contract

### Preconditions

- A charter or spec file exists with YAML frontmatter
- The user has an external tracker reference to associate (Jira, Linear, GitHub Issues, etc.)

### Behaviors

1. **When** `/adev-specify` creates a new spec and the user provides a tracker reference **then** it sets `tracker-ref: <value>` in the spec's YAML frontmatter.

2. **When** `/adev-brainstorm` creates a new charter and the user provides a tracker reference **then** it sets `tracker-ref: <value>` in the charter's YAML frontmatter.

3. **When** no tracker reference is provided **then** the `tracker-ref` field is omitted from frontmatter (not set to empty or null).

4. **When** `/adev-status` reports on a spec or charter with a `tracker-ref` **then** it displays the reference: "Tracker: <value>".

5. **When** `/adev-status --all` generates a project report **then** it includes tracker references alongside each spec/charter entry that has one.

6. **When** the `tracker-ref` value follows common patterns **then** `/adev-status` formats it readably:
   - `#123` → GitHub Issue format
   - `LINEAR-1234` → Linear format
   - `PROJ-567` → Jira format
   - Any other value → displayed as-is

7. **When** the spec or charter template is used to create a new file **then** the template includes a commented-out `tracker-ref` field with an explanation: `# tracker-ref: LINEAR-1234  # optional — link to external tracker (Jira, Linear, GitHub Issues)`.

### Postconditions

- `tracker-ref` is an optional field in charter and spec frontmatter
- The field is purely metadata — no API calls, no validation against external systems
- Templates include commented-out `tracker-ref` with usage instructions

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `tracker-ref` value is empty string | Treat as absent — omit from frontmatter | — (ignored) |
| `tracker-ref` contains invalid YAML characters | Standard YAML quoting applies (user responsibility) | — (YAML) |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Tracker reference is a simple YAML frontmatter field, no executable logic.
- **Principle:** "Minimize external dependencies" — No tracker API integration. The field is metadata only, readable and writable without any external service.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update spec template | Add commented-out `tracker-ref` field with explanation | small |
| Update charter template | Add commented-out `tracker-ref` field with explanation | small |
| Update `adev-specify/SKILL.md` | Ask user for tracker reference during spec creation (optional) | small |
| Update `adev-brainstorm/SKILL.md` | Ask user for tracker reference during charter creation (optional) | small |
| Update `adev-status/SKILL.md` | Display tracker-ref in status reports | small |

## Acceptance Criteria

- [ ] Spec template includes commented-out `tracker-ref` field with explanation
- [ ] Charter template includes commented-out `tracker-ref` field with explanation
- [ ] `/adev-specify` optionally accepts and sets `tracker-ref` during spec creation
- [ ] `/adev-brainstorm` optionally accepts and sets `tracker-ref` during charter creation
- [ ] `/adev-status` displays `tracker-ref` when present
- [ ] Missing `tracker-ref` is silently ignored (no warnings, no errors)
- [ ] No external API calls or validation — metadata only
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
