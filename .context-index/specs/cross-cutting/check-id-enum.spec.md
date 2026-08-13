---
mode: cross-cutting
affects: [lifecycle-state, validation, governance]
kind: behavioral
status: draft
risk_level: medium
tracker-ref: issue-562
revision: 1
created: 2026-08-13
updated: 2026-08-13
blocked-by: "ADR-0010 boundary decision — which surfaces contribute legal emit-time check IDs"
---

# Live Spec: Check-ID Enum — one vocabulary for validator identifiers

<!-- Promoted out of measurement-integrity.spec.md when that spec was dissolved
     (2026-08-13). Carries the two blockers from that spec's revision-2 review as
     opening constraints. Frontmatter precedes the H1 deliberately: `adev specify
     revise` cannot parse a spec whose frontmatter is not the first non-blank
     content (see epic-104 / issue-585). -->

## Status: DRAFT — blocked on an architecture decision

This spec **must not enter review until the ADR-0010 boundary question is answered** (see constraint SA-9). Enforcing an enum without that answer would reject identifiers the system emits by design.

## Problem

Validator identifiers in the lifecycle event log are free text. The live corpus under `.context-index/lifecycle-state/` contains **46 distinct `validator` spellings**, including four spellings of the single code-drift check (`check-1.6-code-drift`, `check-1.6-drift`, `check-1.6-drift-detection`, `check-1.6-drift-warning`) and three of the boundary check. Nothing can be counted reliably across the corpus, so no measurement built on these events — pass rates, per-check no-op analysis, regression trends — can be trusted.

The vocabulary also has two competing forms: `.context-index/governance/validate.yaml` uses namespace-qualified IDs (`validate.check-2-spec-compliance`), while `lib/cli/report.mjs:459` documents the flag with an unqualified example (`check-2-spec-compliance`).

## Behavioral Contract (draft — not yet reviewed)

### Behaviors

1. **When** `adev report --type validator` receives a `--validator` ID outside the legal set **then** the verb exits non-zero, appends no event, and prints the legal set — with the rejected value stripped of control/ANSI characters and truncated before it is echoed.
2. **When** a legacy unqualified but otherwise valid ID is supplied **then** it is normalised to the canonical qualified form rather than rejected, so the CLI's own documented examples keep working.
3. **When** the corpus is read for replay, backfill, or analysis **then** historical identifiers never hard-fail the reader, regardless of whether they are recognised.

### Non-goals

- Rewriting historical events. The corpus is append-only; normalisation applies at emit time and at read time, never by mutation.
- Extending enforcement to `--reviewer` or `--step` in this spec. Those identifiers are also free text (`lib/cli/report.mjs:153,219,224,380`) and deserve the same treatment, but bundling them repeats the packaging error that dissolved the parent spec.

## Constraints carried from the measurement-integrity rev-2 review

Each must be resolved in the spec text before this enters review.

| Origin | Constraint |
|---|---|
| **SA-9** (blocker) | `validate.yaml` is **not** the single authority. ADR-0010 §"Surface roles" scopes it to overrides for Checks 1.5–13, and routes quality gates to `gates.yaml`. `skills/validate/SKILL.md:399` emits `validate.check-1-quality-gates` and `validate.check-1.6-code-drift` with **no registry entry, by design** — an enum sourced only from `validate.yaml` would reject them and delete Check 1's outcome from the event log. Check 1 is the only check in the live set that ever fails. Adding them to `validate.yaml` is closed off by ADR-0010, so this needs an architecture answer: which surfaces contribute legal emit-time IDs, and what is the disposition of registry-less-by-design IDs. |
| **CON-6** (blocker) | Roughly 20 of the 46 corpus spellings normalise to IDs in **neither** `validate.yaml` **nor** `REMOVED_CHECK_IDS` — `check-8-boundary`, `check-11-visual`, `check-5-adr`, `check-9-transitions`, `check-1-5-source-manifest`, `check-1-6-drift`, the whole `check-13-*` family. `check-13-heuristic-extraction` versus registry `validate.check-12-heuristic-extraction` differs in the check *number*, so no prefix rule recovers it. A third class is required — *unrecognised legacy spelling* — with a stated read-path outcome distinct from *retired*. |
| SA-10 | The read path has no owning module. `lib/governance/validate-config.mjs` exports no membership predicate; the actual read-side resolver is `_resolveActorSeverity` at `lib/lifecycle-state.mjs:690`. Name the owner for both halves. |
| SA-12 | Do not re-enumerate retired IDs in prose. `REMOVED_CHECK_IDS` already exists in code, qualified, and contains entries prose copies omit (`validate.check-5-adrs`, `validate.check-6-cross-cutting`). Import it. |
| CON-7 | `REMOVED_CHECK_ID` at `lib/governance/validate-config.mjs:48-53` is **reserved and never emitted**; the loader emits `RESURRECTED_CHECK_ID`, which `check-set-restructure.spec.md:288,333` has already partitioned deliberately (project-authored WARN vs plugin-supplied FAIL). Either mint a distinct code or state that this spec activates the reserved one and confirm the partition still holds. |
| CON-8 | Inserting normalisation before `validate-config.mjs:122` silently changes an existing path: an unqualified removed ID in a project `validate.yaml` passes today and would begin warning and skipping. State the ordering relative to the removed-guard and whether widening `RESURRECTED_CHECK_ID`'s reach is intended. |
| SEC-8 | Behavior 3 accepts identifiers read from committed, pullable JSONL. Sanitisation must extend to any externally-sourced identifier rendered to a terminal or report, not only to rejected inputs. Freeze the retired set as a literal list rather than a `check-12-*` glob, so a crafted event cannot widen the read path. |

## Open design questions

1. Is the legal emit-time set the union of `validate.yaml` + `gates.yaml` + a lib-defined set of built-ins, or does ADR-0010 need amending to name a single registry?
2. Alias table vs. pass-through for the ~20 unrecognised spellings — an alias table makes historical analysis possible but requires a hand-built census.
3. Whether `--reviewer` and `--step` follow later under this spec's contract or their own.

## Acceptance Criteria

- [ ] The ADR-0010 boundary question is answered and cited before this spec enters review
- [ ] `adev report --validator <bogus>` exits non-zero, appends nothing, echoes a sanitised value
- [ ] An unqualified valid ID is normalised and accepted, matching the CLI's documented example
- [ ] `validate.check-1-quality-gates` is accepted at emit time (regression guard for SA-9)
- [ ] Every one of the 46 corpus spellings is readable without a hard failure (regression guard for CON-6)
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
