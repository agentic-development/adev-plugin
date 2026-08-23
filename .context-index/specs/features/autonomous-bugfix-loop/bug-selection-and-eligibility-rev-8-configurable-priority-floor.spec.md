---
partial_schema: implement@1
charter: autonomous-bugfix-loop
kind: behavioral
status: implemented
risk_level: medium
revision: 1
charter-revision: 7
amends: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
target-revision: 8
created: 2026-08-21
updated: 2026-08-21
source-manifest:
  sha: "67d8285"
  files:
    - docs/cli-reference.md
    - lib/cli/issues-next.mjs
    - lib/issues/eligibility.mjs
    - tests/issues/next.test.mjs
  computed-at: "2026-08-21T17:52:06.100Z"
drift_detected: true
---

# Amendment: Live Spec: Bug Selection Verb and Eligibility Filter (targeting rev 8)

> This spec **amends** `.context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md` targeting revision 8.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

`bugfix-loop-execution-hardening.spec.md` (sibling refactor spec, same charter) proposed
wiring `/adev:bugfix-loop`'s hardcoded `--max-priority P3` through to this verb's existing
`--max-priority` flag. During that authoring, the operator (issue owner) asked for the
priority band itself to be fully configurable, including `P0`/`P1` — not just the P2-P4
range this verb's shipped BEH-8 currently permits. BEH-8 today hard-rejects `P0`/`P1`
with `INVALID_PRIORITY_BOUND`, framing that rejection as *the* safety boundary. This
amendment changes that framing and behavior deliberately: it removes the priority-based
floor and leaves the module-based floor (BEH-7) — which the base spec already documents
as unconditional and non-overridable by `--max-priority` "or any other flag" — as the
sole safety boundary going forward.

**Why this is safe to loosen:** BEH-7's excluded-module list (reserved safety tags
`review-gate`, `convergence-detector`, `retry-loop`, `bugfix-loop`, plus any project-
configured `tasks.bugfix_loop.excluded_modules`) is untouched by this amendment and
remains unconditional. A `P0` bug tagged against one of those modules is excluded
regardless of `--max-priority` both before and after this change — this amendment only
removes the *additional*, priority-based rejection that applied even to `P0`/`P1` bugs
in ordinary, non-excluded modules. The charter (revision 12) has been updated to reflect
that the blast-radius/module list, not the priority band, is now the documented safety
boundary.

**Why this is worth loosening:** a fixed P2/P3-only band means the loop can never help
with a critical (P0) or high (P1) bug even in an ordinary, non-sensitive module — an
operator who wants the loop to attempt those, having accepted the risk, has no way to
opt in today short of editing the skill. This amendment makes that an explicit,
per-invocation choice (`--max-priority P0`) rather than an unreachable ceiling.

## Behavioral Delta

**Consumer:** the sole named consumer of this loosened bound is
`bugfix-loop-execution-hardening.spec.md` (sibling refactor spec, same charter), Migration
Path Step 5 / BEH-9 — it threads `/adev:bugfix-loop --max-priority <p>` through to this
verb once this amendment ships. No other spec in this charter references `--max-priority`.

**Amends BEH-8** (base spec, "safety floor"). The base's BEH-8 reads:

> **When** `--max-priority` is omitted **then** the resolved bound defaults to `P3`
> (covering P2 and P3, the charter's fixed eligible band). **When** `--max-priority` is
> `P0` or `P1` **then** the verb rejects the invocation (see Error Cases) — P0/P1 are
> never selectable regardless of flags, since they are outside the eligibility filter's
> safety boundary by design, not merely deprioritized.

Replaced, at target revision 8, with:

- **BEH-8 (configurable priority band)** — **When** `--max-priority` is omitted **then**
  the resolved bound defaults to `P3` (covering P2 and P3 — identical to today's
  default, unchanged by this amendment). **When** `--max-priority` is `P0`, `P1`, `P2`,
  `P3`, or `P4` **then** that value is used as the resolved bound — the full priority
  scale is selectable, including `P0`/`P1`. **When** `--max-priority` is malformed (not
  `P0`-`P4`) **then** the verb rejects the invocation with `INVALID_PRIORITY_BOUND`,
  unchanged from the base spec.

**Unaffected by this amendment (stated for clarity, not re-specified):**
- BEH-1 through BEH-7, BEH-9, BEH-10, BEH-11 carry forward unchanged. In particular
  BEH-7's unconditional module-exclusion floor is explicitly **not** amended — it remains
  the sole safety boundary after this change.
- The `P0`-`P4` ↔ `0`-`4` priority mapping (Preconditions, base spec) is unchanged.

**Error Cases delta:** the base spec's row `"--max-priority is P0 or P1" → rejects,
INVALID_PRIORITY_BOUND` is removed — it is no longer an error condition. The row
`"--max-priority is malformed (not P0-P4)" → rejects, INVALID_PRIORITY_BOUND` is
unchanged.

**Adds BEH-12** (new — no equivalent in the base spec; numbered to continue the base's own
`BEH-<n>` sequence, since it takes effect on the same verb at the same target revision).
Addresses the boundary reviewer's finding that nothing today shows an operator, at the
point of using the widened bound, what BEH-7's excluded-module list actually covers —
the amendment's "safe to loosen" argument depends on that list already being complete for
the operator's risk tolerance, but nothing verifies or surfaces that assumption:

- **BEH-12 (excluded-module visibility)** — **When** `adev issues next` is invoked with
  `--max-priority P0` or `--max-priority P1` **then** the verb additionally prints the
  effective excluded-module set (the four reserved safety tags plus any
  `tasks.bugfix_loop.excluded_modules` configured in the manifest) to stderr before
  returning its result — every invocation, not just the first — so the operator can see
  what remains protected at the moment they use the widened bound. This does not change
  the verb's stdout JSON contract or exit code; it is additive stderr output only.

## Acceptance Criteria

- [ ] `adev issues next --max-priority P0 --json` and `--max-priority P1 --json` succeed
      (exit 0) and apply the requested bound, rather than rejecting with
      `INVALID_PRIORITY_BOUND`
- [ ] `adev issues next` with no `--max-priority` flag still defaults to `P3`, identical
      to pre-amendment behavior
- [ ] A malformed `--max-priority` value (not `P0`-`P4`) still rejects with
      `INVALID_PRIORITY_BOUND`, unchanged
- [ ] BEH-7's module-exclusion floor still excludes a candidate WorkItem tagged against a
      reserved safety module regardless of `--max-priority` value, including `P0`
- [ ] BEH-10's fail-closed default still excludes a candidate WorkItem whose
      `affected_modules` is empty/absent, with `--max-priority P0` set — an untagged bug
      does not become selectable just because the priority floor was lifted
- [ ] BEH-11's fail-closed default still excludes a candidate WorkItem whose
      `affected_modules` entry is an unrecognized/misspelled module slug, with
      `--max-priority P0` set — a mistagged bug does not become selectable either
- [ ] BEH-12: `--max-priority P0`/`P1` prints the effective excluded-module set to stderr
      before returning; `--max-priority P2`-`P4` and the default (`P3`) do not print it
      (only the widened, higher-risk invocations get the extra visibility)
- [ ] Existing test suite for BEH-1 through BEH-7, BEH-9, BEH-10, BEH-11 passes without
      modification — only BEH-8 changes and BEH-12 is added
- [ ] `docs/cli-reference.md`'s `--max-priority` documentation is updated to state the
      full `P0`-`P4` range and note the module-exclusion floor as the actual safety
      boundary
