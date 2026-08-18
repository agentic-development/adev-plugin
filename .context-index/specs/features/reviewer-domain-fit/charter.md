---
kind: initiative
status: draft
revision: 1
updated: 2026-08-18
tracker-ref: adev-plugin-j7pq.5
---

# Initiative Charter: Reviewer and Domain Fit

## Business Intent

adev ships a single hardcoded review panel scoped to web-application concerns —
authentication, endpoint authorization, SQL injection, rate limiting — and applies it to
every project regardless of what that project is. For adev-plugin itself, a
zero-dependency Node CLI, the mismatch is measurable: all 23 security-shaped issues on
the board match path containment, subprocess interpolation, input trust, privilege
posture, artifact leakage or destructive filesystem operations, and **zero** match any
OWASP scope the panel reviews. Asked to find injection surfaces where none of that kind
exist, a reviewer fabricated one in `loadResumeParser(...)` — a function that has never
existed in this repo.

This initiative makes the review panel fit the artifact class under review, and gives
projects a way to select and adopt the right panel rather than inheriting a fixed one.
It covers both ends of the pipeline — the authoring prompts that shape specs and the
reviewer prompts that judge them — because fixing only one leaves half the mismatch in
place.

It also makes the domain layer **extension-native**: the default `software` domain stops
being a special bundled case and travels the same path as any third-party domain. This
is a dogfooding argument as much as an architectural one. Today the extension path is
exercised by almost nobody, which is why `adev-plugin-xg1f.4` — a first-party extension
whose reviewers have never once loaded — survived undetected.

## Scope

### In Scope

- Falsification gate deciding, on evidence, whether the panel's problem is scope or reachability
- Retargeted default reviewer panel, with the OWASP prompt preserved and relocated
- Reviewer and `/adev:specify` prompt revision, gated by a precision/recall eval
- Domain-owned authoring guidance: a `specify-guidance.md` companion per domain
- Inline prompt bodies in the reviewer schema
- `web-service` domain owning the OWASP and structural prompts, with plugin shims
- Install-time registry validation in `adev extension install`
- Split load-failure semantics: fatal for project-declared reviewers, warn-and-drop for extension-contributed
- Codebase-shape domain detection at `/adev:init`, proposing with evidence
- `adev governance adopt` as hygiene Pass 19's apply path
- Unbundling `software` into a vendored, default-installed extension

### Out of Scope

- Extension marketplace, registry service, `adev extension search` — deferred, tracked as `adev-plugin-zsmh.3`
- `extension remove` — `adev-plugin-zsmh.4`
- Extension-to-extension dependencies — `adev-plugin-zsmh.5`
- Automatic updates or version polling — `adev-plugin-zsmh.6`
- Fixing `data-engineering`'s own reviewer data — `adev-plugin-xg1f.4`
- Requiring a network fetch to initialize a project: the `software` domain is vendored
  and installed offline. "Extension-native" describes the code path, not the transport.
- New runtime dependencies of any kind (Constitution principle 1)
- Changing the write-once semantics of materialized registries

### Dependencies

| Module | Direction | Why |
|---|---|---|
| `review` | modifies | Owns the reviewer panel, prompts and context packs |
| `extensions` | modifies | Install path gains validation; software becomes an extension |
| `domain-extensions` | modifies | Domain packages gain guidance and reviewer prompt files |
| `setup` | modifies | `/adev:init` gains codebase-shape domain detection |
| `design` | modifies | `/adev:specify` sheds hardcoded guidance |
| `maintenance` | modifies | Pass 19 gains a named apply path |

## Current State

**The panel.** Three reviewers ship in `templates/domains/software/reviewers.yaml` —
`structural-architect`, `security-reviewer`, `consistency-analyzer` — all
`dispatch: always`. The security reviewer's six scopes are authentication, endpoint
exposure, PII in responses, injection, file uploads and rate limiting.

**The authoring end matches it.** `skills/specify/SKILL.md:382` prompts verbatim
*"lacks permission → 403, column not found → 404, conflict → 409"*; lines 360-361 give
behavior examples about dragging cards between columns and reindexing `position`.

**Guidance has nowhere domain-specific to live.** `resolveTemplate` is already
domain-aware and the skill treats the template as the single source of truth for
structure — but `templates/domains/software/spec-template.md` carries H2 headings only
and zero examples. Skill extensions can APPEND instructions, never replace them. So the
web-shaped guidance sits in the one place that cannot vary by domain.

**Reviewers already reach source.** `reviewer-capable` and `reviewer-reasoning` extend
`read-only`, granting `filesystem-read` and `search` repo-wide. Observed unprompted in
five review rounds on 2026-08-17/18: reviewers cited `lib/cli/gate.mjs:144`,
`effectiveRevision()`, `parseFrontmatter`'s indent-0 limitation and
`lib/specify-revise.mjs:252` — none of which appear in any context pack. Context packs
nonetheless deliver no source: all eight globs in `templates/review-specs/defaults.yaml`
resolve under `.context-index/` or `<charter-dir>`.

**The domain catalog is one entry deep and partly broken.** One bundled domain
(`software`), three first-party extensions in a static `templates/extensions-catalog.json`.
`/adev:init` offers that same fixed list to every project with no inspection of what the
project is. The only extension declaring reviewers cannot load at all: its `prompt:` is
inline prose, the loader resolves `prompt:` only as a path, and the resulting
`FILE_MISSING` aborts the entire registry — taking the three well-formed bundled
reviewers down with it (`adev-plugin-xg1f.4`).

**Distribution is one-directional.** `review.yaml` is materialized and write-once;
hygiene Pass 19 is *"the only channel through which a plugin or domain upgrade becomes
visible"*, and it reports with no apply path.

**Measured blocker inflation.** Five review rounds on one spec produced 4 → 4 → 3 → 4 → 8
blockers — the final round doubling rather than converging.

## Target State

**The panel fits the artifact class** — if the falsification gate says the problem was
scope. Below the 3-of-5 threshold the evidence track stops and the effort redirects to
context delivery. That outcome is a legitimate result, not a setback.

**Source reaching reviewers is a measurement question, not an assumption.** Reviewers
already read source unprompted; whether *inconsistent* reading measurably degrades
findings is answered by the eval. A `<source-manifest>` token is built only if the data
says determinism is the missing ingredient.

**Domains own their reviewers and their authoring guidance.** A `web-service` domain
ships the OWASP and structural prompts; each domain ships `specify-guidance.md`, loaded
the way `reviewers.yaml` and `gates.yaml` already are. `/adev:specify` keeps method and
sheds examples. Inline prompt bodies let a domain declare a small reviewer without a file
per reviewer.

**The default domain is an extension.** `software` is vendored and installed by default,
resolved through the same path as any third-party domain. One code path, exercised by
every install.

**Broken extensions cannot take down the gate.** A malformed reviewer in the project's
own registry stays fatal — the project declared it, and silently reviewing with less is
the under-enforcement the materialized model exists to prevent. A malformed
extension-contributed reviewer is dropped with a loud warning while well-formed reviewers
dispatch. `adev extension install` validates the merged registry before committing.

**Init proposes from evidence.** Codebase-shape signals produce a recommendation shown
with the files or patterns that produced it, confirmed by the user, never auto-applied.

**Drift has an apply path.** Pass 19 keeps detecting; `adev governance adopt` splices
named entries with a diff and confirmation. Write-once holds because a human initiates.

## Migration Plan

Two tracks. The evidence track is strictly sequential and gate-conditional; the
enablement track is unconditional because its value does not depend on the gate outcome —
projects need to select and adopt a panel whatever that panel contains.

### Evidence track

**Phase 1 — Falsification gate.** Declare `referent-integrity` alone in this repo's
`review.yaml` with a hand-written pack; no plugin change, since `mergeReviewers` honours
governance-over-domain on matching `id`. Run `/adev:review-specs` against the five specs
whose defects are closed and root causes known — `he2`, `r5sc`, `zx5`, `rftq`, `ysqd` —
at their **pre-fix** git revisions, since all five are now repaired.

> **Exit condition, stated before running:** fewer than 3 of 5 flagged as blocker with a
> resolving citation ⇒ the panel thesis is wrong; the failure was reachability, not
> scope; the evidence track stops and is written up as a finding.

**Phase 2 — Panel and prompts** *(only if Phase 1 passes)*. Retarget the default panel.
Move authoring examples out of `/adev:specify` into per-domain `specify-guidance.md`.
Delete the hand-computed `blocker_id` instruction from every prompt — reviewers run
`execute: deny` and cannot compute SHA-256, so every emitted id today is typed hex.

**Phase 3 — Eval** *(gates Phase 2's merge)*. Precision and recall over two labeled sets.
A precision gain costing recall fails. Also answers the `<source-manifest>` question with
data.

### Enablement track

**Phase A — Schema, domain ownership, install validation.** Inline prompt bodies;
`web-service` domain owning the OWASP and structural prompts; plugin copies retained as
deprecated shims so materialized registries referencing `plugin:review-specs/…` keep
loading; split load-failure semantics; install-time registry validation.

**Phase B — Init domain detection.** Codebase-shape signals, proposed with evidence.

**Phase C — `adev governance adopt`.** Pass 19's apply path.

**Phase D — Extension-native software.** Unbundle `software` into a vendored,
default-installed extension resolved through the standard extension path. Sequenced last
in this track: it is the largest refactor, it touches `resolveTemplate`'s fallback, the
domain picker, `adev install` and governance loading, and it benefits from Phases A-C
having already hardened the extension path it will then depend on.

The tracks touch different trees — evidence track in `skills/review-specs/` and
`templates/domains/`, enablement track in `lib/governance/`, `lib/cli/`, `skills/init/` —
so they proceed without collision. Phase A ships the `web-service` domain regardless of
the gate: relocating the OWASP prompt is correct whether or not it stays in the default
panel.

## Acceptance Criteria

### Phase 1 — gate

- [ ] `referent-integrity` is declared in this repo's `review.yaml` with a hand-written pack and dispatches with no plugin change
- [ ] All five specs are reviewed at their pre-fix git revisions; each result records whether the known defect was flagged as blocker **with a citation resolving to a real file or symbol**
- [ ] The 3-of-5 threshold is evaluated and recorded BEFORE any Phase 2 work begins

### Phase 2 — panel and prompts

- [ ] No default-panel prompt instructs the model to compute a hash; `blocker_id` comes from `adev heuristics signature --origin review-specs --blocker-id`
- [ ] `/adev:specify` contains no HTTP status codes and no drag-and-drop examples
- [ ] Each domain ships `specify-guidance.md`; `/adev:specify` loads it and renders an explicit empty state when a domain ships none
- [ ] `structural-architect` and `security-reviewer` leave the default panel via `enabled: false` **with a stated reason**, not entry deletion; their prompt files remain resolvable

### Phase 3 — eval

- [ ] Two labeled sets exist: specs with known defects (must be caught) and specs that shipped clean (must not be blocked)
- [ ] Precision and recall are both reported per prompt revision; a precision gain costing recall is a failing result and does not merge
- [ ] The eval records whether reviewers opened source per run, answering the `<source-manifest>` question with data

### Phase A — schema, domain ownership, install validation

- [ ] A reviewer can declare an inline prompt body without shipping a file; `data-engineering`-shaped inline prose no longer resolves as a filename
- [ ] A `web-service` domain ships the OWASP prompt as its own content; a project installing it gets those reviewers and a project that does not, does not
- [ ] Existing projects whose materialized `review.yaml` references `plugin:review-specs/security-reviewer-prompt.md` continue to load unchanged
- [ ] `adev extension install` loads the merged registry before committing and refuses on `errors`, naming the offending reviewer
- [ ] A malformed reviewer in the project's own registry is fatal; a malformed extension-contributed reviewer is dropped with a warning while well-formed reviewers dispatch — asserted by two separate tests

### Phase B — init detection

- [ ] `/adev:init` proposes a domain with the evidence that produced it and never applies without confirmation
- [ ] A project with no matching signals falls back to asking, with no fabricated recommendation

### Phase C — adopt

- [ ] `adev governance adopt` splices named entries into a materialized registry with a diff and confirmation
- [ ] The write-once marker is preserved; the operation is idempotent
- [ ] Pass 19 names the exact adopt command that resolves each divergence

### Phase D — extension-native software

- [ ] `software` resolves through the standard extension path; no code branch treats it as a bundled special case
- [ ] `adev init` succeeds with no network access
- [ ] A project that installs no domain still resolves templates, with an explicit diagnostic rather than a silent fallback
- [ ] `resolveTemplate`'s `TEMPLATE_NOT_FOUND` names the extension the project is missing

### Global

- [ ] No new runtime dependencies
- [ ] `npm test` passes; `adev diagnose` clean
