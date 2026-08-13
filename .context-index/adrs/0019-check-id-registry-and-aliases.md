# ADR 0019: A Machine-Readable Built-In Check Registry, and an Alias Table for Historical IDs

## Status

**Proposed**

> Amends **ADR 0010 (Governance Check Layering)** by naming where its `validate.yaml` row's phrase *"New built-in checks added to the skill itself"* is declared in machine-readable form. The six surface roles are unchanged.

## Date

2026-08-13

## Context

Validator identifiers in the lifecycle event log are free text. `adev report --type validator` accepts any `--validator` string that matches a loose character allowlist, so nothing counted across the corpus can be trusted.

### The measured damage

The live event corpus contains **46 distinct validator spellings**. Four of them name the same code-drift check (`check-1.6-code-drift`, `check-1.6-drift`, `check-1.6-drift-detection`, `check-1.6-drift-warning`), three name the same boundary check, and four name heuristic extraction. Roughly 20 map to identifiers present in neither `.context-index/governance/validate.yaml` nor `REMOVED_CHECK_IDS`.

This is not a cosmetic problem. It is why per-check pass/fail rates, no-op analysis, and regression trends over the corpus cannot be computed — the analysis that `check-set-restructure.spec.md` performed by hand, and that nothing can currently repeat automatically.

### Why the obvious fix is blocked

`issue-562` proposed making `validate.yaml` the closed enum of legal check IDs. Measured directly:

- `skills/validate/SKILL.md` emits **8** check IDs
- `.context-index/governance/validate.yaml` registers **6**
- missing from the registry: **`validate.check-1-quality-gates`** and **`validate.check-1.6-code-drift`**

Enforcing that enum would reject exactly those two, so **Check 1's outcome would stop being recorded** — and Check 1 is the only check in the live set that ever fails (23 PASS / 12 PASS_WITH_NOTES / 11 FAIL). The change intended to make measurement trustworthy would blind the one measurement that works.

The escape hatch is closed by ADR-0010 itself. Its `validate.yaml` row is authoritative for *"the 13 built-in checks … their `enabled` flag, and any per-check parameter overrides"*, and states plainly: *"The skill is the surface that runs the checks; it is not a registry for additional ones."* So the two missing IDs cannot simply be added there.

### The actual gap

ADR-0010 already assigns ownership correctly — built-in checks belong to **the skill**, and `validate.yaml` is an **override slot** over them. What it never did was say where the skill's built-in set is declared in a form a program can read. `skills/validate/SKILL.md` is prose. `lib/governance/validate-config.mjs` holds a partial `BUNDLED_DETERMINISTIC_IDS` set and a `REMOVED_CHECK_IDS` set, neither of which claims to be the complete registry.

So the enum has no source, and `validate.yaml` gets pressed into a role ADR-0010 explicitly denies it.

## Decision

Two parts, both additive to ADR-0010 rather than revisions of it.

### Part A — the built-in registry is a lib constant

**`lib/governance/check-ids.mjs` becomes the authoritative, machine-readable registry of built-in validate check IDs**, in canonical namespace-qualified form (`validate.check-<n>-<slug>`). This is the machine-readable expression of ADR-0010's existing *"added to the skill itself"* — a clarification of where that lives, not a change of owner.

The legal **emit-time** set is:

```
built-in registry (lib/governance/check-ids.mjs)
  ∪  project-declared check IDs in validate.yaml
```

`validate.yaml` keeps exactly the role ADR-0010 gives it — enabling, disabling and parameterising known checks — and gains no new authority. A check absent from the registry and absent from `validate.yaml` is rejected at emit time.

This resolves the blocker directly: `validate.check-1-quality-gates` and `validate.check-1.6-code-drift` are built-ins, so they live in the registry and are legal to emit, without being added to a surface ADR-0010 reserves for overrides.

**Canonical form is the namespace-qualified one.** `lib/cli/report.mjs` currently documents the unqualified example `check-2-spec-compliance`; that becomes a legacy alias (Part B), not an error, so the CLI's own documented invocation keeps working.

### Part B — an alias table, with a read/emit asymmetry

**`lib/governance/check-ids.mjs` also carries an alias table** mapping every historical spelling to its canonical ID, partitioned into three classes:

| class | on read | on emit |
|---|---|---|
| **canonical** — in the registry | accepted | accepted |
| **alias** — a known variant of a canonical ID | accepted, resolved to canonical | rejected, with the canonical ID named in the error |
| **retired** — a check removed by `check-set-restructure.spec.md` (3, 5, 6, 7, 10, 12, 13) | accepted, resolved to its canonical retired ID | rejected |

The asymmetry is the point. **Reading must never hard-fail**, or replay and backfill over the historical corpus break — and that corpus is the only record of what the gates actually did. **Emitting must be strict**, or the vocabulary drifts again the moment it is cleaned up.

Aliases fall into four mechanical families, all present in the corpus:

- **prefix** — `check-2-spec-compliance` → `validate.check-2-spec-compliance`
- **separator** — `check-1-5-source-manifest` → `validate.check-1.5-source-manifest` (dash for the decimal point)
- **abbreviation** — `check-8-boundary`, `check-8-boundary-compliance` → `validate.check-8-boundaries`; `check-11-visual` → `…-visual-verification`; `check-9-transitions` → `…-transition-gates`; `check-1.6-drift`, `…-drift-detection`, `…-drift-warning` → `…-code-drift`
- **renumber** — `check-13-heuristic-extraction` → `validate.check-12-heuristic-extraction`. This is the family no prefix or separator rule can recover, because the check *number* changed. It is also why the table must be hand-built and data-derived rather than generated by a normalising regex.

An unrecognised spelling that matches none of the three classes is passed through verbatim on read and rejected on emit. It is never silently dropped or coerced — a wrong ID that reads as a valid one is worse than an unknown one.

## Consequences

**Positive.** The corpus becomes analysable: per-check rates, no-op detection and regression trends can be computed automatically, which is the capability `check-set-restructure.spec.md` had to produce by hand. The vocabulary stops drifting, because emit-time is strict. ADR-0010's surface roles are untouched, so no governance boundary moves. And Check 1 keeps recording, which was the whole risk.

**Negative.** The alias table is hand-maintained and data-derived; a spelling that appears in future without being added will read as unrecognised. Two sources contribute to the legal emit set (registry plus project overrides), so the union has to be computed rather than read from one file. Strict emit-time validation will reject invocations that work today — deliberately, and with the canonical ID named in the error, but it is a breaking change to a CLI contract.

**Neutral.** `BUNDLED_DETERMINISTIC_IDS` and `REMOVED_CHECK_IDS` in `lib/governance/validate-config.mjs` are subsumed by the new module and should be re-exported from it rather than duplicated, or they become a fourth drifting copy of the same enum. `RESURRECTED_CHECK_ID` keeps its existing meaning for *registry loading* (a project re-declaring a removed check in `validate.yaml`); emit-time rejection is a distinct code and must not overload it — `check-set-restructure.spec.md` already partitioned that deliberately.

## Alternatives considered

**Make `validate.yaml` the single registry** — the original `issue-562` proposal. Rejected: contradicts ADR-0010's explicit *"not a registry for additional ones"*, and rejecting the two unregistered built-ins would blind Check 1.

**Union of surfaces with no new module** — compute the enum from `validate.yaml` + `gates.yaml` + an inline list. Rejected: leaves three sources of truth to keep in sync and gives the built-in set no owner, which is the defect being fixed.

**Warn-only, never reject at emit** — zero risk to Check 1 by construction. Genuinely tempting, since the enum's purpose is measurement rather than enforcement, and it was seriously considered. Rejected because warnings on a path nobody reads are how the corpus reached 46 spellings; the same argument that put the frontmatter check in the artifact-commit verb rather than in prose applies here.

**Normalise historical IDs by rewriting the event log** — makes the corpus uniform in one pass. Rejected outright: the lifecycle log is append-only by design, and rewriting history to fix an analysis problem destroys the audit property the log exists for.

## References

- ADR 0010 — Governance Check Layering (the surface roles this amends, and the `validate.yaml` row it clarifies)
- `.context-index/specs/features/validation/check-set-restructure.spec.md` — retired Checks 3, 5, 6, 7, 10, 12, 13; the hand-built analysis this decision automates
- `.context-index/specs/cross-cutting/check-id-enum.spec.md` — the draft spec unblocked by this ADR
- `lib/governance/validate-config.mjs` — `BUNDLED_DETERMINISTIC_IDS`, `REMOVED_CHECK_IDS`, `RESURRECTED_CHECK_ID`
- `lib/cli/report.mjs` — the `--validator` surface, and the unqualified example that becomes a legacy alias
- `.context-index/specs/cross-cutting/measurement-integrity.review.md` — SA-9 and CON-6, the findings this resolves
