# EV-1 rigor-ladder fixture

The fixture that `../run-ab-eval.mjs` runs `/adev:implement` against, once per
arm (`full`, `quick`, `lite`). It is a 7-task plan over a small catalog library.

| File | Role |
|---|---|
| `example.spec.md` | The spec (`risk_level: medium`, so `lite` is not ruled out by risk) |
| `example.plan.md` | The 7-task plan |
| `example.routing.json` | The routing sidecar `/adev:route` would write for the plan |
| `seed/` | The project the run starts from: source, passing tests, `.context-index/manifest.yaml` and `constitution.md`. Its own `package.json` makes it a nested project, so `scripts/run-tests.mjs` never runs `seed/tests/` |
| `probes/` | Held-out tests, one per seeded defect. The implementer never sees them: the harness copies them into the sandbox only after a run, then removes them |

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
