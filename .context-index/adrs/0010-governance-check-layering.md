# ADR 0010: Governance Check Layering — Gates, Reviewers, Validate Checks, Boundaries, Diagnostics

## Status

Proposed

> **Proposed 2026-05-14**: Articulates the conceptual boundary between the six configurable-check surfaces living under `.context-index/governance/` before the diagnostic-registry implementation lands. Decision unblocks author judgement: "should this new check be a gate, a reviewer, a validate-check, a boundary, or a diagnostic?"

## Date

2026-05-14

## Context

After `cli-driver-surface/diagnostic-registry.spec.md` (rev 2) lands, `.context-index/governance/` will host six configurable-check files, each with its own schema, runner model, severity vocabulary, and execution timing:

| File | What it gates | How it runs | Severity model | When it fires |
|---|---|---|---|---|
| `gates.yaml` | Quality-gate shell commands (`npm test`, lint, typecheck) + lifecycle-transition requirements (`required_gates` per transition) | Shell exec via `execFile` with profile-resolved env | `error` / `warning`; tier `fast` / `integration` / `e2e` | Post-task, post-implement (Check 1 of `/adev:validate`), pre-merge |
| `review.yaml` | Reviewer subagent registry (structural, security, consistency, + project-domain reviewers) | Subagent dispatch under execution profile (ADR-0003, ADR-0004) | Finding-level: `blocker` / `warning` / `suggestion`; per-reviewer `severity_cap` | Per spec during `/adev:review-specs`; gates entry to `/adev:plan` |
| `validate.yaml` | 13 built-in validate-check overrides (Checks 1.5–13) | Skill-internal logic (Checks 2–11 are mostly subagent prompts; Check 1.5 is deterministic; Check 12 is reconciliation; Check 13 is observational heuristic extraction) | Per-check verdict: `PASS` / `PASS_WITH_NOTES` / `FAIL` / `SKIP`; aggregated for overall validate verdict | Post-implementation, via `/adev:validate` |
| `boundaries.yaml` | Regex content rules applied to changed files | Regex match in skill prose (Check 8 of `/adev:validate` and during plan/implement) | `error` / `warning` per rule | Post-change, post-implement |
| `diagnostics.yaml` (incoming) | Runner-module checks with tier (1/2/3) and scope (event-impact / spec / workspace); Tier-1 runs write-time + on-demand | Module import + `run({...})` via `lib/diagnostics/index.mjs::runDiagnostics` | `info` / `warning` / `error`; tier 1/2/3 | Write-time (Tier-1 from `appendEvent`) + on-demand (`adev diagnose`) |
| `risk-policies.yaml` | `risk_level` → required-gate escalation (high/medium/low → `require_review`, `require_hitl_approval`, `additional_gates`) | Lookup at `/adev:review-specs` and `/adev:plan` entry | Gates / escalates other checks | Pre-review, pre-plan |

The problem: **no charter or ADR articulates when an author should write a gate vs reviewer vs validate-check vs boundary vs diagnostic.** Concrete overlaps already exist or are imminent:

- **Boundaries are a strict subset of diagnostics.** A boundary rule is a regex-based content check. Once `lib/diagnostics/index.mjs` ships, the same rule could be a diagnostic entry with `runner: plugin:diagnostics/runners/regex-boundary.mjs` and the regex passed in config.
- **Validate Checks 4 (constitution), 5 (ADRs), 8 (boundaries), 1.5 (source-manifest), 1.6 (drift), 10 (platform-drift) are all "is this artifact verifiably done?"** — exactly the framing the diagnostic-registry uses (`diagnostic-registry.spec.md:20`). They could be Tier-2 diagnostics.
- **`gates.yaml::transitions` and `requireGate` in `lib/lifecycle-state.mjs`** both enforce lifecycle prerequisites at different layers. (The rev 2 amendment to `diagnostic-registry.spec.md` already prevented a third source of truth from joining.)
- **`gates.yaml::kind: probabilistic` and `risk-policies.yaml::additional_gates`** both modulate which gates run based on context — separate vocabularies for related concerns.

Without a principled boundary, future contributors will pick the surface that's most convenient rather than the one that fits the concern, and overlap will continue to accrete.

## Decision

**We will preserve all six surfaces but assign each a single, distinct conceptual role. New checks pick the surface whose role matches the concern; no surface is the "default place to add a check."**

### Role assignments (canonical, normative)

| Surface | Role | Authoritative for | NOT for |
|---|---|---|---|
| `gates.yaml` | **Process gates** — deterministic external commands that produce a binary pass/fail signal at a specific lifecycle moment (post-task, pre-merge, etc.) | Shell commands that exit 0/non-zero. Lifecycle-transition declarations linking transition → required gate IDs + approver_role. | Content inspection, schema validation, advisory observations. |
| `review.yaml` | **Subjective architectural review** — checks that require *reasoning* (LLM or human) rather than deterministic computation | Subagent reviewers (structural, security, consistency, domain experts). Reviewer prompt + context pack + dispatch trigger. | Anything that can be answered by a regex or a YAML lookup. |
| `validate.yaml` | **Composite post-implementation verdict** — the orchestrator that consumes other surfaces and decides whether the implementation is done | The 13 built-in checks of `/adev:validate`, their `enabled` flag, and any per-check parameter overrides. New built-in checks added to the skill itself. | New project-defined checks (those go to diagnostics or boundaries). The skill is the surface that *runs* the checks; it is not a registry for additional ones. |
| `boundaries.yaml` | **Single-regex content rules on changed files** — the narrow case of "does this file match a forbidden pattern?" | One-line regex rules with `pattern`, `exclude`, `severity`, optional charter overrides. | Multi-step logic, cross-file analysis, anything stateful. Those become diagnostics. |
| `diagnostics.yaml` | **Artifact-level verifiability checks** — "is this artifact (a JSONL event, a spec frontmatter, a markdown file with frontmatter) in a verifiably good state?" | Runner-module checks identified by `adev/*` IDs. Tier-1 (write-time, fast deterministic), Tier-2 (on-demand, deeper analysis), Tier-3 (LLM-graded grounding). | Lifecycle workflow state (use `requireGate`). Shell-command quality gates (use `gates.yaml`). Subjective review (use `review.yaml`). |
| `risk-policies.yaml` | **Risk-level escalation policy** — maps spec `risk_level` to required `gates.yaml` IDs, review requirement, HITL approval | The escalation table only. | Defining new gates, reviewers, or checks. It only references IDs from the other files. |

### Decision flow for a new check

When adding a new check, walk this sequence:

1. **Is it a workflow precondition** ("did the prior lifecycle step complete?")? → Not a governance file. Use `requireGate(state, stepName, { mode })` in `lib/lifecycle-state.mjs`.
2. **Is it a deterministic shell command** (`npm test`, `cargo build`, `mypy .`)? → `gates.yaml`.
3. **Does it require LLM or human reasoning** (architecture, security, cross-file consistency)? → `review.yaml`.
4. **Is it a regex against changed-file contents**, no multi-step logic, no state? → `boundaries.yaml`.
5. **Does it inspect an artifact** (JSONL event, spec frontmatter, ADR file, lifecycle log) **for verifiable invariants**? → `diagnostics.yaml`, classify by tier (1: write-time fast, 2: on-demand deeper, 3: LLM-graded).
6. **Is it a new orchestrator step in `/adev:validate`?** → Add to the skill itself (becomes a new built-in check); declare its override slot in `validate.yaml::checks[]`.
7. **Is it about escalating *which* other checks fire** based on spec risk level? → `risk-policies.yaml`.

If none of the above fits cleanly, the concern is probably misshapen — write a spec to decompose it first.

### Existing surface consolidations (out of scope for this ADR, tracked as follow-ups)

The role assignments above expose some current placements that don't match. These are noted but not changed by this ADR:

- **`boundaries.yaml` could be subsumed into `diagnostics.yaml`** as a `runner: plugin:diagnostics/runners/regex-boundary.mjs` family of entries. Defer: requires (a) a regex-runner template in the diagnostic registry and (b) a migration window for projects already using boundaries. Track as a separate hygiene-cycle spec when the diagnostic registry has stabilized and there is demand.
- **Validate Checks 4/5/8/1.5/1.6/10 could migrate to Tier-2 diagnostics.** Defer: these checks are tightly coupled to `/adev:validate` ergonomics today (report format, fail-fast semantics, per-check verdict). Migration is a larger refactor and should follow the inline-Node extraction sweep, not precede it.
- **`gates.yaml::kind: probabilistic` is unused** — no probabilistic gate has ever shipped. Consider removing the field in a future cleanup if no use case materializes.

### Alternatives Considered

1. **Single unified `governance/checks.yaml` with a `surface:` field.** One file, one parser. Rejected: the six surfaces differ in fundamental properties — execution model (shell vs subagent vs module vs regex vs YAML lookup), fire timing (write-time vs review-time vs post-implement vs pre-merge), output shape (exit code vs findings vs verdict vs warning). Forcing them into one schema either becomes a schema-of-schemas (every entry has a different sub-shape) or strips meaningful semantics. The six surfaces are *related* but not *the same*.

2. **Delete `boundaries.yaml` now and migrate to diagnostics.** Cleanest end state. Rejected: introduces a regex-runner dependency in this ADR's window before the diagnostic registry has shipped its v1. Better as a follow-up once the registry is stable.

3. **Make `diagnostics.yaml` subsume `gates.yaml` and `boundaries.yaml`.** "Everything is a runner with a tier." Rejected: gates already use a deterministic shell-command model with mature severity semantics, tier ordering (fast → integration → e2e), and stop-on-error behavior. Refactoring them into runner modules would either lose those semantics or duplicate them inside the diagnostic engine. The existing `gates.yaml` shape is well-tuned for its purpose.

4. **Punt — no ADR, address overlap when it bites.** Rejected: the next two specs (`adev-diagnose-cli`, `inline-node-extraction-sweep`) will both ask "where does this check go?" and without guidance authors will pick by convenience. Cheap to write the ADR now; expensive to untangle later.

### Why This Decision

- **Each surface has a real, distinct property** (execution model, fire timing, output shape). Preserving them is principled, not legacy-debt-accommodation.
- **Authors get a decision tree.** The seven-step flow turns "where does this check go?" from a judgement call into a checklist.
- **No code changes required.** This ADR is purely conceptual. The diagnostic-registry implementation can proceed unchanged. Follow-up consolidations (boundaries → diagnostics, validate-check migration) are tracked but deferred.
- **Compatible with the existing `requireGate` / lifecycle-state model.** The flow's step 1 explicitly routes workflow preconditions away from governance files, reinforcing the rev 2 amendment to `diagnostic-registry.spec.md`.

## Consequences

### Positive

- Future contributors have a documented decision flow for adding checks. Reduces overlap accretion.
- The conceptual model is captured in one place; specs and SKILL.md prose can cite this ADR instead of re-deriving the boundaries.
- Identifies two future consolidation opportunities (boundaries → diagnostics, validate-checks → Tier-2 diagnostics) without forcing them now.
- Locks in the rev 2 decision that lifecycle workflow state lives in `requireGate`, not in any governance file.

### Negative

- Six governance surfaces is still six surfaces. The mental load remains higher than a single unified file would impose. Mitigated by the decision flow, but not eliminated.
- This ADR doesn't immediately fix the existing overlap (boundaries-as-diagnostic-subset, validate-checks-as-Tier-2-diagnostics). Those continue to live with mild duplication until follow-up specs.

### Neutral

- The ADR doesn't restrict what kind of *new* surface could be added in the future. If a seventh distinct concern emerges (e.g., probabilistic / LLM-judged at write-time), a new surface remains an option — but adding it would require updating this ADR.

## Related

- `.context-index/adrs/0003-configurable-review-registry.md` — established the `governance/` pattern this ADR extends
- `.context-index/adrs/0004-execution-profiles.md` — orthogonal primitive consumed by `review.yaml`, `validate.yaml`, and the diagnostic registry
- `.context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md` — the spec whose introduction prompted this ADR
- `.context-index/specs/features/cli-driver-surface/charter.md` — parent charter; lists the diagnostic registry as a must-have for the `adev-compiler-discipline` milestone
- `lib/lifecycle-state.mjs::requireGate` — the workflow-precondition primitive that this ADR explicitly routes *away* from governance files
- CLAUDE.md "Architecture Boundaries" — this ADR introduces no boundary crossings; it documents an existing layering
