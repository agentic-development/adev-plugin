---
type: research
title: Work State Tracking Gaps & Improvement Opportunities
status: draft
created: 2026-04-10
---

# Work State Tracking Gaps & Improvement Opportunities

Research into how unfinished/deferred work gets lost between skills, and how to improve traceability between specs, plans, and the issue board.

## 1. Current State: What Exists Today

### 1.1 The Lifecycle Flow

```
brainstorm → specify → review-specs → plan → implement → validate → debug → hygiene
                                         ↓
                                   issue board
                                   (epics + issues)
```

**Forward tracking is strong.** The pipeline from spec to implementation has clear handoffs:
- `/adev:plan` creates `.plan.md` files, epics, and issues with `planRef` + `planTask` links
- `/adev:implement` reads execution state, updates issues, stamps source manifests on specs
- `/adev:validate` verifies source manifests, spec compliance, and constitution adherence

### 1.2 Issue System Capabilities

Issues support: `open | in_progress | closed | deferred` statuses, priorities 0-4, types (bug/feature/task), epic grouping, `planRef`/`planTask` linking, dependency tracking with cycle detection, and close guards.

Epics support: `planRef`, milestone, and status tracking.

### 1.3 Drift Detection That Exists

| Check | Where | What It Detects |
|-------|-------|-----------------|
| Spec revision vs review revision | `/adev:plan` Step 1 | Spec changed after review |
| File hash drift | `/adev:plan` Step 1 | Spec file modified since review |
| Source manifest verification | `/adev:validate` Check 1.5 | Code changed after implementation |
| Execution state vs issue board | `issue-reminder.mjs` hook | Active work but no in_progress issues |
| Spec status vs charter capability | `/adev:hygiene` Pass 12 | Status mismatches between charter and spec |
| Revision drift | `/adev:hygiene` Pass 12 | Spec revision > review's last-reviewed-revision |

### 1.4 Execution State File

`.context-index/.execution-state.md` tracks `status: active|idle|blocked`, `planRef`, `currentTask`, `issueBinding`, and a progress checklist. Written by `/adev:implement`, read by the session-start hook for resumption.

---

## 2. Identified Gaps

### GAP-1: No Plan-to-Issue Reconciliation (HIGH)

**Problem:** There is no mechanism to detect or report:
- Plans (`.plan.md` files) that have no corresponding epic/issues on the board
- Issues on the board whose `planRef` points to a deleted or modified plan
- Partial issue creation (plan has 6 tasks, only 4 issues were created)

**How work gets lost:** If `/adev:plan` runs but the `tasks.backend` isn't configured, or if issue creation is interrupted, plans exist with no board representation. Nobody notices.

**Current mitigation:** `/adev:implement` can create issues on-the-fly if missing (SKILL.md line ~58-61), but this is reactive, not proactive.

### GAP-2: No Spec-to-Board Reconciliation (HIGH)

**Problem:** There is no way to answer: "Which specs don't have plans or issues yet?" or "Which issues reference specs that have changed?"

The hygiene skill has 13 audit passes, but **none** cross-reference specs against the issue board. Pass 11 (Phase Coverage) checks charter capabilities vs spec statuses, but never looks at the issue board. Pass 12 (Lifecycle Audit) checks revision/file drift but only between specs and reviews, not between specs and issues.

**How work gets lost:** A spec reaches `review-passed` status but never gets planned. It sits there indefinitely with no visibility. Conversely, issues exist for work that specs have since been revised to exclude.

### GAP-3: Deferred Status is a Dead End (MEDIUM)

**Problem:** Issues can be set to `deferred` status (used by `/adev:implement` for tasks marked "MANUAL - requires human implementation"), but:
- No skill audits or surfaces deferred issues
- No periodic review mechanism for deferred work
- No aging alerts (a deferred issue from 30 days ago looks the same as one from yesterday)
- `/adev:hygiene` doesn't check for stale deferred issues

**How work gets lost:** Human-only tasks get deferred and forgotten permanently.

### GAP-4: No Cross-Session Work Continuity View (MEDIUM)

**Problem:** The execution state file tracks the *current* task in *one* plan. But there's no aggregate view of:
- All in-progress work across all plans/epics
- What was worked on in previous sessions but not completed
- Which epics are partially complete (3 of 6 issues closed)

**How work gets lost:** Each session starts fresh. The session-start hook surfaces the execution state if `status: active`, but if it was cleared (set to `idle`) at the end of a previous session while work remains incomplete at the epic level, that context is gone.

### GAP-5: No "Definition of Done" Enforcement (MEDIUM)

**Problem:** There's no checklist that must be satisfied before an epic or feature can be considered complete. The lifecycle goes plan → implement → validate, but there's nothing that checks:
- All issues in the epic are closed
- The spec status has been updated to `validated`
- Source manifests are stamped
- The charter capability status is updated

Each of these is done by individual skills, but there's no aggregate "is this feature fully done?" check.

### GAP-6: Phase 2 Task Management Never Shipped (MEDIUM)

**Problem:** The task-management charter (`.context-index/specs/features/task-management/charter.md`) explicitly lists Phase 2 items as nice-to-have:
- `/adev:status` integration (read issue board for progress dashboard)
- `/adev:recover` integration (read/reset stuck issues)
- `/adev:hygiene` auditing stale issues and orphaned boards
- Session compaction context (inject claimed issue context on compaction)

None of these were implemented. They represent the exact "backward auditing" capabilities that are missing.

### GAP-7: No Orphan Detection (LOW)

**Problem:** Artifacts can become orphaned with no detection:
- Plan files whose specs were deleted
- Review files whose specs were deleted
- Epic references to non-existent plans
- Issues with `planRef` pointing to moved/deleted files

---

## 3. Industry Best Practices (Web Research)

### 3.1 Requirements Traceability Matrix (RTM)

A bidirectional mapping between requirements, design artifacts, implementation, and tests. Key principles:
- **Every requirement traces forward** to implementation and tests
- **Every implementation traces backward** to its requirement
- **Coverage gaps are visible** (requirements with no implementation, implementations with no requirement)
- **Status is tracked per link** (planned, in-progress, complete)

**Relevance:** The adev system has forward tracing (spec → plan → issue → code via `planRef`/source-manifest) but lacks backward tracing and coverage gap detection. Acceptance-criterion-level traceability (mapping `{criterion-id} → [{issue-id}]`) would let hygiene detect uncovered criteria without re-reading the full plan.

### 3.2 Drift Detection (from IaC patterns)

Infrastructure-as-Code tools like Terraform/Spacelift define "drift" as any difference between desired state (configuration) and actual state (infrastructure). Key patterns:
- **Scheduled drift detection** runs periodically, not just on-demand
- **Reconciliation** is a distinct action from detection (detect first, then choose to fix or ignore)
- **Desired state is the source of truth**, actual state is compared against it
- **Cascade invalidation**: when the desired state changes, all derived artifacts are flagged as potentially stale

**Relevance:** Specs are the "desired state" and the issue board + code is the "actual state." When a spec's revision bumps, all issues derived from plans based on that spec version should be flagged. The system should periodically detect drift between them.

### 3.3 Definition of Done (DoD)

A shared checklist that defines when work is truly complete. Best practices:
- Embed the DoD directly into work items so it's always visible
- DoD should cover: code quality, tests, documentation, review, deployment readiness
- Items not meeting DoD stay open, preventing premature closure
- Per-issue DoD stamps (e.g., `"DoD: tests-pass, spec-review-pass, code-review-pass"`) make it possible to audit closed issues for completeness without re-reading session logs

**Relevance:** Epics have no DoD. Issues can be closed individually, but there's no aggregate check that "the feature is done." Epic auto-close on last issue closure would enforce completeness.

### 3.4 Agentic Workflow State Management

From McKinsey, Google, and Microsoft research on agentic development:
- **Git as the state store**: branches represent workflows, commits represent completed phases
- **Deterministic workflow engines** are preferred over agent self-orchestration for tracking
- **Checkpoint after every side effect**, use human-readable formats, support resume-from-checkpoint
- **State should be explicit and inspectable**, not implicit in conversation history
- **Dual-state reconciliation**: the execution state file and issue board are parallel state systems that can diverge — startup checks should verify they agree on what's `in_progress`

**Relevance:** The execution state file is a good start, but it only tracks one active task. A broader "project state" view is needed, and startup reconciliation between execution state and the board would prevent silent divergence.

### 3.5 Deferred Work Anti-Patterns

From Agile/Scrum practices and project management research:
- **Deferred decay**: items deferred without periodic review become graveyards of forgotten work
- **Deferred-with-reason**: requiring structured deferral reasons (e.g., MISSING_CONTEXT, AMBIGUOUS_SPEC) creates context for triage
- **Deferred-until triggers**: linking deferral to a condition ("defer until dependency X merged") enables automated resurfacing
- **Blocked as first-class status**: distinct from `deferred`, captures "stuck for reasons beyond the dependency graph" (missing context, tool failure, ambiguous spec)

**Relevance:** The current `deferred` status has no reason field, no staleness alarm, and no distinction from `blocked`. The existing recovery categories from `/adev:recover` (MISSING_CONTEXT, AMBIGUOUS_SPEC, etc.) could serve as structured deferral reasons.

---

## 4. Core Problem: Code Drifts Outside the Lifecycle

The gaps in Section 2 assume agents follow the lifecycle. In practice, they often don't — code gets written directly without specs, plans, or issues. When this happens, all top-down tracking (specs, plans, issue board) becomes stale documentation. The architecture says one thing, the code says another, and nobody knows which is true.

**The fundamental tension:**
- **Top-down artifacts** (charters → specs → plans → issues) describe *intent* — what should exist
- **Bottom-up reality** (files → symbols → git history) describes *what actually exists*
- **Source manifests** are the only bridge, but they only exist for the ~50% of specs that went through `/adev:implement`

The key insight: **git history is the only artifact that's always accurate and can never go stale**. Every line of code permanently knows which commit created it. If commits carry lifecycle metadata (trailers), the provenance chain is embedded in immutable history.

### 4.1 Existing Infrastructure (Almost Ready)

The plumbing for git-based traceability already exists but isn't fully active:

| Component | Status | Location |
|-----------|--------|----------|
| `prepare-commit-msg` hook | Exists but **inactive** (`core.hooksPath` not set) | `.githooks/prepare-commit-msg` |
| `Spec:` trailer injection | Implemented in hook, reads session JSONL | `.githooks/prepare-commit-msg` |
| `Plan-task:` trailer injection | Implemented in hook | `.githooks/prepare-commit-msg` |
| `Session:` trailer injection | Implemented in hook | `.githooks/prepare-commit-msg` |
| Session JSONL capture | Active, fires on every tool use | `hooks/session-capture.sh` |
| Post-commit session summary | Implemented | `.githooks/post-commit` |
| `Issue:` trailer | **Not implemented** | — |
| `Author-type:` trailer | **Not implemented** | — |
| `commit-msg` validation hook | **Not implemented** | — |
| `Lifecycle: untracked` fallback marker | **Not implemented** | — |

### 4.2 The Provenance Chain

With trailers flowing, every line of code traces back to the full lifecycle context:

```
file:line
  → git blame → commit SHA
    → trailers → Spec: path/to/spec.md
                 Plan-task: 3
                 Session: 2026-04-06T18:11-a1b2c3d
                 Issue: issue-15
                 Author-type: agent/claude-code
      → issue board → epic-3, status: closed
        → spec → status: validated, charter: task-management
```

**Commits without trailers are the signal for lifecycle bypass.** No heuristics needed — the absence of metadata IS the detection.

### 4.3 Author Attribution: Human vs Agent

The `session_id` field in the session JSONL log is present when code is written inside a Claude Code (or other agent) session, and absent for human-only work. The `prepare-commit-msg` hook can use this to inject an `Author-type:` trailer:

| Scenario | `session_id` in JSONL? | `Author-type:` trailer |
|----------|----------------------|------------------------|
| Agent commit (Claude Code) | Yes | `agent/claude-code` |
| Agent commit (Codex) | Yes | `agent/codex` |
| Agent commit (OpenCode) | Yes | `agent/opencode` |
| Human commit (outside any agent) | No | `human` |
| Human commit (inside agent session) | Yes | `agent/<provider>` |

The provider is already resolved in `session-capture.sh` (from stdin or `manifest.yaml`). The `prepare-commit-msg` hook reads the same JSONL file and can extract the provider from the most recent entry with a `session_id`.

**Example: lifecycle-tracked agent commit:**
```
feat(issues): add cycle detection

Implement BFS-based cycle detection.

Spec: .context-index/specs/features/task-management/lifecycle-integration.md
Plan-task: 3
Session: 2026-04-06T18:11-a1b2c3d
Issue: issue-15
Author-type: agent/claude-code
```

**Example: human quick-fix (no agent session):**
```
fix: typo in README

Author-type: human
Lifecycle: untracked
```

**Example: agent commit that bypassed the lifecycle:**
```
refactor: extract helper function

Session: 2026-04-10T09:22-f4e5d6a
Author-type: agent/claude-code
Lifecycle: untracked
```

This enables queries like:
- `git log --format='%(trailers:key=Author-type)' -- lib/` → who wrote each module?
- `git shortlog` grouped by `Author-type` → what % of commits are agent vs human?
- `git blame` + trailer lookup → per-line attribution of human vs agent authorship
- Hygiene audits → "agent commits without Spec: trailer" = agent bypassed the lifecycle

### 4.4 Strategy: Git-Blame Provenance (Priority: CRITICAL)

#### Step 1: Activate the trailer pipeline

- Configure `core.hooksPath` during `/adev:init` (the CLI already scaffolds `.githooks/` but doesn't always set the git config)
- Add `Issue:` trailer to `prepare-commit-msg` (read from execution state's `issueBinding` field)
- Add `Author-type:` trailer to `prepare-commit-msg` (read provider from session JSONL; `human` if no `session_id`)

#### Step 2: Add a `commit-msg` validation hook

A hook that runs after the message is prepared, enforces lifecycle trailers, and attributes authorship. Behavior:

- **If `Spec:` trailer exists**: pass through (exit 0) — lifecycle-tracked commit
- **If no `Spec:` trailer but staged files are all unclaimed** (not in any source manifest): append `Lifecycle: untracked` and pass through (exit 0) — new code, allowed without lifecycle
- **If no `Spec:` trailer but staged files ARE claimed by a source manifest**: **block the commit** (exit 2) with message: "These files are tracked by a spec's source manifest. Add a Spec: trailer or use --no-verify to bypass."

This means: **once a file enters the lifecycle, it stays tracked.** Modifying lifecycle-managed code without referencing the spec is blocked. New files that no spec has claimed can be committed freely (but are marked `Lifecycle: untracked`).

The `Author-type:` trailer is always appended regardless of blocking — even if the commit is allowed through, the authorship attribution is recorded.

#### Step 3: Add a provenance query to `/adev:hygiene` (new pass)

A hygiene pass that scans source files and classifies them by git provenance:

```
## Code Provenance Audit

Scanned: 45 source files, 312 commits

### Fully Traced (28 files)
All commits have Spec + Plan-task trailers → linked to charter/spec/issue
  - lib/issues/file-adapter.mjs → spec-lifecycle/lifecycle-integration.md (issue-13, closed)
  - lib/source-manifest.mjs → spec-lifecycle/source-manifest.md (issue-5, closed)
  ...

### Partially Traced (8 files)
Some commits have trailers, later commits don't → post-implementation drift
  - hooks/issue-reminder.mjs → session-awareness/idle-nudge.md, but 3 recent commits untracked
  - lib/repomap/parse.mjs → tree-sitter-repomap/parser.md, but 1 recent commit untracked
  ...

### Untraced (9 files)
No commits have lifecycle trailers → written entirely outside the lifecycle
  - lib/foo.mjs — 5 commits, none with Spec: trailer
  - hooks/new-hook.sh — 2 commits, none with Spec: trailer
  ...

**Actions:**
- [ ] 8 files have post-implementation drift — review if specs need updating
- [ ] 9 files have no lifecycle provenance — consider creating specs or marking as intentionally untracked
```

#### Step 4: Enhance `/adev:status` with provenance summary

Add a "Code Provenance" section to `--all` mode that shows aggregate counts:

```
Code Provenance: 28 traced, 8 drifted, 9 untraced (45 total)
```

This gives immediate visibility into how much of the codebase is lifecycle-managed vs not.

### 4.4 Enhance `/adev:status` with Board Cross-Referencing (Priority: HIGH)

`/adev:status` already exists with per-spec, per-charter, per-milestone, and `--all` dashboard modes. Extend `--all` to also:

- **Issue board summary**: Total epics/issues, counts by status (open/in_progress/closed/deferred)
- **Deferred work**: All deferred issues with age and original deferral reason
- **Stale work**: Open issues older than 30 days with no status change
- **Unplanned specs**: Specs at `review-passed` with no `.plan.md` file
- **Epic completeness**: Epics where all issues are closed but epic status is still `open`

All computed at query time from existing artifacts — no new files to maintain.

### 4.5 New Hygiene Pass: Issue Board Audit (Priority: HIGH)

Add a Pass 14 to `/adev:hygiene` that cross-references specs, plans, and the issue board:

1. **Orphaned plans**: `.plan.md` files with no corresponding epic on the board
2. **Orphaned issues**: Issues whose `planRef` points to a non-existent file
3. **Partial epics**: Epics where issue count doesn't match plan task count
4. **Stale deferred**: Deferred issues older than 14 days with no notes update
5. **Epic completeness**: Epics where all issues are closed but epic status is still `open`
6. **Plan-spec consistency**: Plans whose parent spec has been modified since the plan was created

### 4.6 New Skill: `/adev:reconcile` (Priority: MEDIUM)

Interactive repair for mismatches found by hygiene/status:

- **Spec → Board**: "Spec X is `review-passed` but has no plan. Create a plan?"
- **Plan → Board**: "Plan Y has 6 tasks but only 4 issues. Create the missing issues?"
- **Board → Spec**: "Issue Z's planRef points to a deleted spec. Close as obsolete?"
- **Untraced code**: "9 files have no lifecycle provenance. Create specs or mark as intentionally untracked?"

### 4.7 Feature Completeness DoD in `/adev:implement` (Priority: MEDIUM)

At the end of implementation, add a "feature completeness" checklist:

```
## Feature Completeness Check
- [ ] All epic issues closed
- [ ] Source manifest stamped on spec
- [ ] Spec status updated to `implemented`
- [ ] Charter capability status updated
- [ ] Epic status updated to `closed` (if all issues done)
```

---

## 5. Prioritized Recommendations

| # | Improvement | Impact | Effort | Priority |
|---|------------|--------|--------|----------|
| 1 | Activate trailer pipeline + `commit-msg` hook with selective blocking | Foundation for all provenance tracking; prevents lifecycle-managed code from drifting untracked | Low | CRITICAL |
| 2 | Code Provenance hygiene pass | Detects lifecycle bypass from code, not specs; classifies all files by trace status and author type | Medium | HIGH |
| 3 | Enhance `/adev:status` with board + provenance summary | Single "what's left?" answer including agent vs human attribution | Medium | HIGH |
| 4 | Hygiene Pass 14: Issue Board Audit | Catches orphans, stale items, mismatches between specs/plans/issues | Medium | HIGH |
| 5 | `/adev:reconcile` skill | Interactive fix for detected mismatches including untraced code | Medium | MEDIUM |
| 6 | Feature completeness DoD in `/adev:implement` | Prevents premature "done" declarations | Low | MEDIUM |

### Recommended Implementation Order

1. **Activate trailer pipeline** first — without trailers flowing into commits, nothing downstream works. Fix `core.hooksPath` in init, add `Issue:` + `Author-type:` trailers, add `commit-msg` validation hook with selective blocking (block changes to source-manifest-claimed files without `Spec:` trailer) and `Lifecycle: untracked` fallback for unclaimed files
2. **Code Provenance hygiene pass** — the bottom-up complement to all existing top-down checks; classify files as fully-traced / partially-traced / untraced, and by author type (agent vs human)
3. **Enhance `/adev:status`** — aggregate provenance + board data for the unified dashboard
4. **Hygiene Pass 14** — top-down artifact reconciliation (specs ↔ plans ↔ issues)
5. **`/adev:reconcile`** — interactive repair using findings from steps 2-4
6. **DoD checklist** — embed completion verification in the workflow

---

## 6. Sources

- [Requirements Traceability Matrix Guide - TestRail](https://www.testrail.com/blog/requirements-traceability-matrix/)
- [Four Best Practices for Requirements Traceability - Jama Software](https://www.jamasoftware.com/requirements-management-guide/requirements-traceability/four-best-practices-for-requirements-traceability/)
- [Agentic Workflows for Software Development - McKinsey/QuantumBlack](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d)
- [Choose a Design Pattern for Agentic AI - Google Cloud](https://docs.google.com/architecture/choose-design-pattern-agentic-ai-system)
- [Definition of Done in Agile - Atlassian](https://www.atlassian.com/agile/project-management/definition-of-done)
- [Definition of Done: Examples & Checklist - Teaching Agile](https://teachingagile.com/scrum/psm-1/scrum-implementation/definition-of-done)
- [Infrastructure Drift Detection and Reconciliation - Spacelift](https://spacelift.io/drift-detection)
- [Drift Management in Cloud Infrastructure - Spacelift](https://spacelift.io/blog/drift-management)
- [Top AI Agentic Workflow Patterns - ByteByteGo](https://blog.bytebytego.com/p/top-ai-agentic-workflow-patterns)
- [AI Agent Workflow State Persistence Best Practices - Fastio](https://fast.io/resources/ai-agent-workflow-state-persistence/)
- [Checkpointing and Resuming Workflows - Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/tutorials/workflows/checkpointing-and-resuming)
- [LangGraph State Machines for Agent Task Flows](https://dev.to/jamesli/langgraph-state-machines-managing-complex-agent-task-flows-in-production-36f4)
- [End-to-end Traceability - Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/cross-service/end-to-end-traceability?view=azure-devops)
- [Minimalist Claude Code Task Management Workflow](https://medium.com/nick-tune-tech-strategy-blog/minimalist-claude-code-task-management-workflow-7b7bdcbc4cc1)
- [Status Tracking and Workflow State - BMAD Skills](https://deepwiki.com/aj-geddes/claude-code-bmad-skills/5.5-status-tracking-and-workflow-state)
- [C4 Model](https://c4model.com/)
- [Structurizr - Architecture as Code](https://structurizr.com/)
- [Architecture-as-Code](https://arch-as-code.org/)
- [Spec-Driven Development](https://dev.to/bobbyblaine/spec-driven-development-write-the-spec-not-the-code-2p5o)
