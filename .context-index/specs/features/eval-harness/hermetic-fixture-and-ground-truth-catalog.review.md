---
spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-21
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 1
file-sha: 38164e3e5a1fb7a2f8ab373ba854cd6ac5ee68e67f2f890a5ff1138ac21483a4
---

# Architecture Review: hermetic-fixture-and-ground-truth-catalog

> **Date:** 2026-08-21
> **Spec:** `.context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`
> **Charter:** `.context-index/specs/features/eval-harness/charter.md`
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level `medium` → `review_mode: full`)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via `adev extension install web-service`). |

## Registry Warnings

- `BROADEN_TOOL` — Profile `browser-review`: allow_add adds mcp_server `playwright`.
- `BROADEN_TOOL` — Profile `browser-review`: allow_add adds category `web-fetch`.
- `BROADEN_NETWORK` — Profile `browser-review`: network broadened `deny` → `read-only`.

(Not dispatched here; recorded because the loader raised them.)

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

**RI-1 — `blocker`** · `misdescribed-function-behavior` · anchor `structural-shape`
The flat-YAML rationale is false. `lib/profiles/yaml.mjs` header states "nested maps via indent (2 spaces)", and `parseMap` calls `parseBlock`, assigning `obj[key] = child ?? {}` — a nested block parses into a real nested object. The `{}` fallback fires only for a *valueless* key. Confirmed empirically: `budget:\n  max_turns: 30` yields `{"budget":{"max_turns":30}}`; a list item with a nested property also parses. Because this claim is also `CATALOG_NESTED_MAP`'s "Failure it prevents", the rule ships with a failure mode that cannot occur.
**Fix:** keep the rule; restate the justification as (a) schema parity with `RUBRIC_NESTED_MAP`, which rejects nesting by policy on the parsed tree, and (b) the real silent-load case — a valueless key materialising as `{}`. Same overbroad prose exists in shipped `lib/evals/rubric.mjs`; file separately.

**RI-2 — `warning`**
Charter `Fixture` entity declares `path` / `scaffolding_manifest`; the catalog renames them `fixture_root` / `scaffolding` without stating the mapping. `path` → `fixture_root` is never linked at all.
**Fix:** one sentence naming both renames.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

**WR-1 — `blocker`** · `write-only-state` · anchor `catalog-yaml-top-level-keys`
`catalog.yaml`'s `version` has no reader anywhere in this spec, the charter, or either tier spec. The write side is stated ("bumped when an entry is added"); nothing enforces or observes it. A rubric pinned against catalog v3 cannot notice the catalog moved to v4 — the correctness gap the field appears to prevent.
**Fix:** name the reader, or drop `version` and reduce the key set to five.

**WR-4 — `warning`** — `CATALOG_UNRESOLVED_CITATION` never names the glob it scans. It is the growth rule's only enforcement point and the sibling tier delegates to it, so an undefined scan root leaves both tiers' citation guarantee resting on nothing.

**WR-3 — `warning`** — `role` documents a twelve-value enum that no rule validates; `role: constitition` parses and means nothing.

**WR-10 — `warning`** — `detect_when` / `must_not_flag_when` have no machine consumer; nothing asserts the sentence matches what any rubric checks.

**WR-2 — `warning`** — `read_by` is unread until Disclosure Fidelity ships; state that, and that the pairing test lands with that capability.

**WR-5 — `warning`** — `npm run test:evals` is named as a fixture consumer but has no path to run until the tier specs add rubrics, scenarios, and a driver.

**WR-6 / WR-7 / WR-8 / WR-9 / WR-11 — `suggestion`** — Verified fully wired: the `repomap.exclude` entry (note `lib/repomap/index.mjs:186` *replaces* `DEFAULT_EXCLUDE`, so the entry must join the existing list), `project/package.json` → `isNestedProjectFile`, the six catalog entry fields → their five integrity rules, `covers_skills` → `CATALOG_UNKNOWN_SKILL`. `README.md`'s "every path exists" criterion has no named test carrying it.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

**CON-1 — `blocker`** · `contract` · anchor `required-files`
`project/.context-index/issues.json` is not a path any adev backend reads. `lib/issues/json-adapter.mjs:97` sets `STORAGE_REL_DIR = join(".context-index","tasks")`; the board is `.context-index/tasks/tasks.json`. `grep -rn "issues\.json" lib skills cli scripts` returns zero hits. Both the PV and its KC twin therefore resolve identically ("no board found") — the pair measures nothing.
**Fix:** `project/.context-index/tasks/tasks.json` in the JsonAdapter shape `{version, epics, issues}`, and pin `tasks.backend: json` in the fixture manifest.

**CON-2 — `blocker`** · `contract` · anchor `seed-content`
Scaffolding ships only `lifecycle-state/create-order.jsonl`. The core-lifecycle spec depends on a `shipping-rates` lifecycle state to make the `work` refusal assertion decidable, and this spec's own criterion requires the two slices to carry the same file kinds.
**Fix:** add `lifecycle-state/shipping-rates.jsonl` and pin both slices' spec `status:` values in Seed Content.

**CON-3 — `warning`** — `assess` is classed here as a non-detector consuming scaffolding only; the change-imminent tier classes it a detector that must cite a `PV`/`KC` pair. `skills/assess/SKILL.md` describes it as scanning the codebase, favouring the sibling. One of the two acceptance criteria is unsatisfiable until this is reconciled.

**CON-4 — `warning`** — Seed scaffolding claims a rubric and verdict input for `eval`, but `skills/eval/SKILL.md:112-116` resolves a project rubric only via `.context-index/evals/config.yaml`, which Required Files omits. A `read_by: eval` declaration on `orders-rubric.yaml` is undischargeable.

**CON-5 — `suggestion`** — `create-order.sample.md` departs from `skills/sample/SKILL.md:162`'s documented `<pattern>-<slug>.md` form.

**CON-6 — `suggestion`** — `CATALOG_UNRESOLVED_CITATION` here vs `RUBRIC_CITATION_UNRESOLVED` in the sibling: two spellings for one emitted code.

**CON-7 — `suggestion`** — Bare "Tier A"/"Tier B" without naming the vocabulary, which the charter's Vocabulary attribute explicitly requires of every spec in this module.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

**BD-1 — `blocker`** · `privilege-escalation` · anchor `hermeticity-rules`
The fixture ships `deploy.yaml` so `/adev:deploy` can run, and Consumers has skills driving `project/` as their working tree. `skills/deploy/SKILL.md` executes `shell` and `ci-trigger` steps via `execFile`; `project/package.json` `scripts` and fixture `quality_gates` are the same crossing. Hermeticity Rules bound `dependencies` only — nothing bounds declared commands. `lib/extensions/exec-consent.mjs` exists for exactly this and is fail-closed; here execution is granted by default with no consent surface.
**Fix:** add a fifth hermeticity property — `deploy.yaml` carries only `manual`/`gate`/`verify` types, `project/package.json` declares no `scripts` (especially lifecycle hooks), the fixture manifest declares no `quality_gates` command — or pin harness runs to a `read-only`-extending profile.

**BD-2 — `blocker`** · `destructive-operation` · anchor `consumers`
The fixture is git-committed ground truth and the driven skills include writers (`sync` rewrites the agent files this spec ships; `implement`, `hygiene`, `reconcile`, `learn` write into `.context-index/`). Nothing states a run is non-mutating or operates on a copy, so a run rewrites the anchors the catalog asserts on and `CATALOG_ANCHOR_NOT_UNIQUE` discovers it only on the next run.
**Fix:** state that eval runs copy `project/` into a temp tree (`tests/helpers.mjs::createTempDir()`), and add a criterion that `git status --porcelain tests/evals/skill-regression/` is empty after a full run.

**BD-3 — `blocker`** · `path-containment` · anchor `required-files`
`lib/issues/resolve-root.mjs::resolveStorageRoot` resolves `git rev-parse --git-common-dir` and returns its dirname — it does not consult cwd. The fixture lives inside this repo's git tree with no submodule, so any issue-touching skill run under `project/` resolves storage to the **real adev-plugin board**. Consequences: the `missing-issue-binding` ground truth is unassertable, and `/adev:issues`, `/adev:reconcile`, `/adev:status` under eval can create, claim, or close issues on the live board.
**Fix:** set `tasks.db_path` in the fixture manifest (priority 1 in `resolveStorageRoot`, ahead of the git probe), correct the path per CON-1, and pin both in the hermeticity test.

**BD-4 — `warning`** — `CATALOG_PATH_ESCAPE` / `CATALOG_PATH_MISSING` state the rules but not the mechanism or their ordering. `assertContained` in `lib/extensions/exec-payload.mjs` runs a lexical pre-check *before* filesystem access precisely so a traversal path that does not exist reports as an escape rather than as merely missing. A raw `startsWith` against an un-realpathed base is defeated by macOS `/var` → `/private/var`.

**BD-5 — `warning`** — No rule constrains scalar *values*. `covers_skills` components become path segments; `version` is described as an integer though `parseYaml` yields strings. `lib/extensions/governance-values.mjs::assertSafeScalar` is the existing refuse-don't-sanitize answer.

**BD-6 — `suggestion`** — The `repomap.exclude` edit should be a text splice, not a parse-and-reserialize of `manifest.yaml`; `governance-splice.mjs` exists because a reserializer once destroyed 7 checks and 20 comment lines.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS

No findings. No loop, retry, poll, or iterative-refinement construct. The keyword trigger fired on one-pass traversal language ("scans rubric files", "never recurses into `tests/`"). Constructs examined and dismissed as non-repeating: the nine-rule integrity check, the citation scan, the four hermeticity assertions, and the `repomap.exclude` glob.

---

## Summary

**Total findings:** 26 (7 blockers, 10 warnings, 9 suggestions)

**Action required:** Revise the spec. The blockers cluster into three groups:

1. **The fixture's issue store is wrong twice over** (CON-1, BD-3) — wrong filename *and* a storage resolver that escapes to the real board regardless of cwd. Two reviewers reached it independently from different directions.
2. **The harness executes and mutates by default** (BD-1, BD-2) — no consent gate on fixture-declared commands, no containment for writes into committed ground truth.
3. **Two stated rationales are false** (RI-1, WR-1) — `parseYaml` does parse nested maps, and `catalog.yaml`'s `version` has no reader.

CON-2's missing `shipping-rates` lifecycle state is a dependency the core-lifecycle tier already relies on, so it must be resolved here rather than there.
