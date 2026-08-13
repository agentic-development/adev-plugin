---
spec: .context-index/specs/cross-cutting/measurement-integrity.spec.md
spec-revision: 2
date: 2026-08-13
blocker-count: 2
---

# Blockers: measurement-integrity (revision 2)

Both blockers land in behaviors 2–3, the check-ID enum. Revision 1's blockers were resolved (4 addressed, 0 persistent); these are new.

## structural-architect:adr-conflict:4b0d72e1

blocker_id: structural-architect:adr-conflict:4b0d72e1

reviewer: structural-architect
severity: blocker
section_anchor: behaviors-2

Behavior 2 treats `.context-index/governance/validate.yaml` as the closed source of legal check IDs, and Integration Point 1 calls it "the single authority… one source of truth rather than two overlapping ones." This conflicts with ADR-0010, whose §"Surface roles" scopes `validate.yaml` to overrides for Checks 1.5-13, and whose decision flow routes quality gates to `gates.yaml` instead. The live consequence is concrete: `skills/validate/SKILL.md:399` emits `validate.check-1-quality-gates` and `validate.check-1.6-code-drift`, neither of which has a registry entry, by design. Under behaviors 2 and 8 those invocations would exit 1 and append no event — removing Check 1's outcome from the event log, and Check 1 is the only check in the live set that ever fails. Adding them to `validate.yaml` is closed off by ADR-0010, which makes this an architecture conflict rather than a configuration fix.

**Resolution:** Cite ADR-0010 and state the enum's real boundary — which surfaces contribute legal emit-time IDs, and what happens to IDs that are registry-less by design. Drop or qualify the "single authority" claim in Integration Point 1.

## consistency-analyzer:legacy-id-admission:4b8ae0d7

blocker_id: consistency-analyzer:legacy-id-admission:4b8ae0d7

reviewer: consistency-analyzer
severity: blocker
section_anchor: behaviors-3

Behavior 3 and Postcondition 2 promise that retired IDs "remain readable" so replay and backfill "never hard-fail", and the only stated mapping is unqualified-to-qualified prefixing. The live event corpus under `.context-index/lifecycle-state/` contains 46 distinct `validator` spellings, and roughly 20 of them normalise to IDs present in neither `validate.yaml` nor `REMOVED_CHECK_IDS` (`lib/governance/validate-config.mjs:58-66`) — among them `check-8-boundary`, `check-11-visual`, `check-5-adr`, `check-9-transitions`, `check-1-5-source-manifest`, `check-1-6-drift`, and the entire `check-13-*` family. `check-13-heuristic-extraction` versus the registry's `validate.check-12-heuristic-extraction` differs in the check number itself, so no prefix rule recovers it. The spec cites "four spellings of the same check" as its own motivation while fixing only the exact-retired case.

**Resolution:** Admit a third class of ID — unrecognised legacy spelling — with a stated read-path outcome (pass through verbatim, or resolve via an alias table), distinct from the retired class. Import `REMOVED_CHECK_IDS` from code rather than re-enumerating it in prose, since the prose copy is both incomplete (omits `validate.check-5-adrs` and `validate.check-6-cross-cutting`) and written in the unqualified form that behavior 2 rejects.
