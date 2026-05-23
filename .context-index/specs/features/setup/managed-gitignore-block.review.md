---
spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
charter: .context-index/specs/features/setup/charter.md
date: 2026-05-22
verdict: PASS_WITH_NOTES
last-reviewed-revision: 1
file-sha: 931bc058f091a6435da126af9a849d130c9ed4956c78548ed04f8d89b91250e3
---

# Architecture Review: managed-gitignore-block

> **Spec:** `.context-index/specs/features/setup/managed-gitignore-block.spec.md`
> **Charter:** `.context-index/specs/features/setup/charter.md`
> **Verdict:** PASS_WITH_NOTES
> **Total findings:** 17 (0 blockers, 8 warnings, 9 suggestions)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

---

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

### SA-1 (warning) — Ownership transfer of `lifecycle-state/build-state` JSON

- **Location:** `behaviors-3`, canonical-path-list
- **Finding:** The canonical list includes `.context-index/lifecycle-state/*.json` and `.context-index/build-state/*.json` but the spec does not declare ownership transfer from existing ad-hoc `.gitignore` entries. The lifecycle-state path is presently described by the `agent-reliable-state-artifacts` charter, with the inline-comment distinction "Per-spec event logs (`*.jsonl`) ARE committed; only the `*.json` build-state files are ignored." Folding into `adev:gitignore` silently relocates a load-bearing comment.
- **Recommendation:** Either (a) keep `lifecycle-state/*.json` and `build-state/*.json` outside the managed block (owned by their charter's installer, mirroring the session-capture carve-out) and explicitly list them under "Explicitly not included," OR (b) embed the documenting rationale into the `MANAGED_GITIGNORE_PATHS` entry's `comment` field so it survives the move.

### SA-2 (warning) — Manifest-knob contract surface incomplete

- **Location:** `behaviors-8`, `error-cases`
- **Finding:** Behavior 8 references `setup.managed_gitignore: false` without declaring the YAML schema location, the default value, or how the explicit `adev init ensure-gitignore` verb interacts with the knob.
- **Recommendation:** State the manifest path (e.g., `setup.managed_gitignore`), the default (`true`), and whether the explicit subverb respects or bypasses the manifest gate. Add an error case for `--remove` invoked while the manifest knob is `false`.

### SA-3 (suggestion) — Paired-marker primitive duplication risk

- **Location:** `module-impact`
- **Finding:** The new installer duplicates paired-marker primitives (open/close splice, dedupe, malformed-repair) already implemented in `lib/session-capture-installer.mjs`.
- **Recommendation:** Consider extracting `lib/gitignore/paired-marker.mjs` consumed by both installers. Non-blocking — extraction can happen during `/adev:plan`.

### SA-4 (suggestion) — Prototype-server call-site contract

- **Location:** `behaviors-7`, `acceptance-criteria`
- **Finding:** `lib/prototype-server.mjs::ensureGitignore` runs lazily on prototype boot. After the refactor, booting a prototype in a project where `setup.managed_gitignore: false` would either silently re-install the block or noop — neither is specified.
- **Recommendation:** Clarify whether `ensureGitignore` honors the manifest gate or always force-installs (since the prototype workspace specifically needs `.adev/` ignored).

### SA-5 (suggestion) — Paired amendment to `incremental-artifact-writes`

- **Location:** `canonical-path-list`, `cross-cutting/incremental-artifact-writes`
- **Finding:** The cross-cutting spec already lists `*.partial` / `*.partial.lock` as `.gitignore` requirements (acceptance criterion line 236). Folding these into `MANAGED_GITIGNORE_PATHS` transfers ownership without paired-amendment notes.
- **Recommendation:** Add a task to update `incremental-artifact-writes.spec.md` acceptance criterion line 236 referencing the `adev:gitignore` block as the enforcement vector.

---

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

### SEC-1 (warning) — Path-containment algorithm unspecified

- **Category:** path-traversal
- **Finding:** Spec declares `UNSAFE_GITIGNORE_PATH` exit 2 for "projectRoot escape via symlink" but does not specify the containment algorithm. Sibling `lib/session-capture-installer.mjs` does NOT path-contain — it writes blindly with `writeFileSync`. Without a concrete rule the exit code is decorative.
- **Recommendation:** Specify `realpath(projectRoot)` and `realpath(dirname(.gitignore))` before write; require the latter to start with the former + `path.sep`. Reject with `UNSAFE_GITIGNORE_PATH` if `.gitignore` is itself a symlink whose target escapes projectRoot. (OWASP A01 / CWE-59.)

### SEC-2 (warning) — Atomic-write semantics missing

- **Category:** atomic-write
- **Finding:** Spec is silent on atomic-write. A crash or `ENOSPC` mid-`writeFileSync` could truncate `.gitignore`, violating the postcondition "byte-identical to its pre-call state." Prior art has the same gap; propagating it to a block covering 18 paths increases blast radius.
- **Recommendation:** Specify temp-then-rename: write `.gitignore.<pid>.tmp` in the same directory, fsync, then `rename(2)`. Decide whether to add `.gitignore.*.tmp` to the managed list or rely on the existing `*.partial` precedent.

### SEC-3 (suggestion) — Path-list input invariants

- **Category:** input-validation
- **Finding:** No stated invariant that `MANAGED_GITIGNORE_PATHS` entries reject embedded newlines, NUL bytes, or marker substrings. A future PR could inject content that shadows user content or breaks parser re-entry.
- **Recommendation:** Add a load-time assertion: each entry's `path` and `comment` must contain no `\n`, `\r`, `\0`, and must not contain the literal marker tokens. Throw at startup.

### SEC-4 (suggestion) — Non-sensitivity documentation

- **Category:** data-exposure
- **Finding:** Path list is non-sensitive today (lifecycle artifacts, lockfiles). Flagging only so the dogfood-parity test enforces future additions remain non-sensitive.
- **Recommendation:** Add a docstring in `lib/gitignore-paths.mjs` that entries must be non-sensitive (visible in installer stderr and committed dogfood test).

### SEC-5 (suggestion) — Strengthen disabled-knob advisory

- **Category:** authorization
- **Finding:** With `setup.managed_gitignore: false` and an existing block, the spec retains the stale block without auto-removing it. The advisory is minimal.
- **Recommendation:** When knob is false AND a managed block exists, also emit "existing managed block retained but not refreshed; run `adev init ensure-gitignore --remove` to delete."

### SEC-6 (warning) — Newline-collapse scope on `--remove`

- **Category:** input-validation
- **Finding:** Prior art uses `.replace(/\n{3,}/g, "\n\n")` globally on the entire file — that mutates user content far from the splice. The spec implicitly inherits this risk by mirroring the sibling's logic.
- **Recommendation:** Specify that newline collapsing is scoped to the splice region (join of `before` tail + `after` head), not a global regex. Add a test asserting triple-newline runs elsewhere survive `--remove` unchanged.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

### CON-1 (warning) — `ensure` vs `append` naming parity claim

- **Category:** naming
- **This spec:** `ensureManagedBlock` / `removeManagedBlock` in `lib/gitignore-installer.mjs`.
- **Conflicts with:** Sibling uses `appendSessionCaptureGitignoreBlock` / `removeSessionCaptureGitignoreBlock` (`lib/session-capture-installer.mjs:121, 155`). The spec asserts "mirror that pattern exactly" while breaking it.
- **Recommendation:** Either rename to `appendManagedGitignoreBlock` / `removeManagedGitignoreBlock` for verb+subject parity, or document the deliberate `ensure*` divergence as a generic-primitive choice.

### CON-2 (warning) — Manifest-knob namespace rationale

- **Category:** naming
- **This spec:** `setup.managed_gitignore: bool` (default `true`).
- **Conflicts with:** Sibling knob `integrations.session_capture.gitignored` (`lib/session-capture-installer.mjs:103`) — `integrations.*` namespace, adjective-style.
- **Recommendation:** Namespace divergence is defensible (this is setup-scoped, not feature-integration-scoped) but the spec should state that explicitly.

### CON-3 (suggestion) — No-file branch pattern divergence

- **Category:** pattern
- **This spec:** Distinct "creates `.gitignore` containing only the block" branch (behavior 6).
- **Conflicts with:** Sibling installer treats absent-file as empty content and appends via shared `prefix`/`tail` logic (`lib/session-capture-installer.mjs:124-145`).
- **Recommendation:** Either fold absent-file into the same empty-content append branch, or document the intentional first-write postcondition.

### CON-4 (warning) — Cross-cutting ownership handoff

- **Category:** contract
- **This spec:** Includes `*.partial` and `*.partial.lock`.
- **Conflicts with:** `cross-cutting/incremental-artifact-writes.spec.md:96, 149, 211, 236` already requires these patterns and references a CI gate as the enforcement vector.
- **Recommendation:** State explicitly that this spec satisfies the cross-cutting requirement, clarify the glob form (`*.partial` vs `**/*.partial`), and let the dogfood parity test be the "CI gate" the cross-cutting spec references.

### CON-5 (suggestion) — CLI verb shape vs sibling

- **Category:** pattern
- **This spec:** `adev init ensure-gitignore [--remove]` (two-level).
- **Conflicts with:** `adev init prompt session-capture` (three-level `init <category> <subject>`).
- **Recommendation:** Both forms are present in adev. Document the rationale for the two-level form (ensure-X is a self-contained installer verb, not a prompt-style configurator) or align to three-level.

### CON-6 (suggestion) — Return-value enum vocabulary

- **Category:** terminology
- **This spec:** Result strings `"repaired"`, `"deduped"`, `"noop"`.
- **Conflicts with:** Sibling enum is `"added"`, `"updated"`, `"noop"`, `"removed"` (`lib/session-capture-installer.mjs:119, 137, 145, 165`).
- **Recommendation:** Either document the extended enum in the Module Impact section so downstream callers can switch on it confidently, or fold `"repaired"` and `"deduped"` into `"updated"` with a stderr warning.

---

## Summary

**Total findings:** 17 (0 blockers, 8 warnings, 9 suggestions)
**Verdict:** PASS_WITH_NOTES — ready to proceed to `/adev:plan`. The eight warnings cluster into three load-bearing themes that the plan should address up-front:

1. **Ownership clarity** (SA-1, SA-5, CON-4): explicitly carve out or absorb the cross-cutting and sibling-charter paths, with paired amendments.
2. **Manifest-knob contract** (SA-2, CON-2): pin the default, document the namespace choice, and decide how the explicit verb interacts with the knob.
3. **Safety semantics** (SEC-1, SEC-2, SEC-6, CON-1): path-containment algorithm, atomic temp-then-rename, scoped newline collapse, and a naming-parity decision.

**Action required:** none blocking. Recommend tracking the eight warnings as up-front tasks in `/adev:plan` before the implementation tasks land.

---

**Governance note:** No `.context-index/governance/risk-policies.yaml` was loaded; spec carries `risk_level: low`. No transition `approver_role` from `gates.yaml` applied.
