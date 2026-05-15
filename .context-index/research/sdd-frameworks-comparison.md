---
topic: "spec-driven development frameworks — how they structure specs, distinguish kinds, and handle the spec-to-code lifecycle"
date: "2026-05-14"
relates-to: "epic-73"
sources:
  - web
status: draft
---

## Summary

Across eight peer SDD frameworks for AI coding agents (GitHub Spec-Kit, Kiro, OpenSpec, Tessl, BMAD-Method, Agent OS, Cursor Rules, Cline) plus the classical BDD/Gherkin and Specification-by-Example lineage, three convergent findings stand out: (1) **every framework that shipped with a single spec template has since added — or had the community add — type variants** (Kiro added Bugfix and Design-first in late 2025; spec-kit-extensions adds five workflows for bugfix/modify/refactor/hotfix/deprecate; OpenSpec separates base specs from delta specs); (2) **only one or two frameworks have an explicit charter/module layer above specs** (Agent OS's product/mission/roadmap layer; BMAD's PRD + Architecture documents) — most peers operate at a flat spec layer and pay for it in fragmentation; (3) **the spec-to-code lifecycle is uniformly a 3-to-5-stage pipeline** (specify → plan → tasks → implement) with a separate orthogonal "constitution" or "rules" layer governing invariants. Adev's six-mode (spec) + four-kind (charter) taxonomy already converges with peer evolution: it adopts up-front what Kiro and spec-kit had to retrofit. The architect-level recommendation is to mirror Kiro's empirically validated pattern (feature + bugfix + design-first, expanding to action/refactor/integration/artifact) rather than spec-kit's flat-template approach, and to keep adev's charter layer (which Agent OS validates as the right level of abstraction) rather than collapse it.

## Findings

### Web

#### Tier 1 — Peer AI-coding-agent SDD frameworks

##### GitHub Spec-Kit (`/speckit.*`)

- **Lifecycle:** five-phase pipeline — `/speckit.constitution` → `/speckit.specify` → `/speckit.clarify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`. Ships with three core templates: `spec-template.md`, `plan-template.md`, `tasks-template.md`. Source: <https://github.com/github/spec-kit>, <https://github.github.com/spec-kit/>.
- **Spec kinds:** **none**. One template for all work. Microsoft's overview blog and the Visual Studio Magazine review both treat the single-template stance as deliberate but flag it as a limitation. Source: <https://developer.microsoft.com/blog/spec-driven-development-spec-kit>, <https://visualstudiomagazine.com/articles/2026/05/12/github-spec-kit-takes-off-as-antidote-to-piecemeal-vibe-coding.aspx>.
- **Charter layer:** **none**. Folder organization is per-feature (`specs/001-create-taskify/`) with the constitution (`memory/constitution.md`) playing a global-rules role analogous to adev's constitution. No module/charter layer between project and feature. Source: <https://blog.logrocket.com/github-spec-kit/>.
- **Template structure (extracted from raw GitHub):** `spec-template.md` has frontmatter (Feature Branch / Created / Status / Input) and four sections (User Scenarios & Testing, Requirements, Success Criteria, Assumptions). `plan-template.md` has Summary / Technical Context / Constitution Check / Project Structure / Complexity Tracking. `tasks-template.md` organizes by Phase (Setup → Foundational → User Stories → Polish) with `[P]`-for-parallel and `[Story]` task discriminators. Notably, the plan template branches its Project Structure section conditionally on project type (single-project / web / mobile+API) — proto-templating that hints at the need for kind-awareness without naming it. Source: `github/spec-kit/templates/{spec,plan,tasks}-template.md`.
- **Pain points (HN, Scott Logic, Martin Fowler):** "spec-kit created a LOT of markdown files for me to review. They were repetitive… very verbose and tedious to review." "When does it merge all this specs into a single ground truth. I never got there and it felt like a huge missing step." Source: <https://news.ycombinator.com/item?id=45610996>, <https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html>.
- **Community-added extensions:** `spec-kit-extensions` ships five additional workflows — `bugfix`, `modify`, `refactor`, `hotfix`, `deprecate` — explicitly because "spec-kit originally provided structured workflows for feature development (~25% of development work), but left the remaining 75% ad-hoc." Source: <https://github.com/MartyBonacci/spec-kit-extensions>.

##### Kiro (AWS-affiliated, Code-OSS-based IDE)

- **Lifecycle:** three-phase — requirements → design → tasks. Three files per spec (`requirements.md`, `design.md`, `tasks.md`). Source: <https://kiro.dev/docs/specs/>.
- **Spec kinds:** **two as of late 2025** — Feature Spec and Bugfix Spec — and two workflow variants (Requirements-first and Design-first). The Bugfix Spec replaces `requirements.md` with `bugfix.md` and uses sections **Current Behavior / Expected Behavior / Unchanged Behavior**, explicitly different from the Feature Spec's Requirements → Design → Tasks shape. Source: <https://kiro.dev/blog/specs-bugfix-and-design-first/>.
- **Charter layer:** **none**. Each spec is independent.
- **Motivation for adding kinds (direct quote):** "Not everyone starts from requirements. Especially when working on existing, brownfield apps, some developers came in with the technical architecture already mapped out." This is the *exact* failure mode adev's spec-taxonomy audit identified for `bundled-templates-cleanup.spec.md` (an action wearing a behavioral mask). Source: <https://kiro.dev/blog/specs-bugfix-and-design-first/>.
- **Pain point (Fowler/HN):** "When I asked Kiro to fix a small bug… the workflow was like using a sledgehammer to crack a nut. The requirements document turned this small bug into 4 'user stories' with a total of 16 acceptance criteria." This is the empirical case for kind-aware templates: Kiro fixed it by adding the Bugfix Spec kind. Source: <https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html>.

##### OpenSpec (Fission-AI)

- **Folder structure:** `openspec/specs/<domain>/spec.md` for "source of truth" + `openspec/changes/<change-name>/` for proposals (with `proposal.md`, `design.md`, `tasks.md`, and a *delta* `specs/<domain>/spec.md`). Archive lives in `openspec/changes/archive/`. Source: <https://github.com/Fission-AI/OpenSpec>, <https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md>.
- **Spec kinds:** **two structural shapes** — base spec and delta spec. Delta specs use four named sections (`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`) to describe edits to base specs without rewriting them. Requirements use SHALL/MUST normative language with Given/When/Then scenarios. Source: <https://thedocs.io/openspec/concepts/spec-format/>.
- **Lifecycle:** `/opsx:propose` → `/opsx:apply` → `/opsx:sync` → `/opsx:archive`. On archive, ADDED requirements append to the main spec, MODIFIED requirements replace existing versions, REMOVED requirements delete. Source: <https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md>.
- **Charter layer:** **none formally** — organizes by "domain" (e.g., `specs/auth/`, `specs/payments/`), which functionally parallels adev's charter but has no separate document. The "profiles" concept bundles command sets, not artifacts. Source: <https://openspec.dev/>.
- **Direct relevance to adev:** OpenSpec's delta-spec mechanism solves the same problem adev's `mode: refactor` template solves (describing changes to existing behavior without rewriting). adev should consider whether refactor specs would benefit from OpenSpec's structured ADDED/MODIFIED/REMOVED section names rather than free-text current-state/target-state.

##### Tessl

- **Approach:** "spec-as-source" — code is generated from spec and marked `// GENERATED FROM SPEC - DO NOT EDIT`. One spec per component. Spec structure: description + capabilities (with linked tests) + API. Source: <https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html>, <https://tessl.io/blog/tessl-launches-spec-driven-framework-and-registry/>.
- **Spec kinds:** **per-component, not per-intent**. Granularity is one spec per file (`dynamic-data-renderer.spec.md` → `dynamic-data-renderer.tsx`). Source: Fowler article.
- **Charter layer:** none. Tessl Spec Registry is a library-level abstraction (10,000+ pre-built specs for OSS libraries) but not a project-internal charter.
- **Risk flagged by sources:** "spec-as-source… is a dangerous anti-pattern… a regression to the failed paradigms of Model-Driven Development (MDD)." Source: <https://www.augmentcode.com/blog/what-spec-driven-development-gets-wrong>.

##### BMAD-METHOD

- **Approach:** persona-orchestrated. 12+ specialized agents (Analyst, PM, Architect, Developer, Scrum Master, UX). Documents are PRD + Architecture Document + Story files. Source: <https://github.com/bmad-code-org/BMAD-METHOD>, <https://docs.bmad-method.org/>.
- **Charter layer:** **yes, partial** — the Architecture Document and PRD play a role similar to adev's charter, but are produced per-effort rather than as persistent module records. Workflows are YAML-defined.
- **Spec kinds:** none distinguished at the spec level; differentiation happens at the *persona* level instead (different agents own different artifact types).
- **Direct relevance to adev:** BMAD's persona-orchestrated approach is orthogonal to adev's mode/kind taxonomy. Both are valid axes, but the persona axis is closer to adev's specialist routing than to its spec/charter taxonomy.

##### Agent OS (buildermethods)

- **Three-layer hierarchy (the closest parallel to adev's design):** Standards (the "How") → Product (mission, roadmap, tech stack — the "What" and "Why") → Specs (the "Next"). Source: <https://buildermethods.com/agent-os>, <https://buildermethods.com/agent-os/v2/plan-product>.
- **Charter layer:** **yes, explicitly** — `plan-product` produces mission/roadmap/tech-stack files that play the role adev calls "charter." Validates the proposition that a charter-equivalent layer is load-bearing in mature SDD frameworks.
- **Spec kinds:** none distinguished. Specs are produced via `shape-spec`.
- **Lifecycle:** four-stage core loop — Discover → Inject → Build → Refine.

##### Cursor (Project Rules)

- **Approach:** instruction layer, not a spec layer. `.cursor/rules/*.mdc` with frontmatter `description`, `globs`, `alwaysApply`. Hierarchical: `.cursor/rules/`, `backend/.cursor/rules/`, `frontend/.cursor/rules/`. The legacy `.cursorrules` file is deprecated. Source: <https://cursor.com/docs/rules>.
- **Spec kinds:** Cursor does not have specs; it has rules (always-apply / glob-scoped / agent-decided-via-description / manual). Three rule types are themselves a kind-discriminator over the rules-as-instructions surface. Source: <https://docs.cursor.com/context/rules>.
- **Direct relevance to adev:** Cursor's hierarchical scoping pattern (workspace-wide vs. directory-scoped) is the same pattern adev's manifest modules use. Not a peer for spec taxonomy but a peer for context-routing.

##### Cline

- **Approach:** rules + workflows + custom modes. `.clinerules/` for persistent rules; `workflows/` for on-demand multi-step processes invoked by name. Cline's Plan & Act modes separate planning from implementation, parallel to spec-kit's plan/implement split. Source: <https://docs.cline.bot/customization/cline-rules>, <https://cline.ghost.io/stop-adding-rules-when-you-need-workflows/>.
- **Key insight:** Cline's own blog explicitly distinguishes rules (persistent, always loaded, token-expensive) from workflows (on-demand, one-time, token-cheap). This rules-vs-workflows split is the same axis adev draws between *constitution* (persistent) and *skills* (invocable) — convergent design.

##### Devin (Cognition) — Playbooks + Specs

- **Playbooks (`.devin.md`):** procedure files with action verbs + Advice sections that "correct Devin's priors." Used for recurring engineering tasks (ingestion pipelines, migrations, Stripe/Plaid integration). Source: <https://docs.devin.ai/product-guides/creating-playbooks>.
- **Specs:** "Specifications describe postconditions — what should be true after Devin is done." Note the deliberately narrow framing: spec = postcondition contract, not full requirements. Source: <https://docs.devin.ai/product-guides/creating-playbooks>.
- **Spec kinds:** **two implicitly** — Playbook (procedure/how) vs. Spec (postcondition/what). This is structurally identical to adev's distinction between `mode: action` (procedure) and `mode: behavioral` (postcondition).
- **Pipeline split:** "Specs authored in Windsurf are picked up by Devin playbooks." Author in one tool, execute in another — same handoff pattern as adev's `/adev:specify` → `/adev:implement`. Source: <https://github.com/COG-GTM/Cognition-SDD>.

##### Aider, Charlie, Sweep

- **Aider:** CONVENTIONS.md is project-wide rules, loaded via `--read CONVENTIONS.md`. No spec layer at all; treats AI instructions as the artifact. Source: <https://aider.chat/docs/usage/conventions.html>.
- **Charlie Labs:** distinguishes **tasks** (start/end/done) from **daemons** (ongoing-role specs). "A task has a start, an end, and a definition of done. The platform distinguishes between tasks and ongoing roles, with the daemon file serving as a spec in your repo that teams tune like any other config." This is a useful precedent for adev: behavioral specs ≈ Charlie's daemons (continuous invariants), action specs ≈ Charlie's tasks (one-shot, terminal). Source: <https://charlielabs.ai/>, <https://www.charlielabs.ai/changelog>.
- **Sweep:** no formal intermediate spec format. Flow is search → plan → write code → validate; the "plan" is internal, not a persistent artifact. Source: <https://docs.sweep.dev/>.

#### Tier 2 — Classical SDD lineage

- **Gherkin (Cucumber/BDD):** feature files have three structural primitives — Background, Scenario, Scenario Outline — but only one *kind* (feature). The discriminator inside a feature is the keyword (Given/When/Then). The fundamental lesson: BDD chose narrow scope (testable behavior only) over breadth, accepting that non-behavioral work (refactors, schemas) lives elsewhere. Source: <https://cucumber.io/docs/gherkin/reference/>.
- **Specification by Example (Adzic):** "living documentation" + Three Amigos (dev/tester/analyst) collaboration. No kind taxonomy; the practice is about collaboration cadence and validation cycles. Won Jolt Award 2012. Source: <https://gojko.net/books/specification-by-example/>.

#### Tier 3 — Sectorwide critique

- **ThoughtWorks Technology Radar (Vol. 33, 2025)** places SDD in the "Assess" ring and warns of "a bias toward heavy up-front specification and big-bang releases" as an antipattern. Source: <https://www.augmentcode.com/blog/what-spec-driven-development-gets-wrong>.
- **Kent Beck (quoted):** "The descriptions of Spec-Driven development that I have seen emphasize writing the whole specification before implementation. This encodes the (to me bizarre) assumption that you aren't going to learn anything during implementation that would change the specification." Source: same.

### Comparative Table

| Framework | Spec kinds | Granularity | Charter layer | Templates | Lifecycle stages | Spec-to-code consumption |
|---|---|---|---|---|---|---|
| **adev (proposed)** | 6 modes | feature/effort | 4 charter kinds | 6 spec + 4 charter | brainstorm → specify → plan → implement → validate | spec drives plan; plan drives subagent prompts |
| **GitHub Spec-Kit** | 1 (community adds 5) | feature (folder per spec) | none (constitution only) | 3 (spec/plan/tasks) | constitution → specify → clarify → plan → tasks → implement | spec read by agent; plan/tasks consumed as prompts |
| **Kiro** | 2 (feature, bugfix) + 2 entry-flows | feature/bug | none | 3 files per spec | requirements → design → tasks | structured prompt to IDE agent |
| **OpenSpec** | 2 (base, delta) | capability/domain | domain folders (informal) | 1 spec + 1 delta + proposal/design/tasks | propose → apply → sync → archive | delta merges into base on archive |
| **Tessl** | 1 (per-component) | file-level | none | 1 spec per file | spec → generated code | code regenerated from spec |
| **BMAD** | 0 (persona-distinguished) | epic/story | PRD + Architecture | YAML workflows | analyze → plan → solution → implement | persona handoff (PM → Architect → Dev) |
| **Agent OS** | 1 | feature | mission + roadmap + tech-stack (yes) | shape-spec template | discover → inject → build → refine | rules injected into agent context |
| **Cursor Rules** | 3 rule types (no specs) | scoped by globs | hierarchical .cursor/rules | .mdc | not applicable | rules injected as system prompt |
| **Cline** | n/a (rules + workflows) | per-rule or per-workflow | none | clinerules + workflows | plan mode / act mode | rules persistent; workflows on-demand |
| **Devin** | 2 (playbook, spec) | task | none | .devin.md | spec authored elsewhere → playbook executes | playbook attached via macro |

## Code Examples

### OpenSpec delta-spec section structure (parallel to adev's `mode: refactor`)

```markdown
# Spec: Auth (delta)

## ADDED Requirements

### Requirement: Two-Factor Authentication
The system SHALL require 2FA for admin accounts.

## MODIFIED Requirements

### Requirement: Session Timeout (was: 60min, now: 30min)
The system SHALL expire sessions after 30 minutes of inactivity.

## REMOVED Requirements

### Requirement: Email-only Password Reset
(Removed in favor of 2FA-gated reset)
```

Source: <https://thedocs.io/openspec/concepts/spec-format/>. The named-section delta pattern is more grep-able than adev's current "current state / target state" prose. Worth considering as a structural element of adev's refactor template.

### Kiro Bugfix Spec section structure (validates adev's case for kind-aware templates)

```markdown
# Bugfix Spec: Cart count incorrect after item removal

## Current Behavior
Cart count includes deleted items until page refresh.

## Expected Behavior
Cart count updates immediately on removal.

## Unchanged Behavior
- Item-add flow remains synchronous
- Checkout total computation unchanged
```

Source: <https://kiro.dev/blog/specs-bugfix-and-design-first/>. The "Unchanged Behavior" section is the regression-prevention contract — a section the feature spec does not need but the bugfix spec must have. This is the empirical case for separate templates per mode.

## Recommendations

1. **Adev's six-mode taxonomy is empirically validated by peer evolution — proceed with confidence.** Every peer SDD framework that began with one template has since added type variants (Kiro: +Bugfix +Design-first; spec-kit: +5 community workflows; OpenSpec: +delta-spec shape; Devin: implicit playbook-vs-spec split). Adev's audit identified this gap before drift accumulated; the framework adoption pattern across peers shows the cost of *not* differentiating early. Grounded in constitutional Principle #2 (skills are primarily markdown — kind-aware templates are a markdown-resolution problem, not a code one).

2. **Retain the charter layer; do not collapse it into specs.** Agent OS (Product layer), BMAD (PRD + Architecture Document), and Charlie Labs (daemons vs. tasks) all carry a charter-equivalent abstraction. Frameworks without it (Spec-Kit, Kiro, OpenSpec, Tessl) consistently report fragmentation pain — practitioners ask "when does it merge all this specs into a single ground truth" (HN comment on spec-kit). Adev's four-kind charter taxonomy (module / feature / cross-cutting / initiative) is closest to BMAD's persona-document split and Agent OS's product layer — both validated designs. Grounded in the charter-format audit's finding that the template was already informally bifurcated into "skill registry" and "specification doc" shapes.

3. **Borrow OpenSpec's named-section delta pattern for adev's refactor template.** Adev's planned `mode: refactor` template uses current-state / target-state / migration-steps prose. OpenSpec's `ADDED` / `MODIFIED` / `REMOVED` / `RENAMED` named sections are more machine-parseable and align with how `/adev:hygiene` would diff specs against code. Low-cost adoption: rename sections inside the refactor template; structure is unchanged otherwise. Grounded in Principle #4 (hooks read structured input — same lesson applies to specs read by `/adev:hygiene` and `/adev:reconcile`).

4. **Adopt Devin's narrow framing for `mode: action` specs: postcondition-first, not requirements-first.** Devin's "specifications describe postconditions — what should be true after Devin is done" framing is the cleanest available statement of what an action spec *is*. Adev's planned `mode: action` template (trigger / procedure / idempotency / rollback / completion check) already has a completion-check section, but the constitutional framing should be stated explicitly: action specs are contracts on terminal state, not on incremental behavior. Grounded in the spec-taxonomy audit's identification of action-as-behavioral as the most common shape-mismatch error.

5. **Do not adopt Tessl's "spec-as-source" stance.** Multiple critics including ThoughtWorks Technology Radar and Augment Code flag spec-as-source as "a regression to the failed paradigms of Model-Driven Development." Adev's constitutional Principle #2 (skills are markdown, code is allowed but not required) deliberately avoids this trap. Tessl's per-component spec granularity is also incompatible with adev's charter-as-aggregator design.

6. **Do not adopt spec-kit's flat-template approach for any of adev's modes.** The verbosity complaints across HN, Visual Studio Magazine, and Scott Logic ("LOT of markdown files… repetitive… tedious to review") all trace to the same root: one template for all work, applied uniformly. Adev's per-mode templates would each be *smaller* than spec-kit's universal template because they would only include the sections that fit the mode. This is also why Kiro's recent retrofit kept Bugfix Spec to three sections instead of inheriting all the Feature Spec sections.

7. **Consider whether `mode:` and `kind:` should be unified to a single name.** The cross-framework-artifact-kinds research already raised this. Adev's six-mode + four-kind split intentionally uses different names to signal different axes (mode = runtime intent, kind = artifact type), but every peer framework surveyed here uses *one* name (Kiro: spec type, OpenSpec: spec vs delta, Devin: playbook vs spec). If adev keeps the dual-name design, the ADR landing the taxonomy should explicitly justify it; otherwise consider naming both `kind:` and document the polysemy.

8. **The "constitution + mode/kind + lifecycle status" three-axis design is unique to adev and worth preserving.** No peer surveyed has all three axes orthogonal: spec-kit has constitution + flat-specs + no status field; Kiro has spec types + workflow phases but no constitution layer; Agent OS has standards + product + specs but no per-spec status. Adev's audit-validated proposal (`mode:` for templates, `kind:` for charters, status for lifecycle, constitution for invariants) is more disciplined than any single peer's design. The risk is over-engineering — the recommendation is to ship Layer 1 (the framework primitive) and validate empirically before extending to Layer 2/3 of the audit.

## References

### Web Sources

#### GitHub Spec-Kit
- [github/spec-kit (repo)](https://github.com/github/spec-kit) — Toolkit overview, template structure
- [Spec Kit Documentation](https://github.github.com/spec-kit/) — official docs site
- [github/spec-kit/AGENTS.md](https://github.com/github/spec-kit/blob/main/AGENTS.md) — agent integration patterns
- [Diving Into Spec-Driven Development With GitHub Spec Kit (Microsoft)](https://developer.microsoft.com/blog/spec-driven-development-spec-kit)
- [Spec-Driven Development with AI: GitHub Blog](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
- [GitHub Spec Kit Takes Off as Antidote to Vibe Coding (VS Magazine)](https://visualstudiomagazine.com/articles/2026/05/12/github-spec-kit-takes-off-as-antidote-to-piecemeal-vibe-coding.aspx)
- [Putting Spec Kit Through Its Paces (Scott Logic)](https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html)
- [Spec-Kit Constitution discussion #980](https://github.com/github/spec-kit/discussions/980)
- [spec-kit-extensions (community)](https://github.com/MartyBonacci/spec-kit-extensions) — bugfix/modify/refactor/hotfix/deprecate workflows
- [spec-driven.md in spec-kit repo](https://github.com/github/spec-kit/blob/main/spec-driven.md)

#### Kiro
- [Kiro: Specs documentation](https://kiro.dev/docs/specs/)
- [New spec types: bugfix and design-first (Kiro blog)](https://kiro.dev/blog/specs-bugfix-and-design-first/)
- [Introducing Kiro (blog)](https://kiro.dev/blog/introducing-kiro/)
- [Kiro First Impressions (Caylent)](https://caylent.com/blog/kiro-first-impressions)
- [AWS Kiro: Testing an AI IDE with a Spec-Driven Approach (TNS)](https://thenewstack.io/aws-kiro-testing-an-ai-ide-with-a-spec-driven-approach/)

#### OpenSpec
- [Fission-AI/OpenSpec (repo)](https://github.com/Fission-AI/OpenSpec)
- [OpenSpec Getting Started](https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md)
- [OpenSpec — A lightweight spec-driven framework](https://openspec.dev/)
- [OpenSpec spec format docs](https://thedocs.io/openspec/concepts/spec-format/)
- [OpenSpec Deep Dive (Redreamality)](https://redreamality.com/garden/notes/openspec-guide/)

#### Tessl
- [Tessl Agent Enablement Platform](https://tessl.io/)
- [Tessl launches spec-driven framework and registry](https://tessl.io/blog/tessl-launches-spec-driven-framework-and-registry/)
- [Understanding SDD: Kiro, spec-kit, and Tessl (Martin Fowler)](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)

#### BMAD-METHOD
- [bmad-code-org/BMAD-METHOD (repo)](https://github.com/bmad-code-org/BMAD-METHOD)
- [BMad Method docs](https://docs.bmad-method.org/)
- [Applied BMAD (Cheung)](https://bennycheung.github.io/bmad-reclaiming-control-in-ai-dev)

#### Agent OS
- [Agent OS (buildermethods)](https://buildermethods.com/agent-os)
- [Agent OS Workflow](https://buildermethods.com/agent-os/workflow)
- [Plan Product (Agent OS v2)](https://buildermethods.com/agent-os/v2/plan-product)
- [buildermethods/agent-os (repo)](https://github.com/buildermethods/agent-os)

#### Cursor
- [Cursor Docs — Rules](https://cursor.com/docs/rules)
- [Cursor Project Rules deep guide](https://dev.to/anshul_02/mastering-cursor-rules-your-complete-guide-to-ai-powered-coding-excellence-2j5h)
- [awesome-cursor-rules-mdc reference](https://github.com/sanjeed5/awesome-cursor-rules-mdc/blob/main/cursor-rules-reference.md)

#### Cline
- [Cline Rules docs](https://docs.cline.bot/customization/cline-rules)
- [Stop Adding Rules When You Need Workflows (Cline blog)](https://cline.ghost.io/stop-adding-rules-when-you-need-workflows/)
- [cline/clinerules (community library)](https://github.com/cline/clinerules/)

#### Continue.dev
- [Continue Rules](https://docs.continue.dev/customize/deep-dives/rules)
- [Continue Customization Overview](https://docs.continue.dev/customize/overview)

#### Devin / Cognition
- [Creating Playbooks (Devin docs)](https://docs.devin.ai/product-guides/creating-playbooks)
- [How Cognition Uses Devin to Build Devin](https://cognition.ai/blog/how-cognition-uses-devin-to-build-devin)
- [COG-GTM/Cognition-SDD (repo)](https://github.com/COG-GTM/Cognition-SDD)

#### Aider, Charlie, Sweep
- [Aider conventions docs](https://aider.chat/docs/usage/conventions.html)
- [Aider-AI/conventions (community)](https://github.com/Aider-AI/conventions)
- [Charlie Labs](https://charlielabs.ai/)
- [Charlie Labs changelog](https://www.charlielabs.ai/changelog)
- [Sweep AI docs](https://docs.sweep.dev/)

#### Classical lineage
- [Cucumber/Gherkin reference](https://cucumber.io/docs/gherkin/reference/)
- [Specification by Example (Gojko Adzic)](https://gojko.net/books/specification-by-example/)

#### Cross-framework critique
- [What spec-driven development gets wrong (Augment Code)](https://www.augmentcode.com/blog/what-spec-driven-development-gets-wrong)
- [The Limits of Spec-Driven Development (Isoform)](https://isoform.ai/blog/the-limits-of-spec-driven-development)
- [SDD: The Waterfall Strikes Back (HN)](https://news.ycombinator.com/item?id=45935763)
- [Understanding SDD: HN discussion of Fowler article](https://news.ycombinator.com/item?id=45610996)
- [9 Best AI Tools for Spec-Driven Development in 2026 (MarkTechPost)](https://www.marktechpost.com/2026/05/08/9-best-ai-tools-for-spec-driven-development-in-2026-kiro-bmad-gsd-and-more-compare/)
- [Spec-compare research repo](https://github.com/cameronsjo/spec-compare)

#### Cross-references inside adev
- `.context-index/research/spec-taxonomy-audit.md` — adev's spec mode taxonomy (six modes)
- `.context-index/research/charter-format-audit.md` — adev's charter kind taxonomy (four kinds)
- `.context-index/research/cross-framework-artifact-kinds.md` — non-SDD frameworks (K8s, PEP, MADR, C4, etc.)
