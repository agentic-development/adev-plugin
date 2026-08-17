---
charter: review
kind: behavioral
status: review-passed
risk_level: medium
revision: 2
charter-revision: 1
amends: .context-index/specs/features/review/configurable-reviewers.spec.md
target-revision: 5
created: 2026-08-17
updated: 2026-08-17
tracker-ref: adev-plugin-j7pq.6
source-manifest:
  sha: "0eafe41"
  files:
    - docs/governance.md
    - lib/governance/context-pack.mjs
    - lib/governance/dispatch-shape.mjs
    - lib/governance/review-config.mjs
    - providers/codex/skills/review-specs/SKILL.md
    - providers/opencode/skills/review-specs/SKILL.md
    - skills/review-specs/SKILL.md
    - templates/review-specs/defaults.yaml
    - tests/governance/context-pack-consistency-glob.test.mjs
    - tests/governance/context-pack-delivery-field.test.mjs
    - tests/governance/context-pack-inline-parity.test.mjs
    - tests/governance/context-pack-manifest-budgets.test.mjs
    - tests/governance/context-pack-manifest-denylist.test.mjs
    - tests/governance/context-pack-path-manifest.test.mjs
    - tests/governance/context-pack-path-safety.test.mjs
    - tests/governance/dispatch-manifest-prompt.test.mjs
    - tests/governance/helpers/parse-pack-sections.mjs
    - tests/governance/review-config-manifest-profile.test.mjs
  computed-at: "2026-08-17T22:00:58.935Z"
# status intentionally left at `review-passed`, NOT advanced to `implemented`:
# plan tasks 8, 9, 12 and 13 are deliberately deferred (8 and 13 gated on the
# OPEN tracker adev-plugin-j7pq.7; 9 depends on 8; 12 routed human-only). The
# renderer ships complete and inert — no bundled pack declares
# `delivery: manifest` — so advancing the status would overstate what landed.
# Advancing it is an operator call once j7pq.7 closes and 8/9/12/13 land.
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
for anything that does not fit. This amendment inverts the default **for
reviewer-dispatched packs only**: name everything, and inline only what must be
byte-exact.

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
   `0009` onward is dropped from `architecture` *and* `security`.
2. **The `security` pack loses exactly what differentiates it.**
   `governance/risk-policies.yaml` and `governance/gates.yaml` are last in
   include order and both omitted, leaving `security` functionally identical to
   `architecture` (248692 vs 248607 bytes).
3. **The `consistency` glob over-matches.**
   `.context-index/specs/cross-cutting/*.md` matches 55 files of which only 18 are
   specs. The other 37 are lifecycle sidecars: 13 `.review.md`, 11 `.plan.md`,
   9 `.validate.md`, 3 `.blockers.md`, and one bare `lifecycle-gate-validation.md`.

**Narrowing the glob alone is insufficient.** Simulated against the 12-sibling
charter: `OMITTED 49/69` → `OMITTED 13/32`. Both the glob narrowing **and** the
delivery-model change are required.

### Scope: reviewer-dispatched packs only (rev 2)

`renderPack` is a **shared consumer surface**. Rev 4's 22o deliberately kept `base`
target-agnostic and widened it for the three constitution-compliance checks in
`templates/domains/software/validate.yaml`. An unconditional delivery-model change
would degenerate `base` to two path strings for those checks — reversing 22o.

Rev 2 therefore makes delivery an **explicit per-pack declaration** (BEH-9) that
**defaults to `inline`**, so every existing consumer is byte-unchanged unless it
opts in. Only the reviewer packs declare `delivery: manifest`.

### Behaviors narrowed in the base spec and rev 4

Declared explicitly rather than left implicit:

| Rev-4 behavior | Effect of this amendment |
|---|---|
| 22k (two byte budgets) | **Narrowed.** Unchanged for `delivery: inline`. Under `delivery: manifest` the caps bound the **manifest text** only; the inlined target spec is exempt from both (BEH-12). |
| 22l (per-file truncation marker) | **Unchanged.** Applies only where a file body is inlined. The target spec is exempt from both caps (BEH-12), so 22l never fires for it. |
| 22m (aggregate omitted-files notice, `role="truncation-notice"`) | **Unreachable, not retired,** under `delivery: manifest` — nothing is omitted for budget reasons. Fully retained for `delivery: inline`. |
| 22n (deterministic ordering) | **Retained verbatim** and extended to manifest entries (BEH-5). |
| 22o (`base` target-agnostic and widened) | **Preserved.** `base` keeps `delivery: inline`. |
| 22p-bis (three-way denylist split) | **Retained verbatim,** extended to manifest entries (BEH-11). |

### On the denylist — a correction to the premise

Replacing inlined bodies with paths does not weaken containment.
`templates/governance/profiles.yaml` defines `read-only` (which
`reviewer-reasoning`, `reviewer-capable` and `reviewer-fast` all extend) as allowing
`filesystem-read` and `search` with **no path scoping** — only
`filesystem: { write: deny, execute: deny }` and `network: deny`. A reviewer can
already read any file in the repository, and 22m explicitly depends on that.

The denylist's real job is narrower and still worth keeping: it stops a careless
*pack author* from bulk-inlining secrets via an over-broad include. BEH-11
preserves 22p-bis's severity split exactly, including the hard failure for an
**enumerated** include that resolves to a denied path — the symlink-evasion case.

Reviewer read-scoping is a real pre-existing gap but is **out of scope here**: it
belongs to the profile contract, not the pack contract.

## Behavioral Delta

Behavior IDs are this amendment's own spec-scoped space.

<!-- retired-behavior-ids: BEH-2, BEH-3, BEH-4, BEH-6, BEH-13 -->

- **BEH-1** — **When** the `consistency` pack is loaded from the bundled `templates/review-specs/defaults.yaml` **then** its cross-cutting include glob is `.context-index/specs/cross-cutting/*.spec.md`, matching specs only and never `.review.md` / `.plan.md` / `.validate.md` / `.blockers.md` sidecars. Charter-independent and correct on its own; it does not by itself satisfy BEH-10.
- **BEH-9** — **When** a pack is resolved **then** it carries a `delivery` field with the closed values `inline` | `manifest`, **defaulting to `inline`**, inherited through `resolveExtends` exactly as `max_file_bytes` / `max_total_bytes` are. A pack that does not declare `delivery` renders byte-identically to today. In the bundled defaults, `base` keeps `delivery: inline` (preserving 22o for the three constitution-compliance check consumers) and `review-base` declares `delivery: manifest`, which `architecture`, `security` and `consistency` inherit. An unrecognised value is a load error (`INVALID_PACK_DELIVERY`), never a silent fallback.
- **BEH-10** — **When** a pack with `delivery: manifest` is rendered **then** the target spec named by `targetSpecPath` is the only file whose body is inlined, and every other matched file is emitted as a repo-root-relative path inside a **nonce-fenced section per include**, using 22g's existing section mechanism with no new grouping syntax:

  ```
  <<<ADEV-PACK-<nonce> role="path-manifest" title="<include title>">>>
  <rel>
  <rel>
  <<<END-ADEV-PACK-<nonce>>>>
  ```

  One section per include, in declaration order. `title` falls back to the include's glob string when `normalizeInclude` yields `title: null`, and is omitted entirely when neither is available. An include matching nothing still emits its section with body `<no matches>`, preserving 22g's guarantee. Because the manifest sits inside a nonce fence, 22j's provenance rule ("only content inside a fence carrying that exact token is repository-sourced") makes BEH-7's instruction legitimate rather than self-contradictory. No file is omitted for budget reasons, so no `role="truncation-notice"` section is emitted for a manifest pack.
- **BEH-11** — **When** a manifest entry resolves to a denylisted path (`.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`, `**/secrets/**`) **then** 22p-bis's three-way split applies **unchanged**, reusing its existing error codes and adding none: a glob whose literal pattern is denied fails load with `CONTEXT_PACK_DENYLIST`; a match arriving through a **wildcard** include is skipped with a `CONTEXT_PACK_DENYLIST_SKIP` warning and the render continues; a match arriving through an **enumerated** include is a **hard error** (`CONTEXT_PACK_DENYLIST_MATCH`), because naming a secret file directly remains an authoring mistake that must fail loudly. Replacing bodies with paths changes nothing here — a denied path is never named in the manifest either.
- **BEH-12** — **When** a pack with `delivery: manifest` is rendered **then** the target spec is inlined **in full and byte-exact, exempt from both `max_file_bytes` and `max_total_bytes`**, and is never truncated. The caps bound the manifest text only. If the target spec alone exceeds `max_total_bytes` the render still emits it whole and emits a `TARGET_SPEC_OVERSIZE` **warning** naming the path and both sizes; there is no truncation path and therefore no marker. 22l's inline per-file marker and 22m's `role="truncation-notice"` aggregate keep their rev-4 meanings and are untouched.
- **BEH-5** — **When** manifest entries are ordered **then** ordering is deterministic by 22n's existing rule: includes in declaration order, files within an include sorted by repo-root-relative path in byte order. Because nothing is dropped, declaration order no longer decides *what* a reviewer receives — only the order it is listed in. This is what removes the target-dependence measured above.
- **BEH-7** — **When** a reviewer is dispatched with a manifest pack **then** the prompt states that paths inside `role="path-manifest"` sections are repository files the reviewer is expected to read on demand, and names the read tools available under its resolved profile. A manifest a reviewer does not know to act on is equivalent to the omission it replaces.
- **BEH-14** — **When** any path string is emitted into a manifest section — including a path produced by `<charter-dir>` expansion or a sibling filename picked up by a glob **then** it passes through the same fence-token neutralization 22h applies to file bodies before emission, and a `CONTEXT_PACK_FENCE_COLLISION` warning naming the path is emitted on a hit. Path and directory names are author-controlled and, under a manifest pack, are the sole non-target-spec content channel, so they require exactly the escaping discipline bodies already get.
- **BEH-8** — **When** a reviewer run completes **then** the dispatch record captures the manifest as issued **and** the set of manifest paths the reviewer reported reading. This buys **auditability, not reproducibility**: the record makes a thin review visible after the fact, but it cannot bound reads the reviewer makes outside the manifest, and bare paths carry no content hashes, so a replay is not guaranteed identical. Reproducibility of the *inlined* portion is preserved by BEH-12 and 22n.

## Preconditions Delta

- `renderPack` still requires `targetSpecPath` for any pack carrying `<charter-dir>` / `<target-spec>` tokens; `CONTEXT_PACK_NO_TARGET` is unchanged. `base` remains target-agnostic, `delivery: inline`, and renderable without one.
- A pack declaring `delivery: manifest` requires `targetSpecPath` — with nothing to inline, a manifest pack rendered target-agnostically would deliver paths only. Rendering one without a target is `CONTEXT_PACK_NO_TARGET`, the existing code.
- Reviewer profiles must already grant `filesystem-read` and `search`. Every bundled reviewer profile extends `read-only`, which does.

## Postconditions Delta

- After rendering a `delivery: manifest` pack, no matched non-denied file is unreachable: each is either inlined (the target spec) or named in a manifest section.
- The rendered size of a manifest pack is a function of the target spec plus the manifest text, not of the corpus — so it no longer varies with the target charter's sibling count.
- After rendering a `delivery: inline` pack, output is **byte-identical to rev 4**, including 22l's inline markers and 22m's `role="truncation-notice"` aggregate. The three constitution-compliance check consumers of `base` are unaffected.
- Every path emitted in a manifest section has passed fence-token neutralization.

## Error Cases Delta

Added to the base spec's Error Cases table. No existing row is modified, and **no
existing denylist code is renamed or resevered**.

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| A pack declares a `delivery` value outside `inline` \| `manifest` | Fail load naming the pack and the offending value | `INVALID_PACK_DELIVERY` |
| A pack declares `delivery: manifest` and is rendered with no `targetSpecPath` | Fail load, reusing the existing code — a manifest pack with nothing to inline is a misconfiguration | `CONTEXT_PACK_NO_TARGET` |
| The target spec of a `delivery: manifest` pack alone exceeds `max_total_bytes` | Emit it whole and byte-exact; warn naming the path, its size and the cap. **No truncation, no marker.** | `TARGET_SPEC_OVERSIZE` (warning) |
| A path string emitted into a manifest section contains a literal fence token | Neutralize per 22h before emission; warn naming the path | `CONTEXT_PACK_FENCE_COLLISION` (warning) |
| A reviewer's resolved profile lacks `filesystem-read` or `search` while its pack declares `delivery: manifest` | Reject the reviewer at load; do not dispatch with paths it cannot read | `PROFILE_CANNOT_CONSUME_MANIFEST` |

## System Constitution Reference

- **Minimize external dependencies** — manifest sections are path strings assembled with `node:path` and the existing `crypto.randomBytes` nonce; no new dependency.
- **Hook protocol / gate semantics are human-approved boundaries** — this changes what reviewers receive, so it ships as an amendment under review.

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| Narrow the consistency glob | `*.md` → `*.spec.md` in `templates/review-specs/defaults.yaml` (BEH-1) | small |
| `delivery` field + resolution | Closed enum, default `inline`, inherited via `resolveExtends`; `INVALID_PACK_DELIVERY` (BEH-9) | small |
| Manifest section rendering | One nonce-fenced `role="path-manifest"` section per include, title fallback, `<no matches>` preserved (BEH-10, BEH-5) | medium |
| Path neutralization | Route every emitted path through 22h's neutralizer (BEH-14) | small |
| Budget re-scoping | Caps bound manifest text only; target spec exempt from both (BEH-12) | small |
| Denylist parity | Extend 22p-bis's three-way split to manifest entries, no new codes (BEH-11) | small |
| Declare packs | `base` → `delivery: inline`; `review-base` → `delivery: manifest` | small |
| Prompt/preamble update | Name `role="path-manifest"` and the reviewer's read tools (BEH-7) | small |
| Dispatch-record read capture | Manifest issued + paths reported read (BEH-8) | medium |
| Profile capability check | Reject manifest-consuming reviewers lacking read/search | small |

## Acceptance Criteria

- [ ] The `consistency` pack matches 18 cross-cutting specs, not 55 files; no `.review.md` / `.plan.md` / `.validate.md` / `.blockers.md` appears in any pack.
- [ ] Rendering `architecture`, `security` and `consistency` against a target in a **12+ sibling charter** omits **zero** files. Verified against `agent-reliable-state-artifacts`, not against `review` — a `review`-only measurement passes today and proves nothing.
- [ ] `security` and `architecture` render **materially different** content for the same target; `risk-policies.yaml` and `gates.yaml` are reachable by the Security Reviewer.
- [ ] A pack that does not declare `delivery` renders **byte-identically to rev 4**, verified on `base` against all three `validate.yaml` check consumers (`templates/domains/software/validate.yaml` lines 54, 69 and 113).
- [ ] The target spec is inlined in full and byte-exact, and remains so when it alone exceeds `max_total_bytes` — that case warns and does not truncate.
- [ ] A file or directory **NAME** containing `=== foo ===` or `<<<ADEV-PACK-…>>>` cannot forge a manifest section or fence when only its path is rendered.
- [ ] Every manifest section is nonce-fenced with `role="path-manifest"`; an include with no matches still emits a section bodied `<no matches>`.
- [ ] An **enumerated** include resolving to a denied path still **fails load** (`CONTEXT_PACK_DENYLIST_MATCH`); a **wildcard** match still skip-warns (`CONTEXT_PACK_DENYLIST_SKIP`). No new denylist code is introduced.
- [ ] A reviewer profile without `filesystem-read` / `search` is rejected rather than dispatched with a manifest.
- [ ] The dispatch record shows the manifest issued and which paths the reviewer reported reading, and the spec text claims **auditability**, not reproducibility.
- [ ] Rendered manifest-pack size is independent of the target charter's sibling count.
- [ ] Token/cost claims, if any, are measured from session JSONL `message.usage` fields — never estimated as bytes/4, which overstates savings by 2-2.5× (module heuristic).
- [ ] All quality gates pass; no constitutional violations.
