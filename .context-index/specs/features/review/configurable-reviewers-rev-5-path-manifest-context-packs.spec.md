---
charter: review
kind: behavioral
status: review-pending
risk_level: medium
revision: 1
charter-revision: 1
amends: .context-index/specs/features/review/configurable-reviewers.spec.md
target-revision: 5
created: 2026-08-17
updated: 2026-08-17
tracker-ref: adev-plugin-j7pq.6
---

# Amendment: Configurable Reviewer Registry (targeting rev 5)

> This spec **amends** `.context-index/specs/features/review/configurable-reviewers.spec.md` targeting revision 5.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

Rev 4 populated the bundled context packs and bounded their size. In practice the
bound is reached on any charter of moderate size, and the pack then delivers a
fraction of what its reviewer's prompt promises.

**This is not a contradiction of rev 4 — it is the completion of its own escape
hatch.** Behavior 22m already states, of the omitted-file list:

> so a reviewer can Glob/Grep the omitted paths on demand — the existing
> `filesystem-read` and `search` capabilities make the truncation recoverable
> rather than silent.

Rev 4 therefore already treats *paths plus reviewer reads* as the recovery path
for anything that does not fit. This amendment inverts the default: name
everything, and inline only what must be byte-exact. Inlining until full and then
naming the remainder spends the entire budget to produce a list the reviewer must
act on anyway.

### Measured behaviour (base a632d18f)

Omission is **target-dependent** — it scales with the target charter's sibling
`.spec.md` count, because `review-base`'s `<charter-dir>/*.spec.md` renders before
each pack's own distinguishing includes (22n fixes includes in declaration order):

| target charter (siblings) | architecture | security | consistency |
|---|---|---|---|
| `review` (2) | complete | complete | complete |
| `agent-reliable-state-artifacts` (12) | 27% (9/33) | 31% (11/35) | 71% (49/69) |
| `heuristics` (14) | 20% (7/35) | 24% (9/37) | 66% (47/71) |

A small charter reviews fine; the two largest charters in the repo do not. **Any
fix must be measured against a large charter** — measuring against `review` shows
a false all-clear.

Three distinct defects follow:

1. **Declaration-order budget spend.** On a 12-sibling charter every ADR from
   `0009` onward is dropped from `architecture` *and* `security`. The target's
   own base spec is inlined truncated per 22l
   (`…[adev: truncated 16384 of 41330 bytes …]`), so 60% of the contract under
   amendment is absent.
2. **The `security` pack loses exactly what differentiates it.**
   `governance/risk-policies.yaml` and `governance/gates.yaml` are last in
   include order and both omitted, leaving `security` functionally identical to
   `architecture` (248692 vs 248607 bytes). The per-reviewer differentiation rev 4
   shipped is nullified on large charters — which is why the regression is easy
   to miss: adopting the per-reviewer packs changes almost nothing observable
   until the budget is also addressed.
3. **The `consistency` glob over-matches.**
   `.context-index/specs/cross-cutting/*.md` matches 55 files of which only 18 are
   specs. The other 37 are lifecycle sidecars: 13 `.review.md`, 11 `.plan.md`,
   9 `.validate.md`, 3 `.blockers.md`, and one bare `lifecycle-gate-validation.md`.
   Two-thirds of the Consistency Analyzer's budget is spent on review reports and
   plans it was never meant to read.

**Narrowing the glob alone is insufficient.** Simulated against the 12-sibling
charter by rewriting the glob and re-rendering:

```
current  cross-cutting/*.md        251855B  OMITTED 49/69
fixed    cross-cutting/*.spec.md   261648B  OMITTED 13/32
```

The matched set drops 69 → 32 and omissions 49 → 13, but the pack still reaches
the cap. A 71% loss becomes a 41% loss. Both the glob narrowing **and** the
delivery-model change are required; neither alone satisfies this contract.

### On the denylist — a correction to the premise

It would be natural to assume that replacing inlined bodies with paths weakens a
containment boundary. It does not. `templates/governance/profiles.yaml` defines
`read-only` (which `reviewer-reasoning`, `reviewer-capable` and `reviewer-fast`
all extend) as allowing `filesystem-read` and `search` with **no path scoping** —
only `filesystem: { write: deny, execute: deny }` and `network: deny`. A reviewer
can already read any file in the repository on its own initiative, and rev 4's
22m explicitly depends on that.

The denylist's real job is narrower and still worth keeping: it stops a careless
*pack author* from bulk-inlining secrets into a prompt via an over-broad include
(`.context-index/**/*`). That is config hygiene, not reviewer containment. This
amendment preserves it by applying the denylist to the **manifest**, so denied
paths are never even named.

Reviewer read-scoping is a real pre-existing gap, but it is **out of scope here**:
it belongs to the profile contract, not the pack contract, and closing it would
change every reviewer's capabilities rather than the pack's shape.

## Behavioral Delta

Behavior IDs are this amendment's own spec-scoped space.

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** the `consistency` pack is loaded from the bundled `templates/review-specs/defaults.yaml` **then** its cross-cutting include glob is `.context-index/specs/cross-cutting/*.spec.md`, matching specs only and never `.review.md` / `.plan.md` / `.validate.md` / `.blockers.md` sidecars. This is charter-independent and correct on its own; it does not by itself satisfy BEH-3.
- **BEH-2** — **When** a pack is rendered **then** the target spec named by `targetSpecPath` is the **only** file whose body is inlined. It is inlined in full, never subject to `max_file_bytes`, and carries the existing nonce-scoped `<<<ADEV-PACK-<nonce> …>>>` fencing with literal fence tokens in its body neutralized. It must be byte-exact because it is the artifact under review and the one untrusted input in the prompt.
- **BEH-3** — **When** a pack is rendered **then** every other matched file is delivered as a **path manifest entry** — its repo-root-relative path — grouped under its include's `title`, and its body is not inlined. No file is omitted for budget reasons, so `renderPack` emits no `role="truncation-notice"` section for manifest entries.
- **BEH-4** — **When** the manifest is assembled **then** the existing hard denylist (`.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`, `**/secrets/**`) is applied to the manifest itself: a denied glob still **fails load** exactly as today, and a denied resolved path is never named in the manifest. Replacing bodies with paths must not turn a load failure into a warning.
- **BEH-5** — **When** manifest entries are ordered **then** ordering is deterministic by the same rule 22n establishes: includes in declaration order, and files within an include sorted by repo-root-relative path in byte order. Because nothing is dropped, declaration order no longer decides *what* a reviewer receives — only the order it is listed in. This is what removes the target-dependence measured above.
- **BEH-6** — **When** `max_total_bytes` and `max_file_bytes` are applied **then** they bound the **inlined portion only** (i.e. the target spec plus the manifest text). They remain declared and overridable per pack, and remain a backstop against a pathological target spec; they no longer gate which context files a reviewer can reach.
- **BEH-7** — **When** a reviewer is dispatched with a path manifest **then** the prompt states that manifest paths are repository files the reviewer is expected to read on demand, and names the read tools available under its profile. A manifest a reviewer does not know to act on is equivalent to the omission it replaces — this is the same failure mode as a prompt promising input the pack never delivered.
- **BEH-8** — **When** a reviewer run completes **then** the dispatch record captures the manifest as issued **and** the set of manifest paths the reviewer actually read. An inlined pack was a fixed, auditable input; on-demand reads are not, so the record is what preserves reproducibility and makes a thin review visible after the fact.

## Preconditions Delta

- `renderPack` still requires `targetSpecPath` for any pack carrying `<charter-dir>` / `<target-spec>` tokens; `CONTEXT_PACK_NO_TARGET` is unchanged. `base` remains target-agnostic and renderable without one.
- Reviewer profiles must already grant `filesystem-read` and `search`. Every bundled reviewer profile extends `read-only`, which does. A reviewer whose profile lacks them cannot consume a manifest and must be rejected at load rather than dispatched with unreadable paths.

## Postconditions Delta

- After rendering, no matched file is unreachable by the reviewer: every non-denied match is either inlined (the target spec) or named in the manifest.
- The rendered pack size is a function of the target spec plus the manifest, not of the corpus — so it no longer varies with the target charter's sibling count.
- `role="truncation-notice"` sections still appear if and only if the inlined portion is itself truncated, preserving 22l/22m's marker contract verbatim for that case.

## Error Cases Delta

Added to the base spec's Error Cases table. No existing row is modified.

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| An include glob matches a denylisted path | Fail load, unchanged from today — never downgrade to a warning because bodies are no longer inlined | `CONTEXT_PACK_DENIED_GLOB` |
| A resolved manifest entry matches the denylist | Omit the path from the manifest entirely and emit one warning naming the include, not the path | `CONTEXT_PACK_DENIED_PATH` (warning) |
| A reviewer's resolved profile lacks `filesystem-read` or `search` while its pack yields manifest entries | Reject the reviewer at load; do not dispatch with paths it cannot read | `PROFILE_CANNOT_CONSUME_MANIFEST` |
| The inlined target spec alone exceeds `max_total_bytes` | Truncate per 22l and emit the existing per-file marker; do not silently drop the target spec | `TARGET_SPEC_OVERSIZE` (warning) |

## System Constitution Reference

- **Minimize external dependencies** — the manifest is path strings assembled with `node:path`; no new dependency.
- **Hook protocol / gate semantics are human-approved boundaries** — this changes what reviewers receive, so it ships as an amendment under review rather than as an implementation tweak.

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| Narrow the consistency glob | `*.md` → `*.spec.md` in `templates/review-specs/defaults.yaml` (BEH-1) | small |
| Manifest rendering in `renderPack` | Inline target spec only; emit grouped path manifest (BEH-2, BEH-3, BEH-5) | medium |
| Denylist against the manifest | Preserve fail-load; add path-level omission warning (BEH-4) | small |
| Budget re-scoping | Apply caps to the inlined portion only (BEH-6) | small |
| Prompt/preamble update | State that manifest paths are to be read; name read tools (BEH-7) | small |
| Dispatch-record read capture | Record manifest issued + paths actually read (BEH-8) | medium |
| Profile capability check | Reject manifest-consuming reviewers lacking read/search (Error Cases) | small |

## Acceptance Criteria

- [ ] The `consistency` pack matches 18 cross-cutting specs, not 55 files; no `.review.md` / `.plan.md` / `.validate.md` / `.blockers.md` appears in any pack.
- [ ] Rendering `architecture`, `security` and `consistency` against a target in a **12+ sibling charter** omits **zero** files. Verified against `agent-reliable-state-artifacts`, not against `review` — a `review`-only measurement would pass today and prove nothing.
- [ ] `security` and `architecture` render **materially different** content for the same target; `risk-policies.yaml` and `gates.yaml` are reachable by the Security Reviewer.
- [ ] The target spec is inlined in full and byte-exact, fenced with the existing nonce scheme, with literal fence tokens neutralized.
- [ ] A file body containing `=== foo ===` or a literal `<<<ADEV-PACK-…>>>` cannot forge a manifest group or a fence.
- [ ] A denylisted glob still fails load; a denylisted resolved path never appears in the manifest.
- [ ] A reviewer profile without `filesystem-read` / `search` is rejected rather than dispatched with a manifest.
- [ ] The dispatch record shows the manifest issued and which paths the reviewer read.
- [ ] Rendered pack size is independent of the target charter's sibling count.
- [ ] Token/cost claims, if any are made in the plan or validation, are measured from session JSONL `message.usage` fields — never estimated as bytes/4, which overstates savings by 2-2.5× (module heuristic).
- [ ] All quality gates pass; no constitutional violations.
