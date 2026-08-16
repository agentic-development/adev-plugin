---
spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
plan: .context-index/specs/cross-cutting/extension-governance-merge-hardening.plan.md
date: 2026-08-15
overall-status: PASS
aggregate-verdict: PASS_WITH_NOTES
rigor-tier: full
tier-source: risk-policy (risk_level high -> validate_mode full)
run: re-run (previous run fail-fasted at Check 1a)
head-commit: 7053118fc4c4f22130092dc4c11dd66d857d5d11
checks-dispatched: [1, 1.5, 1.6, 2, 4, 8, 9, 11, 14]
passed: 6
passed-with-notes: 3
failed: 0
skipped: 0
---

# Validation Report: Live Spec: Extension Governance Merge Hardening

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md`
> **Plan:** `.context-index/specs/cross-cutting/extension-governance-merge-hardening.plan.md`
> **Overall Status:** PASS (aggregate verdict PASS_WITH_NOTES)
> **Rigor tier:** `full` — resolved from `risk-policies.yaml` (`risk_level: high` → `validate_mode: full`). No `--tier` override, no routing signal.
> **Workspace:** not detected — single-repo mode, all workspace-aware logic skipped.
> **Infrastructure preflight:** not applicable — the spec declares no `infra_requirements`.

## Why this is a re-run

The previous validate run returned FAIL at Check 1a because `npm test` exited 1 on two
pre-existing failures in `tests/skills/plan-task-immutability.test.mjs`, unrelated to this spec:
a `git filter-branch` had re-hashed every commit in the repo's
`hygiene.plan_immutability.exempt_commits` list, orphaning all thirteen exemptions. Fail-fast then
skipped Checks 1b, 1c, 2, 4, 8 and 9.

That blocker was fixed in commit `7053118f` on this branch
(`hygiene.plan_immutability.exempt_patch_ids[]` — patch ids survive history rewrites — plus a fix
stopping the detector attributing an enclosing repo's git history to a nested project root). Check 1a
now passes and the previously-skipped checks all ran.

## Registry load

`loadValidateConfig` loaded `.context-index/governance/validate.yaml` cleanly. Seven checks resolved
(1.5, 2, 4, 8, 9, 11, 14), all `enabled`, topologically sorted. Three non-blocking loader warnings,
all from the `browser-review` profile used by Check 11:

- `BROADEN_TOOL` — profile `browser-review` `allow_add` adds mcp_server `playwright`.
- `BROADEN_TOOL` — profile `browser-review` `allow_add` adds category `web-fetch`.
- `BROADEN_NETWORK` — profile `browser-review` network broadened `deny` → `read-only`.

Domain resolution: `software` (source level `default`). Heuristics for module `domain-extensions`
retrieved (3 heuristics, none contradicted by this implementation).

---

## Check 1: Quality Gates — PASS

Gate source: `adev domain load-gates` merged set — the `software` domain starter's gates. Two gates
resolved.

| Sub-check | Tier | Gate | Command | Result |
|---|---|---|---|---|
| 1a | fast | `quality-gate` | `npm test` | **PASS (82.2s)** |
| 1b | integration | `integration-test` | `npm run --if-present test:integration` | **PASS (0.2s, no-op — no `test:integration` script)** |
| 1c | e2e | — | — | **SKIP — e2e tier, no gates configured** |

`npm test` result: `tests 6047 · suites 822 · pass 6045 · fail 0 · cancelled 0 · skipped 0 · todo 2`,
exit 0. Zero `✖` lines in the output. The two `plan-task-immutability` failures that blocked the
previous run are gone.

**WARN — the project's own `test` gate is silently skipped by the domain gate loader.**
`adev domain load-gates` emitted:

```
INVALID_GATE: Gate 'test' command must be an argv list (array), not a string — skipped.
```

`.context-index/governance/gates.yaml:27` declares `command: "npm test"` as a string. The domain
starter's `quality-gate` runs the same `npm test`, which masks the skip — the suite did run, but it
ran because of the domain gate, not the project's. This is an existing configuration defect, not
introduced by this spec; it was first surfaced by the previous validate run. Note the interaction
with this spec: `lib/gates/doctor.mjs` reads `gates.yaml` directly and *does* honor the string form
(see Check 14), so the two consumers disagree about whether this gate exists.

**Legacy gate detection:** `manifest.yaml` contains no `gates:` section — no migration warning.

## Check 1.5: Source Manifest Verification — PASS

```
Check 1.5: PASS — source manifest matches (sha: 5fe0617)
```

All 31 files listed in the spec's `source-manifest.files` hash to the stamped SHA. The
validator-side git-tracked wrap also passed: every one of the 31 files returns a commit from
`git log --oneline -1 -- <file>`, and `git status --porcelain` over `cli/ lib/ tests/ docs/
templates/ extensions/` is empty — nothing was left uncommitted or untracked.

## Check 1.6: Code-Side Drift Warning — PASS (non-blocking)

```json
{"drifted": false, "drift_source": null, "drift_at": null}
```

No `drift_detected` flag set, and the Check 1.5 SHA fallback agrees.

## Check 2: Spec Compliance — PASS_WITH_NOTES

Dispatched as a `subagent-review` against
`skills/validate/checks/validate.check-2-spec-compliance.md`. The spec's `## Acceptance Criteria`
section carries **35** criteria (spec:618-652).

**31 PASS · 4 PARTIAL · 0 FAIL.**

The four PARTIALs are all *assertion-method* gaps — in each case the behavior is present and correct
in code, but the criterion named a stronger assertion method than the test suite actually exercises:

| # | Criterion | Finding |
|---|---|---|
| 12 | Escaping `command` path refused, "asserted for both `gates.yaml` and `validate.yaml`" | Refusal asserted at `tests/lib/extensions/exec-payload.test.mjs:36-43`, `:63-70`, `:312-322`, but those contributions carry no `target`. `grep -rn GOVERNANCE_COMMAND_ESCAPES_EXTENSION tests/` hits only `exec-payload.test.mjs`. The per-registry half is unasserted. Behavior is target-independent and correct (`lib/extensions/exec-payload.mjs:163-208`). |
| 16 | `review.yaml` `package: {skill, adapter}` round-trips through install **and `loadReviewConfig`** | Refusals and the install round-trip are fully asserted (`tests/lib/extensions/governance-registry.test.mjs:58-66`, `tests/lib/extensions/install.test.mjs:335-357`). `loadReviewConfig` is never invoked on an installed registry — `grep -rn loadReviewConfig tests/` hits only `tests/evals/configurable-governance/`. |
| 17 | `package.skill` emitted `.context-index/`-relative "and `loadReviewConfig` resolves it" | Both emission forms strongly asserted, including that they name the same file (`tests/lib/extensions/exec-payload.test.mjs:74-92`, `:94-113`). The `loadReviewConfig` resolution clause is unasserted — same gap as #16. |
| 24 | Each allowlist accepts every contributable field, "asserted by round-tripping a maximal contributable entry per registry through install and then through that registry's loader" | The completeness half is rigorous — `tests/lib/extensions/governance-registry.test.mjs:139-148` `deepEqual`s each fixture's key set against `FIELD_ALLOWLIST.get(target)` for all five registries. The install + loader round-trip half is absent, and the `gates.yaml` maximal fixture (`:110-118`, `command: ['npm','run','lint']`) *cannot* install: it refuses with `GOVERNANCE_COMMAND_ESCAPES_EXTENSION` because `npm` is neither an allowlisted interpreter nor a contained path (`lib/extensions/exec-payload.mjs:321-330`). That refusal is the spec's own intended design (spec:258-259), so the criterion's stated assertion method was never exercisable as written. |

The remaining 31 criteria PASS with cited evidence, including the security-critical ones:
`PATH_TRAVERSAL` refusal with two `existsSync === false` checks
(`tests/lib/extensions/governance-merge-hardening.test.mjs:36-58`); the collision path leaving
existing entries byte-identical with `command === undefined`
(`tests/lib/extensions/example-validation-check-install.test.mjs:319-358`); the end-to-end reference
install in a foreign temp project, payload at mode `0o555`, argv rewritten absolute, loaded by the
real `loadValidateConfig` and executed by `runQualityGate`
(`tests/lib/extensions/example-validation-check-install.test.mjs:483-582`); per-install atomicity
via a whole-tree recursive snapshot (`tests/lib/extensions/install.test.mjs:123-141`, `:248-254`);
and the parse-refusal path replacing the old `catch { start fresh }` fallback
(`lib/extensions/content-install.mjs:127-149`, tests `:150-196`).

### The five deduplicated review defects — adjudicated on their merits

The `.review.md` verdict is `PASS_WITH_NOTES` with `verdict-source: operator-override`; three
reviewers returned BLOCK with 18 blockers at revision 4 and the blockers were **not** waived. Each
was re-adjudicated against current code, treating neither the override nor the original BLOCK as
evidence.

1. **rev-3 design text contradicting rev-4 — RESOLVED.** All four cited locations now read as
   revision-5 text. spec:113-116 sits inside `## Current State` under the explicit historical-record
   blockquote at spec:67-71; spec:214-215 states the three bounds apply uniformly with the `runner`
   carve-out; spec:302 is the `validate.yaml` allowlist row including `command`; spec:370-372 is the
   installer-owned field set. `tests/specs/extension-governance-merge-hardening-consistency.test.mjs:8-17`
   pins the absence of all four rev-3 exclusion phrases, `:19-25` pins the twelve-code closure,
   `:45-47` pins `revision: 5`.
2. **Bound 1 (containment) had no durable base and no run-time counterpart — RESOLVED.** Verified in
   `lib/extensions/exec-payload.mjs`: copy into `.context-index/extensions/<name>/` (`payloadDir`
   `:127-140`, `applyExecPayload` `:424-437`); argv rewritten **absolute** (`:342-350`, applied
   `:456`); `realpathSync` on **both** base (`:168`) and candidate (`:192`), with a lexical
   pre-check at `:179-188` so an escaping relative path reports ESCAPES rather than being masked as
   MISSING, and a realpath throw is a refusal (`:169-171`, `:193-199`) never a fallback; mode
   `0o555` (`:435`) re-asserted contained post-copy (`:439-441`);
   `package.skill`/`package.adapter` emitted `.context-index/`-relative (`:102`, `:355-372`), never
   absolute. The module additionally refuses a directory payload (`:257-263`) and a plan/apply root
   mismatch (`:413-422`) — neither required by the spec.
3. **Bound 2 (argv-only) rested on a false premise about `doctor.mjs` — RESOLVED; the premise is now
   true.** `lib/gates/doctor.mjs:755-768` is the argv-direct branch —
   `spawnSync(rawCommand[0], rawCommand.slice(1), { ...options, shell: false })` with
   `cwd: projectRoot` at `:757`, invoked from `:1004`. String commands keep
   `spawnSync("sh", ["-c", command], options)` at `:767`. `normaliseCommand` (`:254-268`) and
   `NEEDS_QUOTING` (`:219`) survive as defence in depth and are pinned by two spec-owned tests
   (`tests/lib/extensions/invariant-dependencies.test.mjs:72-76`, `:142-155`;
   `tests/gates/doctor-argv-execution.test.mjs:244-248`). The structural proof — a shell **builtin**
   failing under `shell: false` while succeeding under `sh -c`, which quoting cannot fake — is at
   `tests/gates/doctor-argv-execution.test.mjs:97-131` and could not pass on the pre-fix path.
4. **Bound 3 (consent) had no mechanism and no plumbing — RESOLVED; still holds at HEAD.**
   `cli/index.mjs:1248` parses `--allow-exec` position-independently, `:1268` computes
   `interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY)`, `:1269` threads
   `promptFn: readConsentAnswerSync`. `lib/extensions/exec-consent.mjs:159-204` fails closed: both
   flags default `false`, a throwing prompt is caught and treated as refusal (`:183-188`), only
   trimmed/lowercased `y`/`yes` grants (`:43`, `:189`). Exercised through a real pipe with faked TTY
   flags at `tests/cli-extension.test.mjs:133-186`. (Independently verified end-to-end in the prior
   run at commit `6cfc9177`.)
5. **The `review.yaml` allowlist row was wrong on nesting depth — RESOLVED.**
   `lib/extensions/governance-registry.mjs:99-102` is exactly the spec's row;
   `tests/lib/extensions/governance-registry.test.mjs:139-148` `deepEqual`s it against the maximal
   fixture's key set, so drift in either direction fails. `package` is one level with exactly
   `{skill, adapter}` (`:168`, `:252-271`); `package.args` refuses (test `:62-63`);
   `dispatch: triggered` refuses (`:160`, `:185`; test `:60-61`); a two-level object refuses via
   `assertValidValue` (`lib/extensions/governance-values.mjs:274-288`; tests
   `governance-values.test.mjs:40`, `:152-158`).

### Test integrity

No weakened or gamed tests found. Positive findings worth recording:

- Discriminators are structural, not cosmetic — `tests/gates/doctor-argv-execution.test.mjs:101-104`
  picks `exit 0` precisely because quoting cannot produce the pass/fail difference, and `:110-118`
  guards against a vacuous pass by proving the gate genuinely spawned first.
- "Writes nothing" is always byte-identity against the exact source string, never a substring check
  (`governance-merge-hardening.test.mjs:112`, `:123`, `:159`, `:171`, `:183`, `:195`, `:238`,
  `:276`, `:290`, `:302`, `:342`); `install.test.mjs:123-141` snapshots the whole project tree
  including directory entries.
- Caps are boundary-exact, not one-sided: `governance-values.test.mjs:64-70` asserts `CAPS[key]`
  passes and `CAPS[key]+1` refuses for all four.
- The only conditional skip is `example-validation-check-install.test.mjs:573`
  (`if (process.platform === "win32") return`) — a documented platform contract that never fires on
  POSIX CI.
- Two loose-looking assertions are benign: `governance-merge-hardening.test.mjs:87`
  (`commentsBefore.length >= 20`) is a fixture precondition whose real assertion is a strict
  `deepEqual` at `:94`; the line-budget checks in `example-validation-check-install.test.mjs:74`,
  `:156`, `:166` are budgets by design.

**Test-hygiene note (minor):** `tests/specs/extension-governance-merge-hardening-consistency.test.mjs:5-6`
reads the spec through a cwd-relative path rather than `PLUGIN_ROOT`, unlike every sibling. It works
under `npm test` from the repo root but will throw if the suite is run from another cwd.

### Known Minors — all three confirmed against current code

- **(a) The example template's governance header is stale.**
  `templates/adev-extension.example.yaml:32-33` lists only `review.yaml | validate.yaml |
  gates.yaml` — 3 of the 5 writable registries; `diagnostics.yaml` and `boundaries.yaml` are
  missing. `:33-34` still describes the removed field-merge semantics ("merged by `id` per ADR-0003:
  project values override extension values"); collisions are now skipped outright, never
  field-merged (`lib/extensions/content-install.mjs:509-513`). `:37-39` also attributes `execFile`
  to "the installer", which runs it nowhere.
- **(b) An `assertArgvCommand` docstring states a rationale the pipeline contradicts.**
  `lib/extensions/governance-registry.mjs:278-283` justifies the argv-token relaxation by saying the
  scalar rule "would refuse `[npm, test, --, --silent]` … and make a legitimate gate
  uncontributable." That shape was installed during this check and refused with
  `GOVERNANCE_COMMAND_ESCAPES_EXTENSION` (`lib/extensions/exec-payload.mjs:321-330`) — `npm` is
  neither an allowlisted interpreter nor a contained path, so such a gate is uncontributable
  regardless of which rule applies. The relaxation remains correct for `--`/`--silent`; only the
  stated reason is wrong.
- **(c) A collision-skipped entry still has its payload copied.**
  `lib/extensions/install.mjs:305-308` applies the payload before `applyGovernanceMerge` at
  `:325-328`, by which point the merge plan has already decided to skip. Reproduced: a project
  pre-seeded with `id: g1` yields `merges ["skipped: g1"]`, `gates.yaml` unchanged, and an orphan
  payload at `.context-index/extensions/coll-ext/bin/check.sh`. The file is contained and consented,
  so Invariants 5 and 6 hold — an orphan on disk, not an exposure.

### Spec-vs-code drift found beyond the known items (advisory)

The implementation is *stricter* than the spec in each case, so none is a security regression — but
everything from `## Target State` onward is a current-code claim and these four points are stale:

- `lib/extensions/governance-registry.mjs:181-188` constrains `severity` and `severity_cap` to
  closed enums. Behavior 5 (spec:554) and the Error Cases table (spec:568-588) name neither.
- `lib/extensions/governance-values.mjs:67`, `:82` refuse colon-plus-whitespace / trailing-colon and
  type-flipping scalars (`""`, `-?\d+`, `true`/`false`, `null`, `~`) with `GOVERNANCE_SCALAR_UNSAFE`.
  Behavior 7 (spec:556) enumerates a character set that excludes both classes.
- `lib/extensions/content-install.mjs:236-335` (`assertOpenNamespacesResolvable`) is an entire
  enforcement layer — resolving `profile`, `context_pack` and `prompt` against merged project+plugin
  state — that appears nowhere in the spec's Changes Catalog, Behaviors or Error Cases. It reuses
  the declared `GOVERNANCE_FIELD_VALUE_INVALID`, so the twelve-code closure survives.
- `lib/extensions/content-install.mjs:454-456` documents an `extensionRoot` option that
  `planGovernanceMerge` never reads. Dead parameter; the spec's MODIFIED entry (spec:406-410) names
  it as load-bearing.

Not reported as drift: the spec's `## Current State` section, which is a deliberate dated historical
record (2026-08-14) declared as such in the blockquote at spec:67-71.

### Scope Expansion Sub-Finding — DETECTED (severity: warning)

`source-manifest.files` (spec:13-44) is present and non-empty, so scope verification applies.
Comparing `git diff $(git merge-base HEAD main)..HEAD --name-only` against it, two project-source
files fall outside every declared entry:

- `lib/plan-immutability.mjs`
- `tests/skills/plan-task-immutability.test.mjs`

Both arrive from commit `7053118f` — the unrelated hygiene fix landed on this branch specifically to
unblock Check 1's fast tier. The manifest's boundary is set by its `lib/` entries
(`lib/diagnostics/index.mjs`, `lib/extensions/*.mjs`, `lib/gates/doctor.mjs`) and its `tests/`
entries (`tests/cli-extension.test.mjs`, `tests/docs/`, `tests/gates/`, `tests/integration/`,
`tests/lib/extensions/`, `tests/specs/`); neither offending path is implied by any of them.

**Recommended action:** update the spec's `source-manifest.files` to include these paths, or move
the hygiene fix onto its own branch.

Not flagged: `.context-index/manifest.yaml`, the `explicit-governance-registries.*` artifacts and
this spec's own `.review.md` / `.blockers.md` are lifecycle artifacts rather than project source.

## Cross-Repo Dependency Validation — N/A

No workspace detected (`detectWorkspace(cwd)` → `null`) and the spec declares no cross-repo
`depends-on` references.

## Check 4: Constitution Compliance — PASS_WITH_NOTES

Dispatched as a `subagent-review` against `skills/validate/checks/validate.check-4-constitution.md`,
under that check's evidence contract (every finding, PASS or FAIL, carries a `file:line` or a
literal grep pattern plus matched paths).

**Architecture boundaries: PASS.** No item on the "Requires Human Approval" list was crossed.

- *New skills in the lifecycle order* — no path under `skills/` in the diff; the only skill-adjacent
  path is a test (`tests/skills/plan-task-immutability.test.mjs`). `manifest.yaml`'s diff touches
  only `hygiene.plan_immutability`.
- *Hook protocol* — `git diff --name-only | grep -E '^hooks/'` returns nothing;
  `lib/extensions/register.mjs` is not in the diff. The spec's own claim at spec:611 ("hook protocol
  unaffected; this path runs at install time, not in a hook") is accurate. Noted separately:
  `lib/gates/doctor.mjs:734-766` does change how a *gate* is spawned, but gates are not hooks and
  the string-form default path is preserved at `:1004-1008`.
- *CLI installation path structure* — the whole `cli/index.mjs` diff is `readConsentAnswerSync`
  (`:51-84`) plus `--allow-exec` parsing in `cmdExtension` (`:1246-1269`); no `PLUGIN_ROOT` or
  install-target change, and `grep '^\+.*(~/\.claude|homedir\(\))'` over the diff returns nothing.
  The new `.context-index/extensions/<name>/` payload directory
  (`lib/extensions/exec-payload.mjs:127-141`) is project-owned install data, not the CLI's own
  install path structure.
- *Plugin registration format* — `git diff … -- .claude-plugin/plugin.json` is empty.
- *External dependencies* — `git diff … -- package.json package-lock.json` is empty.
- *Version manifests (ADR-0008)* — all three manifests are absent from the diff and all three still
  read `"version": "0.27.8"`. No release-please conflict introduced.

**Non-negotiable principles: PASS (all five).**

1. *Minimize external dependencies* — `git diff $BASE..HEAD -- '*.mjs' | grep "^+.*from '"` filtered
   against `node:`, relative and bare-builtin specifiers returns **none**: every import added across
   the branch is a Node built-in or a relative path (`exec-payload.mjs:62-76`,
   `content-install.mjs:12-22`, `install.mjs:30-48`, `governance-values.mjs` has zero imports,
   `governance-registry.mjs:21`, `governance-splice.mjs:51`). YAML handling routes through the
   repo's own hand-rolled `lib/profiles/yaml.mjs`, so the "a YAML library would need an ADR"
   carve-out was honored and no ADR was owed.
2. *Skills are primarily markdown* — no `skills/*/SKILL.md` in the diff. The `review.yaml`
   `package: {skill, adapter}` surface points at reviewer prompt files, and
   `lib/governance/review-config.mjs:410` (unchanged on this branch) defaults `package.adapter` to a
   markdown prompt.
3. *Pure ESM* — `grep -nE "require\(|module\.exports|exports\." lib/extensions/*.mjs
   lib/diagnostics/index.mjs lib/gates/doctor.mjs lib/plan-immutability.mjs cli/index.mjs` returns
   none; no `.cjs`/`.js` file in the diff; `package.json` still `"type": "module"`.
4. *Hook protocol compliance* — the `hooks/` directory is absent from the diff entirely; the
   exit-0/exit-2 + stdin/stdout JSON contract is unchanged by construction.
5. *Version parity* — `package.json`, `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`
   all read `0.27.8`.

**Coding standards: PASS.** camelCase exports throughout the five new modules (`assertSafeScalar`,
`assertValidValue`, `resolveRootKey`, `validateEntryFields`, `spliceRegistryEntries`, `payloadDir`,
`assertContained`, `planExecPayload`, `applyExecPayload`, `resolveExecConsent`,
`readConsentAnswerSync`, `spawnGate`); SCREAMING_SNAKE constants matching repo convention
(`CAPS`, `WRITABLE_REGISTRIES`, `INSTALLER_OWNED`, `FIELD_ALLOWLIST`, `INTERPRETER_ALLOWLIST`);
snake_case appears only as YAML *data* keys (`exec_consented_at`, `severity_cap`), never as JS
identifiers. All five new source files and all four new test files are kebab-case. Import ordering
verified per file (built-ins before relatives) at `exec-payload.mjs:62-76`,
`content-install.mjs:12-22`, `install.mjs:30-48`, `lib/diagnostics/index.mjs:32-37`,
`lib/gates/doctor.mjs:39-43`, `lib/plan-immutability.mjs:23-31`. CLI failure paths use
`process.exit(1)` (`cli/index.mjs:1256`, `:1287-1289`). The SKILL.md anti-patterns (inline-Node,
both-forms sections, descriptive-only fenced JS, Load Skill Extensions block) are vacuously
satisfied — no `skills/**/SKILL.md` is in the diff and no new skill directory was created.

**Notes (neither is a violation attributable to this change):**

- **The spec understates its own dependency surface.** spec:610 states containment/escaping "use
  `node:path` and string handling only." The shipped `assertContained`
  (`lib/extensions/exec-payload.mjs:163-186`) also uses `realpathSync` from `node:fs` (imported at
  `:62-69`), for the reason documented in the comment at `:145-152` (macOS `/var` →
  `/private/var`). `node:fs` is a Node built-in, so Principle 1 is fully honored — the spec's
  wording just under-describes the implementation. Advisory only.
- **Pre-existing constitution/CLAUDE.md contradiction on version bumping.**
  `.context-index/constitution.md:90` lists bumping `package.json` and `.claude-plugin/plugin.json`
  versions when a PR adds features as *Autonomous*, while the mirrored `CLAUDE.md:92` says do **not**
  bump versions in a feature or fix PR, per ADR-0008. Both texts are byte-identical on `main` and
  neither file is in this branch's diff — pre-existing drift, not introduced here. Route to
  `/adev:hygiene`, or edit the constitution and run `/adev:sync`.

## Check 8: Boundary Compliance — PASS

`.context-index/governance/` exists and `boundaries.yaml` is present, but declares
`boundaries: []` (`.context-index/governance/boundaries.yaml:6`) — the file contains only commented
scaffolds. Zero rules to evaluate, so the rule loop is empty. No `governance/overrides/` directory
exists, so no charter-specific overrides apply.

## Check 9: Transition Gates — SKIP

`.context-index/governance/gates.yaml` declares `transitions: {}` (`:73`) with only commented
scaffolds for `spec-to-plan`, `implement-to-validate` and `validate-to-merge`. No
`implement-to-validate` or `implement-to-merge` transition is configured, so there are no
`required_gates` to verify and no `approver_role` to report.

## Check 11: Visual Verification — SKIP

Trigger guard, Case A (no UI files, no Playwright). The implementation diff contains no `*.tsx`,
`*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss` or `*.html` file and nothing under `components/`,
`pages/`, `views/`, `public/` or `app/**/{page,layout}.*` — every changed source path is `.mjs`,
`.md` or `.yaml`. The Playwright MCP server (`browser_navigate`, `browser_snapshot`) is not
available in this session. Outcome per the four-case matrix: **SKIP — "No UI files in
implementation diff — visual verification not applicable."** This is not the BLOCK case, which
requires UI files to be present.

## Check 14: Gate Executability and Test Collection — PASS_WITH_NOTES

`adev gate doctor --json` (read-only, no `--execute`): `summary: { total: 1, errors: 0, warnings: 1 }`.

- **WARN `gate-doctor/runner-unknown`** — "Gate 'test': no known test runner identified in
  `npm test`, so test collection cannot be verified. This is reported rather than passed silently."
  Citation: `.context-index/governance/gates.yaml`.

Only warnings, so this check PASSes per its own step 3. Two observations:

1. The doctor reads `gates.yaml` directly and therefore *does* see the project's `test` gate, which
   the domain gate loader skipped with `INVALID_GATE` (Check 1). The two consumers disagree about
   whether that gate exists — consistent with the spec's own observation at spec:316 that
   `gates.yaml` has two consumers with divergent contracts.
2. The `runner-unknown` finding means test *collection* was never verified for this project. The
   suite demonstrably runs (6047 tests collected under `npm test`), so this is a doctor-side
   limitation, not evidence of uncollected tests.

---

**Summary:** 9 checks dispatched — **6 PASS, 3 PASS_WITH_NOTES, 0 FAIL, 0 skipped for missing
configuration.** Checks 9 and 11 recorded SKIP outcomes for the legitimate reasons above (no
transitions configured; no UI files), not for missing setup.

Aggregate verdict: **PASS_WITH_NOTES**. Overall status: **PASS** — the implementation satisfies the
spec, respects the constitution, and passes every quality gate. Nothing found in this run blocks the
change.

### Carried forward (report, not blockers)

1. **Scope expansion** — `lib/plan-immutability.mjs` and `tests/skills/plan-task-immutability.test.mjs`
   are on the branch but outside `source-manifest.files`. Update the manifest or move the hygiene
   fix to its own branch.
2. **Four assertion-method gaps** in criteria 12, 16, 17 and 24 — behavior correct, assertions
   weaker than the criteria's own wording. Criterion 24's stated method is not exercisable as
   written and should be reworded.
3. **Four points of spec-vs-code drift** (§ Check 2) where the implementation is stricter than the
   Target State text, plus a dead `extensionRoot` parameter documented as load-bearing.
4. **Three known Minors** confirmed: stale example-template header, contradicted `assertArgvCommand`
   docstring rationale, orphan payload for a collision-skipped entry.
5. **The project's `test` gate in `governance/gates.yaml`** is a string command and is silently
   skipped by the domain gate loader (`INVALID_GATE`); the domain starter's `quality-gate` masks it.
   Converting it to an argv list would make the two consumers agree.
6. **Epic `epic-pshml3`** remains `in_progress`; the beads_rust adapter refuses programmatic closure
   and it needs a manual `br close`.
7. **`lib/retro/session-metrics.mjs`** carries 3 raw NUL bytes (lines 394, 415, 421), making the
   file binary to `grep` and `git diff`. Verified during this run. Out of scope for this spec.
8. **Pre-existing constitution/CLAUDE.md contradiction** on version bumping (§ Check 4).

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files),
> 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly
>   Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now
>   covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with
>   `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13
>   / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the
> surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve
> report readability.
