# Live Spec: Foundation & Onboarding

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
    - docs/README.md
    - docs/concepts.md
    - docs/installation.md
    - docs/getting-started.md
  computed-at: "2026-05-10T23:51:35.315Z"
drift_detected: true
drift_source: docs/README.md
drift_at: 2026-05-16T14:28:10.503Z
---

## Behavioral Contract

### Preconditions

- The `docs/` directory exists (or will be created)
- The constitution, manifest, and platform-context files exist as content sources
- Existing `docs/quickstart.md` content is available for absorption

### Behaviors

1. **When** a user opens `docs/README.md` **then** they see a structured table of contents with sections for Getting Started, Workflow Guides, Reference, and Advanced, each linking to the corresponding guide pages.

2. **When** a user reads the Concepts page **then** they find a brief explanation of the four pillars (Context-First Architecture, Ephemeral Infrastructure, Gate-Based Governance, Hybrid Engineering), a description of the context index and its contents, and a lifecycle overview diagram — all without referencing internal implementation details.

3. **When** a user reads the Installation page **then** they find step-by-step instructions for installing the plugin, with distinct paths for greenfield (new project) and brownfield (existing codebase) scenarios, provider selection (Claude Code, OpenCode, Codex), and verification steps.

4. **When** a user reads the Getting Started tutorial **then** they can follow an end-to-end walkthrough from `/adev:init` through brainstorm, specify, review, plan, implement, and validate — covering the complete lifecycle for one feature.

5. **When** a reader follows the Getting Started tutorial without prior adev experience **then** every term (charter, spec, constitution, context index) is defined on first use, and no step assumes prior knowledge.

6. **When** any page in this spec links to another docs page **then** the link target exists and resolves correctly via relative markdown links.

7. **When** the Table of Contents is rendered **then** every page created by this spec is reachable from the TOC. (Full cross-spec TOC completeness is verified by the Support & Polish spec.)

### Postconditions

- `docs/README.md` exists and serves as the documentation entry point
- `docs/concepts.md` exists with four-pillar overview and lifecycle diagram
- `docs/installation.md` exists with greenfield/brownfield/provider paths
- `docs/getting-started.md` exists with expanded end-to-end tutorial
- All existing `docs/quickstart.md` content is absorbed into `docs/getting-started.md`
- `docs/quickstart.md` is removed (replaced by getting-started.md)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Existing docs/quickstart.md has content not covered by getting-started.md | All quickstart content is preserved in the new guide, nothing lost | CONTENT_LOSS |
| A link in the TOC points to a page that doesn't exist yet | TOC only links to pages created by completed specs; future pages get a "coming soon" note or are omitted until written | DEAD_LINK |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Documentation is pure markdown, no build step or site generator.
- **Principle:** "Minimize external dependencies" — No doc tooling dependencies; plain markdown files readable on GitHub.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Write docs/README.md | Create TOC with card-style section links matching the prototype layout | small |
| Write docs/concepts.md | Four pillars, context index overview, lifecycle diagram (text-based) | medium |
| Write docs/installation.md | Prerequisites, install command, greenfield/brownfield paths, provider flags, verification | medium |
| Write docs/getting-started.md | Absorb quickstart.md, expand to 8-step lifecycle walkthrough with examples | large |
| Remove docs/quickstart.md | Delete after content is absorbed | small |
| Add next-page links | Add "Next: X" links at bottom of each page created by this spec | small |

## Acceptance Criteria

- [ ] `docs/README.md` exists with a table of contents linking all documentation pages
- [ ] `docs/concepts.md` explains all four pillars and the context index without internal jargon
- [ ] `docs/installation.md` covers greenfield, brownfield, and provider selection
- [ ] `docs/getting-started.md` is a complete end-to-end tutorial covering all lifecycle phases
- [ ] All content from `docs/quickstart.md` is preserved in the new structure
- [ ] `docs/quickstart.md` is removed
- [ ] Every link between pages resolves correctly
- [ ] No page assumes prior knowledge of adev — terms defined on first use
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
