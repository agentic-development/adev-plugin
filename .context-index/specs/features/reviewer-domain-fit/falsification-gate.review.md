---
spec: .context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md
charter: reviewer-domain-fit
date: 2026-08-18
verdict: BLOCK
rigor-tier: quick
last-reviewed-revision: 5
file-sha: 7d257935599ed3ac6d5e0ce5cc955e50f716c6d89412a69aef9b4d8b0ce36953
---

# Architecture Review: falsification-gate

> **Date:** 2026-08-18
> **Spec:** `.context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md`
> **Charter:** `.context-index/specs/features/reviewer-domain-fit/charter.md`
> **Rigor tier:** quick (explicit `--tier quick`; risk policy for `medium` would have selected `full`)
> **Verdict:** BLOCK

## Registry Notes

Registry loaded with zero `errors`. Warnings surfaced by `adev governance reviewers --json`:

- `BROADEN_TOOL` — Profile `browser-review`: `allow_add` broadens posture by adding mcp_server `playwright`.
- `BROADEN_TOOL` — Profile `browser-review`: `allow_add` broadens posture by adding category `web-fetch`.
- `BROADEN_NETWORK` — Profile `browser-review`: network broadened `deny` → `read-only`.

Event-write advisory: `UNKNOWN_REVIEWER_DEFAULTED` — `quick-synthesized-reviewer` is not declared in
domain `software`, so its `reviewer_report` severity defaulted to `warning`. This is expected for the
bundled quick-tier reviewer and does not affect the consolidated verdict, which is computed from
post-cap finding severities.

Transition gates: `gates.yaml` declares no `spec-to-plan` transition (it is commented out), so no
approver role applies.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable | `plugin:review-specs/quick-synthesized-reviewer-prompt.md` |

Context pack: `review-base` (constitution, platform-context, parent charter; no sibling specs exist
under this charter). Rendered `delivery: inline`, zero pack errors, zero pack warnings. Module
heuristics for `reviewer-domain-fit` were injected.

The three registry reviewers (`structural-architect`, `security-reviewer`, `consistency-analyzer`)
were **not** dispatched — the `quick` tier skips the registry loop by design.

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** FAIL

### SA-1 — `blocker`

- **blocker_id:** `quick-synthesized-reviewer:false-mechanism-claim:3708f075`
- **section_anchor:** `Procedure > Step 4: Run the review against each mapped spec at its pre-fix revision`
- **Location:** Step 4, item 4, final paragraph ("Record the resolved plugin root, NOT `adev --version`")

**Finding.** The spec asserts that both invocations "print `unknown verb: --version` plus the usage
banner and **exit 0** — byte-identical output emitted by the same code in every checkout." The exit
code is wrong. `cli/index.mjs:1942-1946` writes `unknown verb: <verb>` to **stderr** via
`console.error`, prints the verb registry to stderr, and calls `process.exit(1)`. Verified
empirically: the invocation exits 1, not 0.

The paragraph's *conclusion* survives — `--version` genuinely is not a verb (no `version` entry in
`VERB_REGISTRY`, `cli/index.mjs:1843`), so recording it would be a constant and could not
distinguish two plugin roots. But the stated mechanism is false. This spec reached revision 5
precisely because three of four prior blocking findings were false author claims about adev
behaviour; a rev-5 paragraph written to correct one false mechanism claim must not introduce
another.

**Recommendation.** Replace "and exit 0" with the verified behaviour: both invocations print
`unknown verb: --version` on stderr and exit 1 (`cli/index.mjs:1942-1946`), byte-identical in every
checkout, so the output cannot distinguish the two plugin roots.

### CON-1 — `warning`

- **Location:** Step 3, paragraph beginning "Naming the pack is not optional bookkeeping"

**Finding.** The spec states that `UNKNOWN_CONTEXT_PACK` "is raised only in `renderPack`
(`lib/governance/context-pack.mjs:117`)". Line 117 is inside `resolveExtends` (`:102`); `renderPack`
begins at `:227`. `resolveExtends` is also called directly from `review-config.mjs:196`, where the
error is discarded — which is the spec's own point, so the mis-citation undercuts its argument.
Separately, `lib/extensions/content-install.mjs:253` carries a stale comment asserting the opposite
("makes the loader push `UNKNOWN_CONTEXT_PACK`, which aborts the whole review"); a reader
reconciling the two has no way to tell which is authoritative.

The *behavioural* claim is verified correct: `loadReviewConfig` does `continue` past an unresolvable
pack (`review-config.mjs:196-200`), and `renderPack` returns `rendered: ""`
(`context-pack.mjs:239-252`). Only the citation needs repair.

**Recommendation.** Reword to: raised by `resolveExtends` (`context-pack.mjs:102-121`); it reaches a
caller only through `renderPack`, which returns `rendered: ""` (`context-pack.mjs:239-252`), while
`loadReviewConfig:196-200` swallows it.

### SA-2 — `warning`

- **Location:** Step 4, opening paragraph ("Exactly one thing is historical: the spec text under review")

**Finding.** The invariant and the procedure disagree about the context pack. Step 4.4 pins the run's
project root to the scratch worktree, and `renderPack` resolves include globs against that
`repoRoot` — so the pack's *declaration* is current (copied in at 4.2) while its *rendered file
bodies* are historical. The spec lists "its context pack" among the things that "must be the CURRENT
versions," which is only half true, and Step 3's glob check ("match at least one file in the
worktree being reviewed") already assumes the historical reading.

**Recommendation.** Split the invariant explicitly: the reviewer registry, prompt, pack
*declaration*, and plugin root are current; the spec text and the pack's *rendered sources* are
historical by design. Carry the distinction into the acceptance criterion covering pack rendering so
a run is not later voided on the ambiguity.

## Verification Log

The reviewer was directed to verify every mechanism claim the spec makes about adev internals
against source. Results:

| Spec claim | Verified against | Held? |
|---|---|---|
| `loadReviewConfig` `continue`s past an unresolvable pack | `lib/governance/review-config.mjs:196-200` | yes |
| Empty `errors` does not prove a pack resolved | `validateReviewer` never checks `context_pack` | yes |
| `UNKNOWN_CONTEXT_PACK` raised only in `renderPack` at `context-pack.mjs:117` | `:117` is inside `resolveExtends` (`:102`); `renderPack` starts `:227` | **no — mis-attributed (CON-1)** |
| `renderPack` returns `rendered: ""` on that error | `context-pack.mjs:239-252` | yes |
| `renderPack(..., { repoRoot, targetSpecPath })` signature | `context-pack.mjs:227-228`; `SKILL.md:211` | yes |
| `loadReviewConfig` reads `review.yaml` from the run's repoRoot (`:79,108`) | `review-config.mjs:68,79,107-108` | yes |
| Project `review.yaml` IS the whole set; `mergeReviewers` not on this path | `review-config.mjs:107-115,421`; `mergeReviewers` only in `materialize.mjs:351`, `cli/domain.mjs:317` | yes |
| `quick` tier skips the registry loop (Step 4) | `skills/review-specs/SKILL.md:188,200` | yes |
| `--tier full` / `--spec <path>` flags exist | `SKILL.md:16,18` | yes |
| `getPluginRoot()` derives two levels up from `lib/profiles/index.mjs` | `lib/profiles/index.mjs:28-30` | yes |
| `adev --version` is not a verb | `cli/index.mjs:1843,1937-1946` | yes |
| …and both invocations exit 0 | `cli/index.mjs:1944-1946` — `console.error` + `process.exit(1)` | **no (SA-1)** |
| Every pre-fix commit predates `a25971e2` (2026-08-16) | `git log -- .context-index/governance/review.yaml`; named fixes `0476a7bc`/`8d8d5c5a`/`11b179d7` are 2026-08-14 | yes |
| Relative `prompt:` resolves under `.context-index/` | `review-config.mjs:657-666` | yes |
| `adev governance reviewers --json` exists, does not render packs | `lib/cli/governance.mjs:50,140-188` | yes |
| `adev heuristics signature --origin … --blocker-id …` exists | `lib/cli/heuristics.mjs:77,135` | yes |
| `adev diagnose` exists | `cli/index.mjs:1886` | yes |
| `reviewer_report` / `lifecycle_step` events, `.review.md` / `.blockers.md` sidecar | `SKILL.md:319,335,339` | yes |
| Ids `he2, r5sc, zx5, rftq, ysqd` exist as closed issues | `.beads/issues.jsonl` | yes |

## Heuristics — prior occurrences of this blocker

The following heuristics are lessons learned from past work in this module. Use them as guidance,
not as hard rules.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from `~/.claude/projects/` (`message.usage` fields). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

---

## Summary

**Total findings:** 3 (1 blocker, 2 warnings, 0 suggestions)

**Action required:** Revise the spec to rev 6. The blocker is a one-sentence factual correction in
Step 4 item 4 (exit code 1, on stderr — not exit 0); the conclusion the sentence supports is sound
and needs no structural change. The two warnings (a mis-cited raise site in Step 3, and the
current-vs-historical ambiguity about the context pack in Step 4) are worth folding into the same
revision. Run `/adev:specify --revise` against
`.context-index/specs/features/reviewer-domain-fit/falsification-gate.blockers.md`, then re-review.
