---
kind: initiative
status: approved
revision: 2
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

The `software` domain stays bundled exactly as it is today. An earlier draft proposed making it
an extension for dogfooding reasons — the extension path is exercised by almost nobody, which is
how `adev-plugin-xg1f.4` (a first-party extension whose reviewers have never once loaded) survived
undetected. Charter review established that moving it is a separate architectural effort, tracked as
`adev-plugin-xg1f.5`. This initiative gets the same dogfooding benefit more cheaply by shipping `web-service`
as a real vendored extension and validating registries at install time.

## Scope

### In Scope

- Falsification gate deciding, on evidence, whether the panel's problem is scope or reachability
- Retargeted default reviewer panel, with the OWASP prompt preserved and relocated
- Reviewer and `/adev:specify` prompt revision, gated by a precision/recall eval
- Domain-owned authoring guidance: a `specify-guidance.md` companion per domain
- Inline prompt bodies in the reviewer schema
- `web-service` domain owning the OWASP and structural prompts, with plugin shims
- Install-time registry validation in `adev extension install`
- Template resolution reaching CLI-installed extensions, so a domain package supplies its
  templates as well as its governance config (`adev-plugin-xg1f.6`)
- Split load-failure semantics: fatal for project-declared reviewers, warn-and-drop for extension-contributed
- Codebase-shape domain detection at `/adev:init`, proposing with evidence
- `adev governance adopt` as hygiene Pass 19's apply path

### Out of Scope

- Extension marketplace, registry service, `adev extension search` — deferred, tracked as `adev-plugin-zsmh.3`
- `extension remove` — `adev-plugin-zsmh.4`
- Extension-to-extension dependencies — `adev-plugin-zsmh.5`. Nothing here creates one: `software`
  stays bundled, so the only domain any shipped extension extends remains present
- **Unbundling `software` into an extension.** Charter review found six architectural blockers, of
  which this initiative removes one (the root split, via Phase A); five remain: `extends` verifies the bundled DIRECTORY at
  `lib/domains/domain-config.mjs:222`, not set membership, so `extends: software` breaks whatever
  `BUNDLED_DOMAIN_NAMES` says; `content-install.mjs:53` is the only name-squatting guard and
  relaxing it leaves none; `installDomainProfile` writes `extends: ${parent}` unconditionally and
  cannot express a root domain; the upgrade trigger is unowned; `resolveTemplate` scans
  `<pluginRoot>/extensions/` while installs write to `<projectRoot>/.context-index/domains/` and the
  two never meet — this initiative REMOVES that blocker (see Phase A); and it contradicts
  `template-resolution.spec.md` Behaviors 3 and 4. Tracked as `adev-plugin-xg1f.5`
- Automatic updates or version polling — `adev-plugin-zsmh.6`
- Fixing `data-engineering`'s own reviewer data — `adev-plugin-xg1f.4`
- Requiring a network fetch to initialize a project: `software` stays bundled, and any domain
  this initiative ships (`web-service`) is vendored under `<pluginRoot>/extensions/`
- New runtime dependencies of any kind (Constitution principle 1)
- Changing the write-once semantics of materialized registries

### Dependencies

| Module | Direction | Why |
|---|---|---|
| `review` | modifies | Owns the reviewer panel, prompts and context packs |
| `extensions` | modifies | Install path gains registry validation, and `installDomainProfile`'s `RECOGNIZED_DOMAIN_FILES` copy allowlist is revisited if the domain config set grows |
| `domain-extensions` | modifies | Domain packages gain guidance and reviewer prompt files |
| `setup` | modifies | `/adev:init` gains codebase-shape domain detection |
| `design` | modifies | `/adev:specify` sheds hardcoded guidance and its hardcoded domain-template path; `/adev:brainstorm`'s charter-layer resolution changes with it, and both provider mirrors are regenerated |
| `maintenance` | modifies | Pass 19 gains a named apply path |
| `domain-profiles` | modifies | Adds a `web-service` domain and a `specify-guidance.md` entry to the domain-config set; breaks none of its invariants, since `software` stays bundled |
| `lifecycle-artifacts` | modifies | Owns the spec templates whose `HTTP Status` column Phase 2 removes, and `resolveTemplate` itself — Phase A widens its signature with a project root and adds a project-local search step ahead of the plugin roots. Its fall-through to the bundled default is preserved |

## Current State

**The panel.** Three reviewers ship in `templates/domains/software/reviewers.yaml` —
`structural-architect`, `security-reviewer`, `consistency-analyzer` — all
`dispatch: always`. The security reviewer's six scopes are authentication, endpoint
exposure, PII in responses, injection, file uploads and rate limiting.

**The authoring end matches it.** `skills/specify/SKILL.md:382` prompts verbatim
*"lacks permission → 403, column not found → 404, conflict → 409"*; lines 360-361 give
behavior examples about dragging cards between columns and reindexing `position`.

**Template resolution runs through two distinct trees.** `skills/specify/SKILL.md:159` (Step 2) loads
`templates/domains/<resolved_domain>/spec-template.md` for interview structure, with a hardcoded
fallback to `spec-template.behavioral.md`. Step 5 (:455) WRITES the file from
`resolveTemplate('spec', kind, domain)`, which resolves `extensions/<domain>/domain/` →
`templates/spec-template.<kind>.md` and never touches `templates/domains/`. The interview
structure and the written artifact therefore come from different files under different roots.

**The written templates are themselves web-shaped.** `templates/spec-template.behavioral.md:79`
and `templates/spec-template.refactor.md:145` both carry an
`| Condition | Expected Behavior | HTTP Status / Error Code |` column. These are the templates
actually written into every new spec, so removing examples from `/adev:specify` alone would
leave web-shaped guidance in place.

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

**The domain template override has never worked in production.** `resolveTemplate` builds a
kind-suffixed filename — `${layer}-template.${kind}.md` (`lib/template-resolution.mjs:221`) — and
probes it inside each extension's `domain/` directory. But every shipped domain directory carries
kind-LESS names: `DOMAIN_CONFIG_FILENAMES` (`lib/domains/constants.mjs:23-31`) maps
`spec-template` → `spec-template.md`. `find templates/domains extensions -name "*-template.*.md"`
returns zero results. So the domain-override branch (`template-resolution.spec.md` Behavior 2) has
never resolved for any real domain, vendored or installed; it is exercised only by synthetic
fixtures in `tests/lib/template-resolution.test.mjs`.

**Two roots, and one skill bypasses both.** `resolveTemplate` scans
`<pluginRoot>/extensions/*/domain/` and its signature carries no project root, while
`adev extension install` writes to `<projectRoot>/.context-index/domains/<name>/`. Domain CONFIG
(`reviewers.yaml`, `gates.yaml`, and the kind-less templates) already resolves project-local-first
through `loadDomainConfig` (`lib/domains/domain-config.mjs:90`), so the two systems are reconciled
for config and not for templates. Separately, `skills/specify/SKILL.md:159` bypasses
`loadDomainConfig` altogether and hardcodes `templates/domains/<domain>/spec-template.md` under the
plugin root.

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
ships the OWASP and structural prompts; each domain ships `specify-guidance.md` in the
**domain-config set** (`DOMAIN_CONFIG_FILENAMES`, installed to `.context-index/domains/<name>/`),
loaded via `loadDomainConfig` exactly as `reviewers.yaml` and `gates.yaml` are — NOT in the
`resolveTemplate` discovery root. The two trees are NOT unified by this initiative: guidance
resolves through `loadDomainConfig` and written templates through `resolveTemplate`, and each
acceptance criterion names which. Unifying them belongs with the deferred unbundling work. `/adev:specify` keeps method and
sheds examples. Inline prompt bodies let a domain declare a small reviewer without a file
per reviewer.

**A domain package resolves as one unit.** A domain overrides templates per LAYER using the
kind-less `DOMAIN_CONFIG_FILENAMES` names it already ships, resolved through `loadDomainConfig`'s
existing project-then-bundled precedence — so an installed domain supplies templates, governance
and guidance together. A domain cannot vary its template by `kind`; that specificity stays with
the bundled `templates/<layer>-template.<kind>.md` set, which is unchanged.

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

Also in Phase A: make the domain template override actually resolve (`adev-plugin-xg1f.6`).
`resolveTemplate`'s domain-override step asks `loadDomainConfig` for the kind-less
`spec-template` / `charter-template` config type, which already searches
`.context-index/domains/<domain>/` then `templates/domains/<domain>/` then the one-level `extends`
parent. The kind-suffixed `templates/<layer>-template.<kind>.md` fallback is untouched and remains
the path taken when no domain override exists or `domain` is null.

Two consequences to handle explicitly rather than discover: `loadDomainConfig` THROWS
`BUNDLED_OVERRIDE_BLOCKED` when `.context-index/domains/<bundled-name>/` exists
(`domain-config.mjs:75-82`) — template resolution must not inherit that throw, since a project
shadowing a bundled domain's template is not the same act as shadowing its governance. And
`skills/specify/SKILL.md:159`'s hardcoded plugin path is replaced by the same `loadDomainConfig`
call, so interview structure and written artifact finally agree on where a domain template lives.

Pulled in because Phase A ships domain-owned prompts and Phase 2 ships domain-owned guidance —
both already resolve project-local — so leaving templates unreachable would ship a domain-package
contract that is two-thirds true. It also removes one of the six blockers on the deferred
unbundling work.

**Phase B — Init domain detection.** Codebase-shape signals, proposed with evidence.

**Phase C — `adev governance adopt`.** Pass 19's apply path.

The tracks touch different trees — evidence track in `skills/review-specs/` and
`templates/domains/`, enablement track in `lib/governance/`, `lib/cli/`, `skills/init/` —
so they proceed without collision. Phase A ships the `web-service` domain regardless of
the gate: relocating the OWASP prompt is correct whether or not it stays in the default
panel.

## Acceptance Criteria

### Phase 1 — gate

- [x] `referent-integrity` is declared in this repo's `review.yaml` with a hand-written pack and dispatches with no plugin change
- [x] All MAPPED specs (3 of 5; `rftq` and `ysqd` UNMAPPED, see mapping-table.md) are reviewed at their pre-fix git revisions; each result records whether the known defect was flagged as blocker with a citation resolving to a real file or symbol
- [x] The threshold (bar = ceil(0.6 × denominator); 2 of 3 here, since denominator dropped to 3) is evaluated and recorded before any Phase 2 work begins

### Phase 2 — panel and prompts

- [x] No default-panel prompt instructs the model to compute a hash; each `blocker` finding instead carries `section_anchor` + `finding-type` only, omitting `blocker_id` entirely
- [x] `/adev:specify` contains no HTTP status codes and no drag-and-drop examples (domain-authoring-guidance spec, validated)
- [x] `templates/spec-template.behavioral.md` and `templates/spec-template.refactor.md` carry no
      `HTTP Status` column; their error-case columns are domain-neutral. Removing examples from the
      skill alone does not satisfy this phase (domain-authoring-guidance spec, validated)
- [x] Each domain ships `specify-guidance.md`; `/adev:specify` loads it and renders an explicit empty state when a domain ships none (domain-authoring-guidance spec, validated — bundled `software` default ships; other domains fall back to the explicit empty state)
- [x] `structural-architect` and `security-reviewer` leave the default panel via `enabled: false` **with a stated reason**, not entry deletion; their prompt files remain resolvable

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
- [ ] A domain shipping a kind-less `spec-template.md` has it used by `/adev:specify` for BOTH the
      interview structure (Step 2) and the written artifact (Step 5) — asserted for a domain installed
      via `adev extension install` into a scratch project, not a vendored one
- [ ] `resolveTemplate`'s domain-override step resolves through `loadDomainConfig`, inheriting its
      project → `templates/domains/<domain>/` → one-level `extends` parent precedence; a project-local
      domain template wins over a plugin-side one of the same name
- [ ] A `BUNDLED_OVERRIDE_BLOCKED` condition does NOT propagate out of template resolution: a project
      carrying `.context-index/domains/software/spec-template.md` resolves that template rather than
      throwing
- [ ] `template-resolution.spec.md` is amended in the same change: Behavior 2 (override location),
      the Preconditions containment-root enumeration, and Behavior 8 (`UNSAFE_TEMPLATE_PATH`) all
      account for `.context-index/domains/` as an allowed root
- [ ] `skills/specify/SKILL.md` no longer hardcodes `templates/domains/<domain>/spec-template.md`;
      both provider mirrors under `providers/codex/` and `providers/opencode/` are regenerated
- [ ] `skills/brainstorm/SKILL.md`'s charter-layer resolution is updated for the same contract, with
      its provider mirrors regenerated
- [ ] `templates/<layer>-template.<kind>.md` resolution is unchanged when no domain override exists
      or `domain` is null — `template-resolution.spec.md` Behaviors 3 and 4 still hold, asserted by
      the existing tests passing unmodified

### Phase B — init detection

- [ ] `/adev:init` proposes a domain with the evidence that produced it and never applies without confirmation
- [ ] A project with no matching signals falls back to asking, with no fabricated recommendation

### Phase C — adopt

- [ ] `adev governance adopt` splices named entries into a materialized registry with a diff and confirmation
- [ ] The write-once marker is preserved; the operation is idempotent
- [ ] Pass 19 names the exact adopt command that resolves each divergence

### Global

- [ ] No new runtime dependencies
- [ ] `npm test` passes; `adev diagnose` clean
