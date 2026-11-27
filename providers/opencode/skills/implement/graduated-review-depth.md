# Graduated Review Depth

Full contract for the two `adev implement resolve-depth` calls and the
`full` / `quick` / `lite` review ladder anchored in `SKILL.md` (Steps 2a, 2d,
2f-pre). Read this file before running any branch. The verb owns every
decision below; this file says what its output means and what to do with it.

## 1. The ladder

Each task resolves to one of three depths, per task, so one plan can mix them:

| Depth | Per-task execution | Per-task review |
|---|---|---|
| `full` | Fresh implementer subagent (batched or solo) | Stage 1 spec compliance (2f), then Stage 2 code quality (2g) |
| `quick` | Fresh implementer subagent (batched or solo) | One synthesized reviewer |
| `lite` | Inline in your own context, no `Agent` dispatch | None; a post-task tripwire can escalate the task |

The verb resolves the depth in this order:

1. **`--tier full` is absolute.** Every task is `full`, no floor leg is
   consulted and no `lite` is granted.
2. **Baseline.** `quick` is the baseline. `--tier quick` sets it explicitly
   and outranks the policy. Otherwise the spec's risk level is looked up in
   `risk-policies.yaml` (`implement_mode`); a policy `full` makes the baseline
   `full`, and a policy `lite` is a `quick` baseline that also authorizes the
   `lite` grant. With no policy value the baseline is `quick`.
3. **Floor.** Any holding floor leg (section 2) raises the task to `full`.
   Floors only escalate.
4. **`lite` grant.** Provisional pass only (section 3).
5. **Tripwire.** Final pass only, for a task whose provisional pass resolved
   `lite` (section 5).

Routing scores and the shape of the task's file set never deny `quick`. They
decide only the `lite` grant.

## 2. Floor legs

Each of these legs forces `full`:

| Leg | Holds when |
|---|---|
| `risk-level` | The spec is `risk_level: high` and the task is not routed `auto-agent`. A high-risk `auto-agent` task resolves `quick` and is never granted `lite` |
| `routing` | The task's `selected_agent` is `human-only`. An `assisted-agent` task no longer forces `full`; its human checkpoint still applies |
| `boundary` | A path crosses a governance boundary. The provisional pass checks the declared files; the final pass checks the declared and touched paths together |
| `sensitive-path` | A path matches the sensitive-path configuration, on the same paths as `boundary` |
| `critical-finding` | Final pass only: a prior cycle of this task's review loop produced a Critical finding (`--had-critical-finding`) |

On a `lite` task's final pass (the tripwire, section 5), the `boundary` and
`sensitive-path` legs also see gitignored paths written since the task's
`in_progress` event. Such a file can never enter the task's commit, but a task
can still write a secret into one.

`batched-task` and `scope-mismatch` are no longer floor legs. Batch membership
does not change a task's depth, so a batched task is reviewed at its own
resolved depth. A touched file outside the declared set no longer raises a
`quick` task; `scope-mismatch` survives only as the `lite` tripwire
(section 5).

## 3. Provisional pass (Step 2a, before dispatch)

```bash
adev implement resolve-depth --spec <spec-path> --plan <plan-path> --task-id <task-id> \
  --run-base <run_base> [--tier <t>] [--lite] [--parallel] [--review-cycles <n>] --pass provisional
```

`--run-base` is required on both passes. Pass the `run_base` that
`adev implement check-flags` printed at the start of the run: the verb reads the
risk policies, boundaries, sensitive paths and routing sidecar from that commit.
Pass `--lite`, `--tier` and `--parallel` exactly as the operator passed them.
Batch membership no longer affects a task's depth, so pass no batch flag.

The printed `depth` briefs the implementer (whether elevated scrutiny should be
expected). For `full` and `quick` it decides nothing about which reviewer(s)
dispatch yet; that decision uses the **final** pass below. A provisional
`depth: lite` sends the task to `lite-mode.md` instead of Steps 2b-2g.

**The `lite` grant.** The verb resolves `lite` only when all four of these
hold, checked in this order:

1. The operator authorized `lite`: `--lite` or `--tier lite` on the call, or
   `implement_mode: lite` for the spec's risk level when no `--tier` was
   passed. An explicit `--tier quick` or `--tier full` is the per-run opt-out.
2. The task is route-eligible: its routing entry is routed `auto-agent` or
   `assisted-agent`. Routing scores are not consulted. A missing entry denies
   with `no-routing-entry`, and a `human-only` entry with `floor:routing`. The
   entry is read from the sidecar committed at `run_base`, not the working tree:
   a routing sidecar not committed at `run_base` denies with `no-routing-entry` and a `ROUTING_SIDECAR_MISSING` warning, for every task.
3. The spec is not high-risk and no provisional floor leg holds.
4. The run is not `--parallel`.

**The lite cap.** When `lite` is authorized (condition 1) and the spec is not
high-risk, a holding `boundary` or `sensitive-path` floor leg gives `quick`
instead of `full`, on both passes and in the `lite` tripwire, and the response
carries `floor_cap: "quick"`. Any other holding leg (`routing`,
`critical-finding`) gives `full`, and `--tier full` stays absolute. `floor_cap`
is `null` whenever the cap did not lower the result.

The JSON response carries two fields for the grant:

- `lite_denied` names the first failing condition: `not-authorized`,
  `no-routing-entry`, `high-risk`, `floor:<leg>` or `parallel`, or `null` when
  `lite` was granted. Copy every value other than `not-authorized` into the run
  summary with its task id; a `not-authorized` denial is silent. The field is
  meaningful only on the provisional pass and is always `null` on the final
  pass.
- `lite_source` is `flag`, `policy` or `null`: where the authorization came
  from, whether or not it was granted.

`--review-cycles`, if the operator passed it to `/adev:implement`, is forwarded
here unchanged on every call (both passes); the CLI verb is the single place its
value is validated (`INVALID_REVIEW_CYCLES`) — the SKILL.md does not re-validate
it. The verb's JSON response's `review_cycles` field is the effective cap for
both Step 2f/2g's `full` loops and the `quick` synthesized loop below.

`declared_files` / `additive_only` are never passed by the caller — the verb
derives them itself from the plan's `Files:` block.

This call reports the `review_depth_resolved` event for the provisional pass.

**Warning visibility, provisional pass.** Echo each warning in the response's `warnings` to the operator-facing transcript, by code, in addition to the persisted event the verb already writes — a graduated run must be auditable in the visible transcript, not only in the lifecycle log: `REVIEW_DEPTH_FLOOR_APPLIED` naming its legs and the depth the floor gave; and `ROUTING_SIDECAR_MISSING` naming the run base, telling the operator to commit `<plan>.routing.json` before using `lite` again. `ROUTING_SIDECAR_MISSING` comes from the run-base read, so every `resolve-depth` and `batches` call carries it, whether or not `lite` is authorized. Relay it only when `check-flags` printed `lite_authorized: true`, and only once: on the first provisional `resolve-depth` call of this invocation, or on the `batches` advisory when `batches` runs, whichever comes first. Later calls repeat the same warning for the same `run_base`, so do not echo it again. A batch agent never relays it, and neither does a `--parallel` group agent; the orchestrator already has. This is the only place that case reaches the operator: no task resolves `lite` then, so `lite-mode.md` never loads.

## 4. Task base (Step 2d, before the implementer dispatch)

`adev implement snapshot-base`, captured immediately before dispatch. It prints
a git tree id recording the worktree as it stands (index plus every non-ignored
file, untracked included) without touching the index. Used only for this task's
final-pass depth resolution; it is not persisted anywhere and does not survive
past this single dispatch. A bare `git rev-parse HEAD` also works, but then
every file that was untracked before the task counts as a task addition.
A `lite` task takes the same snapshot inline (`lite-mode.md` §2).

## 5. Final pass (Step 2f-pre, after the implementer reports, against the real diff)

```bash
adev implement resolve-depth --spec <spec-path> --plan <plan-path> --task-id <task-id> \
  --run-base <run_base> [--tier <t>] [--lite] [--parallel] [--review-cycles <n>] \
  [--had-critical-finding] --base-sha <captured-base> --pass final
```

`--base-sha` is the diff range only: the touched files are computed against
it. Governance inputs still come from `--run-base`.

Pass `--had-critical-finding` whenever any prior cycle on this task's own review
loop (tracked in this loop's working state, not read back from disk) produced a
Critical-severity finding — this is what makes the `critical-finding` floor leg
persist for the remainder of the task once triggered. This call also reports the
`review_depth_resolved` event for this pass.

**The `lite` tripwire.** When the task's provisional pass resolved `lite`, the
final pass runs the tripwire in place of the baseline and grant. A `lite` task
runs it from `lite-mode.md` §3, before its commit. The tripwire only
escalates, at most two levels:

- any floor leg gives `full`. `sensitive-path` and `boundary` are evaluated on
  the declared and touched paths together, exempt or not, plus gitignored paths
  written since the task's `in_progress` event;
  `risk-level`, `routing` and `critical-finding` are evaluated as on any final pass;
- otherwise `scope-mismatch` gives `quick`: a touched path is neither
  declared nor exempt. A path is exempt when it is under `tests/` or `docs/`,
  or when its basename, anywhere in the tree, is `README.md` or
  `*.test.<ext>` / `*.spec.<ext>` for a source extension (`js`, `mjs`, `cjs`,
  `ts`, `tsx`, `jsx`, `py`, `go`, `rb`, `rs`). A provider mirror
  `providers/<p>/skills/<rest>` is also exempt when it is an exact
  regeneration: `<p>` is a provider `scripts/sync-provider-skills.mjs`
  handles, the sync writes that path (never `agents/`, a nested `SKILL.md` or
  an `adev-*` skill, so a `lite` task that adds a new skill always trips to
  `quick`), `skills/<rest>` is declared or touched, the mirror is a regular
  file whose content equals the sync's output for `skills/<rest>` as the diff
  sees it, and its mode equals the canonical file's (the sync gives each
  mirror its canonical file's executable bit). A deleted mirror is exempt only when
  `skills/<rest>` was deleted too. When the check cannot be computed (a
  missing, unreadable, symlinked or since-changed canonical file, a generator
  error, or a SHA-256 repository) the mirror is not exempt. The comparison
  uses git's stored blobs, so with `core.autocrlf=true` or `input`, or an
  `eol=crlf` attribute, on CRLF canonical files it also fails closed, and
  mirror regenerations always trip to `quick` on such a checkout. This exemption
  covers `scope-mismatch` only: `sensitive-path` and `boundary` still see the
  mirror path. `*.spec.md` is never exempt,
  and neither is a path under `.context-index/` (both matched
  case-insensitively), a path with an empty, `.` or `..` segment, or a
  symlink;
- otherwise the task stays `lite`.

An escalation returns `escalated_from: lite`, the holding `floor_legs` and a
`LITE_TRIPWIRE_ESCALATED` warning naming the task and legs. Continue at the
branch for the returned depth (section 6) without a second final pass.
`lite-mode.md` §3 has the escalated task's full procedure.

**Warning visibility, final pass.** Echo each warning in the response's `warnings` to the operator-facing transcript, by code, in addition to the persisted event: `REVIEW_DEPTH_FLOOR_APPLIED` naming its legs, and `LITE_TRIPWIRE_ESCALATED` naming the task and legs. A `ROUTING_SIDECAR_MISSING` warning here repeats the one the provisional pass or the `batches` advisory already handled for this `run_base`, so do not echo it. The final pass raises no routing-score warning. Echo by warning code, never from `floor_applied`: a `scope-mismatch` escalation returns `floor_applied: true` and `floor_legs: ["scope-mismatch"]` with only a `LITE_TRIPWIRE_ESCALATED` warning. Never announce a `scope-mismatch` escalation as `REVIEW_DEPTH_FLOOR_APPLIED`. A sensitive-path or boundary escalation carries both warnings, and both are echoed.

**The `source` field.** Each `review_depth_resolved` event records where its
depth came from:

| `source` | Meaning |
|---|---|
| `tier-full-absolute` | `--tier full` |
| `policy-baseline` | `--tier quick`, or the policy's `implement_mode` for the spec's risk level |
| `default-quick` | No `--tier` and no policy value: the `quick` fallback |
| `lite-grant` | A `lite` resolution, on either pass |
| `lite-tripwire` | A final-pass escalation from `lite` |

A floor leg keeps the baseline's `source` and sets `floor_applied` and
`floor_legs`. `lite_denied`, `lite_source` and `escalated_from` appear only in
the verb's JSON output, never in the event.

## 6. Branch on the resolved `depth`

### `full`

Reached through `--tier full`, a policy `full` baseline, a floor leg, or a
`lite` tripwire escalation on a sensitive or boundary path. Run Step 2f
(Stage 1: Spec Compliance) then Step 2g (Stage 2: Code Quality) exactly as
written in `SKILL.md`. Behavior on this path is byte-identical to the
pre-graduated flow.

### `quick`

The default for a task with no floor leg and no `lite` grant, and the
destination of a `scope-mismatch` tripwire escalation. Skip the two-stage path
and dispatch a **single** fresh reviewer subagent carrying the content of
`synthesized-reviewer-prompt.md` from this skill directory, plus the union of
both stages' context:

- Full task requirements from the plan
- The implementer's status report
- The acceptance criteria from the Live Spec
- The git diff (base SHA before task, head SHA after task)
- The Coding Standards section from the constitution
- Any concerns from the implementer (if `DONE_WITH_CONCERNS`)
- Secondary specialist matches from step 2b
- `Implementation mode: <mode>` (resolved in Step 1; `agent-default` for a task escalated from `lite` — see `lite-mode.md` §3), so the reviewer applies the test criterion for the mode the task was implemented under

Apply the same `cq-<n>` id-tagging and `evaluateStopCondition` convergence
discipline Stage 2 uses (`lib/loop-convergence.mjs`, unchanged) — the verdict
table in 2g applies verbatim, including the terminal `LOOP_NO_PROGRESS` /
`LOOP_REGRESSED` / `LOOP_BUDGET_EXHAUSTED` halt — capped at the
effective `review_cycles` value returned by the final pass above.

On completion, call `reportReviewRound(..., { stage: "synthesized", cycles: <n> })`
and add the `Review-round: synthesized=<n>` trailer to the task's single commit,
per `review-provenance.spec.md`. The `synthesized` stage replaces both
`spec-compliance` and `code-quality` on this task's provenance record — do not
also record those two stages.

The `quick` path's worst-case dispatch count is `1 × cap` where `full`'s is
`2 × cap`, because both stages read the same resolved cap.

### `lite`

Follow `<ADEV_ROOT>/skills/implement/references/lite-mode.md`. A task that
stays `lite` through its tripwire has no review loop, no `review_round` event
and no `Review-round:` trailer; its two `review_depth_resolved` events with
`depth: lite` are its review provenance.
