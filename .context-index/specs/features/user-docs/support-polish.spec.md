# Live Spec: Support & Polish

---
charter: user-docs
status: validated
risk_level: low
milestone: 1
revision: 1
charter-revision: 2
created: 2026-05-09
updated: 2026-05-09
source-manifest:
  files:
    - docs/troubleshooting.md
    - docs/README.md
  computed-at: "2026-05-10T23:51:35.315Z"
---

## Behavioral Contract

### Preconditions

- All other user-docs specs are complete (all guide and reference pages exist)
- The project README.md exists at the repository root
- Common issues are identifiable from hook behaviors, lifecycle gates, and skill prerequisites

### Behaviors

1. **When** a user reads `docs/troubleshooting.md` **then** they find a structured FAQ and troubleshooting guide organized by symptom: hook warnings, lifecycle gate blocks, missing prerequisites, skill errors, and common configuration mistakes.

2. **When** a troubleshooting entry describes an error or warning **then** it includes: what the user sees, why it happens, and how to resolve it — in plain language without requiring knowledge of internals.

3. **When** a user encounters a hook warning or lifecycle gate block **then** the troubleshooting guide has a matching entry that explains the resolution.

4. **When** a user reads the FAQ section **then** they find answers to common questions: portability to other AI tools, whether every lifecycle step is required, how to add skills, what to do when agents get stuck, and how to customize gates.

5. **When** the project `README.md` is updated **then** its "Learn More" or documentation section points to `docs/README.md` as the primary documentation entry point, and the skills table and architecture overview remain but link into the full docs for details.

6. **When** a user navigates the docs **then** every page has consistent navigation: a breadcrumb showing location in the hierarchy, and next/previous links at the bottom connecting to adjacent pages in the reading order.

7. **When** all docs pages are complete **then** there are no dead links — every relative link between pages resolves to an existing file.

### Postconditions

- `docs/troubleshooting.md` exists with FAQ and troubleshooting entries
- `README.md` is updated to point to the docs directory
- All pages have consistent breadcrumb navigation and next/previous links
- Zero dead links across the entire docs directory
- Old docs files that were replaced (e.g., `docs/quickstart.md`, `docs/skills.md`, `docs/architecture.md`) are removed

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| A dead link exists between docs pages | Detected by link validation; must be fixed before spec is complete | DEAD_LINK |
| README.md has existing documentation links that would break | Links are updated to point to new docs structure, not left dangling | STALE_README_LINK |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Troubleshooting describes skill behavior in user-facing terms.
- **Principle:** "Hook protocol compliance" — Troubleshooting entries for hook warnings reference the exit-code protocol to explain blocking behavior.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Write docs/troubleshooting.md | FAQ entries and troubleshooting organized by symptom | medium |
| Update README.md | Point to docs/README.md, update links in skills and architecture sections | small |
| Add breadcrumb navigation | Add breadcrumb and next/previous links to all docs pages | medium |
| Remove replaced docs files | Delete docs/quickstart.md, docs/skills.md, docs/architecture.md and other superseded files | small |
| Validate all links | Check every relative link across docs/ for correctness | small |

## Acceptance Criteria

- [ ] `docs/troubleshooting.md` exists with entries for hook warnings, lifecycle gates, and common errors
- [ ] FAQ section covers at least 5 common questions
- [ ] Each troubleshooting entry includes symptom, cause, and resolution
- [ ] `README.md` links to `docs/README.md` as the primary documentation
- [ ] All docs pages have breadcrumb navigation
- [ ] All docs pages have next/previous reading order links
- [ ] Zero dead links across docs/
- [ ] Superseded docs files are removed
- [ ] No constitutional violations introduced
