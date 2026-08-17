---
date: 2026-08-16T21:15:00-03:00
module_filter: all
check_filter: all
total_findings: 441
summary:
  high: 61
  medium: 82
  low: 298
repomap_commit: f09ecab9
scope_nodes: 220
---

# Code Health Report

Full scan (no `--module`, no `--check` filter) against all `hygiene.source_roots`
(`cli/`, `hooks/`, `lib/`, `providers/`, `skills/`, `templates/`), minus
`hygiene.coverage_exclude` (`tests/**`, `skills/*/evals/**`). Run against the
repomap artifacts regenerated immediately prior to this scan
(`.context-index/hygiene/dependency-graph.json`: 1925 nodes, 1209 edges;
`.context-index/hygiene/symbol-ranks.json`: 3458 symbols; commit `f09ecab9`).

**Tree-sitter is available** in this environment (`node lib/repomap/check-deps.mjs`
exits 0; `tree-sitter-typescript.wasm` present in `node_modules/`) — Pass 5
(Duplicate Logic Detection) ran, using the same parser/grammar the repomap uses.

| Pass | High | Medium | Low | Total |
|------|------|--------|-----|-------|
| Dead Export Detection | 0 | 71 | 0 | 71 |
| Orphan File Detection | 0 | 0 | 0 | 0 |
| Unused Dependency Detection | 0 | 1 | 0 | 1 |
| Stale Code Detection | 9 | 0 | 298 | 307 |
| Duplicate Logic Detection | 52 | 10 | 0 | 62 |
| **Total** | **61** | **82** | **298** | **441** |

## Scan-scope note: worktree pollution risk (bug observed, not present in this run's data)

`manifest.yaml`'s `repomap.exclude` list was recently fixed to add
`.adev/worktrees/**` (matching the pre-existing `.claude/worktrees/**` entry added
during the 2026-06-02 codehealth run, when 36% of graph nodes turned out to be a
stale `.claude/worktrees/` checkout). **However, `hygiene.source_roots` /
`hygiene.coverage_exclude` — the settings this skill's own File Scope Resolution
step reads — have no equivalent exclusion for either `.adev/worktrees/**` or
`.claude/worktrees/**`.** The two knobs are read by two different tools
(`repomap.exclude` by the repomap generator; `hygiene.source_roots` /
`coverage_exclude` by this skill's own file-system-scoped passes 3-4), and only one
of them was patched. This scan's own file-scope resolution (prefix-matching
`source_roots` against repo-root-relative paths) happened not to pick up the 6
worktree checkouts currently on disk (`.adev/worktrees/{governance-checks-unbundle,
research-lean-validation,research-test-suite-benchmark,review-context-pack,
spec-behavior-ids}`, `.claude/worktrees/heuristics-migration`) because none of their
full paths literally start with `cli/`, `hooks/`, `lib/`, `providers/`, `skills/`, or
`templates/` — but that is incidental to how `fnmatch`/prefix-based scope resolution
happens to work, not a guarantee. A source-roots resolver that globs by basename
(`**/cli/**`) rather than by root-anchored prefix, or a future worktree placed at a
path that does prefix-match, would silently re-pollute passes 3 and 4 the same way
the June run got polluted. **Recommendation:** add `.adev/worktrees/**` and
`.claude/worktrees/**` to `hygiene.coverage_exclude` directly, so file-scope
resolution does not depend on prefix-matching luck.

## Methodology corrections (dynamic-dispatch blind spots)

The static `.mjs` edge graph cannot see computed `import()` calls. Three recurring
patterns produced false positives that were verified by direct source inspection
before being excluded from the counts above (consistent with the same corrections
applied in the 2026-06-02 report):

1. **CLI verb table.** `cli/index.mjs`'s `VERB_REGISTRY` (~line 1839) dispatches 33
   `lib/cli/<verb>.mjs` modules via `() => import("../lib/cli/<verb>.mjs")`; a nested
   dispatcher in `lib/cli/issues.mjs` further dispatches `issues-migrate.mjs`,
   `issues-claim.mjs`, `issues-stale.mjs` the same way. Their `run`/`help` exports
   looked dead/orphaned — they are not. Suppressed 25 orphan-file candidates and
   ~64 dead-export candidates (the `run`/`help` pair per module).
2. **Hook `.sh` dynamic imports.** `hooks/_execution-state.mjs`,
   `hooks/_gaming-gate-check.mjs`, `hooks/_lifecycle-gate-check.mjs`,
   `hooks/issue-reminder.mjs`, `hooks/post-validate-extract-heuristics.mjs` are
   `import()`-ed from inline Node blocks in `hooks/*.sh` — invisible to the graph.
   Verified via grep of `hooks/*.sh` per the skill's Pass 2 step 4; suppressed 5
   orphan-file candidates.
3. **Repomap's own internal dynamic dispatch.** `lib/repomap/index.mjs`'s
   `runTreeSitterMode()` (~line 367) does `await import('./parse.mjs')` — this is
   the actual live consumer of `lib/repomap/parse.mjs`'s `initParser`, `loadGrammar`,
   `parseFile` exports, which otherwise looked both dead **and** fully-orphaned
   (0 incoming, 0 outgoing static edges — would have been the single highest-severity
   orphan-file finding in this report). Suppressed 1 orphan-file + 3 dead-export
   candidates. Note this is the *dependency-graph generator's own module* failing to
   see its own dynamic self-import — worth a follow-up to see whether the graph
   builder can special-case `await import('./<relative>.mjs')` literals the way it
   evidently already does for `lib/repomap/graph.mjs` and `lib/repomap/rank.mjs`
   (dynamically imported the same way, one line below `parse.mjs`, but *did* register
   as edges — the miss is inconsistent, not systemic).
4. **External harness entry point.** `providers/opencode/plugin.mjs` (`AdevPlugin`)
   is `package.json`'s `main` field for the opencode provider package — loaded by the
   opencode harness outside this repo, not by anything in the graph. Lacks the
   `public-api-entry` tag that `cli/index.mjs` carries (tagging gap worth closing).
   Treated as a public-API entry per the 2026-06-02 precedent; suppressed 1 orphan +
   1 dead-export finding.
5. **WASM grammar path-string reference.** `tree-sitter-typescript` (production
   dependency) is referenced in `lib/repomap/index.mjs` only as a filesystem-path
   string segment (`join(..., 'tree-sitter-typescript', 'tree-sitter-typescript.wasm')`),
   never via `import`/`require`. Every prior codehealth report (2026-04-02 through
   2026-06-02) has independently verified and excluded this exact pattern; not
   flagged as unused here either.

## Dead Export Detection

0 high · 71 medium · 0 low.

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| medium | lib/cli/domain-extension-picker.mjs | 42 | loadCatalog | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/domain-extension-picker.mjs | 77 | validateEntries | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/domain-extension-picker.mjs | 283 | dispatchInstall | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/domain-extension-picker.mjs | 388 | writeDomainKey | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/domain.mjs | 86 | readFrontmatter | Coexists with other referenced exports in file |
| medium | lib/cli/heuristics.mjs | 114 | specSlug | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/heuristics.mjs | 128 | deriveId | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/issues-migrate.mjs | 111 | readSource | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/issues-migrate.mjs | 209 | computeAlreadyMigrated | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/issues-migrate.mjs | 283 | computeInScopeEdges | Coexists with other referenced exports in file |
| medium | lib/cli/issues-migrate.mjs | 313 | loadResumeState | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/issues-migrate.mjs | 387 | clearMigrateState | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/issues-migrate.mjs | 441 | runLiveMigration | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/issues-migrate.mjs | 595 | replayDependencies | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/issues-migrate.mjs | 691 | buildLiveRunReport | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/issues-migrate.mjs | 720 | manifestUpdateSuggestion | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/cli/issues-migrate.mjs | 734 | buildDryRunReport | Coexists with other referenced exports in file |
| medium | lib/cli/issues-migrate.mjs | 778 | parseArgs | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/extensions/exec-consent.mjs | 67 | renderContributionValue | Coexists with other referenced exports in file |
| medium | lib/extensions/exec-payload.mjs | 84 | INTERPRETER_ALLOWLIST | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/extensions/governance-registry.mjs | 191 | FIELD_VALUE_CONSTRAINTS | Coexists with other referenced exports in file |
| medium | lib/gates/doctor.mjs | 51 | SCHEMA_VERSION | Coexists with other referenced exports in file |
| medium | lib/gates/doctor.mjs | 631 | resolveCommandChain | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/gates/doctor.mjs | 1358 | familyOf | Coexists with other referenced exports in file |
| medium | lib/governance/boundaries.mjs | 70 | DEFAULT_BOUNDARIES_PATH | Coexists with other referenced exports in file |
| medium | lib/governance/boundaries.mjs | 86 | MAX_MATCHED_LINE_CHARS | Coexists with other referenced exports in file |
| medium | lib/governance/boundaries.mjs | 111 | BOUNDARY_CODES | Coexists with other referenced exports in file |
| medium | lib/governance/context-pack.mjs | 463 | expandTargetTokens | Coexists with other referenced exports in file |
| medium | lib/governance/enablement.mjs | 54 | DISABLED_WITHOUT_REASON | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/governance/enablement.mjs | 57 | INVALID_ENABLED_VALUE | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/governance/materialize.mjs | 174 | resolveRegistryName | Coexists with other referenced exports in file |
| medium | lib/governance/materialize.mjs | 211 | resolveRegistryTarget | Coexists with other referenced exports in file |
| medium | lib/governance/materialize.mjs | 582 | materialize | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/governance/transitions.mjs | 100 | GATE_REASONS | Coexists with other referenced exports in file |
| medium | lib/hygiene/registry-drift.mjs | 128 | EXECUTION_FIELDS | Coexists with other referenced exports in file |
| medium | lib/hygiene/registry-drift.mjs | 131 | FINDING_IDS | Coexists with other referenced exports in file |
| medium | lib/hygiene/test-debt.mjs | 552 | normaliseReference | Coexists with other referenced exports in file |
| medium | lib/issues/beads-adapter.mjs | 74 | ADEV_CONTEXT_KEY | Coexists with other referenced exports in file |
| medium | lib/issues/id-utils.mjs | 40 | FLAT_ID_SUFFIX_LENGTH | Coexists with other referenced exports in file |
| medium | lib/issues/interface.mjs | 84 | REF_FIELD_CODES | Coexists with other referenced exports in file |
| medium | lib/issues/interface.mjs | 131 | CLAIM_TTL_MINUTES_FLOOR | Coexists with other referenced exports in file |
| medium | lib/lifecycle-gate-helpers.mjs | 45 | loadMergedConfig | Coexists with other referenced exports in file |
| medium | lib/lifecycle-gate-helpers.mjs | 183 | resolveModule | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/lifecycle-gate-helpers.mjs | 213 | checkModuleLifecycle | Coexists with other referenced exports in file |
| medium | lib/migrate-state-artifacts.mjs | 1330 | migratePlanAdvisoryHeader | Coexists with other referenced exports in file |
| medium | lib/migrate-state-artifacts.mjs | 1414 | migrateValidateConfig | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/plan-routing-sidecar.mjs | 353 | unlinkSidecarTmp | Coexists with other referenced exports in file |
| medium | lib/profiles/adapters/claude-code.mjs | 20 | HARNESS | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/profiles/adapters/claude-code.mjs | 23 | IMPLEMENTED | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/profiles/adapters/claude-code.mjs | 26 | UNSUPPORTED | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/profiles/adapters/claude-code.mjs | 29 | AUDITED_CHANNELS | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/profiles/adapters/claude-code.mjs | 39 | capabilities | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/profiles/adapters/claude-code.mjs | 50 | prepareForDispatch | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/profiles/adapters/opencode.mjs | 18 | HARNESS | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/profiles/adapters/opencode.mjs | 20 | IMPLEMENTED | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/profiles/adapters/opencode.mjs | 22 | UNSUPPORTED | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/profiles/adapters/opencode.mjs | 24 | AUDITED_CHANNELS | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/profiles/adapters/opencode.mjs | 34 | capabilities | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/profiles/adapters/opencode.mjs | 38 | prepareForDispatch | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/provider/registry.mjs | 17 | providers | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/providers/copilot/matcher.mjs | 15 | MAX_MATCHER_BYTES | Coexists with other referenced exports in file |
| medium | lib/repomap/index.mjs | 84 | readManifest | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/repomap/index.mjs | 279 | run | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/session-capture-installer.mjs | 45 | readCaptureMode | Coexists with other referenced exports in file |
| medium | lib/session-capture-installer.mjs | 423 | registerSessionCaptureHooks | Coexists with other referenced exports in file |
| medium | lib/session-capture-installer.mjs | 460 | unregisterSessionCaptureHooks | Coexists with other referenced exports in file |
| medium | lib/session-capture.mjs | 452 | runCapture | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/test-strategies/helper-inventory.mjs | 31 | SKIP_DIRS | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |
| medium | lib/test-strategies/helper-inventory.mjs | 634 | isTestShapedPath | Coexists with other referenced exports in file |
| medium | lib/worktree.mjs | 32 | BRANCH_PREFIX | Coexists with other referenced exports in file |
| medium | providers/copilot/adapter.mjs | 49 | getCopilotHome | Coexists with other referenced exports in file — benign: referenced only from tests/** (excluded from dependency graph by hygiene.coverage_exclude) |

## Orphan File Detection

No issues found. All 35 raw candidates resolved to false positives via the
skill's own exclusion rules (`**/index.*` entry points: 2; hook-script
cross-reference: 5) plus the dynamic-dispatch corrections documented above
(CLI verb table + nested `issues.mjs` dispatch: 25; repomap's internal
`await import('./parse.mjs')`: 1; opencode external entry point: 1; the remaining
1, `lib/governance/boundary-worker.mjs`, is loaded via `new URL('./boundary-worker.mjs',
import.meta.url)` and dispatched through `node:worker_threads`, also invisible to the
static edge graph). 0 genuine orphans found — consistent with the 2026-06-02 report.

## Unused Dependency Detection

0 high · 1 medium · 0 low.

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| medium | package.json | — | typescript | devDependency not matched by import/require pattern within resolved source_roots (cli/, hooks/, lib/, providers/, skills/, templates/). Documented exception: ADR-0002 records this as intentional — typescript is used only by the eval harness in tests/evals/repomap/generate-ground-truth.mjs, outside scan scope by design (tests/** is in hygiene.coverage_exclude). Not actually dead. |

`web-tree-sitter` and `@dotenvx/dotenvx` are both actively imported within scope.
`tree-sitter-typescript` is used via path-string reference (see methodology note
above) — not flagged.

## Stale Code Detection

9 high · 0 medium · 298 low. Threshold: 30 days
(`hygiene.staleness_threshold_days`), evaluated against 2026-08-16. No module was
uniformly old enough to trigger the module-wide skip (every multi-file module had
commit activity within the last several days; only the single-file `cli` and
`triage` modules were trivially "uniform").

### High (stale + also flagged as a dead export elsewhere in this report)

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| high | lib/cli/domain-extension-picker.mjs | — | — | Last modified: 2026-05-26T11:33:44-03:00. Also flagged in Dead Export Detection (unreferenced). |
| high | lib/lifecycle-gate-helpers.mjs | — | — | Last modified: 2026-05-10T21:41:02-03:00. Also flagged in Dead Export Detection (unreferenced). |
| high | lib/plan-routing-sidecar.mjs | — | — | Last modified: 2026-05-20T09:36:14-03:00. Also flagged in Dead Export Detection (unreferenced). |
| high | lib/profiles/adapters/claude-code.mjs | — | — | Last modified: 2026-04-19T19:42:27+01:00. Also flagged in Dead Export Detection (unreferenced). |
| high | lib/profiles/adapters/opencode.mjs | — | — | Last modified: 2026-04-19T19:42:27+01:00. Also flagged in Dead Export Detection (unreferenced). |
| high | lib/provider/registry.mjs | — | — | Last modified: 2026-05-19T17:17:08-03:00. Also flagged in Dead Export Detection (unreferenced). |
| high | lib/providers/copilot/matcher.mjs | — | — | Last modified: 2026-05-19T16:37:47-03:00. Also flagged in Dead Export Detection (unreferenced). |
| high | lib/repomap/index.mjs | — | — | Last modified: 2026-05-18T19:27:36-03:00. Also flagged in Dead Export Detection (unreferenced). |
| high | providers/copilot/adapter.mjs | — | — | Last modified: 2026-05-19T17:13:50-03:00. Also flagged in Dead Export Detection (unreferenced). |

### Low (stale, still referenced — informational)

<details><summary>298 findings — expand for full list</summary>

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| low | hooks/constitution-linter.sh | — | — | Last modified: 2026-05-10T08:02:51-03:00. Stale but actively referenced elsewhere in the graph. |
| low | hooks/issue-reminder.mjs | — | — | Last modified: 2026-04-16T16:47:28+01:00. Stale but actively referenced elsewhere in the graph. |
| low | hooks/issue-reminder.sh | — | — | Last modified: 2026-04-06T21:01:55-03:00. Stale but actively referenced elsewhere in the graph. |
| low | hooks/plan-body-write-guard.sh | — | — | Last modified: 2026-05-21T12:07:26-03:00. Stale but actively referenced elsewhere in the graph. |
| low | hooks/post-validate-extract-heuristics.sh | — | — | Last modified: 2026-05-15T23:31:57-03:00. Stale but actively referenced elsewhere in the graph. |
| low | hooks/pre-commit-no-inline-node.sh | — | — | Last modified: 2026-05-15T18:45:04-03:00. Stale but actively referenced elsewhere in the graph. |
| low | hooks/pre-compact.sh | — | — | Last modified: 2026-05-20T18:06:05-03:00. Stale but actively referenced elsewhere in the graph. |
| low | hooks/session-end.sh | — | — | Last modified: 2026-05-20T18:05:00-03:00. Stale but actively referenced elsewhere in the graph. |
| low | hooks/sync-trigger.sh | — | — | Last modified: 2026-05-10T08:02:51-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/amendment-graph.mjs | — | — | Last modified: 2026-06-19T11:09:12-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/blocker-id.mjs | — | — | Last modified: 2026-05-20T00:33:25-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/blockers-writer.mjs | — | — | Last modified: 2026-05-20T00:52:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/build-state.mjs | — | — | Last modified: 2026-05-15T15:20:56-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/build-state.mjs | — | — | Last modified: 2026-05-15T21:22:59-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/context.mjs | — | — | Last modified: 2026-05-15T21:22:59-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/cost.mjs | — | — | Last modified: 2026-05-22T21:45:19-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/execution-state.mjs | — | — | Last modified: 2026-05-15T21:22:59-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/implement.mjs | — | — | Last modified: 2026-05-20T09:36:14-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/init-ensure-gitignore.mjs | — | — | Last modified: 2026-05-22T10:27:46-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/init-prompt-session-capture.mjs | — | — | Last modified: 2026-05-20T18:08:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/partial.mjs | — | — | Last modified: 2026-05-18T11:19:53-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/preflight.mjs | — | — | Last modified: 2026-05-15T22:33:47-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/prototype.mjs | — | — | Last modified: 2026-05-15T22:33:47-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/retro.mjs | — | — | Last modified: 2026-05-20T19:55:18-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/route.mjs | — | — | Last modified: 2026-05-20T09:36:14-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/skill-ext.mjs | — | — | Last modified: 2026-05-25T21:04:58-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/source-manifest.mjs | — | — | Last modified: 2026-05-18T17:34:44-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/specify.mjs | — | — | Last modified: 2026-06-19T10:54:04-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/state.mjs | — | — | Last modified: 2026-05-15T21:22:59-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cli/verify.mjs | — | — | Last modified: 2026-05-18T11:14:43-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cost-formatters.mjs | — | — | Last modified: 2026-05-22T21:45:18-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/cost-summary.mjs | — | — | Last modified: 2026-05-22T21:45:18-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/deploy.mjs | — | — | Last modified: 2026-05-10T08:14:44-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/diagnostics/revision-monotonic.mjs | — | — | Last modified: 2026-05-20T00:58:56-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/diagnostics/tier1/event-schema-valid.mjs | — | — | Last modified: 2026-05-15T18:45:04-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/diagnostics/tier1/frontmatter-present.mjs | — | — | Last modified: 2026-05-15T18:45:04-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/diagnostics/tier1/status-enum-legal.mjs | — | — | Last modified: 2026-05-15T18:45:04-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/domains/constants.mjs | — | — | Last modified: 2026-05-15T22:25:41-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/domains/domain-config.mjs | — | — | Last modified: 2026-05-15T22:25:41-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/domains/merge-gate-config.mjs | — | — | Last modified: 2026-05-10T21:41:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/domains/merge-reviewers.mjs | — | — | Last modified: 2026-05-10T21:41:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/domains/merge-test-config.mjs | — | — | Last modified: 2026-05-10T21:41:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/domains/merge-verification.mjs | — | — | Last modified: 2026-05-10T21:41:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/domains/resolve.mjs | — | — | Last modified: 2026-05-10T21:41:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/extensions/manifest-schema.mjs | — | — | Last modified: 2026-05-11T09:08:40-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/extensions/picker-errors.mjs | — | — | Last modified: 2026-05-20T17:06:05-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/extensions/register.mjs | — | — | Last modified: 2026-05-11T09:23:43-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/extensions/resolve-source.mjs | — | — | Last modified: 2026-05-11T14:45:38-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/extensions/version-check.mjs | — | — | Last modified: 2026-05-11T09:11:13-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/git-timestamp.mjs | — | — | Last modified: 2026-05-15T15:19:41-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/gitignore-installer.mjs | — | — | Last modified: 2026-05-22T10:27:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/governance/quality-gate.mjs | — | — | Last modified: 2026-04-19T19:43:35+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/hygiene/amendment-audit.mjs | — | — | Last modified: 2026-06-19T11:00:30-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/hygiene/kind-validity.mjs | — | — | Last modified: 2026-05-15T15:19:44-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/infra-preflight.mjs | — | — | Last modified: 2026-05-07T21:32:43-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/issues/file-adapter.mjs | — | — | Last modified: 2026-05-12T10:38:59-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/kinds.mjs | — | — | Last modified: 2026-06-19T10:48:38-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/loop-convergence.mjs | — | — | Last modified: 2026-05-20T01:03:17-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/manifest.mjs | — | — | Last modified: 2026-05-20T01:13:06-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/partial-artifact.mjs | — | — | Last modified: 2026-05-18T11:19:53-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/persona.mjs | — | — | Last modified: 2026-05-18T17:36:03-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/profiles/env.mjs | — | — | Last modified: 2026-04-19T19:42:27+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/profiles/extends.mjs | — | — | Last modified: 2026-04-19T19:42:27+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/profiles/index.mjs | — | — | Last modified: 2026-04-19T19:43:35+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/profiles/redaction.mjs | — | — | Last modified: 2026-04-19T19:42:27+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/profiles/schema.mjs | — | — | Last modified: 2026-04-19T19:42:27+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/profiles/tool-categories.mjs | — | — | Last modified: 2026-04-19T19:42:27+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/profiles/yaml.mjs | — | — | Last modified: 2026-04-19T19:42:27+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/prototype-args.mjs | — | — | Last modified: 2026-05-08T17:03:37-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/prototype-server.mjs | — | — | Last modified: 2026-05-22T10:27:46-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/provider/detect.mjs | — | — | Last modified: 2026-03-23T10:52:30-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/providers/copilot/README.md | — | — | Last modified: 2026-05-19T17:19:10-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/providers/copilot/event-table.mjs | — | — | Last modified: 2026-05-19T16:36:22-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/providers/copilot/hook-config-rewriter.mjs | — | — | Last modified: 2026-05-19T17:11:21-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/providers/copilot/skill-validator.mjs | — | — | Last modified: 2026-05-19T17:09:31-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/providers/copilot/symlink-scanner.mjs | — | — | Last modified: 2026-05-19T17:10:16-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/providers/copilot/tool-names.mjs | — | — | Last modified: 2026-05-19T16:37:03-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/reality-check.mjs | — | — | Last modified: 2026-05-17T12:13:13-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/repomap/check-deps.mjs | — | — | Last modified: 2026-03-23T07:11:14-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/repomap/doc-references.mjs | — | — | Last modified: 2026-05-17T16:04:26-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/repomap/graph.mjs | — | — | Last modified: 2026-03-23T07:24:19-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/repomap/languages/typescript.mjs | — | — | Last modified: 2026-05-18T19:27:36-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/repomap/parse.mjs | — | — | Last modified: 2026-03-23T07:22:01-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/repomap/public-api-entries.mjs | — | — | Last modified: 2026-05-17T16:04:26-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/repomap/rank.mjs | — | — | Last modified: 2026-05-17T16:04:26-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/retro/body-scan.mjs | — | — | Last modified: 2026-05-20T19:43:13-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/retro/issue-id-validation.mjs | — | — | Last modified: 2026-05-20T19:43:59-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/retro/safe-frontmatter.mjs | — | — | Last modified: 2026-05-20T19:44:56-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/retro/session-activity.mjs | — | — | Last modified: 2026-05-20T19:47:11-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/retro/session-format.mjs | — | — | Last modified: 2026-05-20T19:45:30-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/retro/session-metrics.mjs | — | — | Last modified: 2026-05-20T19:53:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/session-file-reader.mjs | — | — | Last modified: 2026-04-20T15:24:35+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/session-parser.mjs | — | — | Last modified: 2026-05-07T21:32:46-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/source-manifest.mjs | — | — | Last modified: 2026-05-17T12:13:13-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/spec-drift.mjs | — | — | Last modified: 2026-05-21T12:15:07-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/spec-status.mjs | — | — | Last modified: 2026-05-15T18:45:04-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/specify-amend.mjs | — | — | Last modified: 2026-06-19T10:52:20-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/specify-revise.mjs | — | — | Last modified: 2026-05-20T01:13:06-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/sync/copilot.mjs | — | — | Last modified: 2026-05-19T21:25:23-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/sync/cursor-writer.mjs | — | — | Last modified: 2026-06-02T11:33:22-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/template-resolution.mjs | — | — | Last modified: 2026-05-15T10:34:10-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/assignment.mjs | — | — | Last modified: 2026-04-20T17:35:36+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/detection.mjs | — | — | Last modified: 2026-04-27T15:06:48-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/index.mjs | — | — | Last modified: 2026-04-20T17:35:36+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/manifest.mjs | — | — | Last modified: 2026-04-20T17:35:36+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/profiles.mjs | — | — | Last modified: 2026-05-10T21:41:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/profiles/contract.md | — | — | Last modified: 2026-04-20T17:48:37+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/profiles/fixture.md | — | — | Last modified: 2026-04-20T17:48:37+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/profiles/integration.md | — | — | Last modified: 2026-04-28T15:47:49-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/profiles/policy.md | — | — | Last modified: 2026-04-20T17:48:37+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/profiles/schema.md | — | — | Last modified: 2026-04-20T17:48:37+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/profiles/smoke.md | — | — | Last modified: 2026-04-20T17:48:37+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/profiles/threshold.md | — | — | Last modified: 2026-04-20T17:48:37+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/profiles/unit.md | — | — | Last modified: 2026-04-20T17:35:36+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/profiles/visual.md | — | — | Last modified: 2026-04-20T17:48:37+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/test-strategies/registry.mjs | — | — | Last modified: 2026-04-27T15:06:40-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/token-cursor.mjs | — | — | Last modified: 2026-04-20T15:24:35+01:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/token-pricing.mjs | — | — | Last modified: 2026-05-21T08:45:06-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/visual-references.mjs | — | — | Last modified: 2026-05-08T17:03:37-03:00. Stale but actively referenced elsewhere in the graph. |
| low | lib/workspace.mjs | — | — | Last modified: 2026-04-17T16:37:00+01:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/adapter.mjs | — | — | Last modified: 2026-03-25T12:15:51-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/assess/SKILL.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/assess/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/brainstorm/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/brainstorm/charter-reviewer-prompt.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/build/agents/openai.yaml | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/build/charter-mode.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/build/milestone-mode.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/build/resume-mode.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/build/workspace-mode.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/codehealth/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/codehealth/agents/openai.yaml | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/debug/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/deploy/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/deploy/agents/openai.yaml | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/document/SKILL.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/document/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/eval/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/hygiene/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/implement/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/implement/code-quality-checklist.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/implement/tdd-mandate.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/init/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/issues/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/issues/agents/openai.yaml | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/learn/SKILL.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/learn/agents/openai.yaml | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/plan/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/plan/epic-mode.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/plan/feature-mode.md | — | — | Last modified: 2026-05-08T17:03:36-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/plan/milestone-mode.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/plan/mode-router.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/plan/plan-reviewer-prompt.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/plan/release-mode.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/prototype/agents/openai.yaml | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/reconcile/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/reconcile/agents/openai.yaml | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/recover/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/repomap/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/repomap/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/research/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/research/agents/openai.yaml | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/research/github-researcher-prompt.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/research/internal-researcher-prompt.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/research/synthesis-prompt.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/research/web-researcher-prompt.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/retro/SKILL.md | — | — | Last modified: 2026-06-07T21:08:35-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/retro/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/review-specs/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/review-specs/security-reviewer-prompt.md | — | — | Last modified: 2026-06-07T21:08:35-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/review-specs/structural-architect-prompt.md | — | — | Last modified: 2026-06-07T21:08:35-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/route/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/sample/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/specify/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/status/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/sync/SKILL.md | — | — | Last modified: 2026-06-07T21:08:35-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/sync/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/using-adev/agents/openai.yaml | — | — | Last modified: 2026-03-25T12:15:51-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/validate/agents/openai.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/work/agents/openai.yaml | — | — | Last modified: 2026-04-16T17:01:55+01:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/write-test/agents/openai.yaml | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/write-test/detect-framework.sh | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/write-test/detect-gaming.sh | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/codex/skills/write-test/write-handoff.sh | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/cursor/adapter.mjs | — | — | Last modified: 2026-05-18T18:13:38-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/adapter.mjs | — | — | Last modified: 2026-03-24T18:51:21+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/package.json | — | — | Last modified: 2026-03-23T10:52:30-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/plugin.mjs | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/assess/SKILL.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/brainstorm/charter-reviewer-prompt.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/build/charter-mode.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/build/milestone-mode.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/build/resume-mode.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/build/workspace-mode.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/codehealth/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/deploy/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/document/SKILL.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/implement/code-quality-checklist.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/implement/tdd-mandate.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/issues/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/learn/SKILL.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/plan/epic-mode.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/plan/feature-mode.md | — | — | Last modified: 2026-05-08T17:03:36-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/plan/milestone-mode.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/plan/mode-router.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/plan/plan-reviewer-prompt.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/plan/release-mode.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/reconcile/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/repomap/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/research/SKILL.md | — | — | Last modified: 2026-05-19T11:07:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/research/github-researcher-prompt.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/research/internal-researcher-prompt.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/research/synthesis-prompt.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/research/web-researcher-prompt.md | — | — | Last modified: 2026-05-07T21:32:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/retro/SKILL.md | — | — | Last modified: 2026-06-07T21:08:35-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/review-specs/security-reviewer-prompt.md | — | — | Last modified: 2026-06-07T21:08:35-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/review-specs/structural-architect-prompt.md | — | — | Last modified: 2026-06-07T21:08:35-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/sync/SKILL.md | — | — | Last modified: 2026-06-07T21:08:35-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/write-test/detect-framework.sh | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/write-test/detect-gaming.sh | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | providers/opencode/skills/write-test/write-handoff.sh | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/assess/SKILL.md | — | — | Last modified: 2026-05-30T14:15:28-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/brainstorm/charter-reviewer-prompt.md | — | — | Last modified: 2026-04-08T18:36:21-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/build/charter-mode.md | — | — | Last modified: 2026-05-08T07:31:45-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/build/milestone-mode.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/build/resume-mode.md | — | — | Last modified: 2026-05-12T17:41:25-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/build/workspace-mode.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/codehealth/SKILL.md | — | — | Last modified: 2026-05-30T14:15:28-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/deploy/SKILL.md | — | — | Last modified: 2026-05-30T14:15:28-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/document/SKILL.md | — | — | Last modified: 2026-05-30T14:15:28-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/implement/code-quality-checklist.md | — | — | Last modified: 2026-04-08T18:36:21-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/implement/tdd-mandate.md | — | — | Last modified: 2026-04-08T18:36:21-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/issues/SKILL.md | — | — | Last modified: 2026-05-30T14:15:28-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/learn/SKILL.md | — | — | Last modified: 2026-05-30T14:15:28-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/plan/epic-mode.md | — | — | Last modified: 2026-05-30T15:01:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/plan/feature-mode.md | — | — | Last modified: 2026-05-08T17:03:36-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/plan/milestone-mode.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/plan/mode-router.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/plan/plan-reviewer-prompt.md | — | — | Last modified: 2026-05-11T10:09:06-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/plan/release-mode.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/reconcile/SKILL.md | — | — | Last modified: 2026-05-30T14:15:28-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/repomap/SKILL.md | — | — | Last modified: 2026-05-30T14:15:28-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/research/SKILL.md | — | — | Last modified: 2026-05-30T14:15:28-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/research/github-researcher-prompt.md | — | — | Last modified: 2026-04-09T14:23:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/research/internal-researcher-prompt.md | — | — | Last modified: 2026-04-09T14:23:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/research/synthesis-prompt.md | — | — | Last modified: 2026-04-09T14:23:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/research/web-researcher-prompt.md | — | — | Last modified: 2026-04-09T14:23:08-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/retro/SKILL.md | — | — | Last modified: 2026-05-30T14:15:28-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/review-specs/adapters/generic.md | — | — | Last modified: 2026-04-19T19:42:27+01:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/review-specs/security-reviewer-prompt.md | — | — | Last modified: 2026-05-20T00:55:51-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/review-specs/structural-architect-prompt.md | — | — | Last modified: 2026-05-20T00:55:51-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/sync/SKILL.md | — | — | Last modified: 2026-06-02T12:21:27-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/validate/checks/validate.check-1.5-source-manifest.md | — | — | Last modified: 2026-05-15T22:24:05-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/validate/checks/validate.check-10-platform-drift.md | — | — | Last modified: 2026-05-15T22:24:05-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/validate/checks/validate.check-11-visual-verification.md | — | — | Last modified: 2026-05-15T23:39:18-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/validate/checks/validate.check-2-spec-compliance.md | — | — | Last modified: 2026-05-15T23:46:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/validate/checks/validate.check-3-charter-consistency.md | — | — | Last modified: 2026-05-15T22:24:05-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/validate/checks/validate.check-4-constitution.md | — | — | Last modified: 2026-05-15T23:48:36-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/validate/checks/validate.check-5-adrs.md | — | — | Last modified: 2026-05-15T22:24:05-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/validate/checks/validate.check-6-cross-cutting.md | — | — | Last modified: 2026-05-15T22:24:05-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/validate/checks/validate.check-7-specialist-review.md | — | — | Last modified: 2026-05-15T22:24:05-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/write-test/detect-framework.mjs | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/write-test/detect-framework.sh | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/write-test/detect-gaming.mjs | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/write-test/detect-gaming.sh | — | — | Last modified: 2026-04-28T15:47:49-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/write-test/write-handoff.mjs | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | skills/write-test/write-handoff.sh | — | — | Last modified: 2026-04-06T14:24:24-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/adr-template.md | — | — | Last modified: 2026-03-19T14:20:59-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/blocker-template.md | — | — | Last modified: 2026-03-19T21:38:53-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/boundaries-template.yaml | — | — | Last modified: 2026-03-19T16:54:13-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/charter-template.cross-cutting.md | — | — | Last modified: 2026-05-15T15:20:15-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/charter-template.feature.md | — | — | Last modified: 2026-05-15T14:44:32-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/charter-template.initiative.md | — | — | Last modified: 2026-05-15T15:20:15-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/charter-template.module.md | — | — | Last modified: 2026-05-15T15:20:15-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/constitution-template.md | — | — | Last modified: 2026-05-08T17:03:36-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/context-index-readme.md | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/debug-playbook-template.md | — | — | Last modified: 2026-04-24T19:48:27-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/domains/software/charter-template.md | — | — | Last modified: 2026-05-12T10:38:52-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/domains/software/gate-config.yaml | — | — | Last modified: 2026-05-10T19:12:00-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/domains/software/test-config.yaml | — | — | Last modified: 2026-05-10T19:12:00-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/domains/software/verification.yaml | — | — | Last modified: 2026-05-10T19:12:00-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/eval-config-template.yaml | — | — | Last modified: 2026-04-05T23:57:19+00:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/extensions-catalog.json | — | — | Last modified: 2026-05-20T17:02:07-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/format-documentation.md | — | — | Last modified: 2026-04-06T21:01:55-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/governance/profiles.yaml | — | — | Last modified: 2026-05-08T17:03:36-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/governance/tool-categories.yaml | — | — | Last modified: 2026-05-08T17:03:36-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/governance/validate.example.yaml | — | — | Last modified: 2026-04-19T19:43:35+01:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/persona-override-section.md | — | — | Last modified: 2026-04-21T12:25:18+01:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/personas/architect.md | — | — | Last modified: 2026-05-18T17:36:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/personas/developer.md | — | — | Last modified: 2026-05-18T17:36:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/personas/product.md | — | — | Last modified: 2026-05-18T17:36:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/platform-context.yaml | — | — | Last modified: 2026-05-08T17:03:36-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/research-template.md | — | — | Last modified: 2026-04-09T10:56:35-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/skill-extensions/.gitkeep | — | — | Last modified: 2026-05-25T21:05:22-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/verbosity/deep.md | — | — | Last modified: 2026-05-18T17:36:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/verbosity/normal.md | — | — | Last modified: 2026-05-18T17:36:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/verbosity/terse.md | — | — | Last modified: 2026-05-18T17:36:02-03:00. Stale but actively referenced elsewhere in the graph. |
| low | templates/workspace-template.yaml | — | — | Last modified: 2026-04-15T23:52:10+01:00. Stale but actively referenced elsewhere in the graph. |

</details>

## Duplicate Logic Detection

52 high · 10 medium · 0 low. **Ran** — tree-sitter
was available (`node lib/repomap/check-deps.mjs` exit 0;
`node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm` present). Parsed
208 in-scope `.mjs` files with the same `web-tree-sitter` + `tree-sitter-typescript`
grammar the repomap uses, extracted 1385 function/method bodies with block statements
and >=3 statements, normalized identifiers to positional placeholders (`VAR0`, `VAR1`,
…), and grouped by hash of the normalized token stream (exact duplicates, high) and by
hash of the bare AST-node-type shape (structural similarity, medium). Findings below
point each later occurrence at the earliest (by file path) member of its group.

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| high | lib/blockers-writer.mjs | 42 | mkErr | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/cli/build-state.mjs | 44 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/cli/context.mjs | 54 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/cli/cost.mjs | 43 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/cli/domain.mjs | 71 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/cli/partial.mjs | 367 | realpathOr | Duplicate of cli/index.mjs:1807 (resolveSymlink) |
| high | lib/cli/preflight.mjs | 58 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/cli/prototype.mjs | 60 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/cli/report.mjs | 98 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/cli/source-manifest.mjs | 56 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/cli/state.mjs | 54 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/cli/test-debt.mjs | 33 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/cli/verify.mjs | 56 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/diagnostics/revision-monotonic.mjs | 16 | mkErr | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/domains/domain-config.mjs | 251 | safeRealpath | Duplicate of cli/index.mjs:1807 (resolveSymlink) |
| high | lib/execution-state.mjs | 51 | mkErr | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/extensions/exec-payload.mjs | 107 | refuse | Duplicate of lib/extensions/content-install.mjs:100 (refuse) |
| high | lib/extensions/governance-registry.mjs | 231 | refuse | Duplicate of lib/extensions/content-install.mjs:100 (refuse) |
| high | lib/extensions/governance-splice.mjs | 68 | refuse | Duplicate of lib/extensions/content-install.mjs:100 (refuse) |
| high | lib/extensions/governance-values.mjs | 95 | refuse | Duplicate of lib/extensions/content-install.mjs:100 (refuse) |
| high | lib/extensions/resolve-source.mjs | 266 | makeError | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/gates/gate-sets.mjs | 86 | resolveContained | Duplicate of lib/cli/artifact.mjs:73 (resolveContained) |
| high | lib/gates/gate-sets.mjs | 99 | coded | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/governance/materialize.mjs | 160 | coded | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/governance/materialize.mjs | 769 | atomicWrite | Duplicate of lib/gitignore-installer.mjs:173 (atomicWriteFile) |
| high | lib/governance/registry-marker.mjs | 220 | coded | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/governance/source-vocabulary.mjs | 69 | coded | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/hygiene/registry-drift.mjs | 432 | coded | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/issues/json-adapter.mjs | 1157 | listEpics | Duplicate of lib/issues/file-adapter.mjs:116 (listEpics) |
| high | lib/issues/render-markdown.mjs | 71 | mkErr | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/issues/render-markdown.mjs | 407 | loadManifestForStorage | Duplicate of lib/execution-state.mjs:96 (loadManifestForStorage) |
| high | lib/issues/resolve-root.mjs | 64 | safeRealpath | Duplicate of cli/index.mjs:1807 (resolveSymlink) |
| high | lib/lifecycle-state.mjs | 57 | mkErr | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/manifest.mjs | 30 | mkErr | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/migrate-state-artifacts.mjs | 176 | loadManifestForStorage | Duplicate of lib/execution-state.mjs:96 (loadManifestForStorage) |
| high | lib/milestones.mjs | 57 | validateProjectRoot | Duplicate of lib/issues/json-adapter.mjs:152 (assertProjectRoot) |
| high | lib/milestones.mjs | 84 | loadManifestForStorage | Duplicate of lib/execution-state.mjs:96 (loadManifestForStorage) |
| high | lib/plan-immutability.mjs | 38 | realpathSafe | Duplicate of cli/index.mjs:1807 (resolveSymlink) |
| high | lib/plan-routing-sidecar.mjs | 79 | makeError | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/plan-routing-sidecar.mjs | 353 | unlinkSidecarTmp | Duplicate of lib/cli/partial.mjs:438 (safeUnlink) |
| high | lib/profiles/adapters/opencode.mjs | 43 | add | Duplicate of lib/profiles/adapters/claude-code.mjs:55 (add) |
| high | lib/repomap/doc-references.mjs | 207 | (anonymous) | Duplicate of lib/repomap/doc-references.mjs:195 ((anonymous)) |
| high | lib/repomap/index.mjs | 266 | getCommitHash | Duplicate of lib/repomap/graph.mjs:144 (getCommitHash) |
| high | lib/repomap/public-api-entries.mjs | 166 | (anonymous) | Duplicate of lib/repomap/doc-references.mjs:195 ((anonymous)) |
| high | lib/retro/session-metrics.mjs | 59 | (anonymous) | Duplicate of lib/repomap/index.mjs:678 ((anonymous)) |
| high | lib/retro/session-metrics.mjs | 121 | (anonymous) | Duplicate of lib/repomap/index.mjs:678 ((anonymous)) |
| high | lib/specify-amend.mjs | 51 | mkErr | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/specify-revise.mjs | 51 | mkErr | Duplicate of lib/blocker-id.mjs:31 (mkErr) |
| high | lib/template-resolution.mjs | 147 | safeRealpath | Duplicate of cli/index.mjs:1807 (resolveSymlink) |
| high | lib/template-resolution.mjs | 167 | isPathContained | Duplicate of lib/session-capture.mjs:103 (isContained) |
| high | providers/cursor/adapter.mjs | 16 | readJson | Duplicate of providers/claude-code/adapter.mjs:19 (readJson) |
| high | providers/opencode/adapter.mjs | 19 | readJson | Duplicate of providers/claude-code/adapter.mjs:19 (readJson) |
| medium | lib/cli/issues-migrate.mjs | 56 | atomicWriteJson | Duplicate of lib/build-state.mjs:86 (atomicWriteJson) |
| medium | lib/cli/state.mjs | 60 | run | Duplicate of lib/cli/execution-state.mjs:49 (run) |
| medium | lib/extensions/exec-consent.mjs | 51 | refuse | Duplicate of lib/extensions/content-install.mjs:100 (refuse) |
| medium | lib/extensions/exec-payload.mjs | 107 | refuse | Duplicate of lib/extensions/content-install.mjs:100 (refuse) |
| medium | lib/extensions/governance-registry.mjs | 231 | refuse | Duplicate of lib/extensions/content-install.mjs:100 (refuse) |
| medium | lib/extensions/governance-splice.mjs | 68 | refuse | Duplicate of lib/extensions/content-install.mjs:100 (refuse) |
| medium | lib/extensions/governance-values.mjs | 95 | refuse | Duplicate of lib/extensions/content-install.mjs:100 (refuse) |
| medium | lib/issues/file-adapter.mjs | 33 | deprecatedWrite | Duplicate of lib/governance/boundaries.mjs:405 (invalidPattern) |
| medium | lib/migrate-state-artifacts.mjs | 212 | atomicWriteJson | Duplicate of lib/build-state.mjs:86 (atomicWriteJson) |
| medium | lib/session-capture.mjs | 813 | parseEventArg | Duplicate of hooks/_lifecycle-gate-check.mjs:30 (parseSurfaceArg) |

