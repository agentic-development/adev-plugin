# Architecture Review: configurable-checks

> **Date:** 2026-04-19
> **Spec:** .context-index/specs/features/validation/configurable-checks.spec.md
> **Charter:** .context-index/specs/features/validation/charter.md
> **Verdict:** PASS_WITH_NOTES

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning, Behavior 8):** `deterministic-check` still binds ID to library function by naming convention with no explicit schema field. Carried over from rev 2. Add an explicit `impl: <module-export>` field or a documented registry in Key Files.
- **SA-2 (warning, frontmatter):** `depends-on` still omits `configurable-reviewers.md` despite Behaviors 22 and 23 citing reviewer-spec URI rules and shared context-pack namespace. Rev 3's new Behavior 22 text ("subject to the `plugin:` URI rules from the reviewer spec") makes the omission more acute. Add the entry, or extract URI rules into a cross-cutting reference both specs depend on.
- **SA-3 (warning, Behavior 23):** Shared context-pack namespace between `review.yaml` and `validate.yaml` still resolves collisions via "WARN second-wins" with no documented load order. Specify load precedence or cross-reference the spec that owns the pack registry.
- **SA-4 (warning, Behaviors 6b/6c vs execution-profiles 34):** New in rev 3. Behavior 6b + 13a lock the quality-gate subprocess env to profile-declared keys plus minimal PATH/HOME/locale — structurally sound, but the relationship to execution-profiles Behavior 34 ("adapter makes env available to the subagent's tool execution environment") needs an explicit bridge. A `quality-gate` subprocess is a new dispatch target parallel to subagent tool execution and not yet modeled by the cross-cutting primitive. Add a cross-reference in Behavior 13a.
- **SA-5 (warning, Behavior 25a):** Behavior 25a declares the quality-gate output path "an audited channel per execution-profiles Behavior 36," but execution-profiles 36 enumerates audited channels as a closed list that does not include "quality-gate subprocess stdout/stderr captured by the validate skill." Either extend that list in the cross-cutting spec or annotate this spec as needing a lockstep companion edit.
- **SA-6 (suggestion, Behavior 26):** Report still has no `deterministic-check` auditability output (which library function ran, its version). Extend the report line for `deterministic-check` to include the bound implementation identifier.
- **SA-7 (suggestion, Behavior 15):** Playwright MCP load-time failure unconditional, even when `validate.check-11-visual-verification` is disabled. Specify that disabled entries skip profile resolution.
- **SA-8 (suggestion, Behavior 16):** Topological sort tie-breaking among independent checks still unspecified; affects report determinism. Declare a deterministic secondary key (e.g., lexicographic by `id`).
- **SA-9 (warning, charter):** Validation charter still says "11 ordered checks" while rev 3 canonicalizes 12 + Check 1 = 13 total. Task Map does not include a charter revision. Add a charter-bump task (or upgrade to blocker if the `charter-revision` frontmatter is meant to track drift).

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

### Rev 2 Blocker Remediation

- **SEC-1 (input-validation, shell-injection): RESOLVED.** Behaviors 6, 6a, 6b, 6c: argv-only form; string form rejected; `{{...}}`/`$VAR`/`${VAR}`/`%VAR%` interpolation syntactically rejected (loader never substitutes); `shell: true`, cwd escape, unauthorized `child_process` options rejected with empty whitelist. ACs prove enforcement. Mitigation is stronger than requested.
- **SEC-2 (secrets, output redaction): RESOLVED.** Behavior 25a explicitly routes quality-gate stdout/stderr through the cross-cutting redaction pipeline (execution-profiles 36) before any downstream use, naming all audited channels. 25b adds 64 KiB report cap. AC proves end-to-end.
- **SEC-3 (authorization, misleading profile default): RESOLVED.** Behavior 13 removes the implicit default; omitted `profile` fails load with an explicit-acknowledgement message. 13a hardens subprocess env to profile-resolved keys + minimal startup set.

### New Findings

- **SEC-4 (warning, authorization):** Behavior 13a permits "minimal PATH, HOME, and locale entries required for the subprocess to start" but does not enumerate them. A permissive adapter could include `LD_PRELOAD`, `NODE_OPTIONS`, `PYTHONPATH`, `SSL_CERT_FILE` — each an OS-level code-injection or trust-store-override vector. Enumerate the whitelist explicitly (`PATH`, `HOME`, `LANG`, `LC_ALL`, `TMPDIR`, `USER`) and forbid adapters from broadening it without an ADR. Add AC: fixture verifies `LD_PRELOAD`/`NODE_OPTIONS` from the invoking shell do not reach the subprocess.
- **SEC-5 (warning, input-validation):** 6c pins `cwd` to the consumer repo root but does not constrain how the argv[0] executable is resolved. A malicious repo shipping `./node_modules/.bin/npm` shadowing system `npm` runs attacker-controlled code under the author's UID. Require `execFile` without shell PATH-walking, or mandate argv[0] be absolute or resolved against the profile-resolved `PATH` only. Add AC verifying repo-local `node_modules/.bin/<tool>` does not shadow system binaries unless opted-in.
- **SEC-6 (suggestion, data-exposure):** 25a/25b note "dispatch record retains full (redacted) bytes" but execution-profiles 36b documents bypass classes (base64, URL-encode, etc.) as unmitigated. A long-lived dispatch record of a gate that emitted an encoded secret is a durable exfiltration surface. Add retention/rotation requirement; cross-reference 36b within this spec so operators see the residual-risk at the quality-gate surface.
- **SEC-7 (suggestion, authorization):** A project-added check with `fail_fast: true` + `severity: error` listed in the `after` chain of every bundled security check could suppress all downstream validation by failing first. Bundled defaults MUST NOT appear in a project check's `after` except via explicit allowlist, or project checks cannot set `fail_fast: true` for checks transitively-preceding bundled security checks.

### Unaddressed Prior Warnings (informational)

SEC-4 (prompt provenance hash), SEC-5 (workspace trust), SEC-6 (coverage floor / disable-all fail-open), SEC-7 (per-kind severity defaults), SEC-8 (rate limits), SEC-9 (path normalization in report), SEC-10 (defaults hash) from rev 2 not addressed in rev 3. Not blockers; remain valid warnings/suggestions.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1 (RESOLVED IN SAME CHANGESET):** Behavior 25 referenced `@workspace/` after cross-cutting rev 2 renamed to `$workspace/`. **Fixed in same commit** as this review: Behavior 25 now reads `$workspace/` with the disjointness note.
- **CON-2 (suggestion, naming):** `plugin:validate/defaults.yaml` follows the `plugin:<skill-name>/<file>` pattern consistently with `configurable-reviewers.md`'s `plugin:review-specs/defaults.yaml`. Verify `skills/validate/` is the on-disk directory name. Not a blocker.
- **CON-3 (suggestion, pattern):** Behavior 22 summarizes reviewer-spec resolution rules but omits the explicit `fs.realpath`/`..`-rejection traversal guard. Either inline the guard or cite `configurable-reviewers.md` Behavior 17 by section name to remove ambiguity for implementers.
- **CON-4 (suggestion, terminology):** Behavior 18 ("today's behavior preserved: Checks 2-10 are skipped…") does not cite `unified-gate-system.md` Behavior 9 (the authority). Depends-on list has it, but inline citation would make authority chain explicit.
- **CON-5 (suggestion, pattern):** Silence about `subagent-review` profile-posture clamp: `configurable-reviewers.md` Behavior 11a clamps reviewers to read-only-compatible; this spec does not impose an equivalent clamp on `kind: subagent-review`. The asymmetry is likely intentional (validate checks span broader kinds) but undocumented. Either add a note explaining why `subagent-review` is NOT clamped, or add an equivalent clamp.
- **CON-6 (suggestion, domain-model):** Behavior 15's `browser-review` profile (`network: read-only`, `mcp_server: playwright`) aligns with cross-cutting spec. Verify legacy Check 11 behavior does not rely on `network: allow`.
- **CON-7 (suggestion, terminology):** Behavior 13a says "the invoking `.adev` shell" — no other spec uses this term. Rename to "invoking shell" (aligns with constitution and cross-cutting spec).
- **CON-8 (confirmed consistent):** Acceptance Criteria correctly use `env.allow.required` field name from execution-profiles Behavior 5.

---

## Summary

**Total findings:** 22 (0 blockers, 10 warnings, 12 suggestions)
**Action required:** None blocking. All three rev-2 security blockers (shell-injection, output redaction, profile default) are remediated with stronger controls than requested and verified by ACs. The consistency drift (CON-1 `@workspace/` → `$workspace/`) was resolved in-flight by the same changeset. New warnings (SEC-4 minimal-env enumeration, SEC-5 argv[0] PATH resolution, SA-2 missing depends-on, SA-4/SA-5 quality-gate-as-dispatch-target not modeled by cross-cutting) should be tracked for implementation.

---

last-reviewed-revision: 3
file-sha: 3677879f9b8d88924800161f42564c98a8e1df27
