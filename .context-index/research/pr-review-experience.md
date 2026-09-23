---
topic: "Improving the PR review experience for humans reviewing agent-authored changes"
date: "2026-08-12"
relates-to: "epic-106"
sources:
  - internal
  - web
status: draft
---

## Summary

This repo's PR sizes are **bimodal**, not merely "large": across the last 40 merged PRs the median is 116 added lines, but p75 jumps to 2,100 and 41% of PRs exceed 400 additions — and those large PRs carry **96% of all changed lines**. Almost nothing lands in the 100–900 line band that review research identifies as the effective range. Meanwhile the repo already produces exactly the machine-readable signals a reviewer needs to triage a big diff — per-commit `Spec:`/`Plan-task:`/`Author-type:` trailers, `/adev:route` blast-radius scores, `/adev:validate` PASS/FAIL reports — and **surfaces none of them at PR time**. The highest-leverage fix is therefore not "write smaller PRs" (partly infeasible, partly already true) but **rolling up the provenance the lifecycle already emits into a single advisory PR comment that tells the reviewer where to spend attention**.

Extends `.context-index/research/review-validation-restructuring.md` by adding the PR-review row to its "cheapest fix point" model (see Finding 8). Recommendations are tracked as `epic-106` (`issue-529`, `issue-595` … `issue-604`).

> **Two corrections applied after filing (2026-08-12).**
> 1. **Verb naming.** This artifact writes `adev pr-brief` throughout. That name is **superseded by `adev pr body`**, which `issue-529` proposed earlier and which matches the existing CLI shape (`adev issues <sub>`, `adev milestone <sub>`). Read `pr-brief` as `pr body` below.
> 2. **Framework vs. this repo.** Recommendations 1–7 are written as *fix this repo*. The **framework-default** axis — what adev ships to downstream projects — is tracked separately as `issue-529`: an `adev pr` CLI verb plus a PR body contract under `completion:`, alongside `branch_naming`, which already ships as a convention marked "Not enforced, but referenced by skills" and is the precedent for that shape.
>
> **Forge portability.** The content layer is provider-agnostic by construction: its inputs are adev artifacts, so it works unchanged on GitLab, Gitea, Bitbucket, Forgejo, or no forge at all. Only delivery is GitHub-bound (rec 5 / `issue-600`). Defer any forge adapter until adev is actually run against a non-GitHub forge; at that point it follows `lib/issues/registry.mjs` (`json`/`file`/`beads` → adapter, graceful fallback). Do **not** name the knob `provider` — that word already means *agent harness* in `lib/provider/registry.mjs` (`claude-code`/`opencode`/`codex`/`cursor`/`copilot`). Use `forge:`.

## Findings

### Internal

**1. The size distribution is bimodal, and the big tail dominates.**

Measured over the last 40 merged PRs (`gh pr list --state merged --limit 40`), excluding the 8 automated `release-please` PRs (n=32):

| Metric | Median | p75 | p90 | Max |
|---|---|---|---|---|
| Additions | 116 | 2,100 | 2,945 | 5,135 |
| Files changed | 5 | — | 45 | 179 |
| Commits | 2 | — | 13 | 25 |

- 14 of 32 PRs are under 100 additions (trivial to review).
- Only **5 of 32** land in the 100–900 addition band.
- 13 of 32 (41%) exceed 400 additions, and those account for **32,411 of 33,739 total added lines (96%)**.

The largest recent PRs are the ones a human most needs to review and least can:

| PR | Additions | Files | Commits | Title |
|---|---|---|---|---|
| #187 | 5,135 | 179 | 23 | Universal skill extensions sweep + branch backlog |
| #201 | 3,767 | 50 | 25 | adev-managed worktrees + `/adev:implement --parallel` |
| #194 | 3,453 | 36 | 14 | first-class spec amendments |
| #171 | 3,208 | 30 | 14 | adev-managed `.gitignore` block |
| #173 | 2,945 | 17 | 7 | per-spec cost ticker |
| #180 | 2,733 | 38 | 12 | `adev skill-ext load` |
| #199 | 2,158 | 45 | 13 | `/adev:work` as single front door |

Note the shape of #187: its title literally reads "sweep + branch backlog" — an omnibus PR bundling unrelated work. That is a batching artifact, not an inherently large feature.

**2. There is no PR template and no CONTRIBUTING.** `.github/` contains only `workflows/`. PR body quality is currently good (#209's body is genuinely useful: What / Verification / test counts) but it is **unenforced** — it depends entirely on which agent wrote it. The two places the lifecycle tells an agent to open a PR say nothing about the body:

- `skills/validate/SKILL.md:566` — `Ready for PR. Run: gh pr create --base <target-branch>`
- `skills/implement/SKILL.md:649` — `When validation passes, open a PR: gh pr create --base <target-branch>`

**3. Commit provenance is rich but never rolls up to PR level.** Every commit carries structured trailers, e.g. `b42380c4`:

```
Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 2
Issue: epic-103
Author-type: agent/claude-code
Operator: dpavancini/local
```

`manifest.yaml:168-178` requires `Author-type` + `Operator` and recommends `Spec` + `Plan-task`; `.github/workflows/ci.yml` validates them per-commit. But a reviewer opening a 50-file PR gets **no map** of which hunks are agent-authored, which spec each traces to, or which plan task produced it. The only PR-level provenance signal today is a free-text "Generated with Claude Code." footer.

**4. `/adev:route` already computes a reviewer attention map — and discards it.** `<spec>.routing.json` is machine-readable, per-task, with scores and rationale:

```json
{
  "task_id": "t13",
  "selected_agent": "auto-agent",
  "scores": { "spec_completeness": 0.8, "pattern_coverage": 0.6, "blast_radius": 1, "novelty": 0.8 },
  "rationale": "Replaces one status checklist item with an existing adev state current call; ..."
}
```

Blast radius and novelty are precisely "where should a human look hardest." Tasks routed `human-only` or `assisted-agent` are, by the framework's own reasoning, the hunks that most need human eyes. None of this reaches the PR.

**5. `/adev:validate`'s PASS/FAIL report answers half the reviewer's question and is thrown away.** "What was already verified, and by what" is exactly what lets a reviewer *skip* material safely. It is produced pre-PR and never attached.

**6. The CI hygiene comment deletes and re-posts on every push.** `.github/workflows/ci.yml` finds the previous hygiene comment, `DELETE`s it via the API, then posts a fresh one. Every push therefore generates a new-comment notification and destroys any reply thread on the old one. `gh pr comment --edit-last --create-if-none` (confirmed available in the installed `gh`) is the sticky-comment idiom that fixes this.

**7. Big PRs bundle 13–25 commits with no stated reading order.** Plans already contain a `## Parallelization` section that groups tasks — a natural source of review slices — but nothing maps commits to a suggested reading sequence.

**8. This extends, rather than duplicates, `review-validation-restructuring.md`.** That artifact's "catch issues at the cheapest fix point" table stops at Validation. PR review is the *most* expensive fix point of all, which determines its job:

| Phase | Cost to fix | Focus |
|---|---|---|
| Spec Review | Very low | Design flaws, security gaps |
| Plan Review | Low | Task ordering, coverage, sizing |
| Implementation | Medium | Code quality, TDD |
| Validation | High | Does code match spec? |
| **PR Review (this artifact)** | **Highest — rework after integration** | **Orientation and risk targeting, *not* re-checking design** |

The corollary matters: a PR-time recommendation that re-runs design checks is misplaced effort. PR review should tell a human *where to look* and *what has already been verified*.

### Web

**PR size and review effectiveness.** The 200–400 LOC figure traces to SmartBear's Cisco study: defect detection is highest around 200–400 LOC per review and degrades sharply beyond ~400 LOC or ~60 minutes in one sitting. Secondary analyses report PRs of 200–400 lines having ~40% fewer defects than larger ones, 50-line changes being ~15% less likely to be reverted than 250-line ones, and sub-200-line PRs approved ~3x faster. Caveat on sourcing: the widely-circulated aggregations ([cubic.dev](https://www.cubic.dev/blog/does-pr-size-actually-matter)) do not link peer-reviewed methodology, so treat the precise percentages as directional. The same source names legitimate large-PR exceptions — mechanical/generated changes, atomic dependency updates, migrations — which matter here because several of this repo's large PRs (#193 provider skill mirrors, #190 hygiene remediation) are exactly that class.

**Agent-authored PRs are reviewed differently — and worse.** LinearB's 2026 benchmark (8.1M PRs, ~4,800 teams, [via](https://www.aibuilderclub.com/blog/reviewing-ai-generated-pull-requests)) reports 84.5% of manual PRs merging within 30 days against **32.7% of AI-assisted ones**, with reviewer pickup time rising from ~200 minutes to ~1,050 (≈5x). The stated cause is not code quality but reviewer trust and orientation cost: reviewers cannot tell what was verified or what the author actually understands.

**The "review packet" idea.** The same source proposes machine gates *before* human review (dependency/provenance audit, secret scanning + SAST, adversarial second-model pass) so the human gate reduces to three questions: architecture alignment, trust-boundary integrity, and reasoning reconstruction. The submitter provides a structured packet: problem statement in their own words, risk areas and trust boundaries touched, test commands and results, which sections were personally verified line-by-line, and — the load-bearing field — **an honest statement of what they cannot explain**. A blank answer there is itself the first thing to ask about in review.

**Provenance conventions have converged on a trailer.** The Linux kernel merged `Documentation/process/coding-assistants.rst` with the 7.0 release, prescribing:

```
Assisted-by: AGENT_NAME:MODEL_VERSION [TOOL1] [TOOL2]
```

with the explicit rule that **AI agents MUST NOT add `Signed-off-by`** — only humans can certify the DCO — and that the human submitter is responsible for reviewing all AI-generated code, license compliance, and taking full responsibility. Other projects differ: Apache uses `Generated-by:`, Fedora requires disclosure when a significant unchanged portion came from a tool, MicroPython uses a per-PR checkbox, and NetBSD/QEMU/OpenTofu restrict or decline AI contributions outright. This repo's existing `Author-type: agent/claude-code` + `Operator:` pair is **already more informative than the kernel standard** — it names both the agent class and the accountable human. The gap is PR-level presentation, not commit-level data.

**Generated reviewer guides are now table stakes in review tooling.** CodeRabbit generates PR walkthroughs plus severity-ranked inline comments (reportedly 2M+ repos, 13M+ PRs). Greptile indexes the whole codebase rather than just the diff and emits sequence diagrams per PR; in a 50-PR head-to-head it reports catching ~50% more bugs than diff-only review. The transferable idea for this repo is not the vendor but the artifact: **a structured, regenerated-in-place summary comment that orients the reviewer before they read a line of diff.**

**GitHub shipped review features that fit this repo unusually well.**
- [Copilot code review now reads repository `AGENTS.md`](https://github.blog/changelog/2026-06-18-copilot-code-review-agents-md-support-and-ui-improvements/) automatically for repo conventions (2026-06-18).
- [Agent skills and MCP are GA for Copilot code review](https://github.blog/changelog/2026-07-29-copilot-code-review-agent-skills-and-mcp-now-generally-available/) (2026-07-29): a `SKILL.md` under a subdirectory of `.github/skills` injects team standards into the review; MCP tool calls are read-only, with GitHub and Playwright MCP on by default.
- Billing changed: [Copilot code review consumes Actions minutes on private repos plus AI Credits from 2026-06-01](https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/).

This repo already authors `SKILL.md` files and already syncs its constitution to an agent file — so the mechanism GitHub's reviewer consumes is the mechanism adev already produces. One gap: **`AGENTS.md` does not exist here and is not declared as a sync target.** `manifest.yaml:18-21` lists exactly one target, `CLAUDE.md` (format `claude`), and `ls AGENTS.md` returns no such file. Copilot code review reads `AGENTS.md`, not `CLAUDE.md`, so the automatic-context feature currently cannot fire on this repo.

**Stacked PRs.** GitHub still has no native stacked-diff support; [Graphite](https://graphite.com/guides/stacked-diffs) remains the dominant tool (auto-rebase on parent merge, merge queue), with OSS alternatives like `charcoal`. The relevant property is that each PR in a stack is independently reviewable and the reading order is explicit — which is what the 13–25-commit PRs here lack. Adopting Graphite is a real external-tooling dependency; the cheap approximation is a **stated reading order in the PR body**, derived from the plan's task sequence.

## Code Examples

```yaml
# Example: sticky advisory comment instead of delete-and-repost
# Source: adapted from .github/workflows/ci.yml (Context hygiene check)
#         + `gh pr comment --edit-last --create-if-none` (verified in installed gh)
- name: Reviewer orientation (advisory)
  if: github.event_name == 'pull_request'
  continue-on-error: true
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    BODY=$(adev pr-brief --base "origin/${{ github.base_ref }}")   # hypothetical verb
    gh pr comment "${{ github.event.pull_request.number }}" \
      --body "$BODY" --edit-last --create-if-none
```

Caveat: `--edit-last` targets the last comment *by the current user*, so the body needs a stable leading marker (e.g. `<!-- adev:pr-brief -->`) if other bot comments may interleave. Keep `continue-on-error: true` and the existing "Advisory only — does not block merge" footer; that is this repo's established convention.

This snippet is **GitHub-specific and is the only part that is** — `gh pr comment --edit-last` has no portable equivalent (GitLab uses `glab mr note`; Gerrit has no PR object). The generator on the first line writes markdown to stdout and is forge-agnostic. Note that `lib/milestones.mjs`'s `execGh` is *not* a portability seam despite the name-agnostic look: it passes gh-shaped argv (`["pr","list","--head",...]`), so it is a test injection point. A real adapter needs semantic verbs (`postReviewComment(id, body)`), not argv passthrough.

```
Example: PR-level provenance rollup, derivable today from existing trailers
Source: git log trailers (manifest.yaml:168-178) + <spec>.routing.json

| Spec | Tasks | Commits | +/- | Route | Look here? |
|---|---|---|---|---|---|
| test-strategies/test-depth-policy | t1–t13 | 9 | +412/-38 | auto-agent | low |
| cli-driver-surface/inline-node-sweep | t2 | 3 | +180/-91 | human-only | ← START HERE |
```

The "Look here?" column is `/adev:route`'s `selected_agent` plus `blast_radius`, re-read as a reviewer attention budget. Nothing new needs to be computed.

## Recommendations

Ranked by reviewer benefit ÷ implementation cost. All PR-time signals should be **advisory, non-blocking, and consolidated into one sticky comment** — the convention `.github/workflows/ci.yml` already sets.

1. **Add a PR template with a review packet — highest ratio, do this first.** `.github/pull_request_template.md` codifying the structure #209 already demonstrates (What / Verification), plus three fields it lacks: **risk areas and trust boundaries touched**, **which sections the human verified line-by-line**, and **what the author cannot explain**. Cost: one file. Benefit: makes the currently-accidental PR body quality a contract, and directly attacks the trust deficit behind the 5x reviewer-pickup penalty on agent-authored PRs. Then point `skills/validate/SKILL.md:566` and `skills/implement/SKILL.md:649` at it so `gh pr create` fills it rather than improvising.

2. **Roll commit trailers up into a provenance table in the PR brief.** Group commits by `Spec:`, show `Plan-task:` coverage, flag any commit lacking `Spec:`. Pure aggregation over data that already exists and CI already validates. Benefit: converts a 50-file diff into a handful of spec-scoped reading units.

3. **Surface `/adev:route` scores as a reviewer attention map.** Emit the `human-only` / `assisted-agent` / high-blast-radius tasks and their file sets at the top of the brief, with the explicit instruction "read these hunks first." This is the single most differentiated thing this repo can do that generic review bots cannot — the framework computed the risk assessment *before* the code was written, and currently throws it away.

4. **Attach the `/adev:validate` verdict to the PR.** Which checks ran, which passed, quality-gate output, test counts. Lets a reviewer safely *not* re-verify what was already verified — the cheapest possible reduction in review load.

5. **Make the hygiene comment sticky.** Replace the delete-and-repost block in `.github/workflows/ci.yml` with `gh pr comment --edit-last --create-if-none` and a marker comment; merge it into the same brief comment as items 2–4 so a PR carries exactly one advisory bot comment. Cost: a few lines. Benefit: kills per-push notification churn and preserves reply threads.

6. **Set a soft size budget with a stated escape hatch.** Advisory warning above ~400 additions or ~15 files that names the exception explicitly (mechanical sweep / generated mirror / migration) and asks the author to state which applies. Do *not* make it blocking — 96% of this repo's changed lines are in large PRs, and several are legitimately mechanical (#193, #190). The real target is the omnibus class like #187 ("sweep + branch backlog"), which is a batching decision, not a size necessity.

7. **State a reading order in the PR body for multi-commit PRs.** Derive it from the plan task sequence and `## Parallelization` groups. This is the low-cost approximation of stacked diffs; evaluate Graphite only if reading order alone proves insufficient. Adopting Graphite would add an external tooling dependency — worth a decision record, not a default.

8. **Steer GitHub Copilot code review with the context adev already writes — two steps.** First, **add `AGENTS.md` as a sync target** in `manifest.yaml` (currently only `CLAUDE.md` is declared, and `AGENTS.md` does not exist on disk) and run `/adev:sync`; Copilot code review reads `AGENTS.md` automatically as of 2026-06-18, so this alone makes the built-in reviewer aware of the constitution. Second, add `.github/skills/<name>/SKILL.md` (GA 2026-07-29) to encode adev's own anti-patterns — no-inline-Node, ESM-only, version parity — so the built-in reviewer enforces those instead of generic advice. This repo already authors SKILL.md files, so the second step is mostly relocation. Verify Actions-minutes billing first, per the 2026-04-27 changelog.

9. **Consider aligning trailers with the emerging `Assisted-by:` convention — flagged, not recommended.** The kernel's `Assisted-by: AGENT_NAME:MODEL_VERSION` is becoming the interoperable standard, and this repo's `Author-type: agent/claude-code` carries the agent class but not the model version. Adding model version would improve retro analysis. **This touches the provenance trailer contract enforced by hooks and CI, so it needs human approval** per CLAUDE.md's architecture boundaries — listing it as an option, not a recommendation.

**Where to start:** items 1 and 5 are each roughly a single file and independently useful. Items 2–4 share one implementation — a `pr-brief` generator that reads git trailers, `<spec>.routing.json`, and the validate report — and should land together as one advisory comment. That bundle is the actual answer to "how do we make these PRs reviewable."

**Not recommended:** adding any new *blocking* PR check. This repo's convention is advisory-and-non-blocking at PR time, and PR review is the most expensive fix point — blocking there pays the highest possible cost for a check that belongs at spec or plan review.

## References

### Internal Files
- `.github/workflows/ci.yml` — CI: tests, advisory hygiene comment (delete-and-repost), per-commit provenance/conventional-commit validation
- `.context-index/manifest.yaml:131` — `merge_policy: pr`
- `.context-index/manifest.yaml:168-178` — provenance config: required/recommended trailers, conventional commit types
- `skills/validate/SKILL.md:566` — bare `gh pr create` instruction, no body contract
- `skills/implement/SKILL.md:649` — same
- `.context-index/specs/features/test-strategies/test-depth-policy.routing.json` — per-task route scores (blast radius, novelty) with rationale
- `.context-index/research/review-validation-restructuring.md` — "cheapest fix point" model this artifact extends
- `hooks/merge-guard.sh` — blocks direct commit/push to protected branches under `merge_policy: pr`
- `.githooks/` — `commit-msg`, `prepare-commit-msg`, `post-commit`, `pre-commit`, `pre-commit-no-inline-node`

### Web Sources
- [Does PR size actually matter? — cubic.dev](https://www.cubic.dev/blog/does-pr-size-actually-matter) — aggregates SmartBear/Cisco 200–400 LOC findings; also names legitimate large-PR exceptions. Methodology not independently linked.
- [How to Review AI-Generated Pull Requests (2026) — aibuilderclub](https://www.aibuilderclub.com/blog/reviewing-ai-generated-pull-requests) — LinearB 2026 benchmark (8.1M PRs / ~4,800 teams): 32.7% vs 84.5% 30-day merge rate; ~5x reviewer pickup time. Source of the "review packet" structure. Caveat: figures reached via this secondary summary, not LinearB's report directly; methodology not independently reviewed.
- [AI Coding Assistants — Linux Kernel documentation](https://docs.kernel.org/process/coding-assistants.html) — `Assisted-by: AGENT_NAME:MODEL_VERSION [TOOL1] [TOOL2]`; agents MUST NOT add `Signed-off-by`. Merged with 7.0.
- [Assisted-by: how open source projects are drawing the line on AI contributions — All Things Open](https://allthingsopen.org/articles/open-source-ai-contributions-assisted-by-git-trailer-standard) — comparative survey (Apache `Generated-by:`, Fedora, MicroPython, NetBSD, QEMU, OpenTofu)
- [Copilot code review: AGENTS.md support — GitHub Changelog, 2026-06-18](https://github.blog/changelog/2026-06-18-copilot-code-review-agents-md-support-and-ui-improvements/)
- [Copilot code review: Agent skills and MCP now GA — GitHub Changelog, 2026-07-29](https://github.blog/changelog/2026-07-29-copilot-code-review-agent-skills-and-mcp-now-generally-available/) — `SKILL.md` under `.github/skills`; read-only MCP
- [Copilot code review will consume Actions minutes from 2026-06-01 — GitHub Changelog](https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/)
- [Stacked diffs — Graphite](https://graphite.com/guides/stacked-diffs) — stacked-PR workflow; GitHub has no native support
- [Best Code Review Tools 2026 — Greptile](https://www.greptile.com/content-library/best-ai-code-review-tools) — walkthrough/sequence-diagram artifacts; whole-codebase vs diff-only indexing (vendor-published comparison, treat competitive claims accordingly)
- [How to Review AI-Generated Code in 2026 — CodeAnt](https://codeant.ai/blogs/how-to-review-ai-generated-code) — review-pipeline framing; large changes and AI-generated code as special-attention classes (vendor-published)
