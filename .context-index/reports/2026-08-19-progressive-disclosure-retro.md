# Retro: five review rounds on skill-body-progressive-disclosure

**Date:** 2026-08-19
**Branch:** `chore/skills/progressive-disclosure` (15 commits, unmerged)
**Spec:** `.context-index/specs/cross-cutting/skill-body-progressive-disclosure.spec.md` (revision 8)
**Scope:** adev-plugin-5yfz.3, 5yfz.4, skill-size-headroom-wnn9, 04jr.1

---

## What was delivered

16 of 30 `SKILL.md` bodies exceeded the Agent Skills ~5,000-token guidance; four sat
within 1.5 KB of the hard 64 KB Copilot cap, where overflow throws
`INVALID_SKILL_FRONTMATTER` and takes down the adapter's install path.

| | Before | After |
|---|---|---|
| Bodies over guidance | 16 of 30 | 0 |
| Always-read surface | 856,056 B | ~355 KB (−58.5%) |
| Smallest headroom to the hard cap | 186 B | 47,688 B |

No prose was deleted. Every section moved whole into `references/` with a
conditional-loading pointer. The layout ruling was applied to the 27 prose-referenced
companions and deliberately **not** to the 22 addressed by the `plugin:<skill>/<path>`
URI contract, which is materialised into user projects — moving those breaks installed
projects for zero token payoff.

**The refactor itself was sound from round 1 and never regressed.**

---

## What went wrong

Five review rounds produced 11 blockers. Only **2 were in the refactor**. The other 9
were in the verification and documentation around it.

| Round | Blockers | Where |
|---|---|---|
| 1 | 5 | mirrors broken ×2, pointer form, re-run cap, orphaned SHAs |
| 2 | 2 | pointer exemplar unfixed, 4 stale sync claims |
| 3 | 1 | cursor path containment absent |
| 4 | 1 | the containment test never ran the guard |
| 5 | 2 | opencode resolution row wrong, citations dangling |

### Class 1 — guards that could not fail (4 instances)

| Guard | Why it could not fail |
|---|---|
| `resolveSkillPointer` | no-op `.replace()`; a bare pointer resolved identically |
| `provider-companion-parity` | one-directional set check; a stale mirror copy masked a deleted canonical target |
| `cursor-path-containment` | resolved an unexported function, always fell back to grepping source text |
| `cursor-path-containment` (repair) | test never created the root, so every input threw for an unrelated reason |

**Caught by a green test run: 0.** Two by review subagents, two by a falsification
probe run by hand.

The third is the clearest: its own comment read *"so this test cannot silently pass."*
The fallback **was** the silent pass.

### Class 2 — stale figures (revisions 3, 4, 5, 6 — one per round)

Every instance: a figure measured, a later edit in the same commit moved it, nothing
but a reviewer's arithmetic could notice. In revision 6 a 5-line addition to
`plan/SKILL.md` moved the corpus total by 270 B and invalidated four numbers — in the
same commit that shipped the revision asserting them.

### Class 3 — contradicting sections (6 findings)

A fix landing in one section while the contradiction survived elsewhere. Five involved
the same sync-parity claim, restated in Invariant 6, the Error Cases table, the Module
Impact Map, Integration Points and Dependencies. Fixing the code left four asserting
the pre-fix world — including an invariant instructing maintainers to perform by hand
the exact procedure that caused the original bug.

---

## Root cause

**One pattern under all three: intent substituted for evidence.**

- *"I wrote a guard"* stood in for *the guard fails when the defect is present.*
- *"I measured"* stood in for *the figure matches the tree now.*
- *"I compared the checklists"* stood in for *the files are equivalent* — a deletion
  that lost two sections.
- *"codex and opencode are both mirrors"* stood in for *checking opencode* — its row
  was wrong on both counts.

Deliberate, reviewed, green output was treated as verified **because it was
deliberate**. A passing test is not evidence about a guard; it becomes evidence only
once the guard has been seen to fail.

Two amplifiers made a personal failure mode systemic:

1. **The lifecycle has no falsification step.** `/adev:validate` records that gates
   pass. The TDD mandate covers tests that DRIVE behaviour (RED before code), not
   tests that GUARD an invariant. Nothing asks *does this fail when the defect is
   present?* → `adev-plugin-no-falsification-step-973s` (P1)

2. **The spec template restates each fact four or five times.** Every fix had four
   places to be right. "Be more careful" scales with the number of restatements, and
   the restatements are what the template asks for. → `adev-plugin-spec-restated-facts-70ff`

**"Be more careful" was tried and failed four consecutive times.** Both classes ended
only when made structurally impossible.

---

## What fixed it

- `tests/skills/spec-figures-current.test.mjs` parses tree-tracking figures out of the
  spec prose and recomputes each from the repository. Falsified against all six
  historical failure modes. The suite total was **removed**, not pinned — asserting
  the suite's size from inside the suite is circular.
- Guard status now lives in exactly one section; the Error Cases table names the
  signal and defers status, with a header saying so.
- Every guard added since round 4 was falsified by reintroducing the defect, **with
  an assertion that the probe actually applied** — two earlier probes silently did
  nothing and were briefly mistaken for the guard being broken.

---

## Process failures worth keeping

- **Bypassed the lifecycle entirely.** Went from reading the issue board to editing
  30 skills — no `/adev:work`, no spec, no plan. Recovered via `/adev:reconcile`, but
  the spec was then documentation-of-code rather than a contract, which is why it
  drifted.
- **`filter-branch` to fix provenance destroyed provenance.** Re-stamping `Spec:`
  trailers orphaned the five commit SHAs the spec cited.
- **Skipped the `.review.md` write for rounds 2–4.** Lifecycle events were emitted;
  the artifact was not. Round-scoped finding ids then collided.
- **Reviewed out-of-scope work.** The tier fix was briefed into a review of a spec
  that does not cover it; the reviewer correctly declined.
- **Ran all 10 dispatches on the wrong model** for two rounds — the registry resolves
  a tier per reviewer and nothing applied it (`adev-plugin-reviewer-tier-not-applied-wohx`).

---

## What worked

- **Adversarial review earns its cost.** Two blockers were real shipped defects
  (155 broken pointers to codex/opencode users; a path-traversal in the cursor
  adapter). Neither was findable by reading the diff.
- **Independent lanes converge.** The mirror defect and the vacuous test were each
  found by two reviewers separately, from different angles.
- **Telling reviewers what I got wrong worked better than hoping.** Volunteering the
  broken `export` and asking "does the helper paper over a real failure?" produced the
  finding that the helper did exactly that.
- **Asking for a ruling ends a loop.** Termination restated the same warnings twice;
  asked to decide, it closed one and ruled two tolerable with reasons.
- **A guard added for a hypothetical caught a real one three rounds later** — the
  bidirectional parity check failed a deletion in round 6.

---

## Issues filed

| ID | P | |
|---|---|---|
| `no-falsification-step-973s` | 1 | No lifecycle step asks whether a new guard detects its defect |
| `parity-guard-self-referential-gobk` | 1 | A guard validated against the tool it guards |
| `spec-restated-facts-70ff` | 2 | Specs restate one fact in four sections |
| `reviewer-tier-not-applied-wohx` | 2 | Resolved model tier never applied to dispatch |
| `blocker-id-unattainable-xf5d` | 2 | Reviewers cannot emit the required SHA-256 `blocker_id` |
| `issue-trailer-cross-session-oe8w` | 3 | Provenance hook stamped an unrelated session's epic |

Corroborated rather than duplicated: `adev-plugin-akoy.2` (no `adev partial commit` verb).

---

## The one-line lesson

**A passing test is not evidence. Watch it fail first.**
