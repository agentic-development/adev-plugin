# Skill Reference

All available `/adev:*` skills, organized by lifecycle phase.

## Lifecycle Flow

```
  /adev:start ─── classify incoming work
       │
       ├──► /adev:brainstorm ─── explore idea, produce charter
       │         │
       │         ▼
       │    /adev:specify ─── write live specs within charter
       │         │
       │         ▼
       │    /adev:review-specs ─── architecture review (3 specialists)
       │         │
       │         ▼
       │    /adev:plan ─── decompose into tasks
       │         │
       │         ▼
       │    /adev:implement ─── TDD execution with subagents
       │         │
       │         ▼
       │    /adev:validate ─── 11-check quality verification
       │
       ├──► /adev:debug ─── systematic debugging with context
       │
       └──► /adev:issues ─── manage bugs and tasks directly
```

## All Skills

### Entry Point

| Skill | Purpose | Prerequisites |
|-------|---------|---------------|
| `/adev:start` | Classify work and route to the right skill | None |

### Setup

| Skill | Purpose | Prerequisites |
|-------|---------|---------------|
| `/adev:init` | Scaffold `.context-index/` interactively | None |
| `/adev:sync` | Sync constitution to CLAUDE.md and agent files | `.context-index/` exists |

### Design

| Skill | Purpose | Prerequisites |
|-------|---------|---------------|
| `/adev:brainstorm` | Explore an idea, produce a Feature Charter | `.context-index/` exists |
| `/adev:specify` | Write Live Specs within a charter's scope | Charter exists |

### Review

| Skill | Purpose | Prerequisites |
|-------|---------|---------------|
| `/adev:review-specs` | Architecture review by 3 specialist subagents | Spec at `review-pending` |

### Planning

| Skill | Purpose | Prerequisites |
|-------|---------|---------------|
| `/adev:plan` | Decompose specs into ordered tasks with TDD | Spec at `review-passed` |
| `/adev:route` | Score tasks for auto/assisted/human execution | Plan exists |

### Implementation

| Skill | Purpose | Prerequisites |
|-------|---------|---------------|
| `/adev:implement` | Execute tasks with TDD and 2-stage review | Plan exists |
| `/adev:write-test` | Standalone TDD test authoring | None |
| `/adev:debug` | Context-aware debugging (checks ADRs, specs) | None |
| `/adev:recover` | Unstick a stalled agent with corrective context | Agent stuck |

### Validation

| Skill | Purpose | Prerequisites |
|-------|---------|---------------|
| `/adev:validate` | 11-check post-implementation verification | Spec at `implemented` |
| `/adev:eval` | Graduated quality scoring beyond pass/fail | Eval config exists |

### Maintenance

| Skill | Purpose | Prerequisites |
|-------|---------|---------------|
| `/adev:hygiene` | Audit staleness, drift, and coverage gaps | `.context-index/` exists |
| `/adev:repomap` | Generate AST-based symbol index | None |
| `/adev:document` | Generate docs from repomap output | Repomap output exists |
| `/adev:sample` | Curate golden reference implementations | None |
| `/adev:retro` | Sprint retrospective and delivery metrics | Completed work exists |

### Project Management

| Skill | Purpose | Prerequisites |
|-------|---------|---------------|
| `/adev:issues` | Create, update, close issues and epics | `.context-index/` exists |
| `/adev:status` | Query project progress across specs and charters | `.context-index/` exists |

### Assessment

| Skill | Purpose | Prerequisites |
|-------|---------|---------------|
| `/adev:assess` | Score codebase readiness for agentic development | None |

### Meta

| Skill | Purpose | Prerequisites |
|-------|---------|---------------|
| `/using-adev` | Overview of the framework and available skills | None (auto-injected) |
