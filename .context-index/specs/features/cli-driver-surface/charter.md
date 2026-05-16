---
status: approved
revision: 3
updated: 2026-05-14
---

> **Rev 3 amendment (2026-05-14):** Aligned with `diagnostic-registry.spec.md` rev 2. Tier-1 producer count revised from 4 → 3 (the `adev/lifecycle-prerequisite-met` producer was dropped; lifecycle step-order is enforced by `requireGate` in `lib/lifecycle-state.mjs`, not by a diagnostic). Updated three load-bearing references: (i) the In Scope bullet for Tier-1 producers (was "4 deterministic checks"), (ii) the Relationships entry for diagnostic runner paths (`lib/cli/diagnostics/<id>.mjs` → `lib/diagnostics/tier1/<id>.mjs`, resolving a deferred path mismatch from the rev 1 diagnostic-registry review), (iii) the Capability Map row for "Tier-1 producers (v1 set)" (roster description). No charter scope or boundary changes.

# Feature Charter: cli-driver-surface

## Business Intent

Every adev lifecycle skill today embeds executable logic as inline Node blocks inside SKILL.md prose. Empirical measurement (`.context-index/research/inline-node-extraction-scope.md`) shows this pattern fails: 96–99% of `requireGate` / `reportValidator` / `verifyIssueCompleted` inline calls never fire in real validate runs, leaving the `agent-reliable-state-artifacts` event log 94% empty and the lifecycle gate at ~4% effectiveness. The `cli-driver-surface` module replaces this pattern with the compiler-driver model (`.context-index/research/adev-vs-compiler-dispatch-patterns.md` §2.1): every executable step becomes a callable `lib/cli/<verb>.mjs` helper exposed as `adev <verb>`, with `adev diagnose` providing deterministic artifact verification and write-time diagnostic tagging on every lifecycle event. The goal is to make "agent claims done but checks didn't fire" a detectable failure at write time, and to satisfy Constitution Principle 2 in the spirit it was written — prose names the work, helpers do the work, the relationship is grep-able.

## Scope and Boundaries

### In Scope

- **Driver substrate** — `lib/cli/<verb>.mjs` modules + `adev <verb>` dispatch table in `cli/index.mjs`. Extends existing `cli` charter scope; the single-file constraint is removed as part of this charter.
- **Full inline-Node extraction (option c)** — every `Run inline Node.js:` block, `node -e` heredoc, and embedded JS code fence in the 18 canonical `skills/*/SKILL.md` files. Per-skill atomic: the extraction PR deletes the inline block and replaces it with the `adev <verb>` call in the same commit. No parallel inline+CLI state at any point in tree. Sequenced across PRs by silent-rate: Check 13 first, then `reportValidator` / `reportStep`, then `requireGate`, then source-manifest, then domain-aware loading, then the long tail.
- **Helper-side gating discipline** — every `lib/cli/<verb>.mjs` mapped to a lifecycle step calls `requireGate(state, <step>)` as its first executable line.
- **`adev gate require --skill <s> --spec <p>`** — explicit-invocation gate primitive for SKILL.md prose and pre-commit hooks.
- **Diagnostic registry** — `lib/diagnostics/index.mjs` engine + `governance/diagnostics.yaml` declarative entries (id, runner, severity, tier, scope).
- **`adev diagnose [--spec <p>] [--tier 1|2|3] [--json] [--only <ids>]`** — CLI verb that iterates the registry and reports firing diagnostics.
- **Write-time Tier-1 diagnostic hook** — `lib/lifecycle-state.mjs::appendEvent` calls `runDiagnostics({ tier: 1, scope: 'event-impact' })` after every write; results are tagged inline on the event as `diagnostic_warnings: [<id>...]`.
- **Manifest knob `lifecycle.event_diagnostics: strict|tag|off`** — default `tag`.
- **Tier-1 producers shipped in v1** — event-schema check, status-enum legality, frontmatter presence (3 deterministic checks). Lifecycle step-order checks are NOT a diagnostic — they remain `requireGate` in `lib/lifecycle-state.mjs` per the rev 2 diagnostic-registry amendment and ADR-0009.
- **Canonical SKILL.md updates** — 18 files in `skills/*/SKILL.md`. Mid-migration tree state is per-skill atomic: extracted skills + un-extracted skills, never "skill with both forms."
- **Constitution amendment** — extend `## Anti-Patterns to Avoid` to forbid `node --input-type=module -e "..."` heredocs, `node -e "..."` invocations, and `Run inline Node.js:` step directives in SKILL.md prose. Harness-side `!command` (read-once at load time, distinct from agent-side eval) remains permitted for read-only context injection.
- **Regression hook** — `hooks/pre-commit-no-inline-node.sh` that greps `skills/**/SKILL.md` for the forbidden patterns and rejects matching commits. Scope: canonical `skills/**` only (`providers/*/skills/**` is out of scope per Dependencies below). The hook also rejects commits where a single SKILL.md contains both an inline-Node block *and* an `adev <verb>` invocation in the same H3 section (the per-step boundary; mechanically enforces the per-skill atomic invariant).
- **Revision of existing `cli` charter** to rev 3 — drop the single-file constraint, declare the driver model, expand the listed commands to include the lifecycle dispatch surface.

### Out of Scope

- **Layer 2 (declarative registry per skill)** — `runner:` paths in `governance/validate.yaml` / `review.yaml` etc. This is a follow-up charter.
- **Layer 3 (install-time codegen)** — `lib/_generated/dispatch.mjs`. Depends on L2.
- **Provider mirror sync** — `providers/codex/skills/` and `providers/opencode/skills/` updates. Currently 100% diverged (1,656 cumulative diff lines); remains hand-maintained until a dedicated `provider-mirror-sync` charter.
- **Tier-2 and Tier-3 diagnostic producers** — the registry exposes extension points; the producers themselves land in dependent charters (`artifact-schemas` ships schema validators, `validation/` citation-grounding spec ships Tier-3 grounding).
- **LSP daemon** (`adev lsp serve`, pull-diagnostic over JSON-RPC) — future charter, reuses the same registry.
- **Strict-mode default for write-time diagnostics** — requires corpus backfill (current 5.8% lifecycle-log coverage). Default stays `tag`; strict bake-in is a follow-up once corpus is clean.
- **Removing inline Node from `providers/*/skills/*/SKILL.md`** — same content as canonical post-extraction, but mirror update is the follow-up charter's responsibility.

### Dependencies

| Dependency | Type | Description |
|---|---|---|
| `cli` | internal module (revised) | This charter extends the cli charter to rev 3, dropping the single-file constraint and declaring the driver model. Revision is one of this charter's deliverables. |
| `agent-reliable-state-artifacts` | internal module | Write-time diagnostic hook lives in `lib/lifecycle-state.mjs::appendEvent`; this charter assumes the JSONL event-log substrate from that charter is in place. |
| `unified-gates` | internal module | Helper-side `requireGate` reads gate mode from `lifecycle.gate_mode`; this charter assumes unified gate semantics. |
| `hooks` | internal module | Adds `hooks/pre-commit-no-inline-node.sh` to the existing hook registry. |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|---|---|---|
| CLI helper module | A `lib/cli/<verb>.mjs` file exporting a `run({...})` function | path, verb name, argv schema, lifecycle-step binding (optional) |
| CLI verb | The `adev <verb>` dispatch entry registered in `cli/index.mjs` | name, helper module, argv parser, exit-code policy |
| Diagnostic registry entry | A row in `governance/diagnostics.yaml` | id (e.g., `adev/validator-report-missing`), runner path, severity (info / warning / error), tier (1 / 2 / 3), scope (event-impact / spec / workspace) |
| Diagnostic verdict | The output of running a registered diagnostic | id, severity, message, file:line citation, fired (bool) |
| Lifecycle-step prerequisite | Encoded in `governance/diagnostics.yaml` as a prerequisite check | step, requires (list of prior step events) |
| Write-time event tag | A `diagnostic_warnings: [<id>...]` field on a JSONL lifecycle event | event identity, list of fired diagnostic IDs |

### Relationships

- One `lib/cli/<verb>.mjs` ↔ one `adev <verb>` CLI entry (1:1)
- One CLI helper ↔ zero-or-one lifecycle-step binding (only lifecycle helpers call `requireGate`)
- `governance/diagnostics.yaml` entries → runner files in `lib/diagnostics/tier1/<id>.mjs` for Tier-1 producers (and `lib/diagnostics/tier{2,3}/` for higher tiers as they ship). The registry is the source of truth for which diagnostics exist; runners are the implementations.
- `lib/lifecycle-state.mjs::appendEvent` → `runDiagnostics({ tier: 1, scope: 'event-impact' })` after every write
- `adev diagnose` → `runDiagnostics({ tier: <selected> })` on demand
- `adev gate require` → `runDiagnostics({ tier: 1, only: <blocker ids> })` at skill entry

### Invariants

1. Every lifecycle-step helper calls `requireGate(state, <step>)` as its first executable line.
2. **Per-skill atomic migration.** A SKILL.md is either fully extracted (zero inline-Node blocks; all step logic invoked via `adev <verb>` calls) or untouched by this charter. No SKILL.md contains both an inline-Node block and an `adev <verb>` call for the same step at any point in tree. The pre-commit hook enforces this mechanically.
3. CLI verb exit codes follow the hook protocol: 0 success, 2 gate-blocked, 1 fatal error.
4. Tier-1 diagnostic execution completes in <50 ms per event.
5. Write-time diagnostic results are recorded inline on the event (`diagnostic_warnings` field), not in a separate file.
6. The diagnostic registry is the single source of truth for "which checks exist." A missing runner is itself a diagnostic (severity: warning), never a crash.
7. Constitution amendment + pre-commit hook prevent new inline-Node blocks from accruing in `skills/**/SKILL.md`.

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|---|---|---|---|---|
| Driver substrate (`lib/cli/<verb>.mjs` + dispatch) | Pattern, conventions, registration glue in `cli/index.mjs` | must-have | adev-compiler-discipline | validated |
| Inline-Node extraction sweep | Per-skill atomic deletion of all 35+ inline blocks across 18 canonical SKILL.md files. Each PR ships helper + test + SKILL.md edit in one commit; no in-tree intermediate state with both forms. | must-have | adev-compiler-discipline | implemented |
| Helper-side `requireGate` discipline | Convention enforced by test that scans `lib/cli/*.mjs` for the call site | must-have | adev-compiler-discipline | validated |
| `adev gate require` CLI verb | Explicit-invocation gate primitive | must-have | adev-compiler-discipline | validated |
| Diagnostic registry engine (`lib/diagnostics/index.mjs`) | `runDiagnostics({...})` + registry loader | must-have | adev-compiler-discipline | implemented |
| `governance/diagnostics.yaml` schema + initial scaffold | Declarative registry entries with `id` / `runner` / `severity` / `tier` / `scope` fields. Follows the precedent set by ADR-0003 (configurable review registry) for `governance/review.yaml` and `governance/gates.yaml`; this charter generalizes the same registry shape to diagnostics. | must-have | adev-compiler-discipline | implemented |
| `adev diagnose` CLI verb | On-demand diagnostic run, JSON + human-readable modes | must-have | adev-compiler-discipline | implemented |
| Write-time Tier-1 hook in `appendEvent` | Calls `runDiagnostics({ tier: 1 })` after every event write; tags event inline | must-have | adev-compiler-discipline | implemented |
| Manifest knob `lifecycle.event_diagnostics` | strict / tag / off; default tag | must-have | adev-compiler-discipline | implemented |
| Tier-1 producers (v1 set) | Event schema (closed discriminator / open per-type shape), status-enum legality, frontmatter presence (3 producers; lifecycle step-order is `requireGate`'s job, not a diagnostic — see ADR-0009) | must-have | adev-compiler-discipline | implemented |
| Constitution amendment | Extend Anti-Patterns to forbid inline-Node patterns; permit harness-side `!command` | must-have | adev-compiler-discipline | implemented |
| `hooks/pre-commit-no-inline-node.sh` | Regression hook rejecting new inline-Node and both-forms states in `skills/**/SKILL.md` | must-have | adev-compiler-discipline | implemented |
| `cli` charter revision (rev 2 → rev 3) | Drop single-file constraint, declare driver model, expand commands list. **Prerequisite for the driver-substrate work** — must land first so the first multi-file `lib/cli/` commit does not violate the existing single-file constraint. | must-have | adev-compiler-discipline | done |
| Tier-2/3 producer extension points | Registry supports them; concrete producers land in dependent charters | should-have | adev-compiler-discipline | — |
| `adev <verb>` help / discovery | `adev --help`, `adev <verb> --help` for standard argv discoverability | should-have | adev-compiler-discipline | validated |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|---|---|---|---|
| L2 declarative registry per skill (`runner:` in `governance/validate.yaml` etc.) | Bulk-extraction discipline; defer until L1 stable | TBD | this charter |
| L3 install-time codegen (`lib/_generated/dispatch.mjs`) | Earnable only after L2 | TBD | L2 charter |
| Provider-mirror sync (codex / opencode) | Cross-cutting packaging concern; deserves its own charter | TBD | this charter |
| `adev lsp serve` daemon + pull diagnostics | Long-running incremental analyzer; reuses same registry | TBD | this charter |
| Strict-mode default for `event_diagnostics` | Requires corpus backfill (current 5.8% event-log coverage) | TBD | this charter + backfill |
| Tier-3 citation grounding producer | Lands under `validation/` charter as a new spec | TBD | this charter, validation/ |
| Tier-1/2 schema validators | Lands under `artifact-schemas` charter (epic-76) | TBD | this charter |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|---|---|---|
| `adev <verb> [args]` | CLI | One entry per extracted helper; exit codes 0 (success) / 1 (fatal) / 2 (gate-blocked) |
| `adev diagnose [--spec <p>] [--tier 1\|2\|3] [--json] [--only <ids>]` | CLI | Runs diagnostic registry; exit 0 if clean, 2 if any error-severity diagnostic fires |
| `adev gate require --skill <s> --spec <p>` | CLI | Skill-entry gate; consults diagnostics for blocker-class IDs |
| `lib/cli/<verb>.mjs::run({...})` | function | Uniform export shape for all CLI helpers |
| `lib/diagnostics/index.mjs::runDiagnostics({ projectRoot, spec, tier, only, scope })` | function | Engine entry point; returns `{ fired: [...], skipped: [...], errors: [...] }` |
| `governance/diagnostics.yaml` schema | declarative file | id / runner / severity / tier / scope per entry |
| Manifest field `lifecycle.event_diagnostics: strict\|tag\|off` | config | Controls write-time behavior; default `tag` |
| Event field `diagnostic_warnings: [<id>...]` | data | Inline tag on tagged JSONL lifecycle events |

### Consumed APIs

| Interface | Source Module | Description |
|---|---|---|
| `requireGate`, `currentState`, `appendEvent`, `reportStep`, `reportValidator` | `lib/lifecycle-state.mjs` | Helper-side gating + event writing |
| `loadManifest`, `resolveGateMode` | `lib/manifest.mjs` | Config resolution |
| `getIssueManager` | `lib/issues/registry.mjs` | For helpers that touch the board |
| Existing helpers in `lib/` (heuristics, source-manifest, spec-drift, domains, infra-preflight, execution-state, reality-check, meta-tools, prototype, deploy) | various | Wrapped by extracted CLI verbs — these are the implementations the helpers call into |
| Hook protocol (stdin JSON, exit codes) | Claude Code harness | `hooks/pre-commit-no-inline-node.sh` follows this |

## Quality Attributes

| Attribute | Requirement |
|---|---|
| Performance | Tier-1 diagnostic per event <50 ms; full `adev diagnose --tier 1` for one spec <500 ms; per-skill cumulative overhead <5 s |
| Reliability | CLI exit codes 0 / 1 / 2 per hook protocol; diagnostic registry is fail-safe (missing runner → warning, never crashes); helper-side `requireGate` is unconditional and always first |
| Testability | Every `lib/cli/<verb>.mjs` has a paired `tests/cli/<verb>.test.mjs`; argv is the test surface; registry loading + dispatch are integration-tested |
| Determinism | Identical inputs → identical exit code + stdout; no LLM calls inside helpers (helpers are deterministic; LLM lives only in agent skill prose) |
| Observability | Every helper logs entry / exit to lifecycle event log; `adev diagnose --json` produces a stable, versioned JSON schema |
| Constitution alignment | Honors Principle 1 (zero new deps), Principle 2 (helpers callable; SKILL.md contains no executable logic), Principle 3 (pure ESM), Principle 4 (hook protocol compliance for the new pre-commit hook) |
