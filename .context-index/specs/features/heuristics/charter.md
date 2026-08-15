---
kind: feature
status: evolving
revision: 6
updated: 2026-08-14
---

# Feature Charter: Heuristics

## Business Intent

The heuristics module is a team-shared, lifecycle-driven memory layer that turns adev's existing failure and success signals into transferable lessons. It solves three gaps: recovery records and validation reports are write-only archives with no path back into future tasks; Claude Code's native auto-memory is per-user and conversation-driven so lessons learned by one contributor are invisible to teammates and to CI; and positive patterns are never captured because only failures go through `/adev:recover`. This module closes those gaps with a git-tracked, per-module heuristic store populated by structured lifecycle events and consumed by subagent context packets.

Phase 2 extends the heuristic system from a lifecycle-internal memory layer to a project-wide context layer. The motivating problem: agents repeatedly try wrong approaches (wrong DB paths, incorrect auth middleware, misplaced config) because learned lessons are only visible during plan/implement. By surfacing a compact heuristic index in agent files (CLAUDE.md, AGENTS.md) and widening injection to all lifecycle phases with tiered progressive disclosure, heuristics become available in every interaction — including freeform coding — at minimal token cost.

Phase 3 closes the learning loop. Phases 1 and 2 built a store that captures *successes* and consults them at *skill entry*: automatic capture fires only when a spec passes on its first attempt, and every retrieval call site queries once, keyed on module slug. The result is a memory layer that records that nothing went wrong, and is never queried at the moment something does. Phase 3 makes failure a first-class capture trigger, promotes the content-addressed recurrence key already proven inside `/adev:recover` into a shared primitive, and consults the store at lifecycle failure points rather than only at entry.

## Scope and Boundaries

### In Scope

#### Phase 1 (validated)

- Per-module heuristic files at `.context-index/memory/heuristics/<module>.md` plus `_global.md` for cross-cutting patterns
- `archive/` subfolder for demoted or pruned heuristics
- `lib/heuristics.mjs` — thin ESM helper exposing `readHeuristics`, `writeHeuristic`, `promoteHeuristic`, `demoteHeuristic`, `archiveHeuristic`, `addContradiction`
- YAML frontmatter schema for each heuristic entry: `id`, `scope`, `confidence`, `created`, `updated`, `evidence[]`, `contradicted-by[]`
- Three-state confidence lifecycle (`low` / `medium` / `high`) with recurrence-based promotion and contradiction-based demotion
- Extraction steps added to `/adev:recover` (Step 7, placed after the existing Step 6 Enrich), `/adev:validate` (Check 12), and `/adev:debug` (Phase 7 extension)
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

- `signature` field added to the heuristic schema — a content-addressed recurrence key of the form `<origin-slug>-<sha256-prefix>` computed over normalized failure text. Generalizes the ID Derivation Rule currently embedded in `/adev:recover` skill prose
- `adev heuristics signature` CLI verb — the single implementation of the derivation rule, consumed by every extractor. `/adev:recover` switches to calling it rather than restating the rule in markdown
- Failure capture widened past `/adev:recover`: `/adev:validate` extracts on FAIL as well as on first-run PASS; `/adev:review-specs` extracts on BLOCK
- Outcome-derived heuristic title prefix, replacing the hardcoded `"First-run PASS: "` prefix; removal of the `--check-first-run` rule that skips capture whenever a validate report already exists
- `signature` match axis in `retrieveHeuristics`, ranked above keyword matching
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
- Batch-level systemic-failure circuit breaker — the rule that halts a batch when the same finding ID fails N specs. Chartered as a cross-cutting concern alongside `review-block-auto-retry.spec.md`, which already owns `lib/loop-convergence.mjs` and its single-loop `NO_PROGRESS` detector. This module publishes the `signature` key that breaker consumes; it does not own loop control
- Tool-level error signals via `PostToolUse` on failing Bash or Edit results. Phase 3 fires on adev lifecycle failure events only — raw stderr yields unstable signatures, and injecting on every failing command would pay a per-command context cost against a store that cannot key it reliably
- Signatures keyed on validator check IDs. `check-id-enum.spec.md` measures 46 distinct `validator` spellings in the live corpus and is itself blocked on ADR-0010; content-addressed hashing of failure text sidesteps that dependency

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| Implementation | internal module | `/adev:recover`, `/adev:debug`, `/adev:implement` gain extraction and/or injection steps |
| Validation | internal module | `/adev:validate` gains Check 12 success extraction and heuristic injection |
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

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Heuristic Store Structure | Per-module files, `_global.md`, `archive/` subfolder, YAML frontmatter schema | must-have | 1 | validated |
| `lib/heuristics.mjs` Helper | Thin ESM helper exposing read/write/promote/demote/archive/addContradiction | must-have | 1 | validated |
| Recover Extraction | `/adev:recover` Step 7 distills a root-cause diagnosis into a heuristic entry (runs after Step 6 Enrich) | must-have | 1 | validated |
| Validate Extraction | `/adev:validate` Check 12 extracts a positive pattern on first-run PASS | must-have | 1 | validated |
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
| Failure Signature Primitive | `adev heuristics signature` verb — single implementation of the content-addressed derivation rule, consumed by every extractor | must-have | 3 | — |
| Signature Schema Field | `signature` field on the heuristic schema, with `_format.md` revision and a read path for entries that predate it | must-have | 3 | — |
| Recover Migration | `/adev:recover` Step 7 calls the shared primitive instead of restating the ID Derivation Rule in skill prose | must-have | 3 | — |
| Validate Failure Capture | `/adev:validate` extracts on FAIL as well as first-run PASS; outcome-derived title prefix replaces the hardcoded `"First-run PASS: "` | must-have | 3 | — |
| Signature-Keyed Retrieval | `signature` match axis on `retrieveHeuristics`, ranked above keyword matching | must-have | 3 | — |
| Error-Triggered Retrieval | Lifecycle failure points re-query the store by signature instead of relying on the entry-time module query | must-have | 3 | — |
| Review-Specs Failure Capture | `/adev:review-specs` extracts a heuristic on BLOCK verdicts | should-have | 3 | — |

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
| `.context-index/specs/**/*-validation.md` | Validation | Source material for success heuristics extracted by `/adev:validate` |
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
| Signature Stability | Failure-signature derivation is content-addressed and deterministic: the same failure yields the same key regardless of when, where, or by which lifecycle surface it was observed. Recurrence counting and the downstream batch breaker are only sound if this holds, so it is a contract rather than an implementation detail. |
| Transparency | Every heuristic links back to its source evidence (recovery record, validation report, debug resolution, retro consolidation, or manual capture). Humans can always trace why a heuristic exists. |
| Safety | Heuristics are inert markdown — they cannot execute. No self-modifying code path. Only `/adev:retro` demotes or archives entries; there is no runtime auto-editing during implementation. |
| Token Efficiency | The always-on CLAUDE.md index costs at most ~5 tokens per high-confidence heuristic. For a mature project with 10 high-confidence entries, the total always-on cost is ~50 tokens. Tiered retrieval ensures skills only pay for the detail level they need. |
| Staleness Window | The heuristic index in sync targets may lag behind the store until the next `/adev:sync` run. `/adev:hygiene` Pass 16 detects this and offers auto-fix via sync. Maximum acceptable staleness is one development session. |
