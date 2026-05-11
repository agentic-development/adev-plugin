---
topic: "v1.0.0 Release Research — Deferred Work, Domain Configurability, Plugin System, and New Directions"
date: "2026-05-06"
relates-to: "orchestration-tools-feature-ideas.md, self-learning-agents.md, anthropic-skill-best-practices.md, shared-session-memory.md"
sources:
  - internal
  - web
status: complete
---

## Summary

Comprehensive research for the v1.0.0 release covering four areas: (1) deferred work from prior releases that is ready to land, (2) domain-configurable charters and specs for software, data engineering, and process automation, (3) a plugin/extension system built on existing registry patterns, and (4) new development directions drawn from internal research and external orchestrator analysis.

The codebase is approximately 85% feature-complete for a 1.0 release. The biggest gaps are not missing features but incomplete wiring (heuristic extraction, execution state resume, manifest schema for test strategies) and two critical bugs (ghost validation, SHA drift). The three proposed new directions — domain profiles, extension packs, and bidirectional spec sync — build naturally on infrastructure already in place.

---

## Part 1: Deferred Work Inventory

### Critical Blockers (Must Fix for 1.0)

| ID | Title | Impact | Effort |
|----|-------|--------|--------|
| issue-184 | Ghost validation — `/adev:validate` fabricates PASS | Masks real failures; undermines lifecycle trust | Medium — 3 root causes to fix |
| issue-187 | review-specs SHA drift — SHA computed before status update | Blocks legitimate planning with false hash mismatches | Low — reorder two steps |
| issue-165 | context-pack.test.mjs persistent failure | Permanent CI blind spot; excluded from 15 validation runs | Low — diagnose or remove |

### Near-Complete Features (>80% done)

| Feature | Status | Remaining Work |
|---------|--------|----------------|
| Test Strategies Framework | 95% — 9 strategy types registered, detection heuristics working | issue-149: add `test_strategies` key to manifest schema |
| adev:build Refactor | 70% — `--full` and `--phase` modes implemented | issue-186: rewrite SKILL.md to document both modes |
| Multi-Repo Workspace Phase 1 | Validated and complete | None — ready to ship |
| Execution Profiles (ADR-0004) | Spec complete, adapters stubbed | Wire into review-specs and validate dispatchers |
| Configurable Registries (ADR-0003) | Spec complete, defaults authored | Wire governance/review.yaml and governance/validate.yaml loading into skills |

### Process Discipline Gaps

| ID | Gap | Impact |
|----|-----|--------|
| issue-166 | Heuristic extraction not wired | 15 PASS validations, only 2 heuristics extracted |
| issue-167 | Recovery records not being filed | `/adev:retro` cannot detect patterns |
| issue-169 | Spec commit trailers at 0% coverage | Provenance tracking not adopted across 204 commits |
| issue-168 | 9 charters missing capability maps | assessment, cli, design, hooks, implementation, maintenance, setup, planning, validation |
| issue-170 | 4 specs closed without formal validation | configurable-checks, configurable-reviewers, test-strategies, sync-index |

### Deferred Features (Scoped for Post-1.0)

| Feature | Charter Section | Dependency |
|---------|----------------|------------|
| Multi-Repo Workspace Phase 2 | Cross-repo orchestration, validation, governance | Phase 1 complete |
| Multi-Repo Workspace Phase 3 | Shared issue tracking, epic-board sync | Workspace-level beads DB |
| Production Confidence Layer | epic-35, no spec yet | Conceptual only |
| Custom user-defined personas | Output Personas charter, v2 | Persona resolution implemented |
| Configurable dimension weights | Assess charter, v2 | Run-assessment implemented |
| Security scanning (npm audit) | CI/CD charter, v2 | CI pipeline implemented |
| Document incremental update mode | Document charter, Phase 2 | Architecture generation done |
| Selective tier execution by changed files | Tiered Test Gates, v2 | Gate infrastructure in place |

---

## Part 2: Domain-Configurable Charters and Specs

### Current State — What's Already Domain-Aware

The framework is closer to domain-agnostic than it appears:

1. **Test strategies** — 9 registered types spanning software (unit, integration, contract, visual), data (fixture, schema), infra (policy, smoke), and performance (threshold). Detection heuristics auto-identify dbt, Terraform, protobuf, migrations, components.

2. **Reviewer registry** — `governance/review.yaml` already supports adding domain-specific reviewers (data quality, lineage, process flow) via `dispatch: triggered` with file pattern matching.

3. **Specialist routing** — manifest `specialists` section supports trigger patterns and keywords for domain-specific expert dispatch during implementation.

4. **Constitution** — fully user-editable. Users write domain-specific principles.

5. **Platform context** — declares tech stack; already domain-neutral.

### What's Hardcoded for Software

| Location | Hardcoding | Impact |
|----------|-----------|--------|
| `templates/live-spec-template.md` | Error Cases table column: `HTTP Status / Error Code` | Breaks for data pipelines, process automation |
| `templates/live-spec-template.md` | Visual Expectations section assumes browser UI | Irrelevant for data/process domains |
| `templates/charter-template.md` | Interface Contracts: "REST endpoint / function / event / message" | Wrong vocabulary for data contracts or workflow integrations |
| `skills/implement/SKILL.md` Step 2e | Visual Verification triggers on `*.tsx`, `*.jsx`, `*.vue`, `*.svelte` | Misses data pipeline outputs, process dashboards |
| `templates/review-specs/defaults.yaml` | Structural Architect checks "exposed/consumed APIs" | Doesn't check data lineage, SLAs, or process flows |
| `templates/constitution-template.md` | Example principles: "Never bypass authentication middleware" | Software-only examples; no data/process examples |

### Proposed: Domain Profiles

A `domain` field in `manifest.yaml` that controls template rendering, review criteria, and verification behavior:

```yaml
project:
  name: my-data-pipeline
  domain: data-engineering    # software (default) | data-engineering | process-automation | custom
```

**Phase 1 — Template Conditionals (Minimal Change)**

Rather than maintaining separate template files per domain, make existing templates domain-aware with conditional sections:

- **Error Cases columns**: `HTTP Status / Error Code` (software) | `Validation Action` (data) | `Recovery Action` (process)
- **Visual Expectations**: shown for software, replaced with `Output Expectations` (data) or `Flow Expectations` (process)
- **Interface Contracts vocabulary**: REST/function/event (software) | source/transform/sink (data) | webhook/queue/human-task (process)

The brainstorm and specify skills would read `domain` from manifest and render the appropriate template variant.

**Phase 2 — Domain-Specific Reviewers**

Bundle reviewer prompt files per domain:
- `templates/review-specs/data-quality-reviewer-prompt.md` — checks idempotence, lineage, SLA coverage
- `templates/review-specs/process-flow-reviewer-prompt.md` — checks error recovery, integration points, audit trails

These register in `defaults.yaml` with `dispatch: triggered` and domain-specific file pattern triggers.

**Phase 3 — Domain-Specific Quality Gates**

```yaml
quality_gates:
  software:
    - command: ["npm", "test"]
  data-engineering:
    - command: ["dbt", "test"]
    - command: ["dbt", "parse"]
  process-automation:
    - command: ["npm", "run", "test:workflows"]
```

**Backward Compatibility**: Default to `software` when `domain` is not specified. All existing projects continue working unchanged.

---

## Part 3: Extension Pack System

### Existing Infrastructure

The codebase already has most building blocks for a plugin/extension system:

| Pattern | Location | What It Does |
|---------|----------|-------------|
| Provider adapters | `lib/provider/registry.mjs` | `getProvider(name)` returns harness-specific adapter |
| Reviewer registry | `governance/review.yaml` + `lib/governance/review-config.mjs` | Declarative reviewer dispatch with `package.skill` external wrapping |
| Check registry | `governance/validate.yaml` | Declarative validation check dispatch |
| Execution profiles | `lib/profiles/` + ADR-0004 | Cross-harness dispatch abstraction with tool categories |
| Test strategy registry | `lib/test-strategies/registry.mjs` | Pluggable test strategy definitions |
| Issue backend adapters | `lib/issues/registry.mjs` | `getIssueManager(manifest)` with file/beads backends |
| Context packs | `lib/governance/context-pack.mjs` | Composable file bundles with `extends` |
| Golden samples | `.context-index/samples/` | Curated reference implementations |
| Template scaffolding | `cpSync()` in `/adev:init` | Template-based project setup |
| Marketplace registration | `.claude-plugin/marketplace.json` | Native Claude Code plugin discovery |

### Proposed: Extension Packs

An **extension pack** is a distributable bundle that plugs into existing registries. It is NOT a new plugin system — it's a packaging format over what already exists.

```
adev-pack-data-engineering/
  pack.yaml                          # manifest: name, version, domain, provides
  reviewers/
    data-quality-reviewer-prompt.md  # reviewer prompt file
    lineage-reviewer-prompt.md
  templates/
    charter-data.md                  # domain-specific charter template
    spec-data.md                     # domain-specific spec template
  strategies/
    fixture.yaml                     # test strategy profile override
    schema.yaml
  samples/
    dbt-model-gold.md                # golden sample for dbt models
  hooks/
    data-quality-gate.sh             # pre-merge data quality check
  governance/
    review-overlay.yaml              # reviewer entries to merge into review.yaml
    validate-overlay.yaml            # check entries to merge into validate.yaml
```

**pack.yaml schema:**

```yaml
name: data-engineering
version: 1.0.0
domain: data-engineering
provides:
  reviewers: [data-quality, lineage]
  templates: [charter-data, spec-data]
  strategies: [fixture, schema]
  samples: [dbt-model-gold]
  hooks: [data-quality-gate]
  governance:
    review: governance/review-overlay.yaml
    validate: governance/validate-overlay.yaml
requires:
  adev: ">=1.0.0"
```

**Installation flow:**

1. `npx adev-cli pack install adev-pack-data-engineering`
2. CLI reads `pack.yaml`, validates version compatibility
3. Copies reviewer prompts to `.context-index/specialists/` (or a new `packs/` dir)
4. Merges governance overlays into `review.yaml` and `validate.yaml` (project wins on conflicts)
5. Registers test strategies in manifest
6. Copies golden samples to `.context-index/samples/`
7. Installs hooks into `hooks/hooks.json`
8. Stamps `installed_packs` in manifest for tracking

**Key design decisions:**

- **No code execution in packs** — packs are markdown, YAML, and bash only, consistent with Principle 2 (skills are primarily markdown)
- **Project wins on merge conflicts** — pack governance overlays are defaults, not overrides
- **Packs are git-tracked** — installed pack files live in `.context-index/` and are committed, not hidden in a cache
- **No runtime dependency** — packs are installed once and become part of the project. Removing the pack source doesn't break the project

### Pack Ideas for 1.0 Launch

| Pack | Domain | Provides |
|------|--------|----------|
| `adev-pack-data-engineering` | Data | dbt/Spark reviewers, fixture/schema strategies, data charter template, lineage reviewer |
| `adev-pack-process-automation` | Process | workflow reviewer, integration reviewer, process charter template, retry/idempotence samples |
| `adev-pack-security` | Cross-cutting | OWASP reviewer, threat model template, security-focused acceptance criteria |
| `adev-pack-mobile` | Software | React Native reviewer, visual strategy with device matrix, mobile charter template |
| `adev-pack-infra` | Infra | Terraform reviewer, policy strategy, IaC charter template, drift detection samples |

---

## Part 4: New Development Directions

### From Internal Research

| Source | Idea | Impact | Readiness |
|--------|------|--------|-----------|
| `self-learning-agents.md` | **Heuristic extraction loop** — extract patterns from recovery/validation, re-inject at task start | +7.8% improvement (ERL/ExpeL research) | Infrastructure exists (`lib/heuristics.mjs`, store in `.context-index/memory/heuristics/`); wiring missing |
| `self-learning-agents.md` | **Positive pattern capture** — log what worked, not just what failed | Prevents drift from validated approaches | `/adev:learn` skill exists but adoption is 0% |
| `shared-session-memory.md` | **Execution state resume** — `.execution-state.md` injected at session start | Eliminates lost context across sessions | Partially implemented (epic-3); session-start wiring incomplete |
| `anthropic-skill-best-practices.md` | **Claude 4.6 tuning** — add `ultrathink` to reasoning tasks, `context: fork` on heavy skills, return-size constraints | Overall skill quality 7.3/10 → target 9/10 | P1 changes identified; no code changes yet |
| `anthropic-skill-best-practices.md` | **Anti-overengineering instructions** — add "do not add features beyond what the spec requires" to all implementation-phase skills | Prevents agent scope creep | Template change only |
| `tiered-test-gates-best-practices.md` | **Progressive confidence tiers** — fast (unit+lint) → integration → acceptance → pre-prod | Industry consensus (Fowler, Google, Thoughtworks) | Manifest gates schema extension needed |
| `token-cost-logging.md` | **Token cost tracking via Stop hook** — extend `.session-tracking.jsonl` with token fields | Cost visibility without SDK dependency | Watch anthropics/claude-code#38344 for native hook token exposure |

### From External Orchestrators

| Source | Idea | Fit for adev | Effort |
|--------|------|-------------|--------|
| **Kiro** | Bidirectional spec-code sync — code drift triggers spec update prompts | High — currently one-directional (spec → code), drift detected post-hoc by hygiene | Medium — new hook on file edit that checks spec alignment |
| **Kiro** | File-event hooks — triggers on save/create/delete | Medium — extends hook protocol beyond git/tool events | High — requires hook protocol change (human approval) |
| **Superpowers v5** | Visual brainstorming — HTML mockups during `/adev:brainstorm` | Medium — enhances design phase output | Low — companion output alongside charter, uses Playwright MCP |
| **gstack** | Parallel worktree execution — independent tasks run in isolated worktrees | High — significant speedup for multi-module builds | High — architectural change to implement skill |
| **Claude Code Agent Teams** | Peer-to-peer agent coordination — shared task list, messaging, file locking | Medium — relevant for workspace-level orchestration | High — requires new coordination primitives |
| **SpecKit** | Cross-agent portability — `.specify/` directory works in any AI tool | Already partially addressed — adev syncs to `.cursorrules`, `copilot-instructions.md`, `AGENTS.md` | Low — formalize the portability layer |
| **GSD** | Context-phase isolation — each phase gets clean context window | Already implemented — build orchestrator dispatches subagents with fresh context | None — validate existing approach |
| **Martin Fowler SDD analysis** | Spec-as-source (Tessl approach) — spec IS the code, no separate implementation | Low fit — violates adev's charter/spec/code separation | N/A — philosophical divergence |

### Synthesis: Recommended 1.0 Themes

Based on all research, five themes emerge for the v1.0 release:

#### Theme 1: Reliability (Fix What's Broken)
- Fix ghost validation (issue-184)
- Fix SHA drift (issue-187)
- Fix or remove context-pack test (issue-165)
- Complete test strategies manifest schema (issue-149)
- Complete adev:build SKILL.md rewrite (issue-186)

#### Theme 2: Domain Profiles
- Add `domain` field to manifest
- Make charter/spec templates domain-conditional
- Bundle data-engineering and process-automation reviewer prompts
- Domain-aware quality gates

#### Theme 3: Extension Packs
- Define `pack.yaml` schema
- Add `pack install` / `pack list` / `pack remove` to CLI
- Ship 2-3 launch packs (data-engineering, security, process-automation)
- Governance overlay merge logic

#### Theme 4: Self-Improvement Loop
- Wire heuristic extraction into validation and recovery flows
- Add execution state resume to session-start
- Apply Anthropic skill best practices P1 (ultrathink, anti-overengineering, return-size)
- Add positive pattern capture to `/adev:learn`

#### Theme 5: Spec Lifecycle Maturity
- Bidirectional spec-code sync (Kiro-inspired hook)
- Progressive test gate tiers in manifest
- Commit trailer adoption
- Visual brainstorming companion output

---

## Recommendations

### Must-Have for 1.0

1. **Theme 1 (Reliability)** — all 5 items. Ghost validation alone undermines the entire lifecycle.
2. **Domain profiles (Phase 1 only)** — `domain` field + template conditionals. Unlocks data/process use cases with minimal change.
3. **Extension pack schema** — define `pack.yaml` and `pack install`. Ship one launch pack (data-engineering) as proof of concept.
4. **Heuristic extraction wiring** — connect the existing infrastructure. Highest ROI self-improvement.
5. **Execution state resume** — complete the session-start wiring. Users lose context every session without this.

### Should-Have for 1.0

6. **Anthropic skill best practices P1** — ultrathink on reasoning skills, anti-overengineering instructions, return-size constraints.
7. **Bidirectional spec-code sync hook** — file-edit hook that checks spec alignment and prompts update.
8. **Progressive test gate tiers** — extend manifest gates schema.
9. **Charter capability maps** — fill the 9 empty charters (issue-168).

### Nice-to-Have for 1.0

10. **Visual brainstorming** — HTML mockup companion during brainstorm.
11. **Token cost tracking** — Stop hook approach.
12. **Additional extension packs** — security, process-automation, mobile.
13. **Commit trailer adoption** — spec-driven provenance.

---

## References

### Internal Files
- `.context-index/research/self-learning-agents.md` — heuristic extraction gap analysis
- `.context-index/research/anthropic-skill-best-practices.md` — 28-skill alignment audit
- `.context-index/research/shared-session-memory.md` — session state persistence
- `.context-index/research/tiered-test-gates-best-practices.md` — progressive confidence
- `.context-index/research/token-cost-logging-for-plugin-lifecycle-sk.md` — cost tracking approaches
- `.context-index/research/orchestration-tools-feature-ideas.md` — external tool analysis
- `.context-index/adrs/0003-configurable-review-validate-registries.md` — governance extensibility
- `.context-index/adrs/0004-execution-profiles.md` — cross-harness dispatch
- `.context-index/tasks/tasks.md` — issue board with all referenced issues

### External
- Martin Fowler SDD Tools analysis — Kiro, SpecKit, Tessl comparison
- Superpowers v5 — visual brainstorming, multi-host portability
- gstack — role-based orchestration, parallel worktree execution
- GSD — context-phase isolation
- Kiro — bidirectional spec sync, file-event hooks
- Claude Code Agent Teams — peer coordination primitives
- ERL/ExpeL research — +7.8% from heuristic extraction loops
