---
charter: pr-review-brief
kind: artifact
status: review-pending
risk_level: low
milestone:
revision: 1
charter-revision: 2
created: 2026-08-12
updated: 2026-08-12
---

# Artifact Spec: Review Packet Template

<!-- The author-written half of the PR reviewer contract. Where pr-body-composition
     specifies what the lifecycle *measured*, this specifies what the author must
     *claim* — and fixes the boundary between the two so they can never interleave.
     Parent Charter: .context-index/specs/features/pr-review-brief/charter.md -->

## Structural Shape

A single Markdown file, `.github/pull_request_template.md`, with no frontmatter. GitHub pre-populates the body of every new pull request with its contents verbatim, so the file is simultaneously the storage format and the rendered form — there is no template engine, no interpolation, and no build step.

The file has exactly two regions, in this order and never interleaved:

1. **The review packet** — four author-written sections, each an H2 with fixed heading text, each followed by an HTML-comment prompt that tells the author what belongs there. The comment is instructional scaffolding; an author who leaves it in place has answered nothing, which is legible as such.
2. **The generated slot** — an empty `<!-- adev:pr-brief -->` / `<!-- /adev:pr-brief -->` marker pair. Nothing is written between them by this artifact. The pair reserves the insertion point that `adev pr body` output fills and that `cicd` delivery rewrites on subsequent pushes.

```markdown
## What

<!-- The problem this PR solves, in the reviewer's terms, not the implementation's.
     One paragraph. If you cannot state the problem without describing the diff,
     the PR is probably doing more than one thing. -->

## Risk areas and trust boundaries touched

<!-- Which parts of this change could break something a reviewer cares about, and
     which trust boundaries it crosses (auth, input parsing, filesystem writes,
     shell invocation, hook exit codes, network). Name the file or function.
     Write "none" only if you have checked, not by default. -->

## Verified line by line

<!-- Which parts of this diff you read closely enough to defend, as opposed to
     generated, mechanically swept, or accepted from a tool. Reviewers use this to
     decide where to spend their own attention. -->

## What I cannot explain

<!-- Anything in this diff you do not fully understand: a change you made because a
     test demanded it, a workaround whose root cause you did not find, an
     unexplained behavior you worked around. This section is required.
     "Nothing" is an answer; deleting the section is not. -->

<!-- adev:pr-brief -->
<!-- /adev:pr-brief -->
```

**Heading text is contractual.** The four H2 strings above are the field set named in the charter's Domain Model (`what`, `risk_areas`, `verified_line_by_line`, `cannot_explain`). They are matched literally by the interlock test in Acceptance Criteria, so a rename is a spec change, not an edit.

**Naming exception.** The constitution's Conventions require kebab-case for files. `pull_request_template.md` is snake_case because GitHub resolves that exact path and no other. The exception is confined to this one filename and is recorded here rather than left for a reviewer to rediscover.

## Boundary With Delivery

This spec owns the file's *content and shape*. It does not own how the generated block reaches a live pull request: the `cicd` charter owns `.github/workflows/` and the sticky-comment delivery mechanism. The artifact must therefore be complete and correct with no CI workflow in place — a human who opens a PR by hand gets the packet and an empty marker pair, which is the correct degraded state, not a broken one.

## Required Files

| Path | Layer | Created by |
|---|---|---|
| `.github/pull_request_template.md` | project (this repo) | this spec |
| `tests/pr-review-packet.test.mjs` | project (this repo) | this spec |

`.github/` currently contains only `workflows/`; the template is the first non-workflow file added under it. Path ownership was checked against the two charters that hold `.github/` territory: `cicd` scopes itself to `.github/workflows/` and `copilot-provider` to `.github/skills/`. Neither claims `pull_request_template.md`, so it lands here.

**No bundled copy.** `templates/` carries no `.github/` scaffolding and `/adev:init` writes only `.context-index/`, so this artifact ships as a repo-local file, not as something adev materializes into downstream projects. Shipping a bundled copy would mean `/adev:init` writing outside `.context-index/` for the first time — a scope decision for the init charter, not this one. Recorded in Deferred Capabilities below.

## Consumers

- **GitHub (web and `gh`)** — reads `.github/pull_request_template.md` by exact path and pre-fills the body of every new pull request with it. This is the whole delivery mechanism for the author-written half; no adev code participates.
- **`adev pr body`** (`pr-body-composition.spec.md`) — writes the content that fills the marker slot. The interlock runs in one direction only: the generator must never emit any of the four packet H2 headings, and this template must never contain generated content. Neither reads the other at runtime.
- **`cicd` delivery** — rewrites the region between the marker pair on each push. Depends on the pair existing exactly once and on the closing marker being the last non-blank line, so a naive "replace to end of block" implementation cannot swallow author text.
- **`skills/validate/SKILL.md:566`** and **`skills/implement/SKILL.md:649`** — both end with `gh pr create --base <target-branch>` prose. `gh pr create` populates the body from the template only when neither `--body` nor `--fill` is passed, so the prose must name the template explicitly for agent-opened PRs to carry the packet at all. Editing skill markdown is inside the constitution's Autonomous boundary.
- **The human PR author** — the only writer of the four sections. Nothing generates them, and no agent may fill them on the author's behalf; a machine-written "what I cannot explain" is an empty claim.

## System Constitution Reference

- **Non-Negotiable Principle 1: "Minimize external dependencies."** — Applies because the artifact is static Markdown consumed by GitHub verbatim. No templating library, no renderer, no build step, and nothing added to `package.json`.
- **Architecture Boundary (Autonomous): "Updating templates" and "Editing skill markdown content."** — Applies because the change set is one new static file plus two prose lines in existing SKILL.md files. It touches no hook protocol, no plugin registration, and no provenance trailer contract, so it stays clear of the Requires-Human-Approval list.
- **Anti-pattern: "No executable logic inside SKILL.md files."** — Applies to the two consumer edits: they extend an existing `gh pr create` suggestion with a flag and add no step directive, no inline Node, and no control flow.
- **Conventions: "kebab-case for files and directories."** — Deliberately excepted for `pull_request_template.md`, which GitHub resolves by exact snake_case path. Documented in Structural Shape rather than silently violated.

## Deferred Capabilities

| Capability | Reason | Depends On |
|---|---|---|
| Bundled `.github/pull_request_template.md` scaffolded by `/adev:init` | Would make `/adev:init` write outside `.context-index/` for the first time — an init-charter scope decision, and one that presumes the downstream project uses GitHub. | init charter accepting non-`.context-index/` scaffolding |
| Machine-checked packet completeness (CI failing a PR whose sections are unfilled) | The charter's Availability attribute makes the whole module advisory and non-blocking; gating a merge on packet content contradicts it. Enforcement, if ever wanted, is `cicd`'s to design as an advisory comment. | a decision to move from advisory to enforcing |

## Acceptance Criteria

- [ ] `.github/pull_request_template.md` exists and contains exactly the four H2 headings, in the order given in Structural Shape, with the literal text specified.
- [ ] The file contains exactly one `<!-- adev:pr-brief -->` and exactly one `<!-- /adev:pr-brief -->`, with no content between them.
- [ ] The closing marker is the last non-blank line of the file — no author-written section follows it.
- [ ] The `## What I cannot explain` section is present; a test asserts its presence by literal heading match, so deleting it fails rather than degrading silently.
- [ ] Every H2 heading in the template is followed by an HTML-comment prompt; no section ships bare.
- [ ] An interlock test asserts that no output path of `adev pr body` emits any of the four packet headings, so generated and author-written content cannot collide even if both are present in one body.
- [ ] `skills/validate/SKILL.md` and `skills/implement/SKILL.md` name the template in their `gh pr create` prose, and neither adds a step directive or inline Node.
- [ ] The template introduces no new dependency and no build step; `package.json` is unchanged.
- [ ] The kebab-case naming exception is recorded in the file's own spec, not only in review discussion.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations beyond the documented naming exception.

