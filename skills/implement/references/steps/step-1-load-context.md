### Step 1: Load Context

Extract everything subagents will need so they never have to re-read these files themselves.

**Optimization:** Load spec + charter + constitution + plan progress in a single Bash call via the CLI (replaces items 2, 4, and 5 below with one turn):

```bash
adev context load --spec <spec-path> --plan <plan-path>
```

The verb wraps `lib/meta-tools.mjs::loadSpecContext` + `getPlanProgress` and emits JSON `{ context, progress }`. Use `progress` for resume detection (look at `progress.completed` vs `progress.total` and the per-task `progress.tasks` array).

If the CLI call fails, fall back to reading each file individually.

1. The plan file. Extract every task with its full text, file lists, dependencies, and specialist hints.
2. `.context-index/constitution.md`. Extract the Non-Negotiable Principles, Coding Standards, Architecture Boundaries, and Quality Gates sections.
3. `.context-index/manifest.yaml`. Extract the `specialists` registry.
4. The Live Spec referenced by the plan. Extract acceptance criteria and behavioral contract.
5. The Feature Charter referenced by the plan. Extract scope boundaries.
6. Any cross-cutting specs or ADRs listed in the plan's context routing section.
7. **Boundary rules:** If `.context-index/governance/boundaries.yaml` exists, read it.
   Pass boundary rules to implementer subagents as additional constraints in prompt section 2
   (alongside constitution excerpt). If it does not exist, skip.
8. **Routing decisions:** Routing decisions for each task live in the
   sibling sidecar file `<plan-stem>.routing.json`, written by `/adev:route`.
   The plan markdown body is NOT a source of routing state — `**Routing:**`
   blocks in the plan body are forbidden by CON-8 and ignored by this skill
   (and flagged by `lib/plan-immutability.mjs` as
   `PLAN_MUTATED_WITHOUT_SIDECAR`).

   For each task, resolve routing via the CLI verb at dispatch time
   (Step 2a — Context Packet Assembly):

   ```bash
   adev implement read-routing --plan <plan-path> --task-id <task-id> [--agents-allowlist <csv>]
   ```

   The verb prints the routing entry as JSON on stdout on success. On
   failure, it exits non-zero and writes a typed error code to stderr.
   Handle each error code as follows:

   | Exit | Code                       | Action                                                                                |
   |------|----------------------------|---------------------------------------------------------------------------------------|
   | 0    | (success)                  | Parse JSON; dispatch using `selected_agent`                                           |
   | 2    | `ROUTING_SIDECAR_MISSING`  | Stop the skill. Instruct the operator to run `/adev:route --plan <path>` and re-invoke `/adev:implement`. Do NOT silently fall back to inline parsing or default routing. |
   | 3    | `ROUTING_ENTRY_MISSING`    | Stop for this task. Instruct the operator to re-run `/adev:route` (plan grew tasks since the last route) and re-invoke `/adev:implement --task <N>`.                     |
   | 4    | `ROUTING_AGENT_INVALID`    | Stop for this task. The sidecar names an agent slug not in the allowlist (passed via `--agents-allowlist`). Instruct the operator to re-run `/adev:route` after fixing manifest specialists.                              |
   | 1    | `INVALID_PLAN_PATH`        | Argument bug — surface immediately; do not retry.                                     |

   If the sidecar is absent entirely, no fallback to inline parsing or
   default routing is permitted. The skill stops and surfaces the error.
9. **Completion policy:** Read `completion.merge_policy` from manifest.yaml (default: "pr").
   Read `completion.protected_branches` (default: ["main", "master"]).
10. **Model tier resolution:** Read `model_tiers` from `.context-index/platform-context.yaml`.
    All subagent dispatches in this skill use the `capable` tier (implementer, spec reviewer, code quality reviewer, visual verifier).
    If `model_tiers` is absent or a tier is unset, use the hardcoded defaults from `.context-index/specs/cross-cutting/model-routing.md` and log a one-time advisory.
11. **Heuristics:** Load module-scoped heuristics for injection into context packets via the CLI:

    ```bash
    adev heuristics retrieve --module <charter-module> [--injection-limit N]
    ```

    Derive the module slug from the plan's spec `charter:` frontmatter field. Pass `--injection-limit` only when `heuristics.injection_limit` is configured in `manifest.yaml` (otherwise omit for the library default).
    Stdout is a single JSON object `{count, rendered}` where `rendered` is the markdown blocks joined by blank lines. The verb exits 0 regardless — failures degrade to `{count:0, rendered:""}` so heuristic injection stays strictly non-blocking.
    Store the `rendered` output for use in Step 2a.

Write the active plan path to `.context-index/hygiene/.active-plan` so the scope guard hook can monitor file scope during implementation. Clear this file in Step 4 (Completion).

**Execution State Check:** Read `.context-index/.execution-state.json` via `readExecutionState(projectRoot)` from `<ADEV_ROOT>/lib/execution-state.mjs`. Do NOT hand-parse the JSON or any prior YAML frontmatter — call the library helper:

```javascript
import { readExecutionState } from '<ADEV_ROOT>/lib/execution-state.mjs';
const exec = readExecutionState(projectRoot);
```

If `exec.status === "active"`, resume from `exec.currentTask` instead of task 1. If `exec.status === "blocked"`, surface `exec.blockers` to the user and suggest running `/adev:recover` before continuing. If the state is missing or `status === "idle"`, start from task 1 as normal.

**Update charter Capability Map:** At the start of implementation, read the parent charter and update the Capability Map. For each capability covered by this plan, set its `Status` column to `implementing`.

**Load or create epic on the issue board:** Read `tasks.backend` from `manifest.yaml`. If configured:
- If an epic exists matching this plan's `planRef`, load it.
- If no epic exists, create one via `createEpic({ title: "<plan title>", planRef: "<plan-file-path>" })`. The epic is the **only** board entry created here — per-task Issue creation is forbidden by the board-granularity invariant (see `agent-reliable-state-artifacts/charter.md`).
- **Do NOT call `create({ ..., planTask: ... })`.** Plan-task state lives in the lifecycle log, not as Issues on the board. The `JsonAdapter` rejects such calls with `BOARD_GRANULARITY_VIOLATION`.

If `tasks.backend` is not configured, skip epic creation entirely (plan-task events are still emitted to the lifecycle log).

**Claim the epic before dispatching any task.** The board is the only store shared across every worktree of a repo (`lib/issues/resolve-root.mjs` resolves it to the main checkout), so it is the only place a concurrent session's work is visible without a network round-trip. Claim through the CLI — never set `owner` or `claimed_at` by hand, because the check-and-set only holds inside the adapter's CAS loop:

```bash
adev issues claim <epic-id> --owner "${USER}/local" --branch "$(git branch --show-current)"
```

The exit code is the gate, on the same discipline as `requireGate`:

- **`0`** — the claim is yours. Re-claiming as the same owner is idempotent and preserves the original `claimed_at`, so a resumed session is not penalized. Exit `0` may also mean you **inherited an expired lease**: claims expire after `tasks.claim_ttl_minutes` (default 240), and a stale one is taken over automatically. When that happens the result carries a `takeover` block naming the displaced owner — surface it, because that owner may still believe the work is theirs.
- **`2`** — **refused.** The epic is held by a different owner whose lease is still **live**, or is closed. **STOP. Do not dispatch a single task.** Report the holding `owner` and `claimed_at` to the user and let them choose: take over (`adev issues release <epic-id> --owner <holder> --force`, then re-claim) or work elsewhere. Never force a live claim over autonomously — that is another agent's in-flight work, and this refusal is the whole point of the gate. Expired leases are a different case and are handled at exit `0`.
- **`1`** — usage error, unknown issue, or `CLAIM_UNSUPPORTED_BACKEND` (a backend with no atomic write). Warn and continue: a non-atomic backend cannot offer the guarantee, and blocking on it would train operators to bypass the gate.

Owner identity follows the provenance convention the commit hooks already use — `<os-user>/local`, or `<os-user>/remote` when `CLAUDE_CODE_REMOTE=true`. `ADEV_ISSUE_OWNER` overrides it when a runner sets it once per session.

If `tasks.backend` is not configured, skip the claim.
