---
kind: feature
status: approved
revision: 6
updated: 2026-08-15
---

# Feature Charter: Heuristics

## Business Intent

The heuristics module is a team-shared, lifecycle-driven memory layer that turns adev's existing failure and success signals into transferable lessons. It solves three gaps: recovery records and validation reports are write-only archives with no path back into future tasks; Claude Code's native auto-memory is per-user and conversation-driven so lessons learned by one contributor are invisible to teammates and to CI; and positive patterns are never captured because only failures go through `/adev:recover`. This module closes those gaps with a git-tracked, per-module heuristic store populated by structured lifecycle events and consumed by subagent context packets.

Phase 2 extends the heuristic system from a lifecycle-internal memory layer to a project-wide context layer. The motivating problem: agents repeatedly try wrong approaches (wrong DB paths, incorrect auth middleware, misplaced config) because learned lessons are only visible during plan/implement. By surfacing a compact heuristic index in agent files (CLAUDE.md, AGENTS.md) and widening injection to all lifecycle phases with tiered progressive disclosure, heuristics become available in every interaction — including freeform coding — at minimal token cost.

Phase 3 closes the learning loop. Phases 1 and 2 built a store that captures *successes* and consults them at *skill entry*. Automatic capture runs in a Stop-event hook gated on a PASS verdict, so it is structurally blind to failure; every retrieval call site queries once, keyed on module slug, and never re-queries when something breaks. The result is a memory layer that records that nothing went wrong, and is never consulted at the moment something does.

Phase 3 makes failure a first-class capture trigger and consults the store at lifecycle failure points rather than only at entry. It also resolves a fragmentation that Phases 1 and 2 left behind: the same "stable identity for a recurring thing" was reinvented three times with incompatible inputs — a path-dependent hash in the validate extractor, a content-only hash described in `/adev:recover` prose, and a reviewer-finding hash in `lib/blocker-id.mjs`. Recurrence counting is only sound with one key, so Phase 3 defines that key once and has the extractors consume it.

## Scope and Boundaries

### In Scope

#### Phase 1 (validated)

- Per-module heuristic files at `.context-index/memory/heuristics/<module>.md` plus `_global.md` for cross-cutting patterns
- `archive/` subfolder for demoted or pruned heuristics
- `lib/heuristics.mjs` — thin ESM helper exposing `readHeuristics`, `writeHeuristic`, `promoteHeuristic`, `demoteHeuristic`, `archiveHeuristic`, `addContradiction`
- YAML frontmatter schema for each heuristic entry: `id`, `scope`, `confidence`, `created`, `updated`, `evidence[]`, `contradicted-by[]`
- Three-state confidence lifecycle (`low` / `medium` / `high`) with recurrence-based promotion and contradiction-based demotion
- Extraction steps added to `/adev:recover` (Step 7, placed after the existing Step 6 Enrich), the validate PASS path (shipped as Check 12; since relocated to a Stop hook), and `/adev:debug` (Phase 7 extension)
- Injection of relevant heuristics into `/adev:implement` and `/adev:plan` context packets
- Consolidation step in `/adev:retro` — merge duplicates, promote recurring patterns, demote contradicted entries, archive stale ones
- Public schema documentation at `.context-index/memory/heuristics/_format.md`
- Test coverage via the Node.js built-in test runner and `createTempDir()` helper

#### Phase 2 (progressive disclosure)

- `tags` field added to heuristic schema — free-form string array, derived by extractors from task context (file paths, spec names, error categories)
- Tiered rendering in `retrieveHeuristics` via `tier` parameter: `index` (title + scope, ~5 tok), `summary` (pattern + anti-pattern, ~40 tok, default), `full` (all fields, ~100 tok)
- Keyword matching in `retrieveHeuristics` — optional `keywords` parameter matched against heuristic `tags`, `title`, and `pattern` fields for relevance ranking
- `/adev:sync` appends a `## Learned Lessons` section to all sync targets (CLAUDE.md, AGENTS.md, .cursorrules, copilot-instructions) containing high-confidence heuristic index (one line per entry)
- `/adev:hygiene` Pass 16: Heuristic Index Health — checks for index staleness (high-confidence entries missing from synced files) and orphan tags (tags appearing only once across the store)
- Injection widened to `/adev:debug`, `/adev:brainstorm`, `/adev:specify`, `/adev:review-specs`, and `/adev:validate` at `summary` tier with keyword matching

#### Phase 3 (close the loop)

- `signature` field added to the heuristic schema — a content-addressed recurrence key of the form `<origin-slug>-<sha256-prefix>` computed over normalized failure text. It is an **additional** field alongside `id`, carrying the cross-scope recurrence identity that `id` (unique within one scope file) cannot express
- `adev heuristics signature` CLI verb — the single implementation of the derivation rule, consumed by every extractor. `/adev:recover` switches to calling it rather than restating the rule in markdown
- **`id` derivation is corrected to be path-independent, and existing entries are rekeyed once.** Today the validate-side extractor hashes the absolute spec path — live at `hooks/post-validate-extract-heuristics.mjs:123-127`, with a dead twin at `lib/cli/heuristics.mjs:103-108` and further copies in `tests/skills/validate-success-heuristic-harness.mjs:145` and `tests/skills/recover-extract-heuristic-harness.mjs:119`. The same spec and pattern therefore produce different ids in different worktrees, so `writeHeuristic`'s append-or-update-by-id writes a duplicate instead of a second evidence entry, and `autoPromote` never observes the second distinct path. This is a plausible cause of the store's measured inertness (no promotion has ever been observed). Because the id changes, a one-time migration rekeys existing entries rather than leaving old and new ids to split evidence for the same pattern — the store is small and largely template-content, so the migration is cheap and is preferable to carrying the split forward
- For heuristics originating from a `/adev:review-specs` BLOCK, the signature derives from the existing `blocker_id` (`lib/blocker-id.mjs`) rather than re-hashing the finding text. `blocker_id` is defined by the cross-cutting `review-block-auto-retry.spec.md` (Behavior 3) — the same spec that owns `lib/loop-convergence.mjs`. This module consumes it and does not own it, so one reviewer finding has exactly one identity across both the single-spec retry loop and the heuristic store
- Failure capture widened past `/adev:recover`: the validate-side Stop hook (`hooks/post-validate-extract-heuristics.mjs`) extracts on FAIL as well as PASS; `/adev:review-specs` extracts on BLOCK. Widening the hook's trigger condition is a behavioral change *within* the existing stdin/stdout hook protocol — it does not alter the protocol itself
- Outcome-derived heuristic title prefix, replacing the hardcoded `"First-run PASS: "` prefix, which is duplicated in `lib/cli/heuristics.mjs` and `hooks/post-validate-extract-heuristics.mjs`
- Retirement of the unreachable capture path: `adev heuristics extract` and its `--check-first-run` flag are invoked by no skill and no hook, and the orphaned check file `skills/validate/checks/validate.check-12-heuristic-extraction.md` describes a check ID that is in `REMOVED_CHECK_IDS`. Both carry stale copies of the derivation rules and are removed so the "single implementation" contract holds. The same change updates the two references that would otherwise dangle: the verb signature documented at `docs/cli-reference.md:525`, and the comment in `lib/diagnostics/tier2/validated-without-report.mjs` citing the CLI as a consumer of the report-existence predicate
- `signature` match axis in `retrieveHeuristics`, ranked above keyword matching. An exact signature match **bypasses the `low`-confidence exclusion** in the budget cap; without this the axis returns nothing on a first recurrence, because failure heuristics are written at `low` and only reach `medium` at two distinct evidence paths
- Error-triggered retrieval at lifecycle failure points, keyed by signature rather than by module slug alone
- `signature` published as an exposed contract for the cross-cutting batch systemic-failure breaker

### Out of Scope

- Vector embeddings or semantic search (filesystem retrieval only — research confirmed file-based approaches are competitive)
- Conversation-driven capture (Claude Code native auto-memory owns that surface and is deliberately not replaced)
- `session-start.sh` hook injection (risks polluting unrelated tasks; can be added in a future revision if demand emerges)
- CLI subcommands for manual heuristic curation (the `/adev:learn` skill covers the manual entry path)
- Cross-project heuristic sharing (scope is a single repository)
- Backfilling existing recovery records into heuristics (extraction begins at rollout)
- Automatic self-modification of code or specs based on heuristics (retro is the only consolidation surface)
- Token-budget caps replacing count-based `injection_limit` (deferred to a future revision if heuristic size variance becomes a real problem)
- Semantic/embedding-based retrieval (keyword matching is sufficient for expected store size of tens to low hundreds of entries)
- Batch-level systemic-failure circuit breaker — the rule that halts a batch when the same failure recurs across N specs. Chartered as a cross-cutting concern alongside `review-block-auto-retry.spec.md`, which already owns `lib/loop-convergence.mjs` and its single-loop `NO_PROGRESS` detector. This module publishes the `signature` key that breaker consumes; it does not own loop control
- Error signals derived from raw tool results (a failing Bash exit code, an Edit rejection). Phase 3 keys on adev's own structured lifecycle verdicts, which already carry an outcome and a spec reference. This is a distinction of *signal source*, not of mechanism — hooks remain the delivery vehicle, since the live capture path is already a Stop-event hook. Unstructured stderr does not yield a stable signature, and injecting on every failing command would pay a per-command context cost against a key that cannot be computed reliably
- Signatures keyed on validator check IDs. `check-id-enum.spec.md` measures 46 distinct `validator` spellings in the live corpus and is itself blocked on ADR-0010; content-addressed hashing of failure text sidesteps that dependency

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| Implementation | internal module | `/adev:recover`, `/adev:debug`, `/adev:implement` gain extraction and/or injection steps |
| Validation | internal module | The validate PASS path gains success extraction (now the Stop hook, formerly Check 12) and heuristic injection |
| Maintenance | internal module | `/adev:retro` gains the consolidation step; `/adev:hygiene` gains Pass 16 |
| Planning | internal module | `/adev:plan` gains injection into per-task context packets |
| Design | internal module | `/adev:brainstorm` and `/adev:specify` gain injection for module-scoped heuristics |
| Assessment | internal module | `/adev:review-specs` gains injection for module-scoped heuristics |
| Setup | internal module | Reads `manifest.yaml` `modules[].slug` for per-file scoping; `/adev:sync` gains `## Learned Lessons` section |
| Implementation | internal module | `/adev:recover` migrates its prose ID Derivation Rule to the shared `adev heuristics signature` verb (Phase 3) |
| Validation | internal module | `/adev:validate` gains failure capture on FAIL and signature-keyed retrieval on failure (Phase 3) |
| Assessment | internal module | `/adev:review-specs` gains failure capture on BLOCK (Phase 3) |
| Cross-cutting | external consumer | The batch systemic-failure breaker consumes the `signature` contract published here; loop control itself is out of scope (Phase 3) |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Heuristic | A single distilled lesson about how to work effectively in a specific scope | `id` (slug, unique within scope), `scope` (module slug or `_global`), `title`, `pattern` (what to do), `anti-pattern` (what to avoid), `confidence` (`low` / `medium` / `high`), `tags` (optional string array for keyword matching), `signature` (optional content-addressed failure key), `evidence[]`, `contradicted-by[]`, `created`, `updated` |
| FailureSignature | A stable, matchable identity for a recurring failure, derived from the failure's own content | `origin` (the lifecycle surface that observed it — `recover`, `validate`, `review-specs`, `implement`), `digest` (SHA-256 prefix over the normalized failure text), rendered as `<origin-slug>-<digest>` |
| HeuristicStore | The collection of heuristic files and archive under `.context-index/memory/heuristics/` | `moduleFiles` (one per module slug), `globalFile` (`_global.md`), `archiveDir` (`archive/`) |
| EvidenceRef | A pointer to the source event that produced or reinforced a heuristic | `source` (one of `recovery`, `validation`, `debug`, `retro`, `manual`), `path` (file reference), `date` |

### Relationships

- A Heuristic belongs to exactly one scope — either a module slug from `manifest.yaml` or the reserved `_global` scope
- A Heuristic has one or more EvidenceRefs; recurrence count equals evidence count
- A HeuristicStore owns exactly one file per module plus `_global.md` plus `archive/`
- Archived Heuristics live at `archive/<scope>-<id>.md` with added `archived` and `archived-reason` fields

### Invariants

- `confidence` is exactly one of `low`, `medium`, or `high`
- A Heuristic with two or more `contradicted-by` entries cannot remain at `high` confidence
- Promotion path: auto-promotion thresholds are absolute and based on evidence count across distinct source paths — `low → medium` at two distinct-path evidence entries; `medium → high` at three distinct-path evidence entries; auto-promotion never decreases confidence
- Demotion path: one contradiction drops confidence one level; two contradictions archive the entry regardless of prior confidence
- `id` is unique within its scope file
- Archived entries are read-only; retro may re-promote by copying back into the active file but never edits archived entries in place
- Every heuristic links back to at least one EvidenceRef (no orphan entries)
- `tags` entries must be lowercase, alphanumeric with hyphens only (same safe-slug character set, no length minimum — single-word tags like `db` are valid)
- `signature` is optional. It is absent on entries created before Phase 3, and on success-derived entries that have no failure origin
- `signature` is stable: identical normalized failure text yields an identical signature across runs, machines, and modules. Derivation depends only on failure content — never on timestamp, file path, run id, or observer identity
- `signature` is not unique within a scope and does not participate in `id` uniqueness. Two heuristics may carry the same signature, and one signature may recur across scopes — that recurrence is the signal the breaker consumes
- A `signature` is never rewritten once assigned. Consolidation in `/adev:retro` may merge entries that share a signature, but it does not recompute signatures on existing entries
- `id` derivation is location-independent: extracting a heuristic from the same spec and pattern in two different worktrees, checkouts, or machines yields an identical `id`. This is the property that makes append-or-update-by-id accumulate evidence rather than fork it, and it is directly testable
- `id` and `signature` are independent keys serving different questions. `id` answers "is this the same entry within this scope file"; `signature` answers "is this the same underlying failure, anywhere in the store". Entries rekeyed by the Phase 3 migration keep their evidence, confidence, and contradiction history — only the key changes
- A heuristic whose origin is a `/adev:review-specs` BLOCK carries a `signature` derived from that finding's `blocker_id`. One reviewer finding therefore resolves to exactly one identity across both the single-spec retry loop and the heuristic store

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Heuristic Store Structure | Per-module files, `_global.md`, `archive/` subfolder, YAML frontmatter schema | must-have | 1 | validated |
| `lib/heuristics.mjs` Helper | Thin ESM helper exposing read/write/promote/demote/archive/addContradiction | must-have | 1 | validated |
| Recover Extraction | `/adev:recover` Step 7 distills a root-cause diagnosis into a heuristic entry (runs after Step 6 Enrich) | must-have | 1 | validated |
| Validate Extraction | Positive-pattern extraction on a PASS verdict. Shipped as `/adev:validate` Check 12; that check ID is now in `REMOVED_CHECK_IDS` and the live surface is the non-blocking Stop hook `hooks/post-validate-extract-heuristics.mjs`, which fires on every PASS | must-have | 1 | validated |
| Implement Injection | `/adev:implement` Step 1 loads module heuristics into subagent context packets | must-have | 1 | validated |
| Plan Injection | `/adev:plan` includes relevant heuristics in per-task context packets | must-have | 1 | validated |
| Retro Consolidation | `/adev:retro` merges duplicates, promotes recurring patterns, demotes contradicted entries, archives stale ones | must-have | 1 | validated |
| Retrieval Filtering | Confidence threshold + module match + context-budget cap | must-have | 1 | validated |
| Contradiction Tracking | `contradicted-by` field population and auto-demotion logic per invariants | must-have | 1 | validated |
| Format Documentation | Public schema doc at `.context-index/memory/heuristics/_format.md` | must-have | 1 | validated |
| Keyword Tags | `tags` field on heuristic schema; free-form string array; extractors derive from task context | must-have | 2 | validated |
| Tiered Retrieval | `tier` parameter on `retrieveHeuristics`: `index`, `summary` (default), `full`; keyword matching via optional `keywords` parameter | must-have | 2 | validated |
| Sync Index | `/adev:sync` appends `## Learned Lessons` section to all sync targets with high-confidence heuristic index (one line per entry) | must-have | 2 | implemented |
| Hygiene Pass 16 | `/adev:hygiene` checks for index staleness (high-confidence entries missing from synced files) and orphan tags | must-have | 2 | planned |
| Debug Injection | `/adev:debug` loads heuristics at `summary` tier with keyword matching before investigating | must-have | 2 | planned |
| Brainstorm Injection | `/adev:brainstorm` surfaces module heuristics during charter drafting | must-have | 2 | planned |
| Specify Injection | `/adev:specify` surfaces heuristics when writing acceptance criteria | must-have | 2 | planned |
| Review-Specs Injection | `/adev:review-specs` reviewers receive relevant heuristics for the module under review | must-have | 2 | planned |
| Validate Injection | `/adev:validate` loads heuristics at `summary` tier during validation checks | must-have | 2 | planned |
| `/adev:learn` Skill | Explicit user-driven heuristic capture for lessons the lifecycle missed | must-have | 2 | implemented |
| Failure Signature Primitive | `adev heuristics signature` verb — single implementation of the content-addressed derivation rule, consumed by every extractor including the two test harnesses that currently hold their own copies | must-have | 3 | validated |
| Location-Independent `id` | Remove the absolute-path input from id derivation in the live hook and its dead twin; one-time migration rekeys existing entries, preserving evidence and confidence | must-have | 3 | validated |
| Signature Schema Field | `signature` field on the heuristic schema, added to `FIELD_ORDER` so serialization does not drop it; `_format.md` revision; read path for entries that predate the field | must-have | 3 | validated |
| Recover Migration | `/adev:recover` Step 7 calls the shared primitive instead of restating the ID Derivation Rule in skill prose; `id` derivation is unchanged | must-have | 3 | validated |
| Validate Failure Capture | The validate Stop hook extracts on FAIL as well as PASS; outcome-derived title prefix replaces the hardcoded `"First-run PASS: "` in both copies | must-have | 3 | validated |
| Dead Capture-Path Retirement | Remove the unreachable `adev heuristics extract` verb, its `--check-first-run` flag, and the orphaned `validate.check-12-heuristic-extraction.md` check file | must-have | 3 | validated |
| Signature-Keyed Retrieval | `signature` match axis on `retrieveHeuristics`, ranked above keyword matching, bypassing the `low`-confidence exclusion on exact match | must-have | 3 | validated |
| Error-Triggered Retrieval | Lifecycle failure points re-query the store by signature instead of relying on the entry-time module query | must-have | 3 | validated |
| Review-Specs Failure Capture | `/adev:review-specs` extracts a heuristic on BLOCK verdicts, with the signature derived from the finding's `blocker_id` | should-have | 3 | — |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Batch systemic-failure breaker | Loop control belongs with `lib/loop-convergence.mjs`, not in a memory-layer charter. This module publishes the key it consumes | cross-cutting charter, post-3 | Signature Schema Field (milestone 3) |
| Tool-level error signals | Raw stderr does not yield a stable signature; deferred until the lifecycle-event path has proven the key in practice | future revision | Error-Triggered Retrieval (milestone 3) |
| Token-budget caps replacing count-based `injection_limit` | Deferred unless heuristic size variance becomes a measured problem | future revision | — |
| `session-start.sh` hook injection | Risks polluting unrelated tasks; revisit only if demand emerges | future revision | — |
| Backfill of pre-Phase-3 entries with signatures | Signatures are content-addressed from failure text that historical entries do not retain; backfill would fabricate keys | not planned | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `.context-index/memory/heuristics/<module>.md` | file (public contract) | Markdown with YAML frontmatter per entry; human-readable; git-tracked |
| `.context-index/memory/heuristics/_global.md` | file (public contract) | Cross-cutting heuristics not bound to a single module |
| `.context-index/memory/heuristics/archive/*.md` | file (public contract) | Read-only archive of demoted or pruned heuristics |
| `.context-index/memory/heuristics/_format.md` | file (documentation) | Public schema and lifecycle specification |
| `readHeuristics(projectRoot, { module, minConfidence, limit })` | function | Returns array of heuristic objects sorted by confidence then recency |
| `retrieveHeuristics(projectRoot, module, { tier, keywords, signature, injectionLimit })` | function | Dual-read (module + global), dedup, sort, budget-cap. `tier`: `index`/`summary`/`full` (default `summary`). `keywords`: string array for relevance matching against tags/title/pattern. `signature`: exact-match failure key, ranked above keyword matches |
| `adev heuristics signature --origin <slug> --text <text>` | CLI verb (public contract) | Prints the derived failure signature on stdout. The single implementation of the derivation rule; extractors call it rather than reimplementing normalization |
| `signature` frontmatter field in `<module>.md` | file (public contract) | Content-addressed failure key. Consumed by the cross-cutting batch systemic-failure breaker to count recurrence across specs |
| `writeHeuristic(projectRoot, heuristic)` | function | Appends a new heuristic or updates an existing one by id |
| `promoteHeuristic(projectRoot, id)` | function | Raises confidence one level |
| `demoteHeuristic(projectRoot, id)` | function | Lowers confidence one level |
| `archiveHeuristic(projectRoot, id, reason)` | function | Moves entry to `archive/<scope>-<id>.md` |
| `addContradiction(projectRoot, id, evidenceRef)` | function | Appends to `contradicted-by[]`, auto-demotes per invariants |
| `/adev:learn` skill | markdown skill | Explicit user-driven capture path |
| `## Learned Lessons` section in sync targets | file section | High-confidence heuristic index appended by `/adev:sync` to CLAUDE.md, AGENTS.md, and other sync targets |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `.context-index/hygiene/recoveries/*.md` | Implementation | Source material for failure heuristics extracted by `/adev:recover` |
| `.context-index/specs/**/*.validate.md` | Validation | Source material for success heuristics extracted from validate verdicts |
| `buildBlockerId({ reviewer, type, sectionAnchor, findingText })` | Assessment (cross-cutting) | Canonical reviewer-finding identity from `lib/blocker-id.mjs`, defined by `review-block-auto-retry.spec.md` Behavior 3. Phase 3 derives the `signature` of BLOCK-origin heuristics from it rather than re-hashing finding text |
| `manifest.yaml` `modules[].slug` | Setup | Canonical module list for per-file scoping and retrieval filtering |
| `manifest.yaml` `heuristics.injection_limit` | Setup | Per-task context-budget cap (default 8) |
| `manifest.yaml` `sync.targets` | Setup | Sync targets list for writing the heuristic index |
| `.context-index/constitution.md` | Setup | Quality gates consulted when extracting success patterns |
| `.context-index/lifecycle-state/*.jsonl` | Validation | Lifecycle failure events (validate FAIL, review BLOCK, implement task failure) that trigger Phase 3 capture and retrieval |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Simplicity | Zero new external dependencies. Pure Node.js built-ins (`fs`, `path`). Markdown plus YAML frontmatter. No database, no vector store. |
| Interoperability | Heuristic files are self-describing. Any harness or tool can read or write them without plugin internals. Schema documented in `_format.md`. |
| Performance | Retrieval for a single task is one or two file reads (target module plus `_global`), not a scan. Target: under 50 ms total including parse. |
| Testability | `lib/heuristics.mjs` is testable via the Node.js built-in test runner and the `createTempDir()` helper. Extraction steps are testable via skill markdown evals. |
| Degradation | A missing or malformed heuristic file never blocks an agent. Skills log a warning via `additionalContext` and proceed without heuristics. |
| Context Budget | Injection is capped: max five `high`-confidence plus three `medium`-confidence heuristics per task context packet. Configurable via `heuristics.injection_limit` in `manifest.yaml` (default 8). Error-triggered retrieval (Phase 3) is a *second* injection within the same task and is capped independently and more tightly: signature-matched entries only, `summary` tier, default 3. Rationale is measured — cache reads are roughly 71% of session cost, so a second per-task injection compounds across every subsequent turn rather than being paid once. |
| Signature Stability | Both keys are content-addressed and deterministic: the same failure yields the same `signature`, and the same spec-plus-pattern yields the same `id`, regardless of when, where, or by which lifecycle surface it was observed. Derivation depends only on normalized content — never on timestamp, absolute path, run id, or machine. Recurrence counting and the downstream batch breaker are only sound if this holds, which is why the current absolute-path input is corrected rather than preserved, in the live hook and every copy of the rule including test harnesses. |
| Retrieval Reachability | An exact signature match is exempt from the `low`-confidence exclusion that the budget cap otherwise applies. Failure heuristics enter the store at `low` and reach `medium` only at two distinct evidence paths, so without this exemption error-triggered retrieval would return nothing on a first recurrence — inert precisely when the loop is supposed to close. Confidence still governs ranking and every non-signature retrieval path. |
| Transparency | Every heuristic links back to its source evidence (recovery record, validation report, debug resolution, retro consolidation, or manual capture). Humans can always trace why a heuristic exists. |
| Safety | Heuristics are inert markdown — they cannot execute. No self-modifying code path. Only `/adev:retro` demotes or archives entries; there is no runtime auto-editing during implementation. |
| Token Efficiency | The always-on CLAUDE.md index costs at most ~5 tokens per high-confidence heuristic. For a mature project with 10 high-confidence entries, the total always-on cost is ~50 tokens. Tiered retrieval ensures skills only pay for the detail level they need. |
| Staleness Window | The heuristic index in sync targets may lag behind the store until the next `/adev:sync` run. `/adev:hygiene` Pass 16 detects this and offers auto-fix via sync. Maximum acceptable staleness is one development session. |
