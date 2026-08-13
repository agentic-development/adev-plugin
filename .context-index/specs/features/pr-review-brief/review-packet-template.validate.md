# Validation Report: Review Packet Template

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/pr-review-brief/review-packet-template.spec.md`
> **Plan:** `.context-index/specs/features/pr-review-brief/review-packet-template.plan.md`
> **Overall Status:** PASS_WITH_NOTES

---

## Run Header

- **Rigor tier:** risk policy resolved `quick` (`risk_level: low` → `policies.low.validate_mode: quick`); **escalated to `full`** by operator step-context directive ("let it run its full check set to completion"). Recorded rather than applied silently.
- **Workspace:** none detected — repo-scoped validation, no cross-repo `depends-on` resolution.
- **Infrastructure preflight:** not run — the spec declares no `infra_requirements`.
- **Registry:** `.context-index/governance/validate.yaml` loaded, 6 checks, no loader errors.
- **Registry warning (`adev domain load-gates`):** `INVALID_GATE — Gate 'test' command must be an argv list (array), not a string — skipped.` The project's `governance/gates.yaml` `test` gate is **dead config**; the executed fast-tier gate is the software-domain default `quality-gate` (`["npm","test"]`). Same command today, so no behavioral difference — but `gates.yaml` should be migrated to argv form or it will keep being ignored.
- **Skill extensions:** `__NONE__`.
- **Heuristics:** 3 loaded for module `pr-review-brief` (token-measurement / cache-cost / summarized-output). None bear on this artifact.

---

## Check 1: Quality Gates — PASS_WITH_NOTES

**Check 1a (fast):** `npm test` — exit 1 (50.7s)

```
ℹ tests 5131   ℹ pass 5094   ℹ fail 5   ℹ cancelled 30   ℹ skipped 0   ℹ todo 2
```

Every failing and cancelled test resolves to one of three files, all under `tests/repomap/`:

| File | Failed | Cancelled |
|---|---|---|
| `tests/repomap/index.test.mjs` | 1 | 18 |
| `tests/repomap/parse.test.mjs` | 1 | 12 |
| `tests/repomap/non-code-references.integration.test.mjs` | 3 | 0 |

Single root cause, confirmed by reading the log rather than accepting the claim:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'web-tree-sitter'
  imported from lib/repomap/parse.mjs
```

`web-tree-sitter@^0.26.7` and `tree-sitter-typescript@^0.23.2` are declared in `package.json` (lines 56–57) but are not installed in this worktree. The failure is **environmental and pre-existing**, unrelated to this change set — nothing in the spec's source manifest is imported by `lib/repomap/`. The obligation carried into this step was "no NEW failures", and it holds: the +10 test delta over baseline is exactly the 10 cases added by `tests/pr-review-packet.test.mjs`, and all 10 pass.

**Check 1b (integration):** no gates configured — skipped.
**Check 1c (e2e):** no gates configured — skipped.

Recorded as **PASS_WITH_NOTES, not FAIL**: the gate command's non-zero exit is fully attributed to pre-existing environmental breakage outside this spec's blast radius. Checks 2–11 were therefore not fail-fast skipped. `npm ci` (or reinstalling `web-tree-sitter`) restores a clean green gate; that is a worktree-setup fix, not a code fix.

**Legacy `gates:` in manifest.yaml:** not present — no migration warning.

## Check 1.5: Source Manifest Verification — PASS

```
Check 1.5: PASS — source manifest matches (sha: 1c5e80b)
```

All 8 listed files match their stamped SHA-256 content. Validator-side git-tracked wrapper: every file has a commit, and every file's last commit (`dc9e808f` or `897e467c`) precedes the `573a0fdd` stamp. `889fb116` touched none of them. No file exists on disk uncommitted.

## Check 1.6: Code-Side Drift Warning — PASS (non-blocking)

```json
{ "drifted": false, "drift_source": null, "drift_at": null }
```

This spec carries no `drift_detected` flag and the source-manifest fallback also matches.

**Note, not a finding on this spec:** three *other* specs on this branch carry `drift_detected: true` — `graduated-rigor-tiers.spec.md`, `single-front-door.spec.md`, `parallel-implement.spec.md`. Each was raised correctly by the detector because Task 2 edited `skills/validate/SKILL.md` and `skills/implement/SKILL.md`, which appear in those specs' source manifests. They are their owners' to resolve; this run did not clear them and did not restamp another spec's manifest.

## Check 2: Spec Compliance — PASS_WITH_NOTES

Every verdict below is grounded in a Read of the actual file in this run. No citation is inferred from the spec or the plan, and no plan checkbox was used as evidence.

- **AC-1 — four H2 headings, in order, literal text:** PASS. `.github/pull_request_template.md:1,7,14,20` carry `## What`, `## Risk areas and trust boundaries touched`, `## Verified line by line`, `## What I cannot explain` — byte-identical to the spec's Structural Shape fence (spec lines 42–66). Pinned by `tests/pr-review-packet.test.mjs:26-30`, which asserts `deepEqual` against the ordered `PACKET_HEADINGS` constant (exact, not `includes`).
- **AC-2 — exactly one marker pair, nothing between:** PASS. Template lines 27–28. `tests/pr-review-packet.test.mjs:36-43` counts each marker occurrence with `assert.equal(..., 1)` and asserts the between-slice trims to `""`.
- **AC-3 — closing marker is the last non-blank line:** PASS. Template line 28 is the final line. `tests/pr-review-packet.test.mjs:45-48`.
- **AC-4 — `## What I cannot explain` present by literal heading match:** PASS. Template line 20; asserted separately at `tests/pr-review-packet.test.mjs:50-54` so deletion fails with a message naming the section rather than as a generic order diff.
- **AC-5 — every H2 followed by an HTML-comment prompt:** PASS. Template lines 3–5, 9–12, 16–18, 22–25. `tests/pr-review-packet.test.mjs:56-66`.
- **AC-6 — `adev pr body` interlock:** **DEFERRED WITH CAUSE — not a coverage gap.** The verb does not exist; it is defined by `pr-body-composition.spec.md`, which is review-BLOCK with its build halted. Plan Task 3 is sequenced `[BLOCKED — do not dispatch]` (plan lines 346–415) and carries the pinned assertion settling review finding CON-1: *no output line begins with `## ` followed by one of the four packet headings*, with inline backtick-quoted `` `## What` `` in advisory prose explicitly permitted. Nothing was stubbed to make this green, which is the correct outcome — plan line 396 forbids it. See Open Items.
- **AC-7 — SKILL.md consumers name the template, no step directive, no inline Node:** PASS. `skills/validate/SKILL.md:566` and `skills/implement/SKILL.md:649` each append `--body-file .github/pull_request_template.md` to an existing `gh pr create` line inside an already-fenced agent-output block. The diff (`dc9e808f..897e467c`) is one changed line per file, no new H3 section, no `adev <verb>` adjacent to inline Node, no control flow. Asserted at `tests/pr-review-packet.test.mjs:70-91` — and the assertion is universally quantified over *every* line containing `gh pr create`, so a future unflagged suggestion also fails.
- **AC-8 — no new dependency, no build step, `package.json` unchanged:** PASS. `git diff bede7e4e..HEAD -- package.json .claude-plugin/plugin.json` is empty.
- **AC-9 — kebab-case exception recorded in the spec:** PASS. Spec line 74 (Structural Shape → "Naming exception") and again at line 104 (System Constitution Reference).
- **AC-10 — all quality gates pass:** PARTIAL. See Check 1: the gate exits non-zero solely on pre-existing `tests/repomap/*` environmental failures. Every gate-relevant test touching this change set passes.
- **AC-11 — no constitutional violations beyond the documented naming exception:** PASS. See Check 4.

### Test integrity sub-check

The check hunts for *weakened* assertions. The opposite happened — the implementation **strengthened** the plan's tests in two places, both correctly:

- `tests/pr-review-packet.test.mjs:40` adds `assert.ok(body.indexOf(OPEN_MARKER) < body.indexOf(CLOSE_MARKER))`. Without it, an inverted pair would still satisfy the count-and-slice assertions.
- `tests/pr-review-packet.test.mjs:62` adds `&& next.trim() !== OPEN_MARKER`. Without it, the last section's "prompt" could be satisfied by the marker pair itself, letting `## What I cannot explain` ship bare.

No loose matchers where exact values were available (`deepEqual` on the heading list, `equal` on counts), no conditional skips, no try/catch around assertions, no non-falsifiable assertions, and no assertions over runtime/dynamic data — every case reads a committed file from the working tree.

### Coverage rationale (stated, not a gap)

The AC-7 test asserts only the two canonical SKILL.md files, not the four `providers/{codex,opencode}/skills/**` mirrors. That is deliberate: mirror correctness is delegated to `tests/sync/provider-skill-parity.test.mjs`, which runs the sync script in `--dry-run` inside `npm test` and fails on any drift. It passed this run. Duplicating the assertion across mirrors would test the sync script twice, not the contract.

### Scope-expansion sub-finding — none attributable to this spec

The branch carries material beyond this spec (7 session files, two sibling specs, the charter, `product.md`, three cross-charter drift flags). Attribution matters here: this spec's three commits — `dc9e808f`, `897e467c`, `573a0fdd` — touched **only** files declared in the plan's File Structure section. `889fb116` is pipeline-artifact landing, not spec implementation. The `product.md` +1 line is the charter's registration row in the feature table, not a drift flag. No scope expansion is attributable to this spec.

## Cross-Repo Dependency Validation — N/A

No workspace detected; no cross-repo `depends-on` references.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS. The change set is one new static file, two prose lines in existing SKILL.md files, four script-regenerated mirrors, and one test file. Nothing touches the Requires-Human-Approval list — no new skill in the lifecycle order, no hook stdin/stdout protocol change, no CLI install path change, no `.claude-plugin/plugin.json` change, no new dependency. Both edits land squarely inside the Autonomous list ("Editing skill markdown content", "Updating templates", "Adding tests", "Updating specs when code changes their assumptions").
- **Non-negotiable principles:** PASS.
  - *P1 minimize external dependencies* — `package.json` byte-unchanged; the artifact is static Markdown consumed by GitHub verbatim, no templating library, no build step.
  - *P2 skills are primarily markdown* — the SKILL.md edits add prose only.
  - *P3 pure ESM* — `tests/pr-review-packet.test.mjs` is `.mjs`, uses `import`, `node:test`, `node:assert/strict`, and `fileURLToPath`-derived `__dirname`. No `require`, no `module.exports`.
  - *P4 hook protocol compliance* — untouched.
  - *P5 version parity* — `package.json` and `.claude-plugin/plugin.json` both unchanged, so parity is preserved. Worth stating explicitly since CLAUDE.md's Autonomous list *permits* a version bump on a feature PR while AC-8 forbids touching `package.json`: permits is not requires, so there is no conflict and no violation.
- **Coding standards:** PASS with one documented exception.
  - *Commit trailers* — verified by reading the commit bodies, not the plan's intended blocks. All three commits carry `Spec: .context-index/specs/features/pr-review-brief/review-packet-template.spec.md`; `dc9e808f` and `897e467c` additionally carry `Plan-task: 1` / `Plan-task: 2`; all three carry `Author-type: agent/claude-code` and `Operator: dpavancini/local`.
  - *Anti-pattern "no executable logic inside SKILL.md"* — respected. The edits add a flag to an existing suggestion inside an already-fenced output block; no step directive, no `node -e`, no `Run inline Node.js:`, no both-forms H3 section. `tests/pr-review-packet.test.mjs:84-90` pins this, and the `.githooks/pre-commit-no-inline-node` chain did not fire (no `--no-verify` on any of the three commits).
  - *Convention "kebab-case for files"* — **documented exception.** `pull_request_template.md` is snake_case because GitHub resolves that exact path and no other. Recorded in the spec at line 74 and again at line 104, before a reviewer could rediscover it. This is precisely the exception AC-11 contemplates.
  - *Naming/structure elsewhere* — `pr-review-packet.test.mjs` is kebab-case, camelCase locals, Node built-ins imported before relative imports (there are none).

## Check 8: Boundary Compliance — PASS

`.context-index/governance/boundaries.yaml` exists and declares `boundaries: []` — no rules configured, so no rule can be violated. (The plan and `routing.json` both describe this file as "absent"; it is present but empty. Same practical outcome, noted so the record is accurate.)

## Check 9: Transition Gates — N/A

`.context-index/governance/gates.yaml` declares `transitions: {}`. No `implement-to-validate` or `implement-to-merge` transition is configured. SKIP.

## Check 11: Visual Verification — N/A

Case A of the trigger matrix: **no UI files in the implementation diff, and no Playwright MCP available.** The change set is `.github/pull_request_template.md`, `tests/pr-review-packet.test.mjs`, and six `SKILL.md` files — nothing matches `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, and nothing sits under `components/`, `pages/`, `views/`, `public/`, or `app/`. SKIP is the correct outcome, not a bypass.

---

**Summary:** 6 passed (1.5, 2, 4, 8 — plus 1 and 1.6 with notes), 0 failed, 2 skipped by trigger guard (9, 11). One acceptance criterion (AC-6) is deferred with cause and remains open.

## Open Items

1. **AC-6 — `adev pr body` interlock test.** Deferred by design, tracked as plan Task 3 `[BLOCKED]`, and unblocked only when `pr-body-composition.spec.md` clears review and the verb ships. The pinned assertion wording is already recorded in the plan so it is not re-litigated. Issue board task #3 stays open.
2. **`governance/gates.yaml` `test` gate is dead config.** Its `command` is a string; the loader requires an argv list and skips it. The suite runs today only via the software-domain default. Migrate to `command: ["npm","test"]`.
3. **`web-tree-sitter` not installed in this worktree.** 5 failures + 30 cancellations across `tests/repomap/*`, and the reason `npm test` exits 1. Fix with `npm ci`; no code change involved.
4. **Three cross-charter `drift_detected: true` flags** on `graduated-rigor-tiers.spec.md`, `single-front-door.spec.md`, `parallel-implement.spec.md`, raised by Task 2's SKILL.md edits. Correct detector output; those specs' owners to resolve.
5. **`epic-105` exists but has no child issues.** This directory is a linked git worktree (`git-dir` → `.../adev-plugin/.git/worktrees/adev-plugin-pr-review-brief`), so per `resolveStorageRoot()` the authoritative board is the main repo's: **`/Users/dpavancini/Development/adev-plugin/.context-index/tasks/tasks.json`** (270 issues, 101 epics). The worktree-local copy is stale — it stops at `epic-104` — and reading it would have produced a false "nothing on the board" finding. On the resolved board, `epic-105` *is* present with `planRef: .context-index/specs/features/pr-review-brief/review-packet-template.plan.md`, but **zero issues carry that `planRef` or `epicId: epic-105`**. The post-validation issue step therefore had nothing to annotate or close; no issues were created, since validation is read-and-report. The epic correctly stays `open` — Task 3 / AC-6 is still outstanding. Run `/adev:reconcile` to backfill per-task issues under `epic-105`.
6. **Charter Capability Map not updated by this run.** The normal PASS path flips the covered capability's Status to `validated` in `charter.md`, but this step was scoped to touch only the validate report and this spec's own status field. `.context-index/specs/features/pr-review-brief/charter.md` still shows the pre-validation status for the *Review packet field set* capability and needs a one-line update by whoever owns the charter.

## Post-Validation Actions Taken

- Spec frontmatter `status:` advanced `implemented` → `validated`.
- Eight `validator_report` events emitted (checks 1, 1.5, 1.6, 2, 4, 8, 9, 11) using the registry-prefixed IDs. Checks 1 and 1.6 have no registry entry and tripped the documented `UNKNOWN_VALIDATOR_DEFAULTED` fallback to `severity: warning`, as the skill anticipates.
- `lifecycle_step:validate completed` emitted with aggregate verdict `PASS_WITH_NOTES`.
- Charter Capability Map and issue board deliberately untouched — see Open Items 5 and 6.

**Merge policy:** `completion.merge_policy: pr`, and `main` is a protected branch. Ready for PR — do not merge directly.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional.
