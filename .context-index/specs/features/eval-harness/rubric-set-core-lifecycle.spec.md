---
partial_schema: spec@1
charter: eval-harness
kind: artifact
status: review-pending
risk_level: high
milestone: v1
revision: 13
charter-revision: 6
created: 2026-08-21
updated: 2026-08-22
---

# Artifact Spec: Rubric Set — Core Lifecycle Tier

<!-- Artifact Spec within the eval-harness charter.
     Parent Charter: .context-index/specs/features/eval-harness/charter.md
     Delivers the charter capability "Rubric set, core lifecycle tier".
     Depends on:
       - hermetic-fixture-and-ground-truth-catalog.spec.md (the catalog these cite)
       - rubric-set-change-imminent.spec.md (the SHARED per-skill rubric contract,
         referenced here and deliberately not restated) -->

> **Tier vocabulary.** "Tier A / B / C" means the charter's **eval CI tiers**.
> `tiers.yaml`'s buckets are **rubric-set buckets**, a different axis.

> **Ordering precondition.** `tests/lib/evals/rubric-coverage.test.mjs` does not
> exist yet; `rubric-set-change-imminent.spec.md` authors it. Every task in this
> spec that extends that file is blocked until that tier lands. The charter's
> capability ordering already puts the change-imminent tier first; this makes the
> dependency executable rather than implied.

## Relationship to the Change-Imminent Tier

The per-skill rubric contract — `rubric_id` naming, the point budgets, the
policies, the flat-YAML discipline, the three `source` forms, `tiers.yaml`, and
the conformance rules declared in `rubric-set-change-imminent.spec.md` — is declared once, in
`rubric-set-change-imminent.spec.md`, and governs this tier except where
Difference 2 tightens the deterministic floor. This
spec does not restate it, **except for the two values Difference 2 overrides**,
which are quoted only to state the delta. If the contract changes, it changes
there and both tiers move together; a copy here would drift the first time one
tier was revised and the other was not.

This spec declares only what is **different** about the twelve core-lifecycle
skills, and there are three differences that matter.

### Difference 1 — these rubrics may assert the specified contract, not only current behaviour

The change-imminent tier scores its skills as they behave **today**, because
those skills are queued for demotion, merge, or deletion and a baseline taken
after the change would measure the change against itself. None of these twelve
is queued for anything. Each has a SKILL.md and, in most cases, a governing
spec under `.context-index/specs/features/`.

So a judged criterion here anchors its `reference` on **the skill's own
specified contract** — its SKILL.md, and its governing spec where one exists —
rather than on an observation of current output. Where the two disagree, the
rubric follows the spec and the disagreement is the finding. That is a stronger
assertion than the other tier can make, and it is available only because these
skills are not about to move.

### Difference 2 — a higher deterministic floor

The shared contract sets a floor of 5 deterministic elements and 3–6 judged
criteria. This tier tightens the floor to **7 deterministic elements**, keeping
the 3–6 judged range unchanged.

The reason is Tier placement, not thoroughness for its own sake. Deterministic
elements run in Tier B, on every skill change; judged criteria run in Tier C,
nightly and pre-release. Both cadences are **forward-looking**: at v1 Tier B is
run by hand and Tier C is not wired at all, and both become automatic only when
the CI-integration capability lands. The floor is set for the cadence the tier
is built toward, and the prerequisite is named rather than assumed. These twelve skills carry the highest blast radius in
the repository — a regression in `implement` or `validate` corrupts work that
`hygiene` then reports as healthy — and a regression in one of them should be
caught by the PR that causes it, not by the next nightly. Raising the
deterministic floor is what buys that; raising the judged count would only make
the nightly more expensive.

### Difference 3 — this tier owns the legacy-rubric migration

`tests/evals/skill-compression/rubrics/{brainstorm,plan,specify}.yaml` score
`quality_dimensions` on a 1–5 scale with `weight` fields, and their
`required_elements` carry `match_pattern` rather than `source` + `met_when`.
`lib/evals/rubric.mjs` already rejects all three — with `RUBRIC_NESTED_MAP`,
not `RUBRIC_LEGACY_SCALE`. The nested `scoring:` block trips the nesting pass
first, and all three omit ten of the twelve `REQUIRED_TOP_LEVEL_KEYS`, so
`RUBRIC_MISSING_KEY` would fire second even if `scoring:` were flattened; the
legacy-weight pass is unreachable. `tests/lib/evals/rubric-legacy-scale.test.mjs` — whose retarget also rewrites its `:198` test name and `:199` comment ("the real skill-compression rubrics are refused"), which become false once it loads the synthetic fixture, and its `:190` comment, which belongs to an unrelated test and goes stale only because the tree is deleted — a bare-token `git grep` hit, not a falsehood —
asserts exactly that, and `rubric-schema-and-loader.spec.md`'s known-constraint
note records separately that the fractional `1.5` weights would escape
`RUBRIC_LEGACY_SCALE` anyway.

This matters beyond pedantry: an acceptance criterion phrased as "`loadRubric`
raises `RUBRIC_LEGACY_SCALE` on none of them" is satisfied by a rubric rejected
for an entirely different reason, so it certifies nothing. The criterion below
is stated positively instead.

All three name skills in **this** tier, so the charter's "Retirement of the
three existing skill-compression rubrics and their 4x3 variant matrix, replaced
by skill-regression rubrics scored against the hermetic fixture" (revision 6)
lands here. Revision 4 phrased that scope item as a *migration* from 1-5 scales
to binary verdicts; revision 6 restates it as retirement, for the reason the
next section gives.

Migration is a rewrite, not a translation. A 1–5 `weight` does not map onto a
binary verdict, and pretending it does — "4 and up is `met`" — would invent a
threshold no author chose. Each of the three legacy rubrics is re-authored
against the shared contract, and the legacy file is deleted in the same change
rather than left beside its replacement for a reader to pick between.

The existing scenarios (`tests/evals/skill-compression/scenarios/*.md`) drive a
skill against a *described* project stated in prose inside the scenario file.
The new scenarios drive it against the hermetic fixture on disk. That is the
substantive gain: a described project cannot be asserted against, so the legacy
rubrics could only regex-match the skill's own narration of what it did.

### The compression harness is retired, not repointed

An earlier draft of this spec said the two compression drivers would be
"repointed" at the new rubric directory. That is wrong, and dangerously so.
The coupling is not to a path, it is to a **field shape**:
`run-eval.mjs:111` compiles `new RegExp(el.match_pattern, 'im')` and `:230`
reads `rubric.scoring?.required_element_weight`; `matrix-integrity.test.mjs:294`
maps `el.match_pattern` and greps it against `variants/<variant>/<skill>.md`.
The unified schema has `source` + `met_when` and no `scoring:` block at all.

A pure repoint leaves `el.match_pattern` `undefined`. **`new RegExp(undefined)`
compiles to `/(?:)/`, which matches every input**, so the harness would report
100% while asserting nothing — a driver that scores everything green is worse
than one that crashes, and it is the same failure `RUBRIC_LEGACY_SURVIVES`
exists to prevent, arriving through the other door.

The two harnesses also measure different things. `run-eval.mjs` scores
`outputs/<variant>/<skill>/output.md` produced by *compressed prompt variants*
in a 4×3 matrix; the skill-regression rubrics score a *run against the hermetic
fixture*, and their `artifact:` and `skill-regression:` sources have no referent
in a variant output file. Repointing would silently change what the harness
measures while leaving its name and its green checkmark intact.

So: `tests/evals/skill-compression/` is **retired** as part of this migration — removed by literal repo-relative paths, never computed or interpolated ones, the five tracked ones removed with `git rm` and the sixth — the untracked, ignored `outputs/` — with an explicit `rmSync(target, { recursive: true, force: true })`, since `git rm` cannot reach a path git does not track. That one is the only irreversible removal in the set (nothing in git restores it, and the `eval:skill-compression` script that regenerates it is deleted in the same change), so its literal repo-relative target is containment-asserted with `isContained(lenientRealpath(join(migrationRoot, <literal>)), lenientRealpath(join(migrationRoot, 'tests/evals/skill-compression')))` — an assert that fires rather than self-satisfies on exactly one input, a `tests/evals/skill-compression/outputs` symlink resolving outside the retired tree, which is what separates it from the worktree-exclusion compare this spec labels a defensive no-op — the target anchored on `migrationRoot` too, and the same anchored value handed to `rmSync`. `lenientRealpath` opens with `resolve()`, which would anchor a bare relative literal on `process.cwd()` while the base is anchored on `migrationRoot`; run from a subdirectory those diverge. It fails closed rather than deleting wrongly, but `assertContained` resolves its candidate *against the base* for exactly this reason, where `migrationRoot` is `git rev-parse --show-toplevel` of the migration's own cwd — explicitly **not** `resolveMainRoot`, which this spec uses for the capture anchor: that returns the main repo root, so a migration run from a `.claude/worktrees/` checkout (this repository's normal mode) would containment-check, and delete, against the wrong tree before the call — bounded to the retired tree itself, not to `repoRoot`, which would admit every path in the repository and pass any future edit to the literal. The `applyExecPayload` mirror is close but not exact and both differences are stated: its `rmSync` is non-recursive on a single file where this one is `{ recursive: true }` on a tree, and `lenientRealpath` — unlike `lib/extensions/exec-payload.mjs:158::assertContained`, which refuses an unresolvable candidate — appends a missing remainder literally rather than refusing. That is safe here because `force: true` makes a nonexistent target a no-op and an existing symlink is resolved, but it is a divergence, not an equivalence. Each `git mv` and `git rm` — and the `git rev-parse --show-toplevel` that derives `migrationRoot` itself — runs as an `execFileSync` argv array with `shell: false` and `-C migrationRoot`, since git resolves pathspecs against the process cwd, leaving the same anchor divergence one door over from the one the `rmSync` compare just closed, this spec's own extension of the discipline the capture probes use — the intake list scopes it to the harness's *probes*, and these are one-time migration commands, so the requirement is stated here rather than borrowed,
mirroring `applyExecPayload`, whose delete target is a plan-validated relative
path under an asserted destination root (`lib/extensions/exec-payload.mjs:262-263`
rejects `''` and `..` at plan time; `:434-436` re-asserts containment over every
written path after the copy loop at `:424-432`). The literal is **not** `git rm -r
tests/evals/skill-compression`: `token-budget-eval/` is a child of that path and
is relocated rather than deleted, so a whole-tree `rm` would take ~54KB of live
coverage with it. Two constraints keep the delete inside its enumeration —
ordering and scope, and both are stated rather than left to care. Ordering:
`token-budget-eval/` moves to its new home and the destination is asserted to
exist **before** anything is removed, the same before-the-delete sequencing this
spec already pins for retargeting `rubric-legacy-scale.test.mjs`. Scope: the
removal names the six retired subpaths — `rubrics/`, `scenarios/`, `variants/`,
`run-eval.mjs`, `matrix-integrity.test.mjs`, and the untracked `outputs/` whose
`.gitignore` rule this migration deletes — so the command cannot reach the
preserved subtree even if the ordering were violated.
Its four `variants/` directories, its 4×3 matrix, `run-eval.mjs`,
`matrix-integrity.test.mjs`, the three scenarios and the three rubrics are all
removed, and the `eval:skill-compression` npm script with them. What the
compression matrix measured — does a compressed *prompt* still elicit the right
behaviour — is a question the disclosure-fidelity capability now answers with an
observed read trace rather than a regex over narration.

### The third consumer, and why it was missed

The deletion blast radius is **three** files, not two. Besides the two drivers,
`tests/lib/evals/rubric-legacy-scale.test.mjs:208` loads
`tests/evals/skill-compression/rubrics/plan.yaml` by literal path and asserts a
specific coded refusal. It lives in `tests/lib/`, the **default `npm test`
bucket**, so deleting the rubrics breaks this spec's own "`npm test` passes"
gate on every PR.

It was missed because the earlier draft asserted the wrong rejection code: a
search for consumers of `RUBRIC_LEGACY_SCALE` does not find a test named after
it that actually asserts `RUBRIC_NESTED_MAP`. Before the real files are deleted,
that test is retargeted at `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml`,
which already exists as a purpose-built synthetic stand-in.

Repo-wide references, enumerated from an actual `git grep` rather than assumed.
**Executing consumers** (three): `run-eval.mjs`, `matrix-integrity.test.mjs`, and
`tests/lib/evals/rubric-legacy-scale.test.mjs`. **Configuration**:
`package.json`'s `eval:skill-compression` script, and `.gitignore:43,45`.
**Prose and comments** that name the tree and go stale on removal (six):
`scripts/run-tests.mjs:92`, `lib/evals/rubric.mjs:33`,
`skills/eval/default-rubric.yaml:9,16`,
`tests/fixtures/evals/rubrics/legacy-weight-scale.yaml:2`, and the two relocated
suites' own usage docblocks —
`token-budget-eval.test.mjs:9` and `real-token-analysis.test.mjs:13`. **History**, which is
never rewritten: `CHANGELOG.md:1162` (release-please-generated, ADR-0008) and
four `.beads/issues.jsonl` records.

The earlier "Nothing else" was wrong in both directions — it missed six live
references and it implied history could be cleared.

## Structural Shape

### The Twelve Rubrics

Same table shape as the change-imminent tier. Element and criterion text is
authored at implementation time; this table fixes what each rubric is about.

**The `Kind` column is descriptive here.** In the change-imminent tier,
"detector" and "producer" happen to partition on whether a rubric cites a
catalog id. That correlation does not hold in this tier: `specify`, `plan`,
`write-test` and `brainstorm` write artifacts *and* detect defects while doing
so, which is exactly what makes them worth scoring. `RUBRIC_TWIN_UNCITED`
therefore applies tier-wide — any rubric citing a `PV` cites its `KC` — and the
change-imminent tier's "no producer or responder cites a catalog id" criterion is scoped to
that tier, not to this one.

> In the table's **Catalog classes cited** column, a class name stands for its
> `PV`/`KC` pair; a rubric's `source` carries the pair's *ids*
> (`skill-regression:PV-03`), which is what `CATALOG_UNRESOLVED_CITATION`
> resolves. No rubric cites a class name literally.

| Skill | Kind | Scored input | Catalog classes cited | Elements / criteria |
|---|---|---|---|---|
| `hygiene` | detector | the audit report and its checklists | `spec-code-drift`, `stale-spec-frontmatter`, `missing-issue-binding`, `orphan-source-file` | 9 / 5 |
| `validate` | detector | the PASS/FAIL report | `esm-violation`, `spec-code-drift` | 8 / 5 |
| `review-specs` | detector | the review + blockers sidecars | `charter-scope-escape` | 8 / 5 |
| `debug` | detector | the diagnosis and the fix diff | `spec-code-drift` | 8 / 4 |
| `route` | detector | the four-dimension routing table | `plan-task-without-test` | 7 / 3 |
| `specify` | producer | the written `.spec.md` | `charter-scope-escape` | 8 / 5 |
| `plan` | producer | the written `.plan.md` | `plan-task-without-test` | 8 / 4 |
| `write-test` | producer | the failing tests and the handoff block | `plan-task-without-test` | 7 / 4 |
| `brainstorm` | producer | the written charter | `charter-scope-escape` | 7 / 4 |
| `implement` | producer | the task diffs and per-task review records | — | 8 / 5 |
| `build` | orchestrator | the pipeline transcript and the artifacts each stage left | — | 7 / 3 |
| `work` | orchestrator | the classification and the skill it routed to | — | 7 / 3 |

Totals: 92 deterministic elements, 50 judged criteria. Every row meets the
tier's 7-element floor and sits inside the shared 3–6 judged range.

### The two orchestrators score routing, not artifacts

`build` and `work` do not produce an artifact of their own — they decide which
skill runs next and hand off. Scoring them on the artifacts their children
wrote would double-count those children's rubrics and, worse, would mark an
orchestrator `not_met` for a downstream skill's regression. Their rubrics
therefore assert on the **decision**: given a fixture state, did the skill
classify it correctly, pick the right next step, and refuse the steps whose
gates were not satisfied?

That last clause is what makes them worth scoring at all. `work` reading a
fixture whose `shipping-rates.jsonl` shows `specify` completed with no `review`
step — and no `plan` step to trigger the resume override — must route to
`/adev:review-specs`, and must route to neither `/adev:plan` (the review gate is unsatisfied) nor `/adev:implement` (no `plan` step, so the resume override does not fire despite `shipping-rates.plan.md` sitting on disk). The two refusals guard different branches, and the `/adev:implement` one is the branch the fixture was built to make decidable. The lifecycle log is
the load-bearing half, as the fixture spec states; the matching `review-pending`
frontmatter is the visible half but not what `work` routes on, and a rubric
element anchored on the frontmatter would pass against a log that says otherwise. Two fixture
artifacts make that decidable, and the fixture spec now ships both: the
`status:` frontmatter on `shipping-rates.spec.md`, and
`lifecycle-state/shipping-rates.jsonl` alongside the `create-order` one. The
catalog carries them as scaffolding rather than as ground truth.

### This is the first tier to score mutating skills

The change-imminent tier scores detectors and responders. Here the scored inputs
include diffs and commits: `implement` writes task diffs and commits them,
`debug` writes a fix diff, `validate` auto-fixes, `specify` / `plan` /
`brainstorm` write artifacts, and `build` chains all of them.

That makes the fixture's run model load-bearing rather than hygienic. A `debug`
or `validate` run that *does its job* repairs the planted `spec-code-drift` in
`shipping-rates.spec.md` or the `esm-violation` in `legacy-loader.js` —
destroying the ground truth every rubric in both tiers cites, and surfacing one
run later as a `CATALOG_ANCHOR_NOT_UNIQUE` failure whose message points nowhere
near its cause.

The fixture spec's guarantee is what prevents it, and its scope matters. Runs
execute against a temp-tree copy, and `tasks.db_path` is written into **the
copy's** manifest as the realpathed copy root, so `implement`'s issue writes and
`resolveStorageRoot`'s git-common-dir fallback both land inside the copy.

**The copy must be a git repository, not merely a directory.**
`tests/helpers.mjs::createTempDir()` performs no `git init`, so a copy made with
it is a non-repo directory and `implement`'s `git commit` resolves to whatever
repository git finds walking up from `tmpdir()` — an environment property, not a
bound. The copy is therefore built with `tests/helpers.mjs::createTempGitRepo()` in its
zero-argument form — a constraint the fixture spec owns and every tier inherits,
along with the `README.md` and initial commit that helper writes at the copy
root, which is harness-authored rather than fixture-shipped. The run asserts the
copy's `git rev-parse --show-toplevel` equals the realpathed copy root.

The post-run assertion is a repository-wide **before/after equality** on
`git status --porcelain --ignored=traditional --untracked-files=all` — no path filter, ignored paths
included — captured at **every root `git worktree list --porcelain` prints**,
never at a hardcoded pair, paired with a `git rev-parse HEAD` equality check at
each. That command is anchored at the real repository and run **before any chdir
into the copy** — `execFileSync("git", ["-C", resolveMainRoot(startCwd),
"worktree", "list", "--porcelain"])` — because `git worktree list` answers for
the repository containing its cwd. Run from inside the copy it prints exactly one
root, the copy, which the next paragraph excludes, leaving an empty root set and
an equality that passes vacuously: the same always-green shape this spec rejects
elsewhere, on the one assertion standing between twelve mutating skills and the
real `.context-index/`. The root set is therefore asserted non-empty and asserted
to contain `resolveMainRoot(startCwd)`, both sides through `lenientRealpath` for
the same reason the exclusion compare uses it — `resolveMainRoot` returns its
`git rev-parse` result un-realpathed, and on macOS `/var` and `/private/var` are
the same directory under two names. A hardcoded pair of git roots would be the weaker form the fixture spec rejects: `git status`
never descends into a nested git repository, so a sibling worktree under
`.claude/worktrees/` is invisible from the main root. Where a single root is
named instead, it is resolved by `lib/worktree.mjs::resolveMainRoot`, the repo's
existing mechanism, rather than left to the implementer. The run copy is
deliberately not a capture root — every skill this tier drives writes into it.
With the enumeration anchored at the main repository this clause is a defensive
no-op: a `git init` root is not a registered worktree of this repository, so the
copy never appears in the set. Should it ever be compared, the comparison is
`isContained(lenientRealpath(root), lenientRealpath(copyDir))` via
`lib/path-safety.mjs`, never a raw `startsWith` — on macOS `tmpdir()` is
`/var/folders/…` while git prints `/private/var/folders/…`, and a string compare
between them never matches. The captures are **in-memory only** and are never committed: they enumerate every ignored and untracked path across every checkout, which on a developer machine includes `.env*` files and local scratch. A mismatch is reported as the differing repo-relative paths, or their count — never the raw capture. The harness's own **capture and assertion** invocations — the `status`, `rev-parse HEAD`, `rev-parse --show-toplevel` and `worktree list` probes alike —
are `execFileSync` argv arrays with `-C` and `shell: false`, per the fixture
spec's argv paragraph, matching the discipline `lib/worktree.mjs` and
`lib/issues/resolve-root.mjs` already follow — the argv-array, no-shell half of it. Both pass `cwd` rather than `-C`; the `-C` form comes from the fixture spec's argv paragraph, not from those two modules. `createTempGitRepo` is not among
them — it is built from `execSync` shell strings, safe here only because the
zero-argument form passes no caller-supplied value into any of them. Equality rather
than emptiness because the ignored baseline is never empty in a clean tree — the
fixture spec owns the measurement and is the only place a magnitude belongs;
an emptiness gate would be red before any scenario ran. Each
piece closes a distinct hole: a plain status cannot see writes to
`.context-index/.execution-state.json` or `.context-index/lifecycle-state/*.json`
(both gitignored, and both exactly what `implement` and `build` write), and no
status of any kind can see a **commit**, which leaves the tree clean. A fixture-scoped assertion would check the one directory a run
cannot dirty once cwd is the copy, and would pass while a scenario wrote into the
real `.context-index/` or `.beads/`.

This tier adds no new mechanism; it is named here because this tier is the reason
the mechanism is required.

Scoring `validate` and `build` additionally executes the fixture's declared
quality gates. `lib/domains/merge-gates.mjs` already requires an argv list and
records an `INVALID_GATE` warning while dropping the gate on a shell string
(it does not throw — the warning keeps one malformed entry from aborting
`adev domain load-gates`), and the fixture spec's
`no-step-this-repo-would-spawn` property means the fixture declares no gate command at all —
so a `validate` scenario scores the report over an empty gate set, deliberately.

### Citing a catalog id outside its declared `covers_skills`

Exactly one row above cites a class outside its seeded `covers_skills`: the
`hygiene` rubric cites `orphan-source-file`, seeded for `codehealth` and
`repomap` only. (`missing-issue-binding` already lists `hygiene`, so that
citation needs nothing.) That is allowed, and it is
not free: **the citing change must extend the entry's `covers_skills` in the
same commit.** The field is the catalog's record of who depends on an entry,
and it is what tells a later author which rubrics they are about to break by
re-classing or deleting it, so it is a **predicate** rather than a convention:
`RUBRIC_COVERS_SKILLS_UNLISTED` below fails a rubric whose own `skill` is absent
from a cited entry's `covers_skills`. A citation that does not appear there is a
dependency nobody can see.

## Required Files

| Path | Layer | Created by |
|---|---|---|
| `tests/evals/skill-regression/rubrics/<skill>.yaml` × 12 | repo | this spec |
| `tests/evals/skill-regression/scenarios/<skill>.md` × 12 | repo | this spec |
| `tests/evals/skill-compression/` — `rubrics/`, `scenarios/`, `variants/`, `run-eval.mjs`, `matrix-integrity.test.mjs` | repo | this spec — **deleted** |
| `tests/evals/skill-compression/token-budget-eval/` → `tests/evals/token-optimization/token-budget-eval/` | repo | this spec — **relocated, not deleted**. `token-budget-eval.test.mjs` and `real-token-analysis.test.mjs` reference no rubric, variant, scenario, or `run-eval.mjs`: they assert SKILL.md conditional-loading structure and session-JSONL token accounting, neither of which the compression matrix produced. The retirement argument (disclosure fidelity replaces regex-over-narration) does not reach them, and deleting them would drop ~54KB of live coverage — including the progressive-disclosure assertions the charter's own dependency row names |
| `scripts/run-tests.mjs` | repo | this spec — **modified**, the docblock at `:92` cites "evals/skill-compression token-budget" as a rationale for the eval-bucket split and follows the relocation |
| `skills/eval/default-rubric.yaml` | repo | this spec — **modified**, its header comment at `:9,:16` cites the retired rubrics as the house pattern |
| `lib/evals/rubric.mjs` | repo | this spec — **modified**, the module docblock at `:33` names the skill-compression rubric *shape*, a bare-token grep hit rather than a path |
| `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml` | repo | this spec — **modified**, its comment at `:2` cites the retired rubrics |
| `.gitignore` | repo | this spec — **modified**: deletes the `:45` outputs rule — and, because that rule ignored an *untracked* generated directory, `tests/evals/skill-compression/outputs/` is removed as a sixth literal path in the same ordered step, so a machine that has run `eval:skill-compression` does not end up with previously-ignored output turning git-visible and falsifying both the tree-no-longer-exists criterion and the status baseline — and **edits** the `:43` comment to drop its `/ eval:skill-compression` clause. `:43` heads two rules; deleting it whole would orphan the surviving `tests/evals/repomap/*/` entry at `:44` |
| `.context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md` | repo | referenced, not modified — its token table carries the rows this tier's scenarios must satisfy. Four bear on this tier: three tier-wide with rejecting inputs landed there, and the `ADEV_NO_INFRA` env row, scoped by slug to this tier's `build` and `work` scenarios, whose rejecting input lands there too, against a synthetic fixture |
| `.context-index/evals/tier-b-<YYYY-MM-DD>-<NN>.md` | repo | referenced, not new — the convention lands with the change-imminent tier, whose pass writes the first one; this tier writes one per pass under it |
| `tests/evals/skill-regression/catalog.yaml` | repo | this spec — **modified** by minimal in-place text splice, never a load-mutate-reserialize round trip through `parseYaml` (the discipline `lib/extensions/governance-splice.mjs` exists to enforce, after a naive reserializer replaced seven checks and twenty comment lines in a real `validate.yaml`); the same applies to every comment-bearing YAML this spec amends. Adds `hygiene` to `orphan-source-file`'s `covers_skills` |
| `tests/evals/skill-regression/tiers.yaml` | repo | this spec — **modified**, amends `landed:` from `"change_imminent"` to `"change_imminent,core_lifecycle"`. Without this edit `RUBRIC_TIER_UNCOVERED` never reaches this tier's twelve slugs and the 23-slug coverage criterion is unsatisfiable |
| `tests/evals/token-optimization/token-budget-eval/{token-budget-eval,real-token-analysis}.test.mjs` | repo | this spec — **modified**, each carries its own old path in a usage docblock (`:9` and `:13`) that the relocation rewrites |
| `package.json` | repo | this spec (removes the `eval:skill-compression` script) |
| `tests/lib/evals/rubric-legacy-scale.test.mjs` | repo | this spec — **modified**, retargeted at the synthetic `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml` before the real rubrics are removed |
| `tests/lib/evals/rubric-coverage.test.mjs` | repo | this spec — **modified**, adds the three rules below |

No new manifest and no new test **file**: `tiers.yaml` and
`tests/lib/evals/rubric-coverage.test.mjs` are authored by the change-imminent
spec, which also scopes `RUBRIC_TIER_UNCOVERED` bucket-agnostically so this
tier's twelve slugs are covered by it. This tier fills those twelve files and
extends that existing test with the three rules below.

## Consumers

Identical to the change-imminent tier — and, like that tier's, two of the three
are **prerequisite-gated rather than live at v1**. `tests/lib/evals/rubric-coverage.test.mjs`
is the only consumer that fires on landing. `adev eval score` consumes a verdict
set that nothing produces yet, and `lib/evals/score.mjs` never reads an element's
`source`, so no source form resolves; `npm run test:evals` does not discover this
tier at all, which this spec's own Gates criterion states. Both wait on the
charter's CI-integration capability. No new CLI verb and no new library module —
this tier is rubric content for an engine that already shipped, and for a runner
that has not.

One consumer is **removed**, not repointed. `run-eval.mjs` and
`matrix-integrity.test.mjs` load the three legacy rubrics by path *and* by field
shape; repointing them at the new directory is the always-green failure the
retirement section describes. Both are deleted with the rest of the tree.

## Additional Conformance Rules

Every rule the shared contract declares applies unchanged — the count lives in that spec so it cannot drift here — including
`RUBRIC_TIER_UNCOVERED`, which that spec keys off `tiers.yaml`'s
`landed:` list, so this tier's twelve slugs are covered once this tier's own
change adds `core_lifecycle` to it. This tier adds three, enforced by the
same `tests/lib/evals/rubric-coverage.test.mjs`:

| Rule | Rejected when | Failure it prevents |
|---|---|---|
| `RUBRIC_CORE_ELEMENT_FLOOR` | a `core_lifecycle` rubric declares fewer than 7 `required_elements` | a high-blast-radius skill whose per-PR eval CI Tier B coverage is thinner than the tier promises |
| `RUBRIC_COVERS_SKILLS_UNLISTED` | a rubric cites `skill-regression:<id>` and its own `skill` is absent from that entry's `covers_skills` | a rubric/catalog dependency no later author can see before breaking it |
| `RUBRIC_LEGACY_SURVIVES` | a rubric file under `tests/evals/skill-regression/rubrics/` **or anywhere under `tests/evals/skill-compression/`** (the retired path, so a restored file is caught wherever it lands) carries a legacy marker — a `weight` key on a `quality_dimensions` entry (numeric *or* string, since `parseYaml` types only bare integers and the legacy `1.5` arrives as a string), a `match_pattern`, or a `scoring:` block | two rubrics for one skill, on two incompatible scales, with nothing saying which is current |

`RUBRIC_LEGACY_SURVIVES` matches on **shape within this charter's namespace**,
and both halves are load-bearing.

Shape rather than path, because a rule phrased as "no file may exist under
`tests/evals/skill-compression/rubrics/`" depends on a directory git does not
track once empty, leaving its ENOENT disposition undefined on a clean checkout.
Matching markers needs no directory to exist.

**Two rubric directories, not the whole of `tests/evals/`, and not the `rubric_id` namespace
either.** An earlier draft scoped the rule to rubrics whose `rubric_id` begins
`skill-regression-`. That over-corrected: none of the three legacy files declares
a `rubric_id` at all — which is exactly why `loadRubric` reaches
`RUBRIC_NESTED_MAP` and `RUBRIC_MISSING_KEY` — so a restored legacy file would
sit outside the namespace and the rule would stay silent on the one artifact it
exists to catch, making the re-introduction proof below unsatisfiable. The rule
does not traverse symlinks, and **reports** one rather than skipping it — yielding `RUBRIC_LEGACY_SURVIVES`, the same coded-refusal-not-a-skip posture the parse-tolerant scan already takes, since silently skipping a symlinked directory is how a restored legacy file would evade the rule whose whole threat model is restoration. The same rule the `.claude`/`.mcp.json` scan carries, and it matters here for the opposite reason: a symlink under the rubric root would pull files from outside this charter's namespace into a rule whose entire scoping argument is that it reaches nothing the charter does not own. It therefore enumerates two directory roots: the new rubric directory, and the retired path a
restored file would return to. A file that fails to parse, or that declares no `rubric_id`, is **in scope** —
legacy shape is the selector, not schema conformance. The vehicle matters and is
stated here rather than left to the implementer: the scan is a **parse-tolerant
marker scan over file text**, independent of `loadRubric`. Routing it through the
loader would defeat it, because `lib/evals/rubric.mjs` terminates a malformed
file at `RUBRIC_PARSE_ERROR` before any marker is inspected — so the rule would
silently never fire on precisely the adversarial input its acceptance criterion
names. An unparseable in-scope file yields `RUBRIC_LEGACY_SURVIVES`, a coded
refusal, never a skip and never an unrelated parse error.

Not "anywhere under `tests/evals/`", because that reach is not this charter's to
have. **21 rubric files already carry these markers** outside
`skill-compression/` — 6 each in `configurable-governance/`, `data-engineering/`
and `work-tracking/`, 2 in `integration-sandbox/`, 1 in
`worktree-parallelization/`. (The 4 under `comparison/` carry `weight` on a
`dimensions:` list, not `quality_dimensions`, so they fall outside this rule's
marker set entirely — a fourth legacy shape this charter does not name.) — and the charter's Out of Scope assigns
`data-engineering`'s rubric *content* to `eval-projects` by name, while the
`worktree-parallelization/rubrics/parallel-implement.yaml` belongs to that charter's `equivalence-eval.spec.md`, and the remaining fourteen are assigned to no charter — no case makes them this
charter's to gate. A repo-wide shape scan would go red on landing, in the gate this
spec's own "`npm test` passes" criterion depends on, and would conscript another
charter's files into this migration. The two-root scoping catches the failure that actually matters — "someone
restored the old file when the new one was inconvenient" — and reaches nothing
this charter does not own.

## System Constitution Reference

- **Principle 1, "Minimize external dependencies"** — Rubric content and
  scenario markdown only. No new module, no new verb, no new dependency.
- **Principle 2, "Skills are primarily markdown"** — The twelve skills being
  scored are markdown instructions, and what a rubric asserts about them is
  what they cause to happen on disk, not what their prose says. Every
  deterministic element therefore reads an artifact or an output span, never
  the SKILL.md itself.
- **Architecture boundary, "Requires Human Approval: adding new skills to the
  lifecycle order"** — This tier scores the lifecycle order as it stands and
  changes none of it. `work` and `build` rubrics assert the *existing* routing,
  so a rubric that would require reordering is a signal to stop and escalate,
  not to edit the order. The reverse direction needs stating too: when a
  lifecycle reordering **is** human-approved, those two rubrics go red, and a
  red rubric is indistinguishable from a regression. An approved order change
  therefore carries a same-change update to both with a `version` bump, and
  their post-reorder red verdict is expected output of the approval rather than
  a finding — the same same-commit discipline this spec imposes on
  `covers_skills`, applied to the other direction of the dependency.
- **Charter invariant, "A numeric aggregate is never reported without its
  verdict table"** — These twelve rubrics are the ones most likely to be
  quoted as a single number in a status report. The aggregate exists for trend
  tracking; the verdict table is the result.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Detector rubrics + scenarios (5) | `hygiene`, `validate`, `review-specs`, `debug`, `route` — the five that cite catalog ids and need both twins | large |
| Producer rubrics + scenarios (5) | `specify`, `plan`, `write-test`, `brainstorm`, `implement` | large |
| Orchestrator rubrics + scenarios (2) | `build`, `work` — routing-decision assertions against fixture lifecycle state | medium |
| Legacy migration | Re-author `brainstorm`, `plan`, `specify` against the shared contract; retarget `rubric-legacy-scale.test.mjs` at the synthetic fixture; **delete** the `tests/evals/skill-compression/` tree except `token-budget-eval/`, which relocates; remove the `eval:skill-compression` script, delete the `.gitignore` outputs rule and edit its shared comment; update the six prose references | large |
| Three additional conformance rules | Extend `tests/lib/evals/rubric-coverage.test.mjs` with `RUBRIC_CORE_ELEMENT_FLOOR`, `RUBRIC_COVERS_SKILLS_UNLISTED`, and `RUBRIC_LEGACY_SURVIVES`, each with a rejecting input | small |
| `landed:` amendment | Add `core_lifecycle` to `tiers.yaml`'s `landed:` scalar in the same change that adds the twelve rubrics, so the coverage rule reaches them | small |
| `covers_skills` extension | Add `hygiene` to `orphan-source-file`'s `covers_skills` in the fixture catalog — the one entry this tier cites beyond its seeded list | small |

## Acceptance Criteria

**Artifact shape**

- [ ] All 12 `rubrics/<skill>.yaml` and all 12 `scenarios/<skill>.md` exist, one per slug in `tiers.yaml`'s `core_lifecycle`.
- [ ] Every rubric loads through `lib/evals/rubric.mjs::loadRubric` without error and satisfies the shared contract in `rubric-set-change-imminent.spec.md`.
- [ ] Every rubric declares at least 7 `required_elements` and between 3 and 6 `quality_dimensions`.
- [ ] This spec restates no part of the shared contract except the two values Difference 2 overrides, quoted only to state the delta — verified by review, since a copy is what the reference exists to prevent.

**Reference anchoring**

> A `reference` **is** read by shipped code — `lib/evals/rubric-schema.mjs:77`
> lists it in `REQUIRED_CRITERION_FIELDS`, so `loadRubric` refuses a criterion
> without one, and `lib/evals/score.mjs::buildJudgeContext` copies it verbatim
> into the judge context. What no rule validates is the value's **target**: no
> conformance rule resolves a `reference` string to a file, the shared contract's
> path rules covering `artifact:` and `scenario` only. A path-shaped rule would be
> wrong and is deliberately **not** proposed: the change-imminent tier mandates
> `reference` values that are not paths at all — `ELEMENT_VERDICTS` /
> `CRITERION_VERDICTS` in `rubric-schema.mjs`, `HALF_STATUSES` in
> `score-schema.mjs`, the rendered score-report table in `lib/cli/eval.mjs` — and
> `rubric-coverage.test.mjs` is the shared host, so such a rule would fail that
> tier's already-authored rubrics. The unvalidated target is an accepted v1
> limit; any rule constraining `reference` belongs in the spec that owns the
> shared contract, with a pattern admitting the symbol and contract forms it
> already prescribes. So a `reference` naming a
> moved or deleted spec is not inert — it reaches the judge prompt intact and
> degrades the judgement silently. Stated rather than left to be discovered, since
> this tier is the only one making the anchoring claim.

- [ ] Every judged criterion's `reference` names the skill's SKILL.md, its governing spec, or a named repository contract — never "current output" and never an unanchored standard.
- [ ] Where a rubric's assertion and the skill's current behaviour disagree, the rubric follows the spec and the disagreement is filed as an issue whose id the rubric records in a `spec_behaviour_gap_issue` key matching `^[a-z][a-z0-9-]*-[0-9a-z]+$`, validated by the shared `RUBRIC_EXCEPTION_ID_MALFORMED` rule, which the change-imminent tier defines over both issue-id keys. Not a YAML comment: `parseYaml` discards comments, so no check could read one back — and an unread key would be no better, which is why the id has a pattern and a rule rather than only a convention. **Shape is the only guarantee at v1**, exactly as the sibling records for `baseline_exception_issue`: nothing resolves the id against the board, so a rubric may name a closed or nonexistent issue and stay green.

**Orchestrators**

- [ ] The `work` and `build` rubrics assert on routing decisions and cite no artifact a downstream skill wrote.
- [ ] The `work` rubric asserts at least one *refusal*: a next step the fixture's lifecycle state makes ineligible, which the skill must not take.

**Catalog citations**

- [ ] Every cited `skill-regression:<id>` resolves in `catalog.yaml`, and every `PV` citation is accompanied by its `KC` twin.
- [ ] Every catalog entry cited by this tier lists the citing skill in its `covers_skills`.

**Migration**

- [ ] `tests/evals/skill-compression/` no longer exists; `tests/evals/token-optimization/token-budget-eval/` does, with both its suites passing under `npm run test:evals`; and `package.json` declares no `eval:skill-compression` script.
- [ ] `tests/lib/evals/rubric-legacy-scale.test.mjs` is retargeted at `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml` **before** the real rubrics are removed, and `npm test` is green at every step of the migration — not only at its end.
- [ ] `git grep -n 'skill-compression'` — the bare token, not the path prefix, since `scripts/run-tests.mjs:92` and `.gitignore:43` name it without one — returns no hit outside `.context-index/`, `CHANGELOG.md`, and `.beads/` — the three history-bearing paths this migration must not rewrite. Every remaining reference in the enumeration above is cleared, and each is listed in Required Files as modified.
- [ ] Every migrated rubric **loads through `loadRubric` without error** and declares no numeric `weight`, no `match_pattern`, and no `scoring:` block. Stated positively on purpose: "raises `RUBRIC_LEGACY_SCALE` on none of them" is satisfied by a rubric rejected for an entirely different reason, and would certify nothing.
- [ ] The migration is proven by re-introduction, not only by a green run: restoring one legacy file makes `RUBRIC_LEGACY_SURVIVES` fail, and the test is confirmed red before the file is removed again.

**Coverage check**

- [ ] `RUBRIC_CORE_ELEMENT_FLOOR`, `RUBRIC_COVERS_SKILLS_UNLISTED`, and `RUBRIC_LEGACY_SURVIVES` are each proven by a deliberately broken input asserting the named code.
- [ ] `RUBRIC_EXCEPTION_ID_MALFORMED` — owned by the change-imminent tier but covering this tier's `spec_behaviour_gap_issue` — has a rejecting input on **this** key as well as on `baseline_exception_issue`. Both land with the sibling, which owns the rule and the host file; recorded here as an inherited obligation because a rule with one branch proven and one unproven can stop matching on the unproven branch without going red.
- [ ] `RUBRIC_COVERS_SKILLS_UNLISTED` fires on the `hygiene`/`orphan-source-file` citation until the fixture catalog is extended, and passes after — the one extension this tier needs, proven in both directions.
- [ ] `RUBRIC_LEGACY_SURVIVES` matches on legacy *shape* within its two enumerated roots — `tests/evals/skill-regression/rubrics/` and anywhere under `tests/evals/skill-compression/` — treating a file with no `rubric_id`, or one that fails to parse, as **in scope**; passes on a clean checkout where the retired directory does not exist, and — proven explicitly — does **not** fire on the 21 legacy-shaped rubrics under `configurable-governance/`, `data-engineering/`, `integration-sandbox/`, `work-tracking/` and `worktree-parallelization/`, which this charter does not own. (Only the six under `data-engineering/` are charter-assigned to `eval-projects` by name; fourteen are assigned to no charter at all, and `worktree-parallelization/rubrics/parallel-implement.yaml` belongs to the `worktree-parallelization` charter's `equivalence-eval.spec.md` — either way, not this one's to gate.)
- [ ] With both tiers landed, `RUBRIC_TIER_UNCOVERED` — scoped bucket-agnostically by the change-imminent spec — fails if any of the 23 slugs in `change_imminent` or `core_lifecycle` lacks a rubric file. Proven by removing one core-lifecycle rubric and confirming red.

**Gates**

> **What checks these, at v1** — the same split the change-imminent tier
> declares, and for the same reason: this tier ships twelve rubrics, twelve
> scenarios and no runner, and `rubric-coverage.test.mjs` is a static conformance
> test with no run copy, no cwd and no server. Every criterion here that
> describes a runtime assertion is split in two — the **scenario file must state
> the step**, checked by `RUBRIC_SCENARIO_STEP_MISSING` over the required
> tokens, and the **operator performs the assertion** during the manual Tier B
> pass, with the automated form handed to the CI-integration capability.
>
> **The sweep's halt contract**, stated once here and referenced rather than
> restated by the criteria below: a tripped per-scenario predicate — either the
> `infra_requirements:` scan or the `.claude`/`.mcp.json` scan — **halts the
> sweep**; a halt writes **no** Tier B record; a halted run **retains** the copy
> for out-of-band inspection. A failed capture comparison is the same shape: no
> record, and the mismatch reported to the operator console rather than into the
> record. None of this has static backing at v1 — it is operator discipline
> until the CI-integration capability lands, and that is the honest state rather
> than a checker that cannot fail. Four rows of the shared table bear on **the halt contract** below — every-scenario rows apply to this tier's twelve scenario files exactly as they do to the sibling's eleven — and on this
> tier: three tier-wide — `no infra_requirements: in the copy`, `no .claude/ or
> .mcp.json anywhere under <copy-root>`, and `git status and rev-parse HEAD equality at every
> worktree root` — plus `ADEV_NO_INFRA=1 in the step's own env`, scoped by slug to
> this tier's `build` and `work` scenarios. Every one of their rejecting inputs
> lands with the sibling, the env row's against a synthetic fixture: the
> invariant is that rejecting inputs land with the spec that owns the table. The table is the
> shared contract and lives in `rubric-set-change-imminent.spec.md`, so this tier
> does not widen it silently: the rows live **there**, and this tier owes no rejecting
> inputs; its obligation is that its twelve scenarios carry the literals. Without
> the split these criteria are green on landing with nothing having executed
> them.

- [ ] All twelve scenario files carry the cwd-and-containment contract the change-imminent tier states universally — this tier inherits it rather than restating it, and every one of these twelve is a project-relative writer (`implement` → `.context-index/` and `src/`, `hygiene` → `.context-index/hygiene/`, `validate` and `debug` → reports and fix diffs, `specify`/`plan`/`brainstorm` → spec, plan and charter files, `build` → all of them chained).
- [ ] No markdown **anywhere under the run copy** carries an `infra_requirements:` key, asserted **before and after each scenario** — the same per-scenario form as the `.claude`/`.mcp.json` predicate below, and for the same reason. A single pre-first-scenario check covers a strict subset of the window: `specify`, `plan` and `brainstorm` write `.spec.md` and `.plan.md` into the copy, and `write-test`, `implement`, `validate` and `debug` then run `adev preflight run` against exactly those files, so the scenario-authored spec is the vector, not the fixture-shipped one. Belt and braces at the consumer too, with one constraint the obvious form violates: `skills/validate/SKILL.md:55,87` (and `skills/eval/SKILL.md:35`) state that **the agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously**, and Difference 1 anchors this tier's `reference` on those same SKILL.mds — so a scenario instructing the scored skill to pass the flag would put the run in violation of the contract its own rubric scores against. The bypass is therefore an **operator** act, not an agent one: the operator passes `ADEV_NO_INFRA=1` **per invocation** — in the scenario command's own `env`, not as a shell `export`. `exec-consent.mjs` states consent is per-install and never persisted; a shell export is the opposite shape, inherited by every later subprocess in that terminal (including `build`'s own propagation) and surviving the sweep with nothing to unset it. The bypass direction is safe — it suppresses an unconsented `execFileSync` rather than enabling one — but a one-time decision should not be cached across invocations, which covers both doors — the flag on an operator-invoked step, and the skill-internal `adev preflight run` calls in `debug`, `implement` and `write-test`, which a flag on the scenario's own step would not reach. The export itself carries no file-half token and is unbacked, deliberately: the primary door is the `no infra_requirements: in the copy` predicate, which *is* tokenized and asserted before and after each scenario, leaving preflight nothing to probe. The export is belt-and-braces on a door already closed — **except for the orchestrator scenarios**, where the primacy inverts and saying so is the honest form: `build --full` chains `specify` → `review` → `plan` → `route` → `implement` → `validate` inside one scenario — and the `build` scenario invokes `--full` precisely so it does: the default Implement Pipeline (`plan → route → implement → validate`) writes no spec mid-scenario, so the vector this criterion rests on would not exist, so the spec-writing step and the `adev preflight run` that consumes it both sit *between* the before-check and the after-check. For `build` and `work` the env form is primary and the predicate secondary, and those two scenario files carry the shared table's `ADEV_NO_INFRA=1 in the step's own env` row — hosted there, like every other token, so `RUBRIC_SCENARIO_STEP_MISSING` backs the half that actually covers that window. The fixture spec bans the field at the source; this tier is where the exposure widens — it drives `implement`, `validate`, `debug` and `write-test`, four of the six skills whose early `adev preflight run` step reaches `executeProbe`'s `execFileSync` with no consent gate — so a fixture regression must go red here too, not only there.
- [ ] No `.claude/` directory and no `.mcp.json` exists **anywhere under the run copy, at any depth**, before and after each scenario — not only in the committed fixture, and not scoped to a `project/` prefix. The prefix is right in the fixture spec, where it is a static assertion over a committed tree whose `fixture_root` is `project/`; it stops being right here, because this tier copies those contents *flat* into a git root and asserts `git rev-parse --show-toplevel` equals the copy root. The copy root is what the agent runtime resolves as the project root for project-scoped settings and MCP servers, so a `.claude/settings.json` written there satisfies a `project/`-scoped predicate while opening exactly the door the criterion closes — and nothing else catches it, since the copy is deliberately excluded from the capture roots. Matches the scope the `infra_requirements:` criterion above already uses. This tier is not the first to write into the copy, nor the first to carry the per-scenario before-and-after predicate — the shared token table scopes both door rows to every scenario, so the change-imminent tier carries them too. Nor is the *after* half novel to this tier — the fixture spec pins one copy per scenario, so the surviving-surface hazard is intra-scenario and both tiers face it. What this tier does bring is volume and irreversibility: its runs **commit and produce diffs**, and its orchestrators chain several skills inside a single scenario, so the window between the before- and after-check is widest here, and the agent runtime loads a project-level hooks block or MCP server from the scenario working directory — so a run that creates one grants a later **step inside the same scenario** an unprompted execution surface — the orchestrator window this tier widens, since the copy itself is discarded before the next scenario. A static source-side assertion cannot see that; this is a per-scenario predicate. A trip of **either** per-scenario predicate — this one or the `infra_requirements:` scan above — **halts the sweep** rather than being recorded while the remaining scenarios run. A failed **capture comparison** — a `git status` mismatch or a `HEAD` inequality at any root — writes no record either, for the reason the halt path already gives: a committed record asserting a pass over a run that escaped into the real `.context-index/` is worse than none, and other tooling and other humans read it. The mismatch itself is reported to the operator console as differing repo-relative paths, never into the record. A halted sweep likewise writes **no** Tier B record — a partial record read as a completed pass is worse than none — and the copy is **retained** for inspection rather than torn down, since the tripped predicate is the evidence — inspected **out-of-band**, by reading its paths, never by entering it as a cwd under an agent runtime, which would be the exploitation path the halt exists to prevent. Once the finding is recorded the offending `.claude/` or `.mcp.json` is neutralised or the copy discarded — and the neutralisation is the one operation here that removes bytes from a tree twelve mutating skills just wrote into, so it carries the containment the defensive compare above already models: `isContained(lenientRealpath(hit), lenientRealpath(copyDir))` before the delete, and the scan does not traverse symlinks. A scored skill writing `copy/x → /somewhere/.claude` would otherwise yield a hit whose neutralisation lands outside the copy; a symlinked hit is reported, never followed. The halt itself has no static backing and is stated as such: the shared token table verifies that a scenario *states* each predicate, not that a trip halts — that is operator discipline at v1, and it passes to the CI-integration capability with the automated forms — the stated hazard is that a later step in the same scenario inherits the surface, and that the escape's blast radius is not yet known — continuing past the trip is what turns a caught escape into an exploited one, and the copy must survive as evidence rather than be torn down by the next scenario's setup.
- [ ] `npm test` passes at **every step** of the migration, not only at its end — the retarget lands before the deletion.
- [ ] `npm run test:evals` passes at the step **immediately after** the deletion, not only at migration end. `npm test` does not reach the `tests/evals/` bucket, so it cannot observe a relocation that dropped `token-budget-eval/`'s two suites.
- [ ] Across a full scenario run, `git status --porcelain --ignored=traditional --untracked-files=all` is byte-identical before and after at **every root `git worktree list --porcelain` prints** — not a hardcoded pair — and `git rev-parse HEAD` is unchanged at each. A plain, un-ignored, cwd-scoped, emptiness-based check fails on all four counts: it cannot see execution-state writes, cannot see a commit, misses every sibling worktree under `.claude/worktrees/`, and is red before any run.
- [ ] The scenario copy is a git repository built with `createTempGitRepo()`, and its `git rev-parse --show-toplevel` equals the realpathed copy root.
- [ ] The Tier B sweep is wired to no automated or scheduled trigger while the CI-integration capability has not supplied the automated halt. The halt is operator discipline at v1 and the stated hazard is a surface created mid-run being inherited by a later step of the same scenario, so an automated sweep without an automated halt is the unsafe combination — the Tier C gate below is the model, and Tier B needs the counterpart rather than resting on a description of current practice.
- [ ] Tier C is wired into no scheduled or CI trigger while the charter's budget-threshold capability is unlanded. **Vacuously true on landing** — Tier C is wired nowhere, so nothing goes red if a schedule is added later; enforcement is handed whole to the CI-integration capability, with no interim checker, and that is recorded rather than implied by a criterion that cannot fail. A nightly is unattended by construction, so the observed-not-governed cost posture is only safe while the pass does not run unattended at all; this pins the precondition where the other gates are rather than leaving it in Open Questions.
- [ ] The eval CI Tier B deterministic pass is run by hand, per the change-imminent spec's "Who executes a scenario", and its result is written to `.context-index/evals/tier-b-<YYYY-MM-DD>-01.md` — the ordinal is present from the first report of the day, never added only on collision — a **tracked, committed** artifact. Two properties keep that write from breaking the gate two rows above and from becoming write-only state. **When**: the write happens *after* the post-run capture is taken and compared — outside the before/after window — and is committed, so the next run's before-capture starts from a clean tree. Written inside the window it would redden the one gate standing between twelve mutating skills and the real `.context-index/`, and `.gitignore` would not save it: the capture enumerates ignored paths file-by-file. **Static backing**: none, like the halt above — a once-per-pass write has no per-scenario token to hang on, and that is stated rather than left as an asymmetry between the two operator obligations in the same block. **What it carries**: element and criterion **ids and verdict values only**. Not evidence: `lib/evals/score.mjs`'s `assertVerdictSetValid` — a module-private pass of the exported `scoreRubric` — refuses a `met`/`not_met` verdict with empty `evidence` (`SCORE_EMPTY_EVIDENCE`) and `buildVerdictTable` carries it into the result, and for `artifact:` elements that evidence is a span quoted out of files the twelve mutating skills wrote inside the copy — agent-authored text, which must not land verbatim in a git-tracked project file. Tier B runs no judge, so no *model* output reaches the record either; both exclusions are stated because only one of them is obvious. **Collision and discovery**: per the convention the change-imminent tier defines — every same-day report suffixed from `-01`, an existence pre-check plus `{flag: 'wx'}` refusing a collision rather than overwriting, and readers globbing `tier-b-*.md` in name order. The successor-name rule and its bound live with that convention, in the sibling, so a deterministic rule lands with the definition rather than here — this tier registers the record on the CI-integration intake list, and handing a human-resolved retry to a consumer that has no human is what that bound exists to prevent. Cited, not restated: this spec's own rule is that shared contract is declared once. **Who reads it**: the operator of the *next* pass, who needs the previous verdicts to tell a new regression from a known one, and the CI-integration capability, which replaces the manual pass and inherits its history — registered by name on the intake list the change-imminent tier declares ("What the CI-integration capability inherits") rather than only here. No criterion asserts `npm run test:evals` discovers this tier until the CI-integration capability lands.
- [ ] No constitutional violations introduced.

## Open Questions

- **Cost of a full Tier C run is not yet known and is not bounded here.** With
  both tiers landed, one nightly judged pass is a projected 86 judge dispatches — a projection, not a pinned contract, since only the floors are enforced (`RUBRIC_CORE_ELEMENT_FLOOR` >= 7 elements here, 3-6 criteria via the shared rule), putting the enforced envelope at 36-72 for this tier and 33-66 for the sibling (36 from
  the change-imminent tier, 50 from this one), one per criterion, plus the
  runs that produce their inputs. The charter's "Budget thresholds as failing
  verdicts" capability is what will price and bound that, and it is a separate
  v1 capability with no spec yet. Until it lands, the nightly's cost is
  observed rather than governed. This blocks neither tier from being authored,
  but it is a **precondition**, not a recommendation: Tier C is not enabled in CI until the budget-threshold capability lands. A nightly is unattended by construction, so the interim posture — cost observed rather than governed — is only safe while the pass does not run unattended at all rather than
  after the first invoice.
