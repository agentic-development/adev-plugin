# EV-1 rigor-ladder fixture

The fixture that `../run-ab-eval.mjs` runs `/adev:implement` against, once per
adev arm (`full`, `quick`, `lite`), and that the `plain` arm implements with
Claude Code and no adev at all. It is a 7-task plan over a small catalog
library.

| File | Role |
|---|---|
| `example.spec.md` | The spec (`risk_level: medium`, so `lite` is not ruled out by risk) |
| `example.plan.md` | The 7-task plan |
| `example.routing.json` | The routing sidecar `/adev:route` would write for the plan |
| `seed/` | The project the run starts from: source, passing tests, `.context-index/manifest.yaml` and `constitution.md`. Its own `package.json` makes it a nested project, so `scripts/run-tests.mjs` never runs `seed/tests/` |
| `probes/` | Held-out tests, one per seeded defect. The implementer never sees them: the harness copies them into the sandbox only after a run, then removes them |
| `edge-probes/` | The held-out edge-case battery (see "Edge probes"), copied in and removed the same way |

`tests/fixtures/evals/implement-rigor-ladder-reference/` holds a
spec-conforming implementation that the unit tests lay over the seed to show
every probe in `probes/` and `edge-probes/` passes on code that follows the
spec. It is never copied into a sandbox.

In the sandbox the spec, plan and sidecar live at
`.context-index/specs/features/example/`.

## Tasks

The harness derives every count below from the plan and the sidecar at
`--dry-run` time. Nothing here is read by code except the defect table.

| Task | Routing | Role | Expected depth under `--lite` |
|---|---|---|---|
| 1 | auto-agent, all scores ≥ 0.6 | lite-eligible | `lite` |
| 2 | auto-agent, all scores ≥ 0.6 | lite-eligible | `lite` |
| 3 | auto-agent, all scores ≥ 0.6 | lite-eligible | `lite` |
| 4 | assisted-agent | assisted-agent | `quick` |
| 5 | auto-agent, `pattern_coverage: 0.4` | low-score | `quick` |
| 6 | auto-agent, all scores ≥ 0.6 | sensitive-path (`src/auth/token.mjs`, matched by the built-in `**/auth/**`) | `full` |
| 7 | auto-agent, all scores ≥ 0.6 | tripwire-target | `lite`, then `quick` at the final pass |

How the harness classifies a task, in this order:

1. A declared file matches the effective sensitive-path set (the built-in defaults, extended by `seed/.context-index/governance/sensitive-paths.yaml` if one is added): **sensitive-path**.
2. `selected_agent` is not `auto-agent`: the routed agent's name.
3. A routing score is missing, outside `[0, 1]` or below 0.6: **low-score**.
4. The task body names a backticked `src/` path that its `**Files:**` block does not declare: **tripwire-target**. Task 7 must register its handler in `src/registry.mjs`, which it does not declare, so a correct `lite` implementation trips the `scope-mismatch` tripwire.
5. Otherwise: **lite-eligible**.

In the `--dry-run` output, `liteEligible` means "expected to finish at `lite`"
and counts role 5 only (3 tasks). The tripwire target is granted `lite`
provisionally but is expected to end at `quick`, so it counts as ineligible
there. `routeEligible` counts every task that passes route's easy rule
(`auto-agent`, every score in `[0.6, 1]`) before floors and the tripwire are
applied (5 tasks: 1, 2, 3, 6 and 7).

## Seeded defects

Each defect is already present in `seed/src/`, inside the scope of the task
that touches the module. The task text says the module as a whole must satisfy
the spec, so a reviewer comparing the diff against the spec can catch it. The
seed's own tests pass with the defect in place. The probe is the test that
exposes it.

| Defect | Task | Kind | Seed location | Exposing test |
|---|---|---|---|---|
| D1 | 1 | off-by-one boundary | `src/pagination.mjs` `pageCount` uses `Math.floor(total / pageSize) + 1`, which is one too many when `total` divides evenly and `1` for an empty collection | `probes/off-by-one-boundary.probe.mjs` |
| D2 | 2 | missed error case | `src/config.mjs` `parseConfig` checks `typeof doc !== 'object'`, which lets `null` through to a `TypeError` and accepts arrays, instead of throwing `CONFIG_INVALID` | `probes/missed-error-case.probe.mjs` |
| D3 | 4 | untested branch | `src/discount.mjs` returns the full price when a fixed coupon exceeds it, instead of `0`; the seed tests never reach that branch | `probes/untested-branch.probe.mjs` |
| D4 | 5 | spec-noncompliant output shape | `src/format.mjs` returns a flat `priceCents` key; BEH-5 requires exactly `{ id, label, slug, price: { cents, currency } }` | `probes/noncompliant-output-shape.probe.mjs` |

A defect is recorded per run as `caught_at`:

- `implement`: its probe passes after `/adev:implement`.
- `validate`: its probe failed after implement and passes after `/adev:validate`
  ran. This records only that the probe passes once validate has run, not that
  validate's report named the defect.
- `escaped`: its probe still fails after `/adev:validate` ran.

`/adev:validate` runs only for a valid run, and only when at least one probe
failed after implement. A run is invalid when implement exits non-zero, its
verdict is not `PASS`, it made no commit after the seed, or it left no
session transcript. Invalid runs are written with `valid: false` and
`invalid_reasons`, and are left out of the determinism report.

The defects sit in two `lite`-eligible tasks (D1, D2) and two `quick` tasks
(D3, D4), so the quality cost of skipping per-task review shows up as a
difference between arms.

For the `plain` arm, `caught_at` is only ever `implement` or `escaped`: it has
no `/adev:validate`, so a defect it misses after implement is recorded as
escaped. Compare arms on "missed after implement" (the `--compare` column
`D missed@impl`) for a like-for-like number.

## The plain arm

`--arm plain` runs the same sandbox (seed, spec, plan, sidecar and the
recorded plan step, prepared exactly as for the adev arms) with the prompt:

> Implement every task in the plan at `.context-index/specs/features/example/example.plan.md`,
> following the spec at `.context-index/specs/features/example/example.spec.md`.
> Commit each task separately.
>
> This is an unattended evaluation run. The operator pre-approves every task
> and step in this plan, so continue past each one without stopping. Implement
> every plan task; if a task looks already implemented, do not skip it. Do not
> wait for input.

It uses the same model as the other arms (`--model`, default the session
default, recorded as `model`). Its result has:

- **Validity:** claude exited 0, at least one commit follows the seed, and a
  session transcript exists. There is no implement verdict, so
  `implement-verdict-not-pass` never applies.
- **Wall clock:** `metrics.wall_clock_ms` is process time,
  `metrics.wall_clock_source: "process"`. Every arm also records
  `metrics.process_wall_clock_ms`, the like-for-like column; the adev arms keep
  the lifecycle span in `wall_clock_ms` (`wall_clock_source:
  "lifecycle-event-timestamps"`, or `"none"` when no span was logged).
- **No validate:** `validate: null`, `validate_skipped` says why.
- **`review_depths: null`** (n/a).
- Tokens, dispatches, quality gates, test counts, D1-D4 and the edge probes
  are measured as for every arm.

The plain arm is informational. It needs no baseline, and `--evaluate`'s
thresholds never read it.

## Plugin isolation

The operator's Claude config dir may have adev installed (at user or project
scope). Every claude spawn the harness makes, in every arm, passes
`--settings '{"enabledPlugins":{"<id>":false,...}}'` for every plugin id named
`adev` that `<config>/plugins/installed_plugins.json` or `<config>/settings.json`
knows, plus `adev@agentic-development`. `--settings` is merged over the user,
project and local settings and `enabledPlugins` merges per key, so the
installed copy stays off. A `--plugin-dir` plugin is the separate id
`adev@inline`, so:

- the adev arms load only the ref worktree's copy, through `--plugin-dir`;
- the plain arm loads no adev plugin, skill, hook or SessionStart context. It
  also gets no `ADEV_*`/`CLAUDE_PLUGIN_*` env, and a stub `adev` first on PATH
  that exits 127, so the operator's own `adev` CLI is unreachable.

The sandbox lives in the temp dir and carries no `.claude/`, so no project
settings apply to it.

To see each arm's exact argv and env delta (no model call):

```bash
node tests/evals/implement-rigor-ladder/run-ab-eval.mjs --check-isolation [--arm <id>]
```

To confirm it live, at one short `claude -p` per arm, each in a fresh sandbox:

```bash
node tests/evals/implement-rigor-ladder/run-ab-eval.mjs --check-isolation --probe [--arm <id>] [--model <m>]
```

The probe reads the stream-json init message (`plugins`, `slash_commands`,
`skills`) and the transcript (`skill_listing`, the `using-adev` SessionStart
context, any path into `plugins/cache/*/adev/`). The plain arm passes with
no adev anywhere; an adev arm passes with exactly one adev plugin, at the ref
worktree, each adev skill listed once and no installed copy referenced. It
exits 1 when any arm fails and writes nothing under `results/`.

## Edge probes

`edge-probes/probes.json` lists 54 held-out checks, one `node:test` test each,
named `<id>: ...`, run after implement (before any validate) with
`node --test --test-reporter=tap .ev1-edge-probes/<file>`. Each file imports
its module dynamically, so a missing export fails only the probes that need
it. A result records `metrics.edge_probes`:
`{ total, passed, failed: [ids], by_behavior, strict, total_excluding_strict, passed_excluding_strict }`.

| Behavior | Ids |
|---|---|
| BEH-1 pagination | P1-P7 |
| BEH-2 configuration | C1-C8 |
| BEH-3 slugs | S1-S5 |
| BEH-4 discounts | K1-K10: fixed and percent arithmetic with flooring, expiry at and before `now`, never below 0 for both kinds, `COUPON_INVALID` for an unknown and a missing kind, the throw is an `Error` |
| BEH-5 formatting | F1-F5: the exact shape for another item, extra input keys dropped, `price` keys exactly `cents`/`currency`, currency from the argument, slug edge separators |
| BEH-6 tokens | T1-T9: the exact token construction, round trip, wrong secret, swapped payload, altered signature, wrong-length signature (a `timingSafeEqual` throw), malformed strings, a signed non-JSON payload, non-string tokens |
| BEH-7 list handler | L1-L10: page fields, last partial page, past-the-end page, empty catalog, currency and slugs on items, exact response keys, `dispatch("list")` reaches the handler, `handlers.list` registered, 404 for an unregistered name and for inherited keys like `toString` |

Strict probes (a reading the spec does not state outright) are reported and
also left out of `passed_excluding_strict`: P6 (`paginate` without options),
T8 (a signed non-JSON payload is malformed), T9 (non-string tokens) and L6
(BEH-7 does not say "exactly").

## Patches

Before the sandbox is deleted, every run writes `git diff --binary runBase
HEAD`, minus `.context-index/`, beside its result as `<result>.patch`, and
records `patch: { path, base, head, implement_head, includes_validate_commits,
excluded, files, bytes, uncommitted_paths }`. For an adev arm that ran
validate, the patch includes validate's commits (`includes_validate_commits`),
while the edge probes and D1-D4's `implement` column measure the code as
implement left it. Uncommitted changes are not in the patch; their paths are
listed.

## Blind judge

`../judge-runs.mjs` scores patches against `../judge-rubric.md`: spec
compliance, correctness/robustness, test quality, code clarity and scope
discipline, 0-10 each with cited evidence, plus an overall. It drops
bookkeeping sections from each patch and redacts `Spec:`/`Plan-task:` text,
adev names, `.context-index/` paths and arm flags, so the judge sees only the
spec and the anonymized code. Each patch is judged twice by independent
`claude -p` calls in a seeded shuffled order, with the plain arm's isolation,
no tools and no slash commands.

```bash
node tests/evals/implement-rigor-ladder/judge-runs.mjs --dry-run [--arm <id>] [--ref <sha-prefix>] [files...]
node tests/evals/implement-rigor-ladder/judge-runs.mjs [--model <m>] [--seed <n>] [--trials 2] [--arm <id>] [--ref <sha-prefix>]
node tests/evals/implement-rigor-ladder/judge-runs.mjs --summary [judge-file]
```

The output is `results/judge-<iso>.json`, keyed by result file, with both
trials, their mean and their spread. Results recorded before patches were
persisted have none, and `--dry-run` says so.

## Comparison

```bash
node tests/evals/implement-rigor-ladder/run-ab-eval.mjs --compare [--ref <ref>] [--json]
```

prints one row per arm present (plain, full, quick, lite): runs/valid, median
process and lifecycle wall clock, median cost-weighted tokens (input 1, cache
write 1.25, cache read 0.1, output 5) for implement and with validate added,
median output tokens and dispatches, the quality-gate pass rate over every
run, median D1-D4 missed after implement and escaped, the pooled edge-probe
pass rate, the median test count, and the judge's mean overall from the
latest `results/judge-*.json`. Without `--ref` it reads every recorded run of
each arm, whatever its ref. It is informational; `--evaluate` and its
thresholds are unchanged.
