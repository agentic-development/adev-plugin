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

**Relevance:** The adev system has forward tracing (spec → plan → issue → code via `planRef`/source-manifest) but lacks backward tracing and coverage gap detection.

### 3.2 Drift Detection (from IaC patterns)

Infrastructure-as-Code tools like Terraform define "drift" as any difference between desired state (configuration) and actual state (infrastructure). Key patterns:
- **Scheduled drift detection** runs periodically, not just on-demand
- **Reconciliation** is a distinct action from detection (detect first, then choose to fix or ignore)
- **Desired state is the source of truth**, actual state is compared against it

**Relevance:** Specs are the "desired state" and the issue board + code is the "actual state." The system should periodically detect drift between them.

### 3.3 Definition of Done (DoD)

A shared checklist that defines when work is truly complete. Best practices:
- Embed the DoD directly into work items so it's always visible
- DoD should cover: code quality, tests, documentation, review, deployment readiness
- Items not meeting DoD stay open, preventing premature closure

**Relevance:** Epics have no DoD. Issues can be closed individually, but there's no aggregate check that "the feature is done."

### 3.4 Agentic Workflow State Management

From McKinsey and Google research on agentic development:
- **Git as the state store**: branches represent workflows, commits represent completed phases
- **Deterministic workflow engines** are preferred over agent self-orchestration for tracking
- **Execution tracing and retry/error handling** must be first-class concerns
- **State should be explicit and inspectable**, not implicit in conversation history

**Relevance:** The execution state file is a good start, but it only tracks one active task. A broader "project state" view is needed.

---

## 4. Proposed Improvements

### 4.1 Enhance Existing `/adev:status` Skill (Priority: HIGH)

`/adev:status` already exists at `skills/status/SKILL.md` with per-spec, per-charter, per-milestone, and `--all` dashboard modes. It already covers: charter/spec status counts, capability progress, drifted specs, specs needing re-review, milestone progress (when board configured), and recent sessions.

**What's missing — add these sections to `--all` mode:**
- **Issue board summary**: Total epics/issues, counts by status (open/in_progress/closed/deferred)
- **Deferred work**: All deferred issues with age and original deferral reason
- **Stale work**: Open issues older than 30 days with no status change
- **Unplanned specs**: Specs at `review-passed` with no `.plan.md` file (the 34-spec gap)
- **Orphaned plans**: `.plan.md` files with no corresponding epic on the board
- **Epic completeness**: Epics where all issues are closed but epic status is still `open`
- **Execution state**: Current active work from `.execution-state.md` (plan, task, blockers)

**Key design principle:** Make `--all` the single answer to "what's left?" by bridging the spec pipeline and issue board views that currently exist in isolation.

### 4.2 New Hygiene Pass: Issue Board Audit (Priority: HIGH)

Add a Pass 14 to `/adev:hygiene` that cross-references specs, plans, and the issue board.

**Checks:**
1. **Orphaned plans**: `.plan.md` files with no corresponding epic on the board
2. **Orphaned issues**: Issues whose `planRef` points to a non-existent file
3. **Partial epics**: Epics where issue count doesn't match plan task count
4. **Stale deferred**: Deferred issues older than 14 days with no notes update
5. **Stale open**: Open issues older than 30 days with no status change
6. **Epic completeness**: Epics where all issues are closed but epic status is still `open`
7. **Plan-spec consistency**: Plans whose parent spec has been modified since the plan was created (plan may be outdated)

### 4.3 New Skill: `/adev:reconcile` (Priority: HIGH)

An interactive skill that detects and offers to fix mismatches between specs, plans, and the issue board.

**Reconciliation directions:**
- **Spec → Board**: "Spec X is `review-passed` but has no plan. Create a plan?" 
- **Plan → Board**: "Plan Y has 6 tasks but only 4 issues. Create the missing issues?"
- **Board → Spec**: "Issue Z's planRef points to a deleted spec. Close as obsolete?"
- **Board → Board**: "Epic A has all issues closed. Close the epic?"
- **Deferred → Board**: "3 deferred issues older than 14 days. Review and re-open or close?"

### 4.4 Enhance `/adev:implement` Completion (Priority: MEDIUM)

At the end of implementation (after all tasks complete), add a "feature completeness" checklist:

```
## Feature Completeness Check
- [ ] All epic issues closed
- [ ] Source manifest stamped on spec
- [ ] Spec status updated to `implemented`
- [ ] Charter capability status updated
- [ ] Epic status updated to `closed` (if all issues done)
```

This is the "Definition of Done" embedded in the workflow.

### 4.5 Enhance Execution State for Multi-Epic Awareness (Priority: MEDIUM)

Extend `.execution-state.md` to optionally track a `recentWork` section:

```yaml
recentWork:
  - epicId: epic-3
    lastTask: 4
    status: completed
    completedAt: 2026-04-06T18:11:05.574Z
  - epicId: epic-2  
    lastTask: 6
    status: completed
    completedAt: 2026-04-02T14:07:28.099Z
```

This gives session-start hooks enough context to say "You recently completed epic-3 but epic-1 still has open issues."

### 4.6 Scheduled Hygiene Nudge (Priority: LOW)

A session-start hook check that detects if hygiene hasn't been run in N days and suggests it. Lightweight - just checks the timestamp on the last `drift-report.md`.

---

## 5. Prioritized Recommendations

| # | Improvement | Impact | Effort | Priority |
|---|------------|--------|--------|----------|
| 1 | Enhance `/adev:status` with board cross-referencing | Immediate visibility into all work state | Medium | HIGH |
| 2 | Hygiene Pass 14: Issue Board Audit | Catches orphans, stale items, mismatches | Medium | HIGH |
| 3 | `/adev:reconcile` skill | Interactive fix for detected mismatches | Medium | HIGH |
| 4 | Feature completeness DoD in `/adev:implement` | Prevents premature "done" declarations | Low | MEDIUM |
| 5 | Multi-epic execution state | Better session resumption context | Low | MEDIUM |
| 6 | Scheduled hygiene nudge hook | Proactive drift detection | Low | LOW |

### Recommended Implementation Order

1. **Enhance `/adev:status`** first - provides immediate diagnostic value with no mutations, builds on existing skill
2. **Hygiene Pass 14** next - integrates into existing audit infrastructure
3. **`/adev:reconcile`** third - uses status/hygiene findings to offer fixes
4. **DoD checklist** in implement - small enhancement to existing skill
5. **Multi-epic state** and **hygiene nudge** as polish

---

## 6. Sources

- [Requirements Traceability Matrix Guide - TestRail](https://www.testrail.com/blog/requirements-traceability-matrix/)
- [Four Best Practices for Requirements Traceability - Jama Software](https://www.jamasoftware.com/requirements-management-guide/requirements-traceability/four-best-practices-for-requirements-traceability/)
- [Agentic Workflows for Software Development - McKinsey/QuantumBlack](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d)
- [Choose a Design Pattern for Agentic AI - Google Cloud](https://docs.google.com/architecture/choose-design-pattern-agentic-ai-system)
- [Definition of Done in Agile - Atlassian](https://www.atlassian.com/agile/project-management/definition-of-done)
- [Infrastructure Drift Detection and Reconciliation - Spacelift](https://spacelift.io/drift-detection)
- [Top AI Agentic Workflow Patterns - ByteByteGo](https://blog.bytebytego.com/p/top-ai-agentic-workflow-patterns)
