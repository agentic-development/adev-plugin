# Live Spec: Work Triage and Routing

<!-- Live Spec within the adev:work charter.
     This defines the behavioral contract for the /adev:work skill — a pre-lifecycle
     triage entry point that classifies work, detects project state, and routes to
     the correct /adev:* skill.
     Parent Charter: .context-index/specs/features/work/charter.md -->

---
charter: adev:work
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-03-29
updated: 2026-08-13
source-manifest:
  sha: "1c1191d"
  files:
    - .context-index/manifest.yaml
    - providers/codex/skills/work/SKILL.md
    - providers/codex/skills/work/agents/openai.yaml
    - providers/codex/skills/using-adev/SKILL.md
    - skills/route/SKILL.md
    - skills/work/SKILL.md
    - skills/status/SKILL.md
    - skills/using-adev/SKILL.md
  computed-at: "2026-04-12T11:48:02.746Z"
drift_detected: true
---

## Behavioral Contract

### Preconditions

- The user has invoked `/adev:work`, optionally with a free-text description of their work
- The skill is running inside a Claude Code session with access to Glob, Grep, and Read tools

### Behaviors

#### Init Gate

1. **When** `/adev:work` is invoked and `.context-index/` does not exist **then** the skill outputs a message directing the user to run `/adev:init` and stops. No other processing occurs.

#### Project State Scan

2. **When** `.context-index/` exists **then** the skill scans for in-progress work in a single parallel tool-call round:
   - Glob for `.context-index/specs/features/*/*.plan.md` and grep for unchecked tasks (`- [ ]`)
   - Glob for `.context-index/specs/features/**/*.md` (excluding `charter.md`, `*.review.md`, `*.plan.md`) and check for specs without a sibling `.review.md`
   - Glob for `.context-index/sessions/*.md` and read the 3 most recent session files (by filename date prefix)

3. **When** the state scan finds incomplete plans, unreviewed specs, or recent sessions **then** the skill surfaces them before classification:
   > "I found in-progress work:
   > - **hooks** plan: 3/7 tasks incomplete
   > - **design** spec `drag-drop.md`: unreviewed
   >
   > Want to resume one of these, or start something new?"

4. **When** the state scan finds no in-progress work **then** the skill proceeds directly to classification.

#### Work Classification

5. **When** the user provides a work description (either as an argument or in response to a prompt) **then** the skill classifies it into exactly one of these work types:

   | Slug | Signal Keywords / Patterns | Target Skill |
   |------|---------------------------|-------------|
   | `new-feature` | "new feature", "add capability", "build", "I want to create" | `/adev:brainstorm` |
   | `new-spec` | "write a spec", "specify", "define behavior for" + existing charter | `/adev:specify` |
   | `update-spec` | "update the spec", "change the spec", "revise" + existing spec | `/adev:specify --module` |
   | `review` | "review specs", "architecture review", "are the specs ready" | `/adev:review-specs` |
   | `plan` | "plan the work", "break into tasks", "create tasks" + reviewed spec | `/adev:plan` |
   | `implement` | "implement", "start coding", "build the plan" + existing plan | `/adev:implement` |
   | `bug-fix` | "bug", "broken", "failing test", "error", "not working" | `/adev:debug` |
   | `refactor` | "refactor", "clean up", "tech debt", "restructure" | `/adev:specify --refactor` |
   | `maintenance` | "audit", "staleness", "drift", "hygiene", "context health" | `/adev:hygiene` |

6. **When** the user provides no description and no in-progress work is found **then** the skill asks a single classifying question:
   > "What are you working on? For example:
   > - A new feature or idea
   > - A bug or failing test
   > - Implementing an existing plan
   > - Something else"

7. **When** classification confidence is high (clear keywords or unambiguous context) **then** the skill proposes the route directly with one-line reasoning:
   > "This looks like a bug fix in the hooks module. I'll route to `/adev:debug`. Sound right?"

8. **When** classification is ambiguous (description matches multiple types or is vague) **then** the skill asks one clarifying question with options:
   > "This could be a new feature or an update to an existing spec. Which is it?
   > 1. New feature (needs a charter first)
   > 2. New spec within the **auth** charter
   > 3. Update the existing `login-flow.md` spec"

#### Route Proposal and Confirmation

9. **When** the skill has classified the work type **then** it presents a route proposal:
   > "**Route:** `/adev:debug`
   > **Reason:** You described a failing test in the hooks module.
   > **Context:** Will pre-load the hooks charter and recent session.
   >
   > Proceed? (yes / change route)"

10. **When** the user confirms (explicitly or implicitly with "yes", "sounds right", "go", "proceed") **then** the skill invokes the target `/adev:*` skill, passing any relevant context arguments (e.g., `--module`, `--spec`, `--error`).

11. **When** the user rejects or requests a different route **then** the skill asks what they'd prefer and re-proposes.

#### State-Aware Routing Refinement

12. **When** the user says "work on X" and the state scan found an incomplete plan for module X **then** the skill routes to `/adev:implement` (not `/adev:brainstorm`), noting:
   > "Module **X** has an active plan with incomplete tasks. Routing to `/adev:implement` to continue."

13. **When** the user says "plan X" but specs for X have not passed review **then** the skill warns:
   > "Specs for **X** haven't been reviewed yet. Want to run `/adev:review-specs` first, or proceed to planning anyway?"

#### Pre-flight Concurrency Scan

<!-- Added for issue-606 (epic-107). Behaviors 2-4 above scan only worktree-local
     signals and are blind to other agents: two agents fixed the same p0
     vulnerability an hour apart (duplicate PRs #214/#215 for issue-582), and a
     whole concurrent epic stayed invisible to a study pursuing the same goal. -->

14. **When** the Project State Scan runs **then** the skill also invokes `adev coordination scan`, which reads the three signals that are shared rather than worktree-local:
   - open pull requests (`gh pr list --json …`)
   - remote branches active within the last 14 days, excluding `<remote>/HEAD`, the default branch, and the current branch
   - issues at `in_progress` on the shared board (resolved across worktrees per `lib/issues/resolve-root.mjs`), split into those claimed by a different owner and those `in_progress` with no owner at all

15. **When** the scan reports any item that overlaps the work at hand **then** the skill surfaces it to the user *before* proposing a route, naming the PR number, branch, or issue id — the user decides whether to continue, join, or stop.

16. **When** `gh` is absent, unauthenticated, timed out, or the repo has no GitHub remote — or `git` is unavailable, or the board cannot be read — **then** that signal degrades to `available: false` with a machine-readable `reason`, the remaining signals still report, and the verb still exits 0. A degraded signal is reported as *unknown*, never as *no concurrent work*. Exit 1 means a usage error; exit 2 is never returned.

17. **When** the board is compared against the current operator **then** identity resolves as `--owner` first, then `$ADEV_ISSUE_OWNER` — the same chain `adev issues claim` writes board owners from. **When** neither is set **then** identity is `unresolved` and every owned `in_progress` issue is reported (a duplicate-work detector over-reports rather than staying silent).

18. **When** the scan output is consumed by another verb or by tooling **then** `--json` emits a single JSON object on stdout — `pull_requests`, `remote_branches`, and `issues` buckets plus `owner`, `owner_source`, `concurrent_work`, and `signal_count` — with all diagnostics on stderr. Default (non-JSON) output is a short digest, because this runs at the top of every `/adev:work` invocation and token cost matters.

### Postconditions

- Exactly one `/adev:*` skill is invoked per `/adev:work` session, unless the Init Gate fired (in which case the user is directed to `/adev:init` manually and no skill is invoked)
- The user confirmed (explicitly or implicitly) the route before invocation
- Any in-progress work was surfaced before new work classification
- Concurrent work by others (open PRs, active remote branches, other-owner `in_progress` issues) was surfaced before a route was proposed, or the corresponding signal was reported as unavailable

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `.context-index/` missing | Redirect to `/adev:init`, stop processing | Gate (non-blocking) |
| No specs, plans, or sessions found during scan | Skip resume detection, proceed to classification | N/A (normal flow) |
| User description matches no known work type | Ask clarifying question with examples | N/A (normal flow) |
| State scan file missing | Skip that signal, continue with available data | N/A (normal flow) |
| State scan file present but malformed | Skip that signal, emit visible warning ("One file could not be read and was skipped"), continue | Warning (non-blocking) |
| `gh` missing / unauthenticated / no GitHub remote / timed out | Report `pull_requests.available: false` with a `reason`, continue the scan, exit 0 | N/A (normal flow) |
| `git` unavailable or no remote refs | Report `remote_branches.available: false` with a `reason`, continue the scan, exit 0 | N/A (normal flow) |
| Issue board unreadable or backend unknown | Report `issues.available: false` with a `reason`, continue the scan, exit 0 | N/A (normal flow) |
| Operator identity unresolved (no `--owner`, no `$ADEV_ISSUE_OWNER`) | Report every owned `in_progress` issue and flag `owner_source: "unresolved"` | N/A (normal flow) |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown — skill files are structured instructions for Claude. Companion code (helpers, validators) is allowed but must not be required for the skill to function." — Applies because `/adev:work` is a pure markdown skill. Classification and state detection use Glob/Grep/Read tool calls instructed by the SKILL.md, not companion code.

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because the skill introduces zero dependencies. All state detection uses file system reads against existing `.context-index/` files.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create SKILL.md | Write the `/adev:work` skill markdown with all triage, scan, classification, and routing instructions | Medium |
| Register in manifest | Add `adev:work` as a module entry in `manifest.yaml` (requires human approval per constitution — "Adding new skills to the lifecycle order") | Small |
| Register in using-adev | Add `/adev:work` to the skill table in the `using-adev` SKILL.md gateway | Small |

## Acceptance Criteria

- [ ] `skills/work/SKILL.md` exists and contains all triage, classification, and routing instructions
- [ ] The skill correctly gates on missing `.context-index/` (redirects to `/adev:init`)
- [ ] The skill scans for incomplete plans, unreviewed specs, and recent sessions using parallel Glob/Grep
- [ ] The work type classification table covers all 9 types from the charter
- [ ] The skill always proposes a route and waits for confirmation before invoking
- [ ] Ambiguous descriptions trigger a clarifying question instead of a wrong guess
- [ ] State-aware refinement overrides classification when in-progress work exists
- [ ] The skill is registered in `manifest.yaml`
- [ ] The `using-adev` gateway skill lists `/adev:work` in its skill table
- [x] Step 1 invokes `adev coordination scan` (`lib/cli/coordination.mjs`) and interprets its three shared signals
- [x] The scan degrades cleanly and exits 0 when `gh`, `git`, or the board is unavailable
- [x] `--json` emits the structured report on stdout with diagnostics on stderr
- [x] Tests cover gh-absence degradation, the different-owner filter, and the `--json` shape (`tests/cli/coordination.test.mjs`)
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
