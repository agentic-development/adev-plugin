# Live Spec: Advanced Guides

---
charter: user-docs
status: review-pending
risk_level: low
milestone: 1
revision: 1
charter-revision: 2
created: 2026-05-09
updated: 2026-05-09
---

## Behavioral Contract

### Preconditions

- Existing docs content available for absorption: `docs/workspaces.md`, `docs/governance.md`, `docs/test-strategies.md`
- Foundation & Onboarding spec is complete (docs/README.md exists)
- Governance YAML files, workspace configuration, and test strategy code exist as source material

### Behaviors

1. **When** a user reads `docs/workspaces.md` **then** they find a complete guide to multi-repo coordination: when to use workspaces, how to set them up, cross-repo features, dependency-aware planning, common patterns, and explicit limitations — absorbing and improving the existing workspaces documentation.

2. **When** a user reads `docs/governance.md` **then** they find a guide to customizing review and validation gates: the four governance files, execution profiles, reviewer registry, validation registry, and migration recipes for existing projects — absorbing and improving the existing governance documentation.

3. **When** a user reads `docs/test-strategies.md` **then** they find a guide to domain-specific TDD: the 9 strategies, auto-detection, manual configuration, and the integration strategy deep dive — absorbing and improving the existing test strategies documentation.

4. **When** existing documentation is absorbed **then** all information from the original files is preserved or explicitly superseded — no silent content loss.

5. **When** an advanced guide references skills or configuration **then** it links to the corresponding Skill Reference or Configuration Reference entries rather than re-documenting them.

6. **When** a user reads an advanced guide without reading the Getting Started tutorial first **then** they can still understand the guide — prerequisites are stated at the top of each page.

### Postconditions

- `docs/workspaces.md` exists with reorganized and complete workspace content
- `docs/governance.md` exists with reorganized and complete governance content
- `docs/test-strategies.md` exists with reorganized and complete test strategy content
- All three guides are linked from the Table of Contents under "Advanced"
- Original docs content is fully absorbed (no information loss)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Existing doc content contradicts current behavior | Current behavior wins; stale content is corrected during absorption | STALE_CONTENT |
| An advanced guide references a governance file or config that doesn't exist | All references point to real files; examples use actual project configuration | DEAD_REFERENCE |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Guides describe markdown-based governance and strategy files.
- **Principle:** "Hook protocol compliance" — Governance guide documents hooks that enforce gates.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Absorb and rewrite docs/workspaces.md | Reorganize existing content into the new doc structure, update for accuracy | medium |
| Absorb and rewrite docs/governance.md | Reorganize existing content, preserve migration recipes, update for accuracy | large |
| Absorb and rewrite docs/test-strategies.md | Reorganize existing content, preserve strategy details, update for accuracy | large |
| Add prerequisites section to each guide | State what the reader should know before reading | small |
| Cross-link to reference pages | Link skill and config mentions to reference entries | small |
| Link from TOC | Add all three guides to docs/README.md under Advanced | small |

## Acceptance Criteria

- [ ] `docs/workspaces.md` contains all content from the existing workspaces guide
- [ ] `docs/governance.md` contains all content from the existing governance guide, including migration recipes
- [ ] `docs/test-strategies.md` contains all content from the existing test strategies guide, including all 9 strategies
- [ ] Each guide states prerequisites at the top
- [ ] Skill and config references link to their respective reference pages
- [ ] All three pages are reachable from docs/README.md
- [ ] No information loss from existing documentation
- [ ] No constitutional violations introduced
