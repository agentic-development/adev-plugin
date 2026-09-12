<!-- partial_schema: plan@1 -->

# Implementation Plan: Governance Opt-In Dispatch

> **Methodology:** adev
> **Charter:** cross-cutting — spec `affects: [setup, review, reviewer-domain-fit, validation]`.
> No capability row in any of the four charters names this work directly (it hardens an
> existing scaffold/dispatch contract rather than adding a new user-facing capability); Task 8
> corrects the one capability description ("Bundled defaults preservation", `review/charter.md`)
> that this plan makes false. `.context-index/specs/features/setup/charter.md`,
> `.../review/charter.md`, `.../validation/charter.md`, `.../reviewer-domain-fit/charter.md`.
> **Spec:** `.context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md` (revision 2,
> status `review-passed`)
> **Review:** PASS_WITH_NOTES (2026-09-09) — revision 2, re-reviewed fresh after a revision-1
> BLOCK; zero blockers across 4 reviewers, 6 warnings, 17 suggestions.
> **Platform:** JavaScript (ESM, `.mjs`), Node.js built-ins only, npm, `node:test`

**Goal:** Make `governance/review.yaml` and `governance/validate.yaml` scaffold from an explicit
operator selection instead of an unconditional full-bundle copy (`validate.yaml`) or silent
zero-reviewer default (`review.yaml`), and make an empty resulting selection visible — never
silent — at `/adev:review-specs` and `/adev:validate` run time.

**Architecture:** No loader changes: `lib/governance/review-config.mjs` and
`lib/governance/validate-config.mjs` already read only the project's own file (single-source,
unchanged). What changes is upstream, at `/adev:init` Step 7c/7d, plus two standing-warning
checks at the consumer skills. The scaffold-time write for both files converges on one new,
shared write path (Task 2) built on `spliceRegistryEntries`
(`lib/extensions/governance-splice.mjs`) — the same non-destructive mechanism
`lib/governance/materialize.mjs` already uses for this class of file — because
`spliceRegistryEntries` is a no-op on zero entries and therefore cannot, by itself, produce
BEH-2/BEH-3's required literal `checks: []` / `reviewers: []`; the new module adds that one
missing case as a plain, header-preceded literal write, never a re-serialize of existing bytes
(there are none to lose — the guard this task adds refuses to run against a file that already
exists). Risk tier overlays (Task 7) shift their baseline from the full domain bundle to this
same operator selection.

---

## Design Decisions of Record

Made autonomously under `AUTO: true` (per pipeline instruction: make the most conservative,
spec-consistent choice and continue rather than block). Each names the alternatives and why the
conservative reading was taken. A human should audit these before Task 1 is committed, since
Task 1 writes DDR-1 into the spec as normative text, closing the spec's own open Coverage Gap.

**DDR-1 — Coverage Gap: UI placement is "enhance in place at Step 7c.3/7d.1", not "combine at
Step 7.0".** The spec leaves this open, naming both options as compatible with its behavioral
contract. **Chosen: enhance in place.** Step 7.0 exists for a *different*, already-orthogonal
axis — risk tier — and the spec's own text stresses the orthogonality ("The two axes are
orthogonal: any domain can be any tier"). Folding a per-reviewer/per-check inclusion checklist
into the risk-tier prompt would conflate two independent decisions into one screen the operator
has to parse at once. Step 7c.3 already runs a customization prompt over the bundled reviewer
list (`[d]`/`[c]`/`[p]`/`[s]`) and Step 7d.1 already runs a checklist-style quality-gate proposal
(`Detected stack: Node.js. Propose these quality-gates: [ ] npm test ...`) — enhancing those
existing surfaces to ask *inclusion* first, then the existing per-item options, is the smaller
change and reuses a UI shape the operator has already seen in the same wizard, rather than
inventing a second one. This is Integration Point 3's own framing for Step 7c ("this spec does
not require inventing a second customization surface, only changing its starting state"); this
DDR extends the same reasoning to Step 7d.

**DDR-2 — a new shared CLI verb is required; the spec's own text does not name one.** BEH-1
requires the write to "reuse `spliceRegistryEntries` ... never a bare re-serialize", and the
constitution's cli-driver-surface rule forbids a skill from calling a `lib/` function directly —
skills name an `adev <verb>`. No existing verb fits: `adev governance materialize` computes its
effective set by merging the domain overlay over the project file (`lib/governance/materialize.mjs`
Rule 1), which is the opposite of what Step 7c/7d need — writing the *operator's own selected
subset* of an already-resolved bundle, chosen interactively, not a merge. **Chosen:** add
`adev governance scaffold --registry <review|validate> --entries <json|@path>` (Task 2), a new
sub-verb in `lib/cli/governance.mjs` backed by a new `lib/governance/registry-scaffold.mjs`. This
is new surface area beyond the spec's literal task sketch (which described the write only in
terms of the existing `spliceRegistryEntries` function) but is required to keep `/adev:init`'s
prose non-executable, per CLAUDE.md's Anti-Patterns list. Reuses `resolveRegistryTarget` from
`lib/governance/materialize.mjs` (already exported) for the same symlink-safe containment check,
rather than re-deriving it.

**DDR-3 — the zero-entries write is a literal, not a splice, and this does not violate BEH-1.**
`spliceRegistryEntries(rawText, rootKey, [])` returns its input unchanged by contract (`if
(newEntries.length === 0) return { text: fileAbsent ? '' : rawText, insertedAt: null }` —
`lib/extensions/governance-splice.mjs:106`), so it cannot itself produce BEH-2/BEH-3's required
`checks: []` / `reviewers: []`. The new module (Task 2) special-cases `entries.length === 0`
with a direct literal write (`<rootKey>: []` plus a one-line provenance header matching
`spliceRegistryEntries`'s own header convention). This is not the re-serialize BEH-1 rules out:
that concern is about losing bytes from a file that **already has content**, and Task 2's guard
(below) refuses to run against a file that already exists — the zero-entries path only ever
writes a **fresh** file, so there is nothing on disk to lose.

**DDR-4 — the scaffold verb refuses to run against an existing file (`GOVERNANCE_SCAFFOLD_EXISTS`),
rather than silently no-op'ing.** Step 7d.0's existing idempotency guard ("if
`governance/validate.yaml` already exists: no-op, skip overlay re-write" — sub-step 5) is the
skill's own responsibility to check *before* calling the verb, per BEH-1's closing sentence
("Step 7d.0 sub-step 5's existing idempotency guard ... is preserved unchanged under this
rework"). Making the verb itself refuse on an existing file is a second, independent safety net
against a skill-prose bug calling it when it should not — cheap to add, and it turns a silent
skip (which would look identical to a successful write in a transcript) into a loud, named
error the operator's own `/adev:init` invocation must not swallow silently.

**DDR-5 — the standing-warning surface also prints in `/adev:init`'s own Step 7 summary, not only
at `/adev:review-specs`/`/adev:validate` run time.** The spec leaves this open ("whether it also
appears in `/adev:init`'s own summary ... is left to planning"). **Chosen: yes, print it there
too**, phrased identically to the run-time warning's first clause. Conservative reading: more
visibility, not less, is the direction "never silent" points in, and the Step 7 summary already
prints an analogous standing line for risk tier (`Risk tier: standard (manifest.yaml: risk_tier)`)
— adding one more line for an empty selection matches the section's existing shape rather than
inventing a new one.

**DDR-6 — warning wording.** Not specified by the spec ("precise message text ... is left to
planning"). Adopted, for both skills:
`⚠ No <reviewers|checks> are configured for this project — /adev:<review-specs|validate> will
dispatch zero <reviewers|checks>. Run /adev:init to configure governance/<review|validate>.yaml,
or this is expected if the project intentionally selected none.` The trailing clause matters:
BEH-2/BEH-3 make "selected nothing" a legitimate, deliberate state, and a warning that reads as
pure alarm for a state the operator chose on purpose would train operators to ignore it.

**DDR-7 — `writeRegistrySelection` creates `.context-index/governance/` itself, departing from
`lib/governance/materialize.mjs`'s assumption that the directory already exists.** Reviewer
finding (revision 1 of this plan): `materialize.mjs` contains no `mkdirSync` at all — it assumes
Step 7a already created `.context-index/governance/`, which holds for every real
`/adev:init` invocation (7a always runs before 7c/7d in the fixed sub-step order) but does not
hold for a unit test building a bare temp dir, and would not hold for any future caller that
invokes Step 7c/7d's write path without Step 7a's side effect. **Chosen:** `writeRegistrySelection`
calls `mkdirSync(dirname(absPath), { recursive: true })` before checking `existsSync`/writing,
making the function self-contained rather than silently dependent on an undocumented invocation
order. This is a deliberate divergence from `materialize.mjs`'s posture, not an oversight — it is
recorded here so a later reader comparing the two modules does not "fix" the difference away.

---

## File Structure

**Create:**
- `tests/specs/governance-opt-in-dispatch-contract.test.mjs` — content-assertion tests pinning the spec-text edits (Task 1's Coverage Gap closure, Task 9's risk-tier-bundles reconciliation)
- `lib/governance/registry-scaffold.mjs` — shared explicit-selection write path (splice-or-empty-literal, optional marker) backing the new CLI verb
- `tests/governance/registry-scaffold.test.mjs` — unit tests for the new module (empty-write, non-empty splice, existing-file refusal, marker-only-for-review)
- `tests/cli/governance-scaffold.test.mjs` — CLI-surface tests for `adev governance scaffold`
- `tests/skills/init-governance-explicit-selection.test.mjs` — content-assertion tests pinning Step 7c/7d.0's reworked prose (BEH-1, BEH-2, BEH-3)
- `tests/skills/review-specs-zero-reviewers-warning.test.mjs` — content-assertion test pinning the Step 3 standing-warning addition (BEH-4)
- `tests/skills/validate-zero-checks-warning.test.mjs` — content-assertion test pinning the preflight standing-warning addition (BEH-5)
- `tests/skills/init-risk-tier-overlay-baseline.test.mjs` — content-assertion test pinning Step 7c.0/7d.0's baseline-source correction and warning surfacing (BEH-6)
- `tests/cross-skill/governance-opt-in-handoff.test.mjs` — behavioral test: scaffold a project via the new verb with a partial selection, then assert `loadReviewConfig`/`loadValidateConfig` see exactly that selection and the two skills' warning conditions fire correctly on an empty one (BEH-7)

**Modify:**
- `.context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md` — close the Coverage Gap (DDR-1), bump `revision` to 3
- `skills/init/SKILL.md` — Step 7 intro (stale claims), Step 7c (explicit reviewer selection + BEH-3 zero-write), Step 7d.0 (explicit check selection + BEH-1/BEH-2), Step 7c.0/7d.0 (BEH-6 baseline + warning surfacing), Step 7 summary (DDR-5)
- `lib/cli/governance.mjs` — new `scaffold` sub-verb, `help()` text
- `skills/review-specs/SKILL.md` — Step 3, standing-warning check (BEH-4)
- `skills/validate/SKILL.md` — preflight section, standing-warning check softening `MISSING_VALIDATE_CONFIG` for the exists-but-empty case only (BEH-5)
- `docs/governance.md` — lines 22, 37, 645 (stale "bundled defaults" claims)
- `.context-index/specs/features/review/charter.md` — "Bundled defaults preservation" capability description (line 74)
- `.context-index/specs/features/setup/risk-tier-bundles.spec.md` — BEH-13/BEH-14/BEH-15 and the Postcondition at line 128-129 (baseline is the operator's own selection, not the full domain bundle)
- `templates/risk-tiers/prototype/review-overlay.yaml`, `templates/risk-tiers/prototype/validate-overlay.yaml`, `templates/risk-tiers/strict/review-overlay.yaml`, `templates/risk-tiers/strict/validate-overlay.yaml` — the four "Applied on top of the resolved domain's bundled ... defaults" header comments
- `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs` — add a partial/empty-selection base-list case; correct the "same end-to-end path" docstring claim (BEH-7)
- `docs/cli-reference.md` — document the new `adev governance scaffold` verb

**Reference (read, do not modify):**
- `lib/extensions/governance-splice.mjs` — `spliceRegistryEntries`, the only sanctioned non-destructive writer
- `lib/governance/registry-marker.mjs` — `stampMarker`, `MARKED_REGISTRIES` (review.yaml is marked; validate.yaml is exempt)
- `lib/governance/materialize.mjs` — `resolveRegistryTarget` (reused for symlink-safe containment), the established atomic-write pattern
- `lib/risk-tiers/merge-review-overlay.mjs`, `lib/risk-tiers/merge-validate-overlay.mjs` — `applyReviewTierOverlay`/`applyValidateTierOverlay`, unchanged by this plan
- `lib/governance/review-config.mjs`, `lib/governance/validate-config.mjs` — loaders, unchanged (single-source already)
- `templates/domains/software/reviewers.yaml`, `templates/domains/software/validate.yaml` — the bundled full lists Step 7c/7d now select *from*, not copy *whole*

---

## Context Packets

### Task 1 Context
- Spec: full text, Coverage Gaps section (lines 56-61), Behaviors BEH-1 through BEH-7
- This plan's DDR-1 (verbatim text to insert)

### Task 2 Context
- Spec: BEH-1, BEH-2, BEH-3; this plan's DDR-2, DDR-3, DDR-4, DDR-7
- Source files: `lib/extensions/governance-splice.mjs` (full — the writer), `lib/governance/registry-marker.mjs` (`stampMarker`, `MARKED_REGISTRIES`), `lib/governance/materialize.mjs:186-247` (`resolveRegistryName`-adjacent pattern, `resolveRegistryTarget` — reuse, not reimplement; note it does NOT create directories, per DDR-7), `lib/extensions/governance-registry.mjs` (`WRITABLE_REGISTRIES`, `FIELD_ALLOWLIST`, `resolveRootKey` — reuse for field-shape validation)
- Sample: `lib/cli/governance.mjs` (full — the sub-verb dispatch pattern `materialize`/`drift`/`reviewers` already establish); `tests/cli-extension.test.mjs:20-25` (the repo's own convention for a multi-arg CLI test: direct `spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), <argv...>], { cwd, env })` — NOT `tests/helpers.mjs::runCLI`, which passes a single command token plus stdin `inputs[]` and cannot express `governance scaffold --registry ... --entries ...`'s multiple flags)

### Task 3 Context
- Spec: BEH-1, BEH-2; Module Impact Map `setup` row
- Source files: `skills/init/SKILL.md:446-505` (Step 7d, full — current auto-copy prose to rework), `templates/domains/software/validate.yaml` (the 8-check bundle Step 7d.1 already partially proposes gates from)
- Depends on: Task 2 (the CLI verb this rework calls)

### Task 4 Context
- Spec: BEH-3; Integration Point 3
- Source files: `skills/init/SKILL.md:357-444` (Step 7c, full — current customization prose), `templates/governance/review.example.yaml` (marker line format), `templates/domains/software/reviewers.yaml` (the 8-reviewer bundle)
- Depends on: Task 2

### Task 5 Context
- Spec: BEH-4
- Source files: `skills/review-specs/SKILL.md:156-190` (Step 3, full), `lib/governance/review-config.mjs:229-241` (`loadReviewConfig`'s return shape — `reviewers`, `disabled`)
- Note: `reviewers.filter(r => r.enabled !== false).length === 0` is the exact predicate BEH-4 names; both the empty-list and all-disabled cases must trigger it

### Task 6 Context
- Spec: BEH-5
- Source files: `skills/validate/SKILL.md:135-148` (preflight, full), `lib/governance/validate-config.mjs:96-172` (`loadValidateConfig`'s `MISSING_VALIDATE_CONFIG` throw and its `checks`/`disabled` return shape)
- Constitution: absent-file hard-crash is UNCHANGED (only "exists but empty" softens)

### Task 7 Context
- Spec: BEH-6; Coverage Gaps (risk-tier-bundles interaction)
- Source files: `skills/init/SKILL.md:359-365` (Step 7c.0), `skills/init/SKILL.md:448-462` (Step 7d.0 sub-step 4), `lib/risk-tiers/merge-review-overlay.mjs`, `lib/risk-tiers/merge-validate-overlay.mjs` (both full — unchanged, only their call-site baseline moves)
- Depends on: Task 3, Task 4 (same file, same sections; the baseline they establish is what Task 7 layers the overlay onto)

### Task 8 Context
- Spec: Module Impact Map (`review` row: "No change to reviewers.yaml content")
- Source files: `docs/governance.md:18-37, 643-645`, `skills/init/SKILL.md:190-201` (Step 7 intro), `.context-index/specs/features/review/charter.md:74`
- Depends on: Task 7 (accuracy of the corrected claim depends on the baseline-source change landing first)

### Task 9 Context
- Spec: Coverage Gaps (risk-tier-bundles' overlay semantics, closing note: "Resolving it is this spec's Behavior 6 ... not deferred")
- Source files: `.context-index/specs/features/setup/risk-tier-bundles.spec.md:109-130` (BEH-9 through BEH-16, Postconditions, full), `templates/risk-tiers/{prototype,strict}/{review,validate}-overlay.yaml` (header comments only)
- Depends on: Task 7

### Task 10 Context
- Spec: BEH-7
- Source files: `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs` (full — the file to extend), `lib/governance/review-config.mjs`, `lib/governance/validate-config.mjs` (loader entry points the hand-off test drives through), `tests/helpers.mjs` (`createTempDir`, `writeFixture`)
- Depends on: Task 3, Task 4, Task 5, Task 6, Task 7 (exercises the full landed chain)

---

## Parallelization

- **Group A (sequential, spec text first):** Task 1 → nothing else quotes the closed Coverage Gap until it lands
- **Group B (infra):** Task 2, after Task 1
- **Group C (sequential — all four edit `skills/init/SKILL.md`, different but adjacent sections):** Task 3 → Task 4 → Task 7 → Task 8
- **Group D (independent files, parallel to Group C once Task 2 lands):** Task 5, Task 6
- **Group E (tail):** Task 9, after Task 7 (parallel with Task 8 — disjoint files)
- **Task 10** depends on Tasks 3, 4, 5, 6, 7 — runs last

Groups C and D touch disjoint files (`skills/init/SKILL.md` vs. `skills/review-specs/SKILL.md` /
`skills/validate/SKILL.md`) and can run concurrently once Task 2 lands. Tasks 8 and 9 touch
disjoint files (`docs/governance.md` + `review/charter.md` vs. `risk-tier-bundles.spec.md` +
templates) and can run concurrently once Task 7 lands.

**Dependency edges** (`→` means "must complete before"):

    1 → 2 → {3, 5, 6}      3 → 4 → 7 → {8, 9}      {3,4,5,6,7} → 10

Acyclic. Tasks 5 and 6 depend only on Task 2 landing (so the CLI verb they may reference in
tests exists), not on Tasks 3/4's `skills/init/SKILL.md` edits — their own files are untouched
by Group C.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Close the UI-placement Coverage Gap in the spec text | small | unit | — | 0 create, 1 modify |
| 2 | Shared explicit-selection registry write path + `adev governance scaffold` | medium | unit | 1 | 3 create, 1 modify |
| 3 | Rework Step 7d.0 to explicit per-check selection | medium | unit | 2 | 1 create, 1 modify |
| 4 | Rework Step 7c to explicit per-reviewer selection + BEH-3 zero-write | medium | unit | 3 | 0 create, 2 modify |
| 5 | Standing-warning check in `/adev:review-specs` Step 3 | small | unit | 2 | 1 create, 1 modify |
| 6 | Standing-warning check in `/adev:validate` preflight | small | unit | 2 | 1 create, 1 modify |
| 7 | Risk tier overlay baseline + warning surfacing | medium | unit | 4 | 1 create, 1 modify |
| 8 | Correct stale bundled-defaults claims | small | unit | 7 | 0 create, 3 modify |
| 9 | Reconcile risk-tier-bundles.spec.md with the new baseline | small | unit | 7 | 0 create, 5 modify |
| 10 | Cross-skill hand-off test + partial-selection overlay coverage | medium | unit | 3,4,5,6,7 | 1 create, 1 modify |

All ten tasks resolve to `strategy: unit` (source: fallback — the manifest declares no
`test_strategies`, and every task's files sit under `lib/`, `skills/`, `docs/`, `templates/` or
`.context-index/`, none of which the detector maps to a non-unit strategy). No **Strategy
Summary** section and no **Test Infrastructure Requirements** section: the spec declares no
`infra_requirements:`, and `node:test` needs no external system.

Granularity resolves to **per-behavior** (source: manifest — `.context-index/manifest.yaml`'s
`test_policy.granularity: per-behavior`). Task 3 and Task 4 each implement a distinct behavior
(BEH-1/BEH-2 and BEH-3 respectively) in a distinct file section, so each proposes its own new
suite rather than sharing one.

`.context-index/manifest.yaml` declares `specialists: []`, so every task is tagged
`[specialist: none]`.

---

## Tasks

### Task 1: Close the UI-placement Coverage Gap in the spec text [specialist: none]

**Charter capability:** none (cross-cutting infrastructure; see header note)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md`

**Tests:** `tests/specs/governance-opt-in-dispatch-contract.test.mjs` — create.

**Context to load:** the spec's Coverage Gaps section; this plan's DDR-1.

Replace the first Coverage Gaps bullet ("Exact UI placement for the opt-in selection...") with
DDR-1's resolution, stated as a closed decision rather than an open question, and bump
`revision: 2` to `revision: 3` in frontmatter, `updated:` to today's date.

- [ ] **Write failing test**

```javascript
// tests/specs/governance-opt-in-dispatch-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SPEC = ".context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md";

test("the UI-placement Coverage Gap is closed, not left open", () => {
  const spec = readFileSync(SPEC, "utf8");
  assert.doesNotMatch(spec, /is undecided|not yet resolved by this spec/i);
  assert.match(spec, /enhance.*in place|Step 7c\.3\/7d\.1/i);
});

test("revision is bumped past 2", () => {
  const spec = readFileSync(SPEC, "utf8");
  const m = spec.match(/^revision:\s*(\d+)/m);
  assert.ok(m && Number(m[1]) > 2, "revision must be bumped");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/specs/governance-opt-in-dispatch-contract.test.mjs`
Expected: FAIL — the gap is still stated as open, revision is still 2.

- [ ] **Implement** — apply the edit above.

- [ ] **Verify test passes**

Run: `node --test tests/specs/governance-opt-in-dispatch-contract.test.mjs` → PASS.

- [ ] **Commit**

Branch: `feat/cross-cutting/governance-opt-in-dispatch`

```bash
git add .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md \
        tests/specs/governance-opt-in-dispatch-contract.test.mjs
git commit -m "docs(cross-cutting): close UI-placement gap in governance-opt-in-dispatch spec" \
  -m "Spec: .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md" \
  -m "Plan-task: 1"
```

---

### Task 2: Shared explicit-selection registry write path + `adev governance scaffold` [specialist: none]

**Charter capability:** none (shared infrastructure underlying setup's scaffold rework)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `lib/governance/registry-scaffold.mjs`
- Create: `tests/governance/registry-scaffold.test.mjs`
- Create: `tests/cli/governance-scaffold.test.mjs`
- Modify: `lib/cli/governance.mjs` (new `scaffold` sub-verb + `help()`)

**Tests:** `tests/governance/registry-scaffold.test.mjs` — create (BEH-1, BEH-2, BEH-3, unit
level). `tests/cli/governance-scaffold.test.mjs` — create (CLI surface).

**Context to load:** `lib/extensions/governance-splice.mjs` full; `lib/governance/registry-marker.mjs`
full; `lib/governance/materialize.mjs:186-247` for `resolveRegistryTarget` (reuse verbatim,
import it); `lib/extensions/governance-registry.mjs` for `resolveRootKey`/`FIELD_ALLOWLIST`; this
plan's DDR-2, DDR-3, DDR-4.

**API contract for `writeRegistrySelection`:**

```javascript
// lib/governance/registry-scaffold.mjs (descriptive reference — implemented in Task 2, not here)
export function writeRegistrySelection(projectRoot, registry, entries, options = {}) {
  // registry: 'review' | 'validate'
  // entries: array of already-resolved entry objects (each `{ id, ... }`), possibly empty
  // Refuses GOVERNANCE_SCAFFOLD_EXISTS if the target file is already present (DDR-4).
  // entries.length === 0 -> literal `<rootKey>: []` + header, no splice call (DDR-3).
  // entries.length > 0   -> spliceRegistryEntries(null, rootKey, entries) (fresh-file form).
  // registry === 'review' -> stampMarker() after the write (BEH-3); 'validate' never marked.
  // Returns { path, root_key, marker_written, entry_count }.
}
```

- [ ] **Write failing test**

```javascript
// tests/governance/registry-scaffold.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeRegistrySelection } from "../../lib/governance/registry-scaffold.mjs";
import { readMarker } from "../../lib/governance/registry-marker.mjs";
import { createTempDir, captureThrow } from "../helpers.mjs";

test("non-empty validate selection writes a fresh checks: block, no marker", async () => {
  const dir = await createTempDir();
  const result = writeRegistrySelection(dir, "validate", [
    { id: "validate.check-1-quality-gates", kind: "deterministic-check", severity: "error", source: "project" },
  ]);
  const text = readFileSync(join(dir, ".context-index/governance/validate.yaml"), "utf8");
  assert.match(text, /checks:\n\s+- id: validate\.check-1-quality-gates/);
  assert.equal(readMarker(join(dir, ".context-index/governance/validate.yaml")), null);
  assert.equal(result.entry_count, 1);
});

test("zero-selection validate writes an explicit empty list, not an absent file", async () => {
  const dir = await createTempDir();
  writeRegistrySelection(dir, "validate", []);
  const path = join(dir, ".context-index/governance/validate.yaml");
  assert.ok(existsSync(path));
  assert.match(readFileSync(path, "utf8"), /^checks:\s*\[\]\s*$/m);
});

test("zero-selection review writes an explicit empty list WITH the materialized_at marker", async () => {
  const dir = await createTempDir();
  writeRegistrySelection(dir, "review", []);
  const path = join(dir, ".context-index/governance/review.yaml");
  assert.match(readFileSync(path, "utf8"), /^reviewers:\s*\[\]\s*$/m);
  assert.ok(readMarker(path) !== null, "review.yaml must carry the marker even when empty");
});

test("refuses to run against an already-existing file", async () => {
  const dir = await createTempDir();
  writeRegistrySelection(dir, "validate", []);
  // codedError() puts the code on err.code, not in the message text, so
  // assert.throws(fn, /REGEX/) — which matches String(err) — can never see it.
  // Use captureThrow (tests/helpers.mjs) and assert on err.code directly.
  const err = captureThrow(() => writeRegistrySelection(dir, "validate", []));
  assert.equal(err.code, "GOVERNANCE_SCAFFOLD_EXISTS");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/registry-scaffold.test.mjs`
Expected: FAIL — module does not exist.

- [ ] **Implement**

```javascript
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicWriteFile as atomicWrite } from "../atomic-write.mjs";
import { spliceRegistryEntries } from "../extensions/governance-splice.mjs";
import { resolveRootKey } from "../extensions/governance-registry.mjs";
import { stampMarker } from "./registry-marker.mjs";
import { resolveRegistryTarget } from "./materialize.mjs";
import { codedError as coded } from "../errors.mjs";

const REGISTRY_FILES = { review: "review.yaml", validate: "validate.yaml" };

export function writeRegistrySelection(projectRoot, registry, entries, options = {}) {
  const file = REGISTRY_FILES[registry];
  if (!file) throw coded("GOVERNANCE_SCAFFOLD_UNKNOWN_REGISTRY", `unknown registry '${registry}'.`);
  const relPath = join(".context-index", "governance", file);
  const absPath = resolveRegistryTarget(projectRoot, relPath);
  // DDR-7: materialize.mjs assumes Step 7a already created this directory; this
  // verb makes no such assumption of its own callers (including its own tests).
  mkdirSync(dirname(absPath), { recursive: true });
  if (existsSync(absPath)) {
    throw coded("GOVERNANCE_SCAFFOLD_EXISTS", `${relPath} already exists; refusing to overwrite. This verb is for first scaffold only.`);
  }
  const rootKey = resolveRootKey(file);
  const list = Array.isArray(entries) ? entries : [];
  let text;
  if (list.length === 0) {
    text = `# ${rootKey} — governance registry scaffolded by /adev:init from an explicit\n` +
      `# operator selection of zero entries.\n\n${rootKey}: []\n`;
  } else {
    text = spliceRegistryEntries(null, rootKey, list).text;
  }
  if (registry === "review") text = stampMarker(text);
  atomicWrite(absPath, text);
  return { path: relPath, root_key: rootKey, marker_written: registry === "review", entry_count: list.length };
}
```

- [ ] **Verify test passes**

Run: `node --test tests/governance/registry-scaffold.test.mjs` → PASS.

- [ ] **Write failing test (CLI surface)**

Per the repo's own multi-arg CLI test convention (`tests/cli-extension.test.mjs:20-25`), use
`spawnSync` directly with a full argv array — `tests/helpers.mjs::runCLI` takes a single command
token plus stdin lines and cannot express multiple flags.

```javascript
// tests/cli/governance-scaffold.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";

function runGovernanceCli(cwd, args) {
  const result = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), "governance", ...args], {
    cwd, env: { ...process.env }, encoding: "utf8",
  });
  return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

test("adev governance scaffold --registry validate --entries writes the selection", () => {
  const dir = createTempDir();
  const r = runGovernanceCli(dir, ["scaffold", "--registry", "validate",
    "--entries", '[{"id":"validate.check-1-quality-gates","kind":"deterministic-check","severity":"error"}]']);
  assert.equal(r.code, 0, r.stderr);
  const text = readFileSync(join(dir, ".context-index/governance/validate.yaml"), "utf8");
  assert.match(text, /validate\.check-1-quality-gates/);
  cleanupTempDir(dir);
});

test("--entries @path reads a JSON file for long selections", () => {
  const dir = createTempDir();
  const fixturePath = join(dir, "entries.json");
  writeFileSync(fixturePath, '[{"id":"validate.check-1-quality-gates","kind":"deterministic-check","severity":"error"}]');
  const r = runGovernanceCli(dir, ["scaffold", "--registry", "validate", "--entries", `@${fixturePath}`]);
  assert.equal(r.code, 0, r.stderr);
  const text = readFileSync(join(dir, ".context-index/governance/validate.yaml"), "utf8");
  assert.match(text, /validate\.check-1-quality-gates/);
  cleanupTempDir(dir);
});

test("malformed --entries JSON exits 1 with a named error", () => {
  const dir = createTempDir();
  const r = runGovernanceCli(dir, ["scaffold", "--registry", "review", "--entries", "{not json"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--entries/);
  cleanupTempDir(dir);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/governance-scaffold.test.mjs`
Expected: FAIL — `scaffold` sub-verb not wired.

- [ ] **Implement** — add `scaffold` handling in `lib/cli/governance.mjs`'s `run()` dispatch,
parsing `--registry` and `--entries` (JSON literal or `@path`), delegating to
`writeRegistrySelection`. Two distinct error paths, each printed as `${code}: ${message}` on
stderr before `process.exit(1)`:
- a `JSON.parse` failure on `--entries` (either the literal or the file it names) is caught HERE
  and re-thrown as a coded error whose message explicitly names `--entries` (e.g.
  `coded("GOVERNANCE_SCAFFOLD_ENTRIES_INVALID", "--entries is not valid JSON: <parse error>")`) —
  a raw `JSON.parse` `SyntaxError` message never mentions the flag, and the CLI test above asserts
  `stderr` matches `/--entries/`, so this re-throw is required, not optional;
- any error thrown by `writeRegistrySelection` itself (e.g. `GOVERNANCE_SCAFFOLD_EXISTS`) is
  caught and printed using its own `.code`/`.message`, unchanged.
Add the verb to `USAGE` and `help()`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/governance-scaffold.test.mjs` → PASS; `npm test` → 0 failures.

- [ ] **Commit**

```bash
git add lib/governance/registry-scaffold.mjs lib/cli/governance.mjs \
        tests/governance/registry-scaffold.test.mjs tests/cli/governance-scaffold.test.mjs
git commit -m "feat(setup): add adev governance scaffold for explicit registry selections" \
  -m "Spec: .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md" \
  -m "Plan-task: 2"
```

---

### Task 3: Rework Step 7d.0 to explicit per-check selection [specialist: none]

**Charter capability:** setup — governance scaffolding (no formal row; see header note)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `tests/skills/init-governance-explicit-selection.test.mjs`
- Modify: `skills/init/SKILL.md` (Step 7d.0, lines 446-464)

**Tests:** `tests/skills/init-governance-explicit-selection.test.mjs` — create (BEH-1, BEH-2).

**Context to load:** `skills/init/SKILL.md:446-464` (current Step 7d.0, full); `templates/domains/software/validate.yaml`
(the 8-check bundle presented as the checklist); Task 2's verb signature.

Rework Step 7d.0's sub-steps 1-4 from "copy the starter verbatim" to: (1) load the resolved
domain's starter check list via `loadDomainConfig`, (2) present each check as an inclusion
checklist item (DDR-1 — reusing Step 7d.1's existing checklist UI shape), defaulting every item
to **unchecked** (explicit inclusion, not pre-selected), (3) after the operator responds (which
may select zero), call `adev governance scaffold --registry validate --entries <selected-subset-json>`
— an empty array is a legitimate, first-class outcome (BEH-2), not an error. Sub-step 4 (risk
tier overlay) and sub-step 5 (idempotency guard: skip entirely if the file already exists) are
preserved unchanged, per BEH-1's closing sentence and Task 7 below.

- [ ] **Write failing test**

```javascript
// tests/skills/init-governance-explicit-selection.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillPath = join(__dirname, "..", "..", "skills", "init", "SKILL.md");
const content = readFileSync(skillPath, "utf8");
const start = content.indexOf("#### Step 7d.0");
const end = content.indexOf("\n#### Step 7d.1");
const section = content.substring(start, end);

test("Step 7d.0 presents an explicit inclusion checklist, not an unconditional copy", () => {
  assert.ok(!/copy its bytes verbatim/.test(section),
    "Step 7d.0 must no longer copy the starter verbatim");
  assert.match(section, /adev governance scaffold/, "Step 7d.0 must call the new scaffold verb");
  assert.match(section, /unchecked|not pre-selected|explicit(ly)? select/i,
    "Step 7d.0 must default the checklist to unchecked");
});

test("Step 7d.0 states a zero-selection outcome is legitimate, not an error", () => {
  assert.match(section, /zero checks|selects? (zero|none)/i);
  assert.match(section, /checks:\s*\[\]/);
});

test("Step 7d.0 sub-step 5's idempotency guard survives unchanged", () => {
  assert.match(section, /already exists.*no-op|no-op.*already exists/is);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/init-governance-explicit-selection.test.mjs`
Expected: FAIL — Step 7d.0 still describes an unconditional copy.

- [ ] **Implement** — rewrite Step 7d.0 prose per the description above.

- [ ] **Verify test passes**

Run: `node --test tests/skills/init-governance-explicit-selection.test.mjs` → PASS.
Run: `node --test tests/skills/init-governance-scaffolding.test.mjs` → still PASS (Step 7a
untouched).

- [ ] **Commit**

```bash
git add skills/init/SKILL.md tests/skills/init-governance-explicit-selection.test.mjs
git commit -m "feat(setup): rework Step 7d.0 to explicit per-check selection" \
  -m "Spec: .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md" \
  -m "Plan-task: 3"
```

---

### Task 4: Rework Step 7c to explicit per-reviewer selection + BEH-3 zero-write [specialist: none]

**Charter capability:** review — configurable reviewer registry (no formal row for this change; see header note)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `tests/skills/init-governance-explicit-selection.test.mjs` (extend)
- Modify: `skills/init/SKILL.md` (Step 7c, lines 357-444)

**Tests:** `tests/skills/init-governance-explicit-selection.test.mjs` — **extend** (per-behavior
granularity: this file already covers BEH-1/BEH-2 from Task 3; add BEH-3's describe block here
rather than a new file, since both are the same "explicit selection at Step 7" behavior family).

**Context to load:** `skills/init/SKILL.md:357-444` (Step 7c, full); `templates/governance/review.example.yaml`
(marker line format Step 5 currently copies verbatim); Integration Point 3.

Rework Step 7c sub-step 3 ("Bundled reviewer customization") from disable/cap-only to an
inclusion checklist over the resolved domain's full reviewer bundle (DDR-1), reusing the
existing `[d]`/`[c]`/`[p]`/`[s]` prompt shape but starting every entry **unselected**. Sub-step
5's write gate changes: **always** write `.context-index/governance/review.yaml` now (never
"if nothing was selected, DO NOT write the file") — BEH-3 makes an explicit empty
`reviewers: []` (with `materialized_at`) the correct outcome of a zero-selection, replacing the
old zero-config-preservation no-write path for this file specifically. Sub-step 5 calls
`adev governance scaffold --registry review --entries <selected-subset-json>` (Task 2's verb,
which already stamps the marker unconditionally per its own contract).

- [ ] **Write failing test**

```javascript
// appended to tests/skills/init-governance-explicit-selection.test.mjs
const step7cStart = content.indexOf("### Step 7c:");
const step7cEnd = content.indexOf("\n### Step 7d:");
const step7c = content.substring(step7cStart, step7cEnd);

test("Step 7c always writes review.yaml, even on zero selection (BEH-3)", () => {
  assert.ok(!/If nothing was selected, DO NOT write the file/.test(step7c),
    "Step 7c must no longer skip the write on zero selection");
  assert.match(step7c, /reviewers:\s*\[\]/);
  assert.match(step7c, /materialized_at/);
});

test("Step 7c's bundled reviewer prompt starts unselected", () => {
  assert.match(step7c, /unselected|not pre-selected|opt.?in/i);
});

test("Step 7c calls the shared scaffold verb", () => {
  assert.match(step7c, /adev governance scaffold/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/init-governance-explicit-selection.test.mjs`
Expected: FAIL — Step 7c still contains "If nothing was selected, DO NOT write the file."

- [ ] **Implement** — rewrite Step 7c sub-step 3 and sub-step 5 per the description above.

- [ ] **Verify test passes**

Run: `node --test tests/skills/init-governance-explicit-selection.test.mjs` → PASS.

- [ ] **Commit**

```bash
git add skills/init/SKILL.md tests/skills/init-governance-explicit-selection.test.mjs
git commit -m "feat(setup): rework Step 7c to explicit per-reviewer selection with BEH-3 zero-write" \
  -m "Spec: .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md" \
  -m "Plan-task: 4"
```

---

### Task 5: Standing-warning check in `/adev:review-specs` Step 3 [specialist: none]

**Charter capability:** review — configurable reviewer registry
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `tests/skills/review-specs-zero-reviewers-warning.test.mjs`
- Modify: `skills/review-specs/SKILL.md` (Step 3, lines 156-190)

**Tests:** `tests/skills/review-specs-zero-reviewers-warning.test.mjs` — create (BEH-4).

**Context to load:** `skills/review-specs/SKILL.md:156-190`; `lib/governance/review-config.mjs:229-241`
(`reviewers`/`disabled` shape); this plan's DDR-6 (wording).

After "If `adev governance reviewers` reported any `errors`, abort with the error list," add:
when `reviewers.filter(r => r.enabled !== false).length === 0` — covering both an empty
`reviewers` array and a non-empty one where every entry is disabled — print the standing warning
(DDR-6 wording) as a report-header line that is not suppressible by the normal report format,
then continue (the review still runs to completion with a normal verdict; zero dispatched
reviewers is not itself a failure).

- [ ] **Write failing test**

```javascript
// tests/skills/review-specs-zero-reviewers-warning.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(__dirname, "..", "..", "skills", "review-specs", "SKILL.md"), "utf8");
const start = content.indexOf("## Step 3: Load Reviewer Registry");
const end = content.indexOf("\n## Step 4:");
const step3 = content.substring(start, end);

test("Step 3 checks the exact BEH-4 predicate", () => {
  assert.match(step3, /enabled\s*!==\s*false/);
  assert.match(step3, /\.length\s*===\s*0/);
});

test("Step 3 states the warning is not suppressible, and review still completes", () => {
  assert.match(step3, /standing warning/i);
  assert.match(step3, /not suppressible/i);
  assert.match(step3, /still (runs|completes|dispatches)/i);
});

test("Step 3 covers both empty-list and all-disabled cases", () => {
  assert.match(step3, /all disabled|every (entry|reviewer) (is )?disabled/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/review-specs-zero-reviewers-warning.test.mjs`
Expected: FAIL — Step 3 has no standing-warning check today.

- [ ] **Implement** — add the check and its wording to Step 3.

- [ ] **Verify test passes**

Run: `node --test tests/skills/review-specs-zero-reviewers-warning.test.mjs` → PASS.

- [ ] **Commit**

```bash
git add skills/review-specs/SKILL.md tests/skills/review-specs-zero-reviewers-warning.test.mjs
git commit -m "feat(review): standing warning on zero enabled reviewers" \
  -m "Spec: .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md" \
  -m "Plan-task: 5"
```

---

### Task 6: Standing-warning check in `/adev:validate` preflight [specialist: none]

**Charter capability:** validation — check registry
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `tests/skills/validate-zero-checks-warning.test.mjs`
- Modify: `skills/validate/SKILL.md` (preflight section, lines 135-148)

**Tests:** `tests/skills/validate-zero-checks-warning.test.mjs` — create (BEH-5).

**Context to load:** `skills/validate/SKILL.md:135-148`; `lib/governance/validate-config.mjs:96-172`
(`MISSING_VALIDATE_CONFIG` throw site, `checks` return shape); this plan's DDR-6.

Add, immediately after the existing preflight bullet: when `.context-index/governance/validate.yaml`
**exists** but `loadValidateConfig(...).checks.filter(c => c.enabled !== false).length === 0`,
print the standing warning (DDR-6 wording, checks variant) and proceed to run Check 1 and every
other configured check as normal (there are none, so the run completes with no findings) — this
is explicitly distinct from the absent-file case immediately above it, which still throws
`MISSING_VALIDATE_CONFIG` and hard-stops. State the distinction explicitly so a future reader
cannot conflate the two paths.

- [ ] **Write failing test**

```javascript
// tests/skills/validate-zero-checks-warning.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(__dirname, "..", "..", "skills", "validate", "SKILL.md"), "utf8");
const start = content.indexOf("**Domain-Aware Gate Loading:**");
const end = content.indexOf("**Load Skill Extensions:**");
const preflight = content.substring(start, end);

test("preflight distinguishes absent-file (hard crash) from exists-but-empty (warn)", () => {
  assert.match(preflight, /MISSING_VALIDATE_CONFIG/);
  assert.match(preflight, /exists.*(zero|no).*enabled|enabled.*count.*zero/is);
  assert.match(preflight, /standing warning/i);
});

test("absent-file hard-crash wording is unchanged", () => {
  assert.match(preflight, /Run \/adev:init to scaffold the validate configuration/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/validate-zero-checks-warning.test.mjs`
Expected: FAIL — no exists-but-empty branch exists today.

- [ ] **Implement** — add the branch per the description above.

- [ ] **Verify test passes**

Run: `node --test tests/skills/validate-zero-checks-warning.test.mjs` → PASS.

- [ ] **Commit**

```bash
git add skills/validate/SKILL.md tests/skills/validate-zero-checks-warning.test.mjs
git commit -m "feat(validation): standing warning on zero enabled checks, absent file still hard-crashes" \
  -m "Spec: .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md" \
  -m "Plan-task: 6"
```

---

### Task 7: Risk tier overlay baseline + warning surfacing [specialist: none]

**Charter capability:** setup — Risk Tier Bundles
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Create: `tests/skills/init-risk-tier-overlay-baseline.test.mjs`
- Modify: `skills/init/SKILL.md` (Step 7c.0 lines 359-365, Step 7d.0 sub-step 4 lines 458-462)

**Tests:** `tests/skills/init-risk-tier-overlay-baseline.test.mjs` — create (BEH-6).

**Context to load:** `skills/init/SKILL.md:359-365, 448-462`; `lib/risk-tiers/merge-review-overlay.mjs`,
`lib/risk-tiers/merge-validate-overlay.mjs` (both unchanged — only the caller's baseline moves).

Two edits:
1. Step 7c.0 / Step 7d.0 sub-step 4: change "load the resolved domain's bundled `reviewers.yaml`"
   / "the just-written checks list" to explicitly state the base list is the operator's own
   Step 7c/7d **selection** (Tasks 3/4's checklist result), not the full domain bundle — BEH-6's
   core requirement.
2. Both sections: the overlay function's `warnings` return value
   (`RISK_TIER_OVERLAY_UNKNOWN_ID`, `RISK_TIER_OVERLAY_INVALID_EXTRA_CHECK`,
   `RISK_TIER_OVERLAY_DUPLICATE_ID`) is surfaced in the Step 7 summary (the same treatment the
   summary already gives other warnings), not computed and discarded. State explicitly that an
   overlay naming an id the operator did not select now surfaces `RISK_TIER_OVERLAY_UNKNOWN_ID`
   as a meaningful, operator-visible signal.

- [ ] **Write failing test**

```javascript
// tests/skills/init-risk-tier-overlay-baseline.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(__dirname, "..", "..", "skills", "init", "SKILL.md"), "utf8");

test("Step 7c.0 states the overlay base is the operator's own selection, not the full bundle", () => {
  const start = content.indexOf("#### Step 7c.0");
  const end = content.indexOf("\n1. **Scan for existing charters.**");
  const section = content.substring(start, end);
  assert.ok(!/load the resolved domain's bundled `reviewers\.yaml`/.test(section),
    "Step 7c.0 must no longer name the full domain bundle as the overlay base");
  assert.match(section, /operator's own (Step 7c )?selection/i);
});

test("Step 7c.0 / Step 7d.0 surface overlay warnings in the Step 7 summary, not discard them", () => {
  assert.match(content, /RISK_TIER_OVERLAY_UNKNOWN_ID/);
  assert.match(content, /surface(d|s)? (in|at) the Step 7 summary/i);
});

test("an unselected-id overlay warning is named as a meaningful signal, not noise", () => {
  assert.match(content, /RISK_TIER_OVERLAY_UNKNOWN_ID/);
  assert.match(content, /tier expects|didn't select|not (selected|part of)/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/init-risk-tier-overlay-baseline.test.mjs`
Expected: FAIL — Step 7c.0 still names the full domain bundle; warnings are computed and unused.

- [ ] **Implement** — apply the two edits above to both Step 7c.0 and Step 7d.0 sub-step 4, and
extend the Step 7 summary template to print any non-empty overlay `warnings` list.

- [ ] **Verify test passes**

Run: `node --test tests/skills/init-risk-tier-overlay-baseline.test.mjs` → PASS.

- [ ] **Commit**

```bash
git add skills/init/SKILL.md tests/skills/init-risk-tier-overlay-baseline.test.mjs
git commit -m "feat(setup): risk tier overlays apply against the operator's own selection" \
  -m "Spec: .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md" \
  -m "Plan-task: 7"
```

---

### Task 8: Correct stale bundled-defaults claims [specialist: none]

**Charter capability:** review — configurable reviewer registry (charter description correction)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7
**Files:**
- Modify: `skills/init/SKILL.md` (Step 7 intro, lines 190-201)
- Modify: `docs/governance.md` (lines 22, 37, 645)
- Modify: `.context-index/specs/features/review/charter.md` (line 74)

**Tests:** `tests/skills/init-governance-explicit-selection.test.mjs` — **extend** (per-behavior
granularity: this is prose correction supporting BEH-1/BEH-2/BEH-3's landed behavior, sharing the
suite Task 3 created rather than opening a new one for a documentation-only change).

No new behavior; corrects text that now contradicts landed code:
1. `skills/init/SKILL.md:198-201` claims "the three reviewers (structural-architect,
   security-reviewer, consistency-analyzer) and the 12 bundled validate checks ship enabled" —
   both counts are wrong today (the bundle carries 8 reviewers with structural-architect/
   security-reviewer disabled by default per `reviewer-panel-retarget.spec.md`, and 8 validate
   checks, not 12) and the claim is now categorically false regardless of count: nothing ships
   enabled without an explicit selection. Replace with a statement naming Step 7c/7d's explicit
   selection as the source of what runs, and correct the counts.
2. `docs/governance.md:22` ("Bundled defaults ship with the plugin and reproduce the pre-0.18.0
   hardcoded flow byte-for-byte") and `:37` ("Absent files mean 'use bundled defaults.'") are
   both false for `review.yaml` today (absent means zero reviewers) and, post this plan, also for
   `validate.yaml` (BEH-1/BEH-2 mean the file always exists once Step 7 runs governance at all).
3. `docs/governance.md:645` ("Zero-config projects migrate with nothing to do — the bundled
   defaults reproduce the pre-0.18.0 behavior bit-for-bit") is the same claim in the migration
   section; correct it to state that a project which already ran Step 7 under the old model is
   unaffected (Coverage Gap "Existing projects" — no retroactive change), while a project running
   Step 7 for the first time after this ships now sees an explicit selection prompt.
4. `.context-index/specs/features/review/charter.md:74` ("Bundled defaults preservation ...
   projects with no governance file see no change") — correct to state that a project with no
   `review.yaml` runs zero reviewers (today's actual, and post-this-plan's still-actual,
   behavior), removing the false "no change" framing.

- [ ] **Write failing test**

```javascript
// appended to tests/skills/init-governance-explicit-selection.test.mjs
import { readFileSync as readFile } from "node:fs";

test("Step 7 intro no longer claims a fixed bundled-defaults-ship-enabled fallback", () => {
  const introStart = content.indexOf("Step 7/11: Governance Policies");
  const introEnd = content.indexOf("### Step 7.0");
  const intro = content.substring(introStart, introEnd);
  assert.ok(!/ship enabled/.test(intro), "Step 7 intro must not claim a ship-enabled default");
});

test("docs/governance.md no longer claims absent files mean bundled defaults", () => {
  const docs = readFile("docs/governance.md", "utf8");
  assert.ok(!/Absent files mean .use bundled defaults\./.test(docs));
});

test("review charter no longer claims no-governance-file means no change", () => {
  const charter = readFile(".context-index/specs/features/review/charter.md", "utf8");
  assert.ok(!/projects with no governance file see no change/.test(charter));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/init-governance-explicit-selection.test.mjs`
Expected: FAIL — all three stale claims still present.

- [ ] **Implement** — apply the four corrections above.

- [ ] **Verify test passes**

Run: `node --test tests/skills/init-governance-explicit-selection.test.mjs` → PASS;
`npm test` → 0 failures.

- [ ] **Commit**

```bash
git add skills/init/SKILL.md docs/governance.md .context-index/specs/features/review/charter.md \
        tests/skills/init-governance-explicit-selection.test.mjs
git commit -m "docs(setup): correct stale bundled-defaults-ship-enabled claims" \
  -m "Spec: .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md" \
  -m "Plan-task: 8"
```

---

### Task 9: Reconcile risk-tier-bundles.spec.md with the new baseline [specialist: none]

**Charter capability:** setup — Risk Tier Bundles
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7
**Files:**
- Modify: `.context-index/specs/features/setup/risk-tier-bundles.spec.md` (BEH-13, BEH-14, BEH-15, Postcondition lines 128-129)
- Modify: `templates/risk-tiers/prototype/review-overlay.yaml`, `templates/risk-tiers/prototype/validate-overlay.yaml`, `templates/risk-tiers/strict/review-overlay.yaml`, `templates/risk-tiers/strict/validate-overlay.yaml` (header comment, line 2 of each)

**Tests:** `tests/specs/governance-opt-in-dispatch-contract.test.mjs` — **extend** (per-behavior
granularity: this reconciliation is part of BEH-6's landed contract, sharing Task 1's suite).

The Postcondition at `risk-tier-bundles.spec.md:128-129` — "A `governance/review.yaml` or
`governance/validate.yaml` written with a tier overlay applied carries every entry the resolved
domain's bundle would have produced on its own" — directly contradicts BEH-6's new baseline (the
operator's own selection, which may be a strict subset of the domain bundle). Correct it to: "...
carries every entry the operator's own Step 7c/7d selection would have produced on its own" and
note that `applyReviewTierOverlay`/`applyValidateTierOverlay` are themselves unchanged (BEH-9/BEH-11
already state input-preservation generically; only the *caller's* input changed).

BEH-13/BEH-14/BEH-15's prose describing "Step 7c.0's overlay (softening ... to `severity_cap:
warning`)" etc. names specific reviewer/check ids assuming they are present in the baseline —
this remains textually correct (the ids named are still part of the domain bundle an operator
*may* select), but each behavior gets one added clause: the overlay is applied against whichever
subset of those ids the operator actually selected at Step 7c/7d, and an id the operator did not
select is now reported via `RISK_TIER_OVERLAY_UNKNOWN_ID` per Task 7, rather than being silently
present as before.

The four template files' header comment ("Applied on top of the resolved domain's bundled
reviewer defaults during ...") becomes "Applied on top of the operator's own Step 7c/7d selection
during ...".

- [ ] **Write failing test**

```javascript
// appended to tests/specs/governance-opt-in-dispatch-contract.test.mjs
const RISK_TIER_SPEC = ".context-index/specs/features/setup/risk-tier-bundles.spec.md";

test("risk-tier-bundles Postcondition names the operator's selection, not the full domain bundle", () => {
  const spec = readFileSync(RISK_TIER_SPEC, "utf8");
  assert.ok(!/the resolved domain's bundle would have produced on its own/.test(spec));
  assert.match(spec, /operator's own Step 7c\/7d selection/);
});

test("BEH-13/14/15 name the unknown-id signal for an unselected overlay target", () => {
  const spec = readFileSync(RISK_TIER_SPEC, "utf8");
  assert.match(spec, /RISK_TIER_OVERLAY_UNKNOWN_ID/);
});

test("the four risk-tier overlay templates no longer claim the domain bundle as their base", () => {
  for (const f of [
    "templates/risk-tiers/prototype/review-overlay.yaml",
    "templates/risk-tiers/prototype/validate-overlay.yaml",
    "templates/risk-tiers/strict/review-overlay.yaml",
    "templates/risk-tiers/strict/validate-overlay.yaml",
  ]) {
    const text = readFileSync(f, "utf8");
    assert.ok(!/resolved domain's bundled reviewer defaults|resolved domain's scaffolded validate\.yaml/.test(text), f);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/specs/governance-opt-in-dispatch-contract.test.mjs`
Expected: FAIL — Postcondition and template headers still name the full domain bundle.

- [ ] **Implement** — apply the edits above.

- [ ] **Verify test passes**

Run: `node --test tests/specs/governance-opt-in-dispatch-contract.test.mjs` → PASS.

- [ ] **Commit**

```bash
git add .context-index/specs/features/setup/risk-tier-bundles.spec.md \
        templates/risk-tiers/prototype/review-overlay.yaml \
        templates/risk-tiers/prototype/validate-overlay.yaml \
        templates/risk-tiers/strict/review-overlay.yaml \
        templates/risk-tiers/strict/validate-overlay.yaml \
        tests/specs/governance-opt-in-dispatch-contract.test.mjs
git commit -m "docs(setup): reconcile risk-tier-bundles spec with the operator-selection baseline" \
  -m "Spec: .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md" \
  -m "Plan-task: 9"
```

---

### Task 10: Cross-skill hand-off test + partial-selection overlay coverage [specialist: none]

**Charter capability:** none (cross-cutting verification; see header note)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 4, Task 5, Task 6, Task 7
**Files:**
- Create: `tests/cross-skill/governance-opt-in-handoff.test.mjs`
- Modify: `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs`

**Tests:** `tests/cross-skill/governance-opt-in-handoff.test.mjs` — create (BEH-7, first half:
cross-skill hand-off). `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs` — **extend**
(BEH-7, second half: partial-selection overlay coverage).

**Context to load:** `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs` (full);
`lib/governance/review-config.mjs`, `lib/governance/validate-config.mjs` (loader entry points);
`tests/helpers.mjs` (`createTempDir`, `writeFixture`).

Two independent additions, both required by BEH-7:

1. **Cross-skill hand-off test** (new file): use `writeRegistrySelection` (Task 2) to scaffold a
   temp project's `governance/review.yaml` and `governance/validate.yaml` with a **partial**
   selection (neither empty nor the full bundle), then assert `loadReviewConfig`/
   `loadValidateConfig` (the actual loaders `/adev:review-specs`/`/adev:validate` call) see
   exactly that selection — not the full bundle, not zero. Repeat with an **empty** selection and
   assert the loaders report zero enabled entries (the exact predicate Tasks 5/6's warnings key
   on: `reviewers.filter(r => r.enabled !== false).length === 0` and the checks equivalent) — this
   is the actual init-writes → review-specs/validate-reads hand-off BEH-7 requires, not each
   skill's local behavior tested in isolation.

2. **Partial-selection overlay coverage** (extend the existing referential-integrity file): add a
   test that builds a **partial** subset of `softwareReviewers` by removing, BY NAME, an id one of
   the tier overlays actually targets (`strict`'s `review-overlay.yaml` names `enable:
   [structural-architect, security-reviewer]`; `prototype`'s names `severity_caps:` over
   `referent-integrity`/`wiring-reviewer`/`consistency-analyzer`/`boundary-reviewer`/
   `termination-reviewer`) — an index-parity filter (`i % 2 === 0`) gives no guarantee the removed
   entries include an overlay-targeted id, so the test would silently prove nothing were an
   overlay's targets to all land on the kept half. Assert that applying the overlay against the
   reduced list produces **exactly one** `RISK_TIER_OVERLAY_UNKNOWN_ID` warning **naming the
   removed id** (a warning names exactly one id per `lib/risk-tiers/overlay-helpers.mjs:30`
   — "names unknown reviewer id "<id>" — skipped" — so an assertion demanding every kept id appear
   in a single warning's message, as opposed to the removed id specifically, is the inverted
   version of this check and must not be written). Every remaining (non-removed) entry must
   survive untouched in the result (BEH-9). Correct the file's docstring claim ("the same
   end-to-end path Step 7c.0 / Step 7d.0 of /adev:init exercises") to describe both the full-bundle
   and partial-selection cases, since it described only the pre-Task-7 full-bundle path.

- [ ] **Write failing test**

```javascript
// tests/cross-skill/governance-opt-in-handoff.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeRegistrySelection } from "../../lib/governance/registry-scaffold.mjs";
import { loadReviewConfig } from "../../lib/governance/review-config.mjs";
import { loadValidateConfig } from "../../lib/governance/validate-config.mjs";
import { createTempDir } from "../helpers.mjs";

test("a partial operator selection at scaffold time is exactly what review-specs dispatches", async () => {
  const dir = await createTempDir();
  writeRegistrySelection(dir, "review", [
    { id: "consistency-analyzer", name: "consistency-analyzer", dispatch: "always",
      profile: "reviewer-capable", context_pack: "base", severity_cap: "blocker",
      prompt: "plugin:review-specs/consistency-analyzer-prompt.md", source: "project" },
  ]);
  const cfg = loadReviewConfig(dir);
  assert.equal(cfg.errors.length, 0);
  assert.deepEqual(cfg.reviewers.map(r => r.id), ["consistency-analyzer"]);
});

test("an empty operator selection reads as zero enabled reviewers, the exact BEH-4 predicate", async () => {
  const dir = await createTempDir();
  writeRegistrySelection(dir, "review", []);
  const cfg = loadReviewConfig(dir);
  assert.equal(cfg.errors.length, 0);
  assert.equal(cfg.reviewers.filter(r => r.enabled !== false).length, 0);
});

test("an empty validate selection reads as zero enabled checks, the exact BEH-5 predicate", async () => {
  const dir = await createTempDir();
  writeRegistrySelection(dir, "validate", []);
  const cfg = loadValidateConfig(dir);
  assert.equal(cfg.errors.length, 0);
  assert.equal(cfg.checks.filter(c => c.enabled !== false).length, 0);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cross-skill/governance-opt-in-handoff.test.mjs`
Expected: FAIL — until Tasks 2-7 land in this same worktree, `writeRegistrySelection` and the
warning predicates it feeds are unavailable/unwired. (If run after Tasks 2-7 are already merged,
this instead documents the intended RED state pre-existed only in a fresh worktree; the practical
verification is `npm test` passing after Implement.)

- [ ] **Implement** — no production code changes; this task is pure verification once Tasks 2-7
have landed. If any assertion fails, it identifies a real gap in one of Tasks 2-7 to fix in this
task's own commit (test-driven discovery is in scope here, since BEH-7 exists specifically to
catch hand-off gaps the isolated per-skill tests miss).

- [ ] **Verify test passes**

Run: `node --test tests/cross-skill/governance-opt-in-handoff.test.mjs` → PASS.

- [ ] **Write failing test (overlay partial-selection case)**

```javascript
// appended to tests/risk-tiers/tier-overlay-referential-integrity.test.mjs
describe('tier overlays vs. a partial operator selection', () => {
  it('strict review-overlay warns exactly once, naming the id the operator did not select', () => {
    const removedId = 'structural-architect'; // named in strict's `enable:` list
    const partial = softwareReviewers.filter(r => r.id !== removedId);
    const overlay = loadRiskTierConfig('strict', 'review-overlay', PLUGIN_ROOT);
    const { reviewers, warnings } = applyReviewTierOverlay(partial, overlay);

    const unknownIdWarnings = warnings.filter(w => w.code === 'RISK_TIER_OVERLAY_UNKNOWN_ID');
    assert.equal(unknownIdWarnings.length, 1);
    assert.match(unknownIdWarnings[0].message, new RegExp(removedId));

    // security-reviewer (the overlay's other `enable:` target) IS in the partial
    // selection and still gets re-enabled; every other kept entry is untouched.
    assert.equal(reviewers.find(r => r.id === 'security-reviewer').enabled, true);
    assert.equal(reviewers.length, partial.length);
  });

  it('prototype review-overlay (severity_caps path) warns exactly once, naming the id the operator did not select', () => {
    const removedId = 'termination-reviewer'; // named in prototype's `severity_caps:` map
    // Exercises applyIdValueMap (severity_caps), the other overlay-application path
    // from Task 10's first case (applyIdListField, via strict's `enable:`).
    const partial = softwareReviewers.filter(r => r.id !== removedId);
    const overlay = loadRiskTierConfig('prototype', 'review-overlay', PLUGIN_ROOT);
    const { reviewers, warnings } = applyReviewTierOverlay(partial, overlay);

    const unknownIdWarnings = warnings.filter(w => w.code === 'RISK_TIER_OVERLAY_UNKNOWN_ID');
    assert.equal(unknownIdWarnings.length, 1);
    assert.match(unknownIdWarnings[0].message, new RegExp(removedId));
    assert.equal(reviewers.length, partial.length);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/risk-tiers/tier-overlay-referential-integrity.test.mjs`
Expected: the new describe block runs against code already proven correct (BEH-9's generic
preservation and BEH-10's unknown-id warning both apply regardless of input) — this pins the
specific partial-input scenario rather than discovering new production-code failures; if it
fails, it names a real regression in `applyReviewTierOverlay` to fix.

- [ ] **Implement** — correct the file's docstring (top-of-file comment) per the description
above; no other production code changes are expected.

- [ ] **Verify test passes**

Run: `node --test tests/risk-tiers/tier-overlay-referential-integrity.test.mjs` → PASS;
`npm test` → 0 failures, full suite.

- [ ] **Commit**

```bash
git add tests/cross-skill/governance-opt-in-handoff.test.mjs \
        tests/risk-tiers/tier-overlay-referential-integrity.test.mjs
git commit -m "test(cross-cutting): cross-skill governance hand-off + partial-selection overlay coverage" \
  -m "Spec: .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md" \
  -m "Plan-task: 10"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are
recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from the spec satisfied (all 9 checkboxes in the spec's Acceptance
  Criteria section)
- No constitutional violations: no inline Node in any `skills/*/SKILL.md` edit (all ten tasks
  edit skill prose only, never add executable directives); no new external dependency; all new
  `.mjs` files are pure ESM

If `governance/gates.yaml` exists, use its gate definitions instead of constitution Quality
Gates. This repo's own `governance/gates.yaml` (dogfooded) declares the `test` fast-tier gate
(`npm test`) as the deterministic gate this plan's own implementation must pass.
