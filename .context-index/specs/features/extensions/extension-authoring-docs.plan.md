<!-- DO NOT EDIT statuses inline — see lifecycle log extension-authoring-docs.jsonl -->
# Implementation Plan: Extension Authoring Documentation Bundle

> **Methodology:** adev
> **Charter:** .context-index/specs/features/extensions/charter.md (rev 4)
> **Spec:** .context-index/specs/features/extensions/extension-authoring-docs.spec.md (rev 2)
> **Review:** PASS_WITH_NOTES (2026-05-16, rev 2)
> **Platform:** Node.js (ESM, .mjs), node:test, npm — zero new external dependencies; bash for the reference extension binary

**Goal:** Ship documentation + a manifest template + a reference extension that demonstrate the full `provides.*` surface of `adev-extension.yaml`, with `provides.governance` wiring a `kind: quality-gate` check that integrates with `adev report --type validator`. Closes the post-cli-driver-surface documentation gap (issue-485).

**Architecture:** Three deliverables in a fixed dependency order. The reference extension at `extensions/example-validation-check/` is the executable artifact — its manifest demonstrates the canonical `provides.governance: [{target, entries[]}]` shape and its `bin/check.sh` shows the minimum-surface quality-gate binary contract. The manifest template at `templates/adev-extension.example.yaml` cross-references the reference extension for context. The docs guide at `docs/extensions.md` cross-references both. The reference extension is exercised by an install test (positive path + negative fixture) and a validate-flow integration test, which together prevent docs ↔ implementation drift.

---

## File Structure

**Create:**
- `extensions/example-validation-check/adev-extension.yaml` — Manifest (≤25 lines), canonical `provides.governance` shape
- `extensions/example-validation-check/bin/check.sh` — Bash no-op check binary (≤15 lines incl. shebang); `set -euo pipefail`; forbids eval/source/cmd-sub by spec
- `extensions/example-validation-check/README.md` — Install + use walkthrough (≤60 lines)
- `templates/adev-extension.example.yaml` — Commented manifest template exercising all 5 `provides.*` slots
- `docs/extensions.md` — Extension author guide (200-300 lines)
- `tests/lib/extensions/example-validation-check-install.test.mjs` — Install positive path + collision-report assertion + string-form `command:` negative fixture + static grep + sentinel-env runtime test
- `tests/integration/extension-validate-flow.test.mjs` — End-to-end: install → `/adev:validate` dry-run → assert registry walk + `validator_report` event
- `tests/docs/extensions-links.test.mjs` — Doc-link test: every code symbol cited in `docs/extensions.md` resolves to an existing export/file

**Modify:**
- `docs/README.md` — Add "Extensions" link in the Reference section (1-line addition)

**Reference (read, do not modify):**
- `.context-index/specs/features/extensions/extension-core.spec.md` — Manifest shape, install semantics
- `.context-index/specs/features/extensions/content-installation.spec.md` Behavior 5/8 — Governance merge + `PATH_TRAVERSAL`
- `.context-index/specs/features/extensions/cli-and-registration.spec.md` — `extension install`/`extension list` CLI verbs
- `.context-index/specs/features/validation/configurable-checks.spec.md` Behaviors 6/6a/6b/13 — Quality-gate hardening
- `.context-index/specs/features/cli-driver-surface/write-time-diagnostic-hook.spec.md` — Write-time event tagging
- `.context-index/adrs/0003-configurable-review-registry.md` — Merge-by-id semantics
- `lib/extensions/install.mjs:85-110` — Canonical `provides.governance: [{target, entries[]}]` consumer
- `lib/cli/report.mjs:30-37` — `adev report --type validator` validator-id binding
- `extensions/data-engineering/adev-extension.yaml` — Structural template for the example
- `extensions/process-automation/adev-extension.yaml` — Structural template for the example

---

## Context Packets

### Task 1 Context (Charter verification — trivial)
- Spec: `extension-authoring-docs.spec.md` Preconditions, AC line 111
- Charter: `extensions/charter.md` rev 4 Capability Map row "Extension Authoring Documentation Bundle"

### Task 2 Context (Reference extension manifest)
- Spec: `extension-authoring-docs.spec.md` Behavior 1, Behavior 2, Postconditions
- Source files (signatures): `lib/extensions/install.mjs:85-110` (canonical governance shape consumer)
- Examples: `extensions/data-engineering/adev-extension.yaml`, `extensions/process-automation/adev-extension.yaml`
- Spec: `validation/configurable-checks.spec.md` Behaviors 6/13 (argv form, explicit `profile:`)

### Task 3 Context (`bin/check.sh` no-op binary + hardening)
- Spec: `extension-authoring-docs.spec.md` Behavior 4, Postconditions (lines 60-61), AC line 103
- Review note: **SEC2-8** — MUST begin with `#!/usr/bin/env bash`, include `set -euo pipefail`, forbid `eval`/`source`/backticks/`$(...)` cmd-substitution
- Review note: **SEC2-10** — install test enforces via static grep AND runtime sentinel-env

### Task 4 Context (Manifest template)
- Spec: `extension-authoring-docs.spec.md` Behavior 1
- Source: `lib/extensions/install.mjs:85-110` (all 5 `provides.*` slots)
- Reference: rendered reference extension manifest from Task 2

### Task 5 Context (`docs/extensions.md` guide)
- Spec: `extension-authoring-docs.spec.md` Behavior 5 (a-d), Behavior 6, Behavior 7
- Review note: **SEC2-9** — pitfalls section must include "Untrusted sources" subsection warning that `npx adev-cli extension install <unknown-npm-pkg>` runs `bin/*` with full user privilege
- Review note: **SEC2-2** — pitfalls section must state in threat-model voice: "`profile:` permissions scope only the adapter tool surface, NOT the subprocess"
- ADR: `0003-configurable-review-registry.md` (decision + rationale only) — merge semantics
- Spec path: `cli-driver-surface/write-time-diagnostic-hook.spec.md` — write-time event tagging

### Task 6 Context (Reference extension README)
- Spec: `extension-authoring-docs.spec.md` Postconditions (≤60 lines), Behavior 4 (constraint documentation)
- Style reference: existing `extensions/data-engineering/README.md`

### Task 7 Context (docs/README.md link)
- Spec: `extension-authoring-docs.spec.md` Behavior 7, Postconditions

### Task 8 Context (Install test)
- Spec: `extension-authoring-docs.spec.md` AC lines 102-111
- Test convention: `tests/lib/extensions/{install,content-install,manifest-schema,register,resolve-source,version-check}.test.mjs`
- Source: `lib/extensions/install.mjs` install flow
- Review notes: **SA2-2** (collision-report assertion), **SEC2-8** (static grep for forbidden bash forms), **SEC2-10** (sentinel-env runtime), **SEC2-11** (resolution path)

### Task 9 Context (Validate-flow integration test)
- Spec: `extension-authoring-docs.spec.md` Behavior 3, AC line 108
- Test reference: `tests/integration/cli-lifecycle.test.mjs` (full-lifecycle pattern, ~300 lines)
- Source: `lib/cli/report.mjs:30-37` (validator-id binding)

### Task 10 Context (Doc-link test)
- Spec: `extension-authoring-docs.spec.md` AC line 112
- Pattern: read `docs/extensions.md`, extract every `lib/...`, `templates/...`, `extensions/...` reference, assert file/symbol exists

---

## Parallelization

- **Group A (sequential, foundation):** Task 1 → Task 2 → Task 3 (charter verify → manifest → binary; later tasks consume earlier outputs)
- **Group B (depends on A):** Task 4 (template — consumes Task 2 manifest shape) → Task 5 (docs guide — references Tasks 2, 3, 4) → Task 6 (reference extension README — depends on Tasks 2, 3)
- **Group C (depends on Group B):** Task 7 (docs/README link to Task 5's guide)
- **Group D (depends on Groups A-B):** Task 8 (install test — exercises Tasks 2, 3); Task 9 (validate-flow test — exercises full extension)
- **Group E (depends on Task 5):** Task 10 (doc-link test — scans Task 5's output)

Tasks 8/9/10 can run concurrently after Group B closes. Within each group, tasks run sequentially.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Verify charter capability row | trivial | unit | — | 0 create, 0 modify (verify-only) |
| 2 | Reference extension manifest | small | unit | Task 1 | 1 create |
| 3 | bin/check.sh no-op binary | small | unit | Task 2 | 1 create |
| 4 | Manifest template (all provides.* slots) | small | unit | Task 2 | 1 create |
| 5 | docs/extensions.md author guide | medium | unit | Tasks 2, 3, 4 | 1 create |
| 6 | Reference extension README | trivial | unit | Tasks 2, 3 | 1 create |
| 7 | docs/README.md link | trivial | unit | Task 5 | 0 create, 1 modify |
| 8 | Install test (positive + negative + hardening) | medium | integration | Tasks 2, 3 | 1 create |
| 9 | Validate-flow integration test | medium | integration | Tasks 2, 3, 8 | 1 create |
| 10 | Doc-link sentinel test | small | unit | Task 5 | 1 create |

---

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 8 | fallback |
| integration | 2 | detected (high) — install + e2e exercise the extension install path and the validate registry walk |

No low-confidence assignments. Both integration tests touch `lib/extensions/install.mjs` and the validate flow, which are integration concerns (filesystem writes + multi-component composition); strategy detection is straightforward.

---

## Test Infrastructure Requirements

No external systems. Both integration tests run against temp dirs with no network or credentials. `npm test` runs everything; no `test:integration` separation required for this plan.

---

## Tasks

### Task 1: Verify charter capability row [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle
**Strategy:** unit
**Files:**
- Verify-only: `.context-index/specs/features/extensions/charter.md`

**Tests:** `tests/skills/no-stale-format-refs.test.mjs` (already exists; verifies charter consistency)

**Context to load:**
- Charter `extensions/charter.md` Capability Map (rev 4)

- [ ] **Verify** the charter has the capability row with status `review-passed` (it was set in /adev:review-specs Step 7 already).
- [ ] **Verify** no edit needed. This task is a guard against future re-planning that might re-add the row.
- [ ] **No commit** — verification only.

---

### Task 2: Reference extension manifest [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle
**Strategy:** unit
**Files:**
- Create: `extensions/example-validation-check/adev-extension.yaml`
- Test: `tests/lib/extensions/example-validation-check-install.test.mjs` (created in Task 8; this task adds the fixture this test consumes)

**Tests:** `tests/lib/extensions/example-validation-check-install.test.mjs::manifest-parses` (Task 8)

**Context to load:**
- `lib/extensions/install.mjs:85-110` — canonical governance shape
- `extensions/data-engineering/adev-extension.yaml` — structural pattern
- Spec Preconditions + Behavior 1 + Behavior 2

- [ ] **Write failing test** (in Task 8's test file, as part of the install test):

```js
test("example extension manifest parses with canonical provides.governance shape", () => {
  const m = parseYaml(readFileSync("extensions/example-validation-check/adev-extension.yaml", "utf8"));
  assert.equal(m.name, "example-validation-check");
  assert.ok(Array.isArray(m.provides.governance));
  assert.equal(m.provides.governance[0].target, "validate.yaml");
  assert.ok(Array.isArray(m.provides.governance[0].entries));
  assert.equal(m.provides.governance[0].entries[0].kind, "quality-gate");
  assert.ok(Array.isArray(m.provides.governance[0].entries[0].command)); // argv form
  assert.equal(m.provides.governance[0].entries[0].profile, "read-only"); // explicit profile
});
```

- [ ] **Verify test fails** — manifest file does not exist.

- [ ] **Implement** the manifest (≤25 lines):

```yaml
name: example-validation-check
version: 0.1.0
description: Reference extension showing the canonical provides.governance wiring
author: adev-org
requires:
  adev: ">=0.27.0"
provides:
  governance:
    - target: validate.yaml
      entries:
        - id: example-validation-check.passing
          kind: quality-gate
          profile: read-only
          command: [bash, extensions/example-validation-check/bin/check.sh]
          severity: warning
          after: [validate.check-1-quality-gates]
```

- [ ] **Verify test passes**.

- [ ] **Commit** (after Task 3 lands too; bundled commit per Group A boundary):

Branch: `feat/extensions/example-validation-check-docs-bundle`

---

### Task 3: bin/check.sh no-op binary with hardening [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle
**Strategy:** unit
**Files:**
- Create: `extensions/example-validation-check/bin/check.sh`
- Test: `tests/lib/extensions/example-validation-check-install.test.mjs::bin-check-hardening` (Task 8)

**Tests:** `tests/lib/extensions/example-validation-check-install.test.mjs::bin-check-hardening`

**Context to load:**
- Spec Behavior 4, Postconditions (lines 60-61)
- **Review SEC2-8:** include `set -euo pipefail`; forbid `eval`, `source`, backticks, `$(...)`, `$1`/`$@`/`${VAR}`, `printenv`, `env`
- **Review SEC2-10:** install test enforces via static grep AND runtime sentinel-env

- [ ] **Write failing tests** (in Task 8's file):

```js
test("bin/check.sh has bash shebang and is executable", () => {
  const stat = statSync("extensions/example-validation-check/bin/check.sh");
  assert.ok(stat.mode & 0o111, "must be executable");
  const body = readFileSync("extensions/example-validation-check/bin/check.sh", "utf8");
  assert.match(body, /^#!\/usr\/bin\/env bash/);
});

test("bin/check.sh sets safe shell options and forbids dangerous forms", () => {
  const body = readFileSync("extensions/example-validation-check/bin/check.sh", "utf8");
  assert.match(body, /set -euo pipefail/);
  // SEC2-8: forbid dangerous bash forms
  for (const pattern of [/\beval\b/, /\bsource\b/, /`[^`]+`/, /\$\(/, /\$\{?[A-Z]/, /\bprintenv\b/, /\benv\b/]) {
    assert.doesNotMatch(body, pattern, `bin/check.sh must not contain ${pattern}`);
  }
});

test("bin/check.sh exits 0 with single-line stdout and zero stderr", () => {
  const r = spawnSync("bash", ["extensions/example-validation-check/bin/check.sh"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
  assert.equal(r.stdout.trim().split("\n").length, 1);
  assert.match(r.stdout, /^PASS: example-validation-check$/);
});

test("bin/check.sh ignores SECRET sentinel env var (SEC2-10)", () => {
  const r = spawnSync("bash", ["extensions/example-validation-check/bin/check.sh"], {
    encoding: "utf8",
    env: { ...process.env, SECRET: "hunter2" },
  });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /hunter2/);
  assert.doesNotMatch(r.stderr, /hunter2/);
});
```

- [ ] **Verify tests fail** — binary does not exist.

- [ ] **Implement** the binary (≤15 lines):

```bash
#!/usr/bin/env bash
# example-validation-check — reference quality-gate extension binary.
# Reads no env, no argv, no stdin. Exits 0 with one stdout line. Demonstrates
# the minimum-surface contract; real extensions add their own logic on top.
set -euo pipefail
echo "PASS: example-validation-check"
```

Then `chmod +x extensions/example-validation-check/bin/check.sh`.

- [ ] **Verify tests pass**.

- [ ] **Commit** as part of Group A bundle (after Tasks 1, 2).

---

### Task 4: Manifest template (all provides.* slots) [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle
**Strategy:** unit
**Files:**
- Create: `templates/adev-extension.example.yaml`
- Test: `tests/lib/extensions/manifest-schema.test.mjs` extension (if it parses templates) OR new doc-link test in Task 10

**Tests:** Static parse validation via `tests/lib/extensions/example-validation-check-install.test.mjs::template-parses` (Task 8)

**Context to load:**
- `lib/extensions/install.mjs:85-110` — all 5 `provides.*` slot consumers
- Reference extension manifest from Task 2

- [ ] **Write failing test** (in Task 8's file):

```js
test("templates/adev-extension.example.yaml parses and exercises all 5 provides slots", () => {
  const m = parseYaml(readFileSync("templates/adev-extension.example.yaml", "utf8"));
  assert.ok(m.provides.skills, "provides.skills slot");
  assert.ok(m.provides.hooks, "provides.hooks slot");
  assert.ok(m.provides.governance, "provides.governance slot");
  assert.ok(m.provides["domain-profile"], "provides.domain-profile slot");
  assert.ok(m.provides.samples, "provides.samples slot");
});
```

- [ ] **Verify test fails**.

- [ ] **Implement** the template with commented examples per slot. Reference Task 2's manifest for the governance slot's canonical shape; pull the other slots from `extension-core.spec.md` Behaviors 1, 2, 5, 7, 8.

- [ ] **Verify test passes**.

- [ ] **Commit:** `feat(extensions): add adev-extension.example.yaml manifest template`

---

### Task 5: docs/extensions.md author guide [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle
**Strategy:** unit
**Files:**
- Create: `docs/extensions.md` (200-300 lines)
- Test: `tests/docs/extensions-links.test.mjs` (Task 10)

**Tests:** `tests/docs/extensions-links.test.mjs`

**Context to load:**
- Spec Behavior 5 (a-d), Behavior 6, Behavior 7
- **Review SEC2-2:** threat-model paragraph stating `profile:` permissions DO NOT sandbox the subprocess
- **Review SEC2-9:** "Untrusted sources" pitfalls subsection — `npx adev-cli extension install <unknown-pkg>` runs `bin/*` with full user privilege at validate time
- ADR-0003 decision + rationale (merge semantics)
- Cross-spec: `cli-driver-surface/write-time-diagnostic-hook.spec.md`

- [ ] **Write failing test** (Task 10 has this; this task creates the doc that satisfies it).

- [ ] **Implement** the docs guide. Required sections (per spec Behavior 5):
  1. **Schema** — every `provides.*` slot documented with canonical shapes; `provides.governance` shown as array of `{target, entries[]}`.
  2. **Install-time merge** — narrative + link to ADR-0003.
  3. **Validate-time event flow** — extension check exits 0 → validate skill records via `adev report --type validator` → write-time diagnostic hook stamps the event.
  4. **Pitfalls section** — at minimum: (a) forgetting `profile:` (configurable-checks Behavior 13); (b) string-form `command:` (Behavior 6a); (c) omitting `requires.adev` semver; (d) missing `id:` on a governance entry; (e) **profile-permissions threat model** (SEC2-2); (f) **Untrusted sources** subsection (SEC2-9).
  5. **Worked example** — point at `extensions/example-validation-check/` from Task 2.

- [ ] **Verify** by manual read + Task 10's doc-link test.

- [ ] **Commit:** `docs(extensions): add author guide`

---

### Task 6: Reference extension README [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle
**Strategy:** unit
**Files:**
- Create: `extensions/example-validation-check/README.md` (≤60 lines)

**Tests:** Length budget asserted in Task 8.

**Context to load:**
- Existing READMEs: `extensions/data-engineering/README.md` for style
- Spec Postconditions (line-count budget), Behavior 4 (constraint documentation)

- [ ] **Implement** README. Sections: What it does (1 paragraph), Install (`npx adev-cli extension install`), Verify (`adev diagnose --tier 1`), Constraints (no env/argv/stdin — deliberate threat-model choice), Modify-for-your-project (1 paragraph pointing at `bin/check.sh`).

- [ ] **Commit** as part of Group B bundle.

---

### Task 7: docs/README.md link [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle
**Strategy:** unit
**Files:**
- Modify: `docs/README.md` (1-line addition in Reference section)

**Tests:** `tests/docs/extensions-links.test.mjs` indirectly (Task 10 asserts the link exists).

**Context to load:**
- Existing `docs/README.md` Reference section structure

- [ ] **Implement** — add `- [Extensions](./extensions.md) — authoring extension packages` to the Reference section.

- [ ] **Commit:** `docs(extensions): link author guide from docs/README.md`

---

### Task 8: Install test (positive + collision + hardening) [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle
**Strategy:** integration
**Files:**
- Create: `tests/lib/extensions/example-validation-check-install.test.mjs`

**Tests:** This file IS the test.

**Context to load:**
- `lib/extensions/install.mjs` install flow
- `tests/lib/extensions/install.test.mjs` for fixture-setup patterns
- Spec AC lines 102-111
- **Review SA2-2:** collision-report assertion (extension entry id collides with project entry → report lists ALL collisions)
- **Review SEC2-8 + SEC2-10:** static grep for forbidden bash forms + sentinel-env runtime
- **Review SEC2-11:** assert installer rewrites `command` argv to absolute path under installed location, not repo-relative

- [ ] **Write failing test** — author the file with test cases:
  - `manifest-parses` (Task 2 fixture validates)
  - `template-parses` (Task 4 fixture validates)
  - `bin-check-hardening` (4 sub-tests from Task 3)
  - `install-positive-path` — `npx adev-cli extension install` succeeds in a temp project; `installed_extensions` stamped; `validate.yaml` has the entry under `target: validate.yaml`
  - `install-string-form-command-rejected` — negative fixture with `command: "bash bin/check.sh"` (string) fails `QUALITY_GATE_COMMAND_SHELL` per configurable-checks Behavior 6a
  - `install-collision-report` — install when project's `validate.yaml` already has check id `example-validation-check.passing`; install succeeds, report lists the collision in a dedicated section, project's fields preserved
  - `install-absolute-command-path` — after install, the merged `validate.yaml` entry's `command` argv resolves to an absolute path under the installed `extensions/` location (SEC2-11)
  - `manifest-line-budget` — `extensions/example-validation-check/adev-extension.yaml` is ≤25 lines
  - `bin-line-budget` — `bin/check.sh` is ≤15 lines
  - `readme-line-budget` — README is ≤60 lines

- [ ] **Verify test fails** — fixtures don't exist yet (Tasks 2, 3, 4, 6 satisfy them).

- [ ] **After Tasks 2, 3, 4, 6 land:** verify all install tests pass.

- [ ] **Commit:** `test(extensions): example-validation-check install test (positive + collision + hardening)`

---

### Task 9: Validate-flow integration test [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle
**Strategy:** integration
**Files:**
- Create: `tests/integration/extension-validate-flow.test.mjs`

**Tests:** This file IS the test.

**Context to load:**
- `tests/integration/cli-lifecycle.test.mjs` for the full-lifecycle setup pattern
- Spec Behavior 3, AC line 108
- `lib/cli/report.mjs:30-37` for validator-id binding

- [ ] **Write failing test:**

```js
test("install + /adev:validate dry-run: example check appears in registry walk and emits validator_report event", async () => {
  const project = setupProject(); // temp dir with manifest + a stub spec
  // Step 1: install the example extension
  const r1 = adev(project, ["extension", "install", path.join(REPO_ROOT, "extensions/example-validation-check")]);
  assert.equal(r1.exitCode, 0);
  // Step 2: confirm validate.yaml gained the entry
  const v = parseYaml(readFileSync(join(project, ".context-index/governance/validate.yaml"), "utf8"));
  assert.ok(v.checks.some(c => c.id === "example-validation-check.passing"));
  // Step 3: emit a validator_report event citing the new check
  const stubSpec = ".context-index/specs/features/m/stub.spec.md";
  const r2 = adev(project, [
    "report", "--type", "validator", "--spec", stubSpec,
    "--step", "validate", "--validator", "example-validation-check.passing", "--verdict", "PASS"
  ]);
  assert.equal(r2.exitCode, 0);
  // Step 4: confirm the event landed
  const events = readEvents(project, stubSpec);
  const vr = events.filter(e => e.event === "validator_report");
  assert.equal(vr.length, 1);
  assert.equal(vr[0].validator, "example-validation-check.passing");
});
```

- [ ] **Verify** test fails before Tasks 2/3 exist; passes after.

- [ ] **Commit:** `test(extensions): e2e validate-flow integration test`

---

### Task 10: Doc-link sentinel test [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle
**Strategy:** unit
**Files:**
- Create: `tests/docs/extensions-links.test.mjs`

**Tests:** This file IS the test.

**Context to load:**
- `tests/docs/foundation-onboarding.test.mjs` for doc-link test pattern
- Spec AC line 112

- [ ] **Write failing test:** walk `docs/extensions.md`, regex-extract every `lib/...`, `templates/...`, `extensions/...`, `.context-index/...` reference, assert each resolves to an existing file. For function symbols cited inline (e.g., `adev report --type validator`), assert the verb is registered in `cli/index.mjs`.

- [ ] **Verify** test fails until Task 5 lands.

- [ ] **Commit:** `test(docs): doc-link sentinel for docs/extensions.md`

---

## Heuristics

> Snapshot from plan generation for review convenience. Live store: see `lib/heuristics.mjs`.

No module-scoped heuristics retrieved for `extensions` module — the heuristic store is empty for this module. Proceed without injection.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in `.validate.md`, not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from `extension-authoring-docs.spec.md` satisfied
- No constitutional violations introduced
- Regression hook (`hooks/pre-commit-no-inline-node.sh`) accepts the commit set
