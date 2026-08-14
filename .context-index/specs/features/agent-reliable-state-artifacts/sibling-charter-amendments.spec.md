# Live Spec: Sibling Charter Amendments

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

---
charter: agent-reliable-state-artifacts
status: review-passed
risk_level: low
milestone: 0.26.0
revision: 1
charter-revision: 3
created: 2026-05-12
updated: 2026-05-12
---

## Behavioral Contract

This spec performs the final rollout step the charter calls out: amend the four sibling charters whose storage-format decisions have moved into `agent-reliable-state-artifacts`. Each amendment (a) references this charter as the authoritative source for the storage format, (b) updates normative paths from legacy `.md` / `.yaml` to `.json` / `.jsonl` where the path appears in charter prose, and (c) adds a short Ownership Note clarifying the format-ownership boundary. Charters retain ownership of *what* the data means (issue lifecycle, milestone semantics, execution-state transitions, spec gates); this charter owns *how* it is persisted.

The four siblings:

- `.context-index/specs/features/task-management/charter.md`
- `.context-index/specs/features/spec-lifecycle/charter.md`
- `.context-index/specs/features/session-awareness/charter.md`
- `.context-index/specs/features/milestone-lifecycle/charter.md`

This spec is the **last rollout step**. It must land after the foundation specs validated (already true), after `plan-task-events`, `issue-board-granularity-cleanup`, `lifecycle-skill-instruction-updates`, `direct-fs-consumer-migration`, and `test-migration` have been implemented and validated (so amendments reference completed reality, per the charter's "Performed as the last step of the rollout so amended charters reference completed reality" directive).

## Amendment Template

Each amended charter receives the same three-part edit:

### Part 1 — Ownership Note (added near the top, before Scope)

A new section titled `### Storage Format Authority` is added immediately after the charter's Business Intent or Overview section. The boilerplate:

> **Storage Format Authority.** The on-disk format and atomic-write semantics for [the relevant artifacts] are owned by the `agent-reliable-state-artifacts` charter. This charter retains semantic ownership: [enumerate semantic responsibilities]. For the storage contract, document schema, and migration tool, see `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` and its child specs.

Per-charter `[bracketed]` substitutions are detailed in the per-charter table below.

### Part 2 — Path Updates

Every charter that previously referenced legacy paths in its prose is updated:

- `tasks.md` → `tasks.json` (with a parenthetical "(read-only-deprecated, removal in follow-up)" where the prose specifically referenced the legacy file by name and the read-only deprecation is contextually relevant; otherwise just rename)
- `.context-index/build-state/` → `.context-index/lifecycle-state/`
- `.execution-state.md` → `.execution-state.json`
- `milestones.yaml` → `milestones.json`
- `<slug>.json` under `build-state/` → `<slug>.jsonl` under `lifecycle-state/`

### Part 3 — Charter revision bump

The charter's `revision:` frontmatter is incremented. `updated:` is set to the amendment date. Both reflect that the charter is now revision N+1.

## Per-Charter Amendments

### task-management

**Storage Format Authority bracket fill:**
- artifacts: "the issue board (`tasks.json`), atomic-write semantics, the schema-version field, and post-migration board-granularity invariants"
- semantic responsibilities: "the `IssueManagerInterface` contract, issue lifecycle states (open / in_progress / blocked / closed), tiered IDs, dependency edges, and the `/adev:issues` skill surface"

**Path updates:**
- Every reference to `tasks.md` in the charter → `tasks.json` (with the deprecation parenthetical at the first occurrence)
- `lib/issues/file-adapter.mjs` references gain a parenthetical "(read-only-deprecated)"

**Other amendments:**
- The charter's existing Capability Map row for "Issue board storage format" is marked `status: delegated` with a pointer to `agent-reliable-state-artifacts`.

### spec-lifecycle

**Storage Format Authority bracket fill:**
- artifacts: "the per-spec lifecycle event log (`<slug>.jsonl`), the `lifecycle-state/` directory location, atomic-append semantics, and the canonical event schema"
- semantic responsibilities: "source manifests, capability status, the `/adev:status` skill surface, spec lifecycle stage definitions (specify / review / plan / implement / validate), and gate semantics (strict / advisory)"

**Path updates:**
- Every reference to `.context-index/build-state/` → `.context-index/lifecycle-state/`
- Every reference to `<slug>.json` (as the per-spec build state file) → `<slug>.jsonl`
- References to `.review.md` frontmatter parsing are amended to point at `requireGate(state, stepName)` and the lifecycle event log as the gate source.

**Other amendments:**
- The Capability Map row for "Per-spec build state" is marked `status: delegated` with a pointer to `agent-reliable-state-artifacts`.

### session-awareness

**Storage Format Authority bracket fill:**
- artifacts: "the execution state file (`.execution-state.json`), atomic-write semantics, and the Node-helper invocation pattern from bash hooks"
- semantic responsibilities: "execution-state transitions, the `/adev:work` skill's resume logic, idle-nudge timing, issue-reminder semantics, and session log schemas"

**Path updates:**
- Every reference to `.execution-state.md` → `.execution-state.json`
- The `execution-state-file.spec.md` reference in the charter is annotated: "Storage format owned by agent-reliable-state-artifacts; this spec captures pre-migration state and remains as historical record."

**Other amendments:**
- The Capability Map row for "Execution state format" is marked `status: delegated` with a pointer to `agent-reliable-state-artifacts`.

### milestone-lifecycle

**Storage Format Authority bracket fill:**
- artifacts: "the milestone registry (`milestones.json`), atomic-write semantics, and the `lib/milestones.mjs` wrapper"
- semantic responsibilities: "milestone definitions, ship strategies, ship criteria, epic links, and the `/adev:issues milestone *` subcommand surface"

**Path updates:**
- Every reference to `milestones.yaml` → `milestones.json`
- The `lib/milestones.mjs` wrapper is referenced as the canonical I/O surface; direct YAML reads in prose are removed.

**Other amendments:**
- The Capability Map row for "Milestone registry format" is marked `status: delegated` with a pointer to `agent-reliable-state-artifacts`.

## Validation

Each amended charter MUST pass:

1. **Charter consistency** — `/adev:review-specs --module <charter-module>` (or equivalent charter review) does not flag the amended charter as broken. The structural reviewer agent recognizes the Storage Format Authority section as a valid extension.
2. **No orphan references** — A grep over the amended charter for the legacy paths (`tasks.md`, `build-state`, `.execution-state.md`, `milestones.yaml`, `<slug>.json` in a build-state context) returns no matches outside of (a) the Storage Format Authority Ownership Note (which may reference legacy paths in a historical-context phrasing) and (b) explicit "read-only-deprecated" parentheticals.
3. **Revision metadata** — `revision:` is bumped by at least 1; `updated:` is the amendment date.
4. **Cross-charter pointer is reachable** — Each amendment references `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` by path. A simple existence check confirms the pointer is not stale.

A new architectural test, `tests/architectural-sibling-charters.test.mjs`, runs items 2 and 4 in CI.

## /adev:sync Follow-Up

After the amendments are committed, run `/adev:sync` to regenerate any agent-file copies that pick up charter content. Today the sync targets only `CLAUDE.md` per `.context-index/manifest.yaml::sync.targets` and the charter content is not copied verbatim into `CLAUDE.md`, so this is mostly a no-op — but the spec calls it out as the standard rollout closing step. If future sync targets aggregate charter content, this step becomes more substantive.

## Naming Conventions (CON-1)

- The new section heading is `### Storage Format Authority` — title-case, no abbreviation.
- Path references in amended prose use backticked file paths verbatim (no relative-path ambiguity).
- The boilerplate phrase "owned by the `agent-reliable-state-artifacts` charter" is exactly that, every time, to make grep-based audits straightforward.

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Applies. The amendments are markdown edits to four charter files.
- **Architecture Boundary (Autonomous):** "Updating specs/ADRs when code changes affect their assumptions" — Applies directly. Per CLAUDE.md, this is required, not optional.
- **Architecture Boundary (Autonomous):** "Editing skill markdown content" — Charter files are content, autonomous.
- **Architecture Boundary (Requires Human Approval):** "Adding new skills to the lifecycle order" — Does NOT apply. No new skills; no lifecycle-order changes.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Amend `task-management/charter.md` | Add Storage Format Authority section, rename `tasks.md` references, mark delegated capability row, bump revision and updated. | small |
| Amend `spec-lifecycle/charter.md` | Same template; build-state path renames; `.review.md` parsing references redirected to `requireGate`. | small |
| Amend `session-awareness/charter.md` | Same template; `.execution-state.md` renames; historical-record annotation on `execution-state-file.spec.md` reference. | small |
| Amend `milestone-lifecycle/charter.md` | Same template; `milestones.yaml` renames; `lib/milestones.mjs` API-as-canonical reference. | small |
| `tests/architectural-sibling-charters.test.mjs` | New test asserting no orphan legacy-path references and that the cross-charter pointer is reachable. | small |
| `/adev:sync` invocation | Re-sync agent-file copies after amendments commit. (No-op for current sync targets but executed as the standard rollout closing step.) | trivial |
| Charter-review pass | Run `/adev:review-specs --module <module>` (or equivalent governance pass) against each amended charter and address any structural reviewer findings. | small |
| Close-out note in this charter | After amendments land, this charter's own Capability Map row "Sibling charter amendments" flips to `validated`. Tracked here as a task because it is the trigger for the rollout's completion. | trivial |

## Acceptance Criteria

- [ ] Each of the four sibling charters carries a `### Storage Format Authority` section with the boilerplate filled in per the per-charter table.
- [ ] Each of the four sibling charters has had its legacy paths replaced (`tasks.md`, `build-state`, `.execution-state.md`, `milestones.yaml`, build-state `<slug>.json`) per the path-update rules above.
- [ ] Each amended charter's revision is bumped and `updated:` reflects the amendment date.
- [ ] `tests/architectural-sibling-charters.test.mjs` passes (no orphan legacy-path references; cross-charter pointer reachable).
- [ ] `/adev:sync` has been run after the amendments commit.
- [ ] Charter-review on each amended charter passes.
- [ ] The `agent-reliable-state-artifacts` charter's "Sibling charter amendments" capability is marked `validated`.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
