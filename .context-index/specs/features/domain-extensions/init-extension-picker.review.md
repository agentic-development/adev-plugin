---
last-reviewed-revision: 2
file-sha: 8eebce5008dc70f070cd37840b3622f7c0220c83a05e597a383ea8c1a7c84bd4
---

# Architecture Review: init-extension-picker (revision 2)

> **Date:** 2026-05-20
> **Spec:** .context-index/specs/features/domain-extensions/init-extension-picker.spec.md (revision 2)
> **Charter:** .context-index/specs/features/domain-extensions/charter.md (revision 3)
> **Verdict:** PASS
> **Prior review:** Revision 1 PASS_WITH_NOTES (6 warnings, 12 suggestions). This re-review verifies revision 2 addresses every finding.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

Prior findings verification:

- **SA-1: resolved** — Module Impact Map row for `cli/index.mjs` rewritten cleanly. Broken sentence removed.
- **SA-2: resolved** — New Workspace-mode precondition explicitly states the picker writes only to the current repo's `manifest.yaml` and `.context-index/domains/`, skips silently at workspace root, and guards writes with `assertPathInWorkspace()`. Reinforced by Task Map entry "Workspace-mode guard", a new acceptance criterion, and the System Constitution Reference §ADR-0005 entry. Aligns precisely with ADR-0005 §Decision rules 1, 2, and 4. **Real fix, not papered over** — the precondition declares the semantics, the task encodes the work, the AC verifies it.
- **SA-3: resolved** — New `## Catalog Contract` section is unambiguous: "There is one canonical source; no in-source constant fallback." Module Impact Map confirms `templates/extensions-catalog.json` as the single artifact. Constitution Reference §Principle 1 rephrased to match.
- **SA-4: resolved** — Behavior #5 now explicitly states "the existing top-level `domain:` value in `manifest.yaml` is preserved unchanged (no write)". Mirrored in Acceptance Criterion.
- **SA-5: resolved** — Constitution Reference §Principle 3 and §Coding-standard name `lib/cli/domain-extension-picker.mjs` explicitly. Module Impact Map confirms it as a new High-impact module. No "or inline" ambiguity remains.
- **SA-6: resolved** — Error Cases row for `PICKER_CATALOG_PARSE_FAILED` now reads "Bundled catalog file missing or malformed", citing the single canonical source.

**New section assessment (`## Catalog Contract`):**
- API shape: schema is explicit (`version`, `entries[]` with `name`, `label`, `description`, `path`); validation rules tie to existing regex (`parseExtensionManifest`) and existing path-traversal guard (`resolve-source.mjs::resolveGit`) — no parallel invention.
- Data flow: catalog → load → validate → drop-invalid → present → resolve → `installExtension()`. Single direction, no backflows.
- Module boundaries: picker consumes catalog, calls install pipeline unchanged. No leakage.
- Dependency direction: `lib/cli/` → `lib/extensions/` (acyclic, matches charter convention).
- Constitution consistency: no new deps; ESM-only; content-only catalog.
- ADR compliance: stamp-trust note cites SEC-4 and the local-CLI threat model; no conflict with any ADR.

**Workspace-mode precondition assessment:**
Cross-references ADR-0005 rules 1 (`detectWorkspace`), 2 (write containment to current repo), and 4 (`assertPathInWorkspace`). The "skipped silently at workspace root" semantics matches ADR-0005's graceful-degradation philosophy. Resolves SA-2 substantively. No regression.

**No new findings.** Rev 2 is a clean closure pass; the Catalog Contract section is a structural improvement, not a new surface.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

Prior findings verification:

- **SEC-1: resolved** — Rev 2's `## Catalog Contract` section declares (a) `name` regex `^[a-z][a-z0-9-]*$` matching `parseExtensionManifest()`, (b) `path.resolve(pluginRoot, entry.path)` with prefix check mirroring `resolve-source.mjs::resolveGit`, and (c) explicit drop-on-failure with advisory log ("Entries failing validation are dropped from the picker … they do not abort init") — all three required properties present.
- **SEC-2: resolved** — Behavior #7 now mandates "passes any source URI through `stripCredentials()` (per `lib/extensions/install.mjs::writeManifestStamp` precedent) before printing" and adds the negative requirement "Error messages and the install banner MUST NOT contain raw credentials." Acceptance criterion mirrors this. `stripCredentials` confirmed exported from `resolve-source.mjs:65`.
- **SEC-3: resolved** — New precondition: "v1 catalog scope: catalog entries in v1 MUST resolve to local paths under the plugin root. Network sources (git URL, npm) are deferred until a separate spec adds catalog signing / integrity verification." Reinforced by Catalog Contract: "no embedded URLs in v1; URL fields are deferred with the network-source spec."
- **SEC-4: resolved** — Catalog Contract closes with explicit "Stamp-trust note (per SEC-4)": "the project's existing `installed_extensions` stamp in `manifest.yaml` is treated as authoritative by the picker — no re-verification of installed content is performed … consistent with the local-CLI threat model." Matches recommendation verbatim.

**No new findings.** The Catalog Contract section narrows attack surface rather than expanding it: schema constraints are restrictive (regex + traversal guard + no URLs), and the catalog file is shipped under `templates/` — same trust domain as `cli/index.mjs` itself. The `PICKER_*` error codes carry no internal state beyond what `SOURCE_RESOLUTION` / `BUNDLED_COLLISION` already disclose.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

Prior findings verification:

- **CON-1: resolved** — Behavior #6 commits to "exactly `Domain: <name>` (single canonical format, no variant)". All banner-touching acceptance criteria, the Module Impact Map row for `cli/index.mjs`, and Task Map rows use `Domain: <name>`. No remaining "Domain extension:" instances.
- **CON-2: resolved** — Error Cases row for `BUNDLED_COLLISION` carries the exact annotation "unreachable for the v1 first-party catalog because `BUNDLED_DOMAIN_NAMES` contains only `"software"` after the Bundled Templates Cleanup; retained for forward-compatibility…" Explicit `(Addresses CON-2.)` tag present.
- **CON-3: resolved** — Preamble note declares the reuse convention; table `Source` column tags each row `pipeline (reused)` or `picker (new)`. `SOURCE_RESOLUTION`, `INVALID_SCHEMA`, `BUNDLED_COLLISION` reused verbatim (verified against `lib/extensions/install.mjs`, `resolve-source.mjs`, `content-install.mjs`, `manifest-schema.mjs`). New codes prefixed `PICKER_*` and pinned to definition site `lib/cli/picker-errors.mjs`.
- **CON-4: resolved (no-change)** — `kind: behavioral` frontmatter still present. Informational; sibling-backfill remains a separate pass.
- **CON-5: resolved** — Heading reads `## System Constitution Reference`.
- **CON-6: resolved** — Task Map header reads `Estimated Complexity`; all 12 rows use `small`/`medium`/`large`. No `S/M/L` residue.
- **CON-7: resolved** — All 17 acceptance criteria use `- [ ]` checkbox syntax.
- **CON-8: resolved** — Final Task Map row: "Charter Domain Model note — Add a one-line note to the `domain-extensions` charter (next revision) documenting the top-level `domain:` key in project manifests." Module Impact Map `manifest.yaml` row cross-references the pending charter update.

**No new findings.** The new `PICKER_*` prefix does not collide with any existing error-code namespace; grep across `lib/` and `cli/` shows no prior `PICKER_*` usage. The Catalog Contract schema follows the same flat-object style as sibling-spec entity sections — no contract drift.

---

## Summary

**Total findings:** 0 (0 blockers, 0 warnings, 0 suggestions)

**Prior findings:** All 18 findings from the rev 1 review (SA-1..6, SEC-1..4, CON-1..8) verified `resolved` against rev 2 by the dispatched reviewers.

**Verdict consolidation:** All three reviewers returned PASS with zero new findings. Consolidated verdict per `computeVerdict` rules is **PASS**.

**Action required:** The spec is **ready for planning**. Run `/adev:plan --spec .context-index/specs/features/domain-extensions/init-extension-picker.spec.md` to decompose into ordered implementation tasks.

### Governance footer

No `spec-to-plan` `approver_role` requirement found in `.context-index/governance/gates.yaml`.
