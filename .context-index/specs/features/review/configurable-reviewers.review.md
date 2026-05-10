# Architecture Review: configurable-reviewers

> **Date:** 2026-04-19
> **Spec:** .context-index/specs/features/review/configurable-reviewers.spec.md
> **Charter:** .context-index/specs/features/review/charter.md
> **Verdict:** PASS_WITH_NOTES

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning, Behavior 11a):** Read-only-compatibility check hardcodes a specific bundled profile name (`"except via 'browser-review'-style explicit allowances"`). Encodes the execution-profiles bundled-default name into the reviewer module's invariant. If `browser-review` is renamed or its posture shifts, 11a silently loosens/tightens. Restate in terms of observable posture (e.g., "literal tool entries permitted only when the transitive extends chain roots at `read-only` and the literal was introduced by a bundled plugin-shipped profile") or drop the carve-out.
- **SA-2 (warning, Behavior 11a ↔ execution-profiles API):** 11a requires inspecting an effective profile's resolved tool allowlist + filesystem/network posture at load time. The cross-cutting spec defines `loadProfiles`, `resolveProfile`, `prepareForDispatch` — no declared API for posture introspection without going through a harness adapter. Without such an API, `loadReviewConfig` either reaches into profile internals or duplicates extends-resolution logic. Add a normative line citing a specific helper (e.g., `getEffectivePosture(name)` from `lib/profiles/index.mjs`) and track its addition to execution-profiles rev 3.
- **SA-3 (warning, Behavior 31):** Adapter-subagent profile selection still says "under the same profile, or `reviewer-fast` if explicitly chosen" but Behavior 28's schema has no `adapter_profile` field. Carried over from rev 2 SA-5. Add `adapter_profile: <profile-name>` (optional, default = reviewer's profile) to the Behavior 28 schema, or remove the escape-hatch sentence.
- **SA-4 (warning, Behavior 24):** Triggered-dispatch scoring still cites `skills/review-specs/SKILL.md:86`. Line-number citation will rot when Task Map item 7 rewrites that file. Inline the scoring rule (2 points per matching glob + 1 per path segment beyond root, 1 point per keyword) as owned normative text.
- **SA-5 (warning, Behavior 39):** Manifest specialists deprecation layering remains ambiguous. Does a converted specialist override a bundled default with the same id, or lose to a `governance/review.yaml` entry? Carried over from rev 2 SA-4. Add explicit precedence line.
- **SA-6 (warning, Behavior 38):** `verdict_rules.blocker_threshold` still has no defined merge semantics. Carried over from rev 2 CON-4. Add: "`verdict_rules` merges field-by-field; project values win per field; unset fields inherit from defaults."
- **SA-7 (suggestion, Behaviors 17/30/30a):** Identical traversal-guard rule now restated three times. Factor into a single normative block referenced by each path-accepting field.
- **SA-8 (suggestion, Behavior 22):** Context-pack globs have no declared envelope. A pack matching `**/.env*` or `**/profiles.yaml` would be included silently. Add a denylist (minimum `.env*`, `profiles.yaml`, `**/secrets/**`) + `..`/symlink guard. Cross-references security review SEC-4 below.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

### Rev 2 Blocker Remediation

- **SEC-1 (data-exposure): RESOLVED.** Behavior 33 applies `redactionSet` via standard pipeline, 8 KiB truncation, absolute-path normalization, and routes full text to dispatch record only. AC added.
- **SEC-2 (input-validation): RESOLVED.** Behaviors 17, 30, 30a mandate `path.resolve` containment, pre-resolution `..` rejection, and `fs.realpath` verification. Covers prompt, package.skill, package.adapter.
- **SEC-3 (authorization): RESOLVED.** Behavior 11a blocks any reviewer profile whose effective posture permits `filesystem-write`, `shell`, non-whitelisted literals, write-allow, or unrestricted network. Runs at load, not dispatch.

### New Findings

- **SEC-1 (suggestion, input-validation):** 11a's literal-tool carve-out is prose, not a testable predicate. A project could `extends: browser-review` + `allow_add: { tool: arbitrary, allow_unportable: true }` and only get a WARN (execution-profiles 14a), not a load-fail. Tighten 11a to "no tool literal beyond those present in the bundled ancestor's transitive closure" and add AC that `extends: browser-review` + `allow_add: { tool: Bash }` fails reviewer load.
- **SEC-2 (warning, input-validation):** Behavior 17's traversal guard has a TOCTOU window between load-time `fs.realpath` and dispatch-time file read at Behavior 26. A symlink swap between load and dispatch could redirect the prompt file. Snapshot the prompt contents (or realpath + inode) at load and reuse at dispatch. Same concern for `package.skill` / `package.adapter`.
- **SEC-3 (warning, data-exposure):** Behavior 31's Stage 1 → Stage 2 handoff passes runner stdout verbatim into the adapter prompt. Cross-cutting 36 covers tool stdout/stderr at adapter-dispatch time, but the text that becomes *Stage 2's prompt* is not explicitly routed through the redaction pipeline first. A runner whose output echoes env values feeds them into Stage 2 prompt text. Add an explicit behavior + AC: runner output passes through the redaction pipeline before inclusion in the Stage-2 adapter prompt.
- **SEC-4 (warning, data-exposure — carryover):** Prior SEC-5 (context-pack glob denylist) unaddressed. Behaviors 20-22 still permit `include: [".env*", "**/secrets/**", "**/id_rsa"]` — a direct secret-exfiltration path, because the secrets never traverse `env.allow` so `redactionSet` has no value to match. Add a hard denylist; fail load (not WARN) on match. Structural SA-8 also flags this.
- **SEC-5 (suggestion, authorization — carryover):** Prior SEC-4 (bundled-default field override) unaddressed. A project `governance/review.yaml` entry with `id: security-reviewer` and a project-controlled `prompt:` silently replaces the bundled security reviewer. Require explicit `override_default: true` when overriding `prompt` or `package` on the three bundled reviewer ids, or restrict project overrides on bundled ids to `enabled`, `severity_cap`, `dispatch` only.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1 (suggestion, terminology):** Behavior 22's empty-glob marker `<no matches>` should be echoed in `configurable-checks.md` Behavior 23 (or consolidated in a shared context-pack spec). Low priority — shared library semantics will carry over.
- **CON-2 (suggestion, pattern):** `configurable-checks.md` Behavior 22 says traversal rules are "the same as in the reviewer spec" but doesn't restate the `fs.realpath`/`..`/symlink guard. Consider a one-line explicit echo for auditability. No change required to the reviewer spec.
- **CON-3 (suggestion, contract):** Behavior 11a's "browser-review-style explicit allowances" is a hypothetical exemption — bundled `browser-review` uses `{ mcp_server: playwright }` and `{ category: web-fetch }`, not a literal tool. Tighten wording to: "No `{ tool: <literal> }` entry whatsoever (bundled read-only-derived profiles do not use literal tools)."
- **CON-4 (suggestion, contract):** Intentional asymmetry: reviewers enforce read-only-compatibility, `configurable-checks` does not impose it on `subagent-review` kind. State the rationale in `configurable-checks.md` System Constitution Reference, or port the clamp to `subagent-review`. Flag for decision; not a conflict within the reviewer spec itself.
- **CON-5 (confirmed consistent):** `redactionSet` citations to cross-cutting Behavior 36 aligned with sibling spec.
- **CON-6 (suggestion, pattern):** Adapter-fallback 8 KiB cap vs. quality-gate 64 KiB cap is consistent-by-design (different surfaces warrant different budgets).

---

## Summary

**Total findings:** 19 (0 blockers, 10 warnings, 9 suggestions)
**Action required:** None blocking. All three rev-2 blockers (SEC-1 raw-output leak, SEC-2 traversal, SEC-3 profile posture) are remediated with specific, testable mitigations. New findings are warnings/suggestions; SEC-4 (context-pack denylist) is a carryover and a direct secret-exfiltration path worth closing before implementation freezes. SA-1/SA-2 (hardcoded profile name + missing posture-introspection API) are new structural couplings introduced by the 11a fix and should be tracked.

---

last-reviewed-revision: 3
file-sha: a36d06f9ddb974a4f68505a6818ed79ba017ce1e
