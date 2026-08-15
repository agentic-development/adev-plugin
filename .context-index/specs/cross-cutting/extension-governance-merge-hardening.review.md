---
spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
charter: (cross-cutting — no parent charter)
date: 2026-08-15
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 4
file-sha: 1a7ddf3e47111aa1ff08c3982f057c7a8cc1b758b889e18d1298e8a0b16208cc
findings-total: 34
blockers: 18
warnings: 12
suggestions: 4
---

# Architecture Review: extension-governance-merge-hardening

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md` (revision 4)
> **Charter:** none (cross-cutting spec)
> **Rigor tier:** full (explicit `--tier full`)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Domain resolved: `software` (source level: default). Registry warnings: none.

## What rev 4 closed

Recorded so the next revision does not re-litigate settled ground. All three reviewers
independently confirm these rev-3 blockers are genuinely closed:

- **`validate.yaml` allowlist row.** `command` and `fail_fast` added; `kind` constrained to the four
  values `lib/governance/validate-config.mjs:19-24` accepts. The row now matches what
  `validateCheck` reads.
- **Writable-registry count.** "Five" is now consistent at every assertion site (spec L112, L138,
  L317, L335, L391, L399) and matches the seven files on disk.
- **Array-element and nested-value checking.** Behavior 7's "applies to every emitted value, not
  only top-level scalars" plus AC L406 close rev-3 SEC-2.
- **Diagnostics-guard dependency.** Invariant 6's declared dependency on
  `lib/diagnostics/index.mjs` is well-founded, and AC L407 pins it. The guard itself
  (`resolveRunnerContained`, `:88-147`) was verified sound.
- **Citation accuracy, mostly.** `content-install.mjs:139-147`, `:187-189`, `:206-210`, `:235`,
  `:242-256`, `:307-318`, `:383-384`; `install.mjs:91`; `merge-gates.mjs:29-33`, `:34-38`, `:42-46`;
  `doctor.mjs:965`; `validate-config.mjs:110`; `yaml.mjs:6-7`, `:179`, `:244-252` all verified
  accurate. Three minor drifts remain (CON-14).

The operator's design decision — extensions *may* contribute executables — is **not** contested by
any reviewer. The security reviewer states explicitly that permitting bounded executable
contribution is defensible and that the `validate.yaml` quality-gate sink is genuinely argv-only
with `shell: false`. What blocks is that each of the three bounds rests on a code fact that does not
hold, and that the rev-3 text stating the opposite design was left in place.

## Structural Architect (structural-architect)

**Verdict:** BLOCK — 6 blockers, 3 warnings, 1 suggestion

### SA-1 — blocker — internal contradiction
- **blocker_id:** `structural-architect:internal-contradiction:6cf92e42`
- **section_anchor:** `changes-catalog`
- **Location:** Improvements L115-116; allowlist table L184; rationale L215-221; Module Impact L370

Rev 4 added `command` to the `gates.yaml` allowlist row and a whole section permitting executable
contributions, but left the rev-3 prose asserting the opposite, verbatim and normative: "An
extension cannot contribute an executable field at all" (L115-116); "**`command` is deliberately
absent from the `gates.yaml` row**" (L215-219); "`gates.yaml` becomes non-writable by extensions
entirely" (L370). The last also contradicts the writable-set table at L134 and AC L394. A planner
cannot derive one implementation from this document.

**Recommendation:** Delete or rewrite L115-116, L215-221 and the unified-gates row so the document
states one design.

### SA-2 — blocker — false premise
- **blocker_id:** `structural-architect:false-premise:e9ab1dcb`
- **section_anchor:** `executable-contributions`
- **Location:** bound 2, L163-165; MODIFIED L237-240

Bound 2 claims merge-gates' argv enforcement "becomes uniform" and that "No contributed command is
ever passed to `sh -c`". False for `gates.yaml`. `lib/gates/doctor.mjs::loadGates` (`:1109-1133`)
reads `governance/gates.yaml` directly — never through `lib/domains/merge-gates.mjs` — then
`normaliseCommand` (`:254-268`) joins the argv array back into a single shell string and `:965` runs
`spawnSync("sh", ["-c", command], { cwd: projectRoot })`. `doctor.mjs` is not in MODIFIED, so an
extension-contributed argv gate does reach a shell, and bound 2 supplies none of the protection the
three-bound conjunction (L173-176) is built on.

**Recommendation:** Either add `lib/gates/doctor.mjs` to MODIFIED with the contract that gate
execution stops going through `sh -c` for extension-sourced entries, or restate bound 2 accurately
and re-derive whether the conjunction still holds.

### SA-3 — blocker — unsatisfiable precondition
- **blocker_id:** `structural-architect:unsatisfiable-precondition:2fad9f9c`
- **section_anchor:** `executable-contributions`
- **Location:** bound 1, L156-162; AC L400-401

Bound 1 pins argv paths to `resolvedPath`. For npm and git sources `resolvedPath` is inside a
`mkdtempSync` temp dir (`lib/extensions/resolve-source.mjs:127,171`) that `installExtension`'s own
`finally` block deletes (`lib/extensions/install.mjs:179-182`). Nothing in `content-install.mjs`
copies an extension's `bin/` anywhere. A command satisfying bound 1 points at a directory that no
longer exists when the gate runs. Conversely the reference extension's repo-relative
`[bash, extensions/example-validation-check/bin/check.sh]` is resolved at `cwd` = consumer repo root
(`lib/governance/quality-gate.mjs:49`, `doctor.mjs:966`) and does not resolve inside `resolvedPath`,
so L162's "satisfies this unchanged" is false and AC L400 and L401 are mutually exclusive.

**Recommendation:** Name the durable containment root explicitly and specify how the extension's
executable gets there, then re-check the reference extension against it.

### SA-4 — blocker — mechanism does not exist
- **blocker_id:** `structural-architect:mechanism-does-not-exist:ddc9b38c`
- **section_anchor:** `executable-contributions`
- **Location:** bound 3, L166-172; Behavior 10 L343; AC L403

"The prompt has a home already: `lib/cli/domain-extension-picker.mjs` prompts during extension
install today" is a different flow. `adev extension install <source>` runs
`cli/index.mjs::cmdExtension` (`:1207-1250`), which is entirely non-interactive: it calls
`resolveExtensionSource` then `installExtension(..., { pluginRoot, sourceUri, _tmpDir })` with no
prompt and no reference to the picker. The picker is an init-time flow for bundled catalog
*domain-profile* entries (`:339-350`). Bound 3 and Behavior 10 specify behavior against a mechanism
that does not exist — the exact defect class this spec's own Out of Scope invokes to defer uninstall
(L425-429). `cli/index.mjs` does not appear in MODIFIED at all.

**Recommendation:** Add `cli/index.mjs` and whatever owns the prompt to MODIFIED, specify the
interactive/non-interactive detection contract, and drop the "has a home already" claim.

### SA-5 — blocker — missing signature change
- **blocker_id:** `structural-architect:missing-signature-change:597c1e81`
- **section_anchor:** `changes-catalog-modified`
- **Location:** MODIFIED L237-240; Behaviors 9-10 L342-343

Behaviors 9 and 10 require the merge to know the extension's installed directory and the per-install
consent grant. `mergeGovernanceEntries(projectRoot, targetFile, entries)`
(`lib/extensions/content-install.mjs:163`) receives neither, and `install.mjs:89-98` passes exactly
those three arguments. MODIFIED says only "the five functions above" — no signature change, no
options object, no consent threading is stated anywhere.

**Recommendation:** State the new signature (e.g. an `options` carrying `extensionRoot`,
`extensionName`, `execConsent`) and the corresponding call-site change in `install.mjs`.

### SA-6 — blocker — allowlist schema mismatch
- **blocker_id:** `structural-architect:allowlist-schema-mismatch:1837885a`
- **section_anchor:** `changes-catalog`
- **Location:** review.yaml row L183; rationale L198-205; splice L274-275; AC L405, L411

Rev 4's fix for the rev-3 `review.yaml` blocker relocates it. (a) "`dispatch` and `package` are
object-valued … so both are rejected today" is wrong for `dispatch`: `validateReviewer` defaults it
to the string `"always"` and validates strings against `VALID_DISPATCH_STRING`
(`lib/governance/review-config.mjs:365-372`); a string `dispatch` passes `isValidGovernanceValue`
today. (b) The object form is two levels deep — `dispatch.triggered.{patterns,keywords,min_score}`
(`shouldDispatch:167-171`) — which the one-level cap and AC L405 explicitly forbid, so
`dispatch: triggered` is unexpressible for an extension. (c) L204-205 omits
`patterns`/`keywords`/`min_score` as fields "no consumer reads at the entry position", yet
`governance/review.yaml`'s own documented schema header lists all three there. AC L411 remains
unsatisfiable for `review.yaml` — the same criterion that failed at rev 3.

**Recommendation:** Correct the `dispatch` shape claim, decide explicitly whether `dispatch:
triggered` is extension-contributable, and note that `package.args` is an unconstrained object
(`review-config.mjs:419`) the one-level cap silently narrows.

### SA-7 — warning
**Location:** gates.yaml allowlist rationale L193-196. "Fields outside that set are silently dropped
by the merge today" is false as a general claim. `mergeGates` projects five fields, but `doctor.mjs`
reads `gates.yaml` raw and consumes `gate?.kind` at `:805`, and the project's own `gates.yaml` uses
`name`, `kind`, `scope`, `required`, `triggers` — none allowed by the row. `gates.yaml` has two
consumers with different contracts; the row is derived from one. This also makes AC L411's "that
registry's loader" ambiguous for gates.yaml.

### SA-8 — warning
**Location:** Invariant 6 L322-326; preamble L152-154. "All three bounds apply to every executable
contribution, in whichever registry it appears" cannot hold for `diagnostics.yaml`'s `runner`.
`resolveRunnerContained` (`lib/diagnostics/index.mjs:88-147`) accepts only `plugin:`/`project:`
prefixed specs; a path inside the extension's own directory is rejected by construction, so bound 1
is unsatisfiable there. Scope the three bounds to `command`-bearing contributions and state the
`runner` bound as substitution, not addition.

### SA-9 — warning
**Location:** Behaviors 1, 5, 6, 7, 10, 12 ("writes nothing"); `install.mjs:75-98`. The guarantee is
per-target, not per-install: domain-profile writes land first, then a per-target loop with no
pre-validation and no rollback. A manifest with a valid first target and a refused second leaves the
first registry mutated. Rev 4 added new refusal conditions without adding validate-all-before-write
ordering.

### SA-10 — suggestion
**Location:** Error codes L230-231 vs Error Cases L350-362. The ADDED error-code list was not
updated for rev 4: `GOVERNANCE_COMMAND_NOT_ARGV`, `GOVERNANCE_COMMAND_ESCAPES_EXTENSION` and
`GOVERNANCE_EXEC_NOT_CONSENTED` appear only in Behaviors 9-10 and the Error Cases table.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK — 5 blockers, 4 warnings, 1 suggestion

### SEC-1 — blocker — input-validation
- **blocker_id:** `security-reviewer:input-validation:ae93c3cc`
- **section_anchor:** `executable-contributions`

**Rule 2's factual premise is false.** L164-165 claims "No contributed command is ever passed to
`sh -c`." `lib/gates/doctor.mjs:963` does exactly that on a value `loadGates` (`:1109-1133`) reads
straight out of `gates.yaml`, filtering only `g && typeof g === "object"`. It never goes through
`mergeGates`, so `merge-gates.mjs:34-38` — the enforcement the rule cites — is not in that path at
all. The project's own `gates.yaml:29` still carries `command: "npm test"`, a shell string, proving
the doctor path accepts what `mergeGates` rejects.

What actually keeps a contributed argv inert there is `normaliseCommand` (`doctor.mjs:254-268`) plus
`NEEDS_QUOTING` (`:219`), which single-quotes every metacharacter-bearing token with POSIX `'\''`
escaping. The reviewer verified the failure mode without it: `spawnSync("sh", ["-c", ["node",
"x$(id -u > /tmp/PWNED_ADEV)"]])` coerces the array to `node,x$(id -u > /tmp/PWNED_ADEV)` and the
substitution **executes**. So the safety of rule 2 rests entirely on a quoting function this spec
never names, under `--execute` (`doctor.mjs:739-749`).

**Recommendation:** Restate rule 2 as "argv-array only at the contribution boundary; the one shell
executor, `doctor.mjs:963`, is safe because `normaliseCommand`/`NEEDS_QUOTING` shell-quote every
token," and declare that quoting a dependency of Invariant 6 exactly as the spec already does for
`lib/diagnostics/index.mjs`, with a matching acceptance criterion pinning it (mirroring L407).

### SEC-2 — blocker — path-traversal
- **blocker_id:** `security-reviewer:path-traversal:3c03040e`
- **section_anchor:** `executable-contributions`

**Rule 1 is an install-time check with no run-time counterpart, against an unstated base.** L156-158
never says what a relative argv element resolves against. At run time nothing re-resolves anything:
`quality-gate.mjs:44-52` does `execFile(executable, args, { cwd: ctx.cwd })` and the doctor uses
`cwd: projectRoot`. A relative argv path therefore resolves against the **project root** when it
executes, not the extension directory it was validated against. An extension declaring
`[bash, bin/check.sh]` passes containment at install and runs `<projectRoot>/bin/check.sh` — a file
the extension does not control. Worse, for npm/git sources `resolvedPath` is a temp dir the `finally`
block deletes, and nothing copies extension executables into the project, so for every non-local
source a path satisfying rule 1 is **guaranteed not to exist at execution**. The spec also does not
define behavior when the mandated `realpathSync` throws ENOENT.

**Recommendation:** Pick one and specify it: (a) copy the extension's executable payload into a
project-owned installer-controlled directory (e.g. `.context-index/extensions/<name>/`) at install
time and rewrite argv paths to that absolute location, so install-time containment and run-time
resolution share a base; or (b) require argv paths to be absolute and rooted at that installed
directory. Either way state the base explicitly, state that `realpathSync` failure is a refusal, and
realpath the base as well as the candidate (macOS `/var`→`/private/var` defeats a raw `startsWith`).

### SEC-3 — blocker — input-validation
- **blocker_id:** `security-reviewer:input-validation:0b1ea485`
- **section_anchor:** `acceptance-criteria`

**The reference extension does not satisfy rule 1, so AC L400 is unachievable and L162 is false.**
`extensions/example-validation-check/adev-extension.yaml` declares
`command: [bash, extensions/example-validation-check/bin/check.sh]` — a project-root-relative path.
The actual file is `<resolvedPath>/bin/check.sh`. Resolved against `resolvedPath` per rule 1 you get
`<resolvedPath>/extensions/example-validation-check/bin/check.sh`: nominally "contained" by
`startsWith`, but nonexistent, so the mandated `realpathSync` throws. Resolved against the project
root it escapes `resolvedPath` outright. Under either reading the shipped extension is refused, or
installs and then cannot run in any project that is not the adev-plugin repo itself.

**Recommendation:** Fix the reference manifest in the same change and rewrite L162 to state that it
is being changed. Make L400 assertable end-to-end: install the reference extension into a temp
project *that is not this repo*, and assert the resulting check both loads via `loadValidateConfig`
and executes.

### SEC-4 — blocker — authorization
- **blocker_id:** `security-reviewer:authorization:071e2d28`
- **section_anchor:** `executable-contributions`

**Rule 3 has no mechanism — the rev-3 failure class repeated.** `grep` for `--allow-exec`,
`allowExec`, `exec_consented_at` across all `.mjs`/`.md`/`.yaml` returns **zero** hits outside this
spec. `cmdExtension` (`~:1207-1230`) parses only `process.argv[4]` as the source — no flag, no
prompt, no TTY check. `installExtension` (`install.mjs:37`) has no consent parameter and
`mergeGovernanceEntries` receives neither `resolvedPath` nor any consent flag, so **neither rule 1
nor rule 3 can be evaluated where the Target State table (L105) places them**. `dispatchInstall`
(`domain-extension-picker.mjs:283-289`) threads only `{pluginRoot, sourceUri}` and is not on the
`adev extension install <source>` path at all — the only path a third-party extension takes.

**Recommendation:** Specify the mechanism as changes to named functions: a `--allow-exec` flag parsed
in `cmdExtension`, `options.allowExec` + `options.interactive` threaded through `installExtension`
into `mergeGovernanceEntries` (whose signature must also take `resolvedPath`), a TTY-gated prompt
that fails closed when `!process.stdin.isTTY`, and `GOVERNANCE_EXEC_NOT_CONSENTED` when neither is
present. Add an AC that a non-interactive install without the flag exits non-zero and writes nothing.

### SEC-5 — blocker — authorization
- **blocker_id:** `security-reviewer:authorization:40279141`
- **section_anchor:** `improvements`

**The spec states its central boundary in both directions.** `gates.yaml` is extension-writable
*with* `command` at L136, L144-176, L184 and Behavior 9 (L342). It is simultaneously declared closed
at L116, L215, L220 and L370 — unremoved rev-3 text. An implementer cannot determine from this
document whether the highest-risk sink is open or closed, and a reviewer cannot verify an
implementation against it.

**Recommendation:** Delete L116 and L215-221 and rewrite L370 to match the rev-4 decision. L395's
criterion ("cannot introduce a `command` onto an **existing** entry") is correct and should stay — it
is collision-skip, not exclusion.

### SEC-6 — warning — input-validation
**Section:** `behaviors-7`. Two defects. (a) The "non-path literal" carve-out (L161) is undefined —
nothing says what "names a path" means, so `--config=../../../etc/shadow` and `bin/x` will be
classified differently by different implementers. (b) Behavior 7 rejects a *leading* `-`, which
forbids every CLI flag: `[npm, test, --, --silent]`, the argv form `validate-config.mjs:434` itself
documents, is refused. Meanwhile `;`, `$`, `(`, `)`, `\`, `<`, spaces and non-leading backtick are
not rejected at all — survivable only because of the quoting in SEC-1, and it leaves argv tokens that
appear verbatim in agent-visible output (`doctor.mjs` findings, `adev domain load-gates` JSON
consumed by `skills/validate/SKILL.md:99`) as a prompt-injection surface. Define "names a path"
positively and apply a conservative token allowlist to argv elements instead of Behavior 7's leading-
`-` rule.

### SEC-7 — warning — authorization
**Section:** `invariants-6`. Rule 1 and the diagnostics guard are mutually exclusive, yet Invariant 6
asserts both. A runner satisfying rule 1 is rejected by `resolveRunnerContained`; one satisfying the
guard escapes rule 1. Since no install path writes into `.context-index/diagnostics/`, the
`diagnostics.yaml` row is effectively dead. State that `runner` is bounded by the diagnostics guard
*instead of* rule 1, and that an entry naming a non-plugin runner must be refused at install rather
than failing later at dispatch.

### SEC-8 — warning — input-validation
**Section:** `behaviors-1`. "Refuses and writes nothing" remains per-target, not per-install (rev-3
SEC-4, unaddressed). This now compounds with consent: nothing says consent is evaluated for the whole
manifest before the first byte is written. Specify a two-phase install — validate every block, entry
and argv element and obtain consent for the union of executable contributions before any write.

### SEC-9 — warning — data-exposure
**Section:** `changes-catalog`. `source` and `exec_consented_at` appear in no allowlist row, which the
spec declares "Exhaustive per target; anything else is refused" — contradicting Behaviors 3 and 10,
which require the installer to write them. And `merge-gates.mjs:41-47` projects exactly five fields,
so both are silently stripped from the merged gate set every consumer sees. Add them to every row as
installer-owned, supply-forbidden, and either extend the projection or state that provenance is a
file-level property not visible to gate consumers.

### SEC-10 — suggestion
**Section:** `migration-path`. The splice table (L268-271) covers three on-disk forms and omits four
reachable ones: target key absent from a valid file; registry file absent (today auto-created,
`content-install.mjs:170-172`); key duplicated or nested; and **root key present but not an array** —
`:184` requires `Array.isArray(parsed[rootKey])`, so a scalar or map at that key leaves
`existingEntries` empty and collision detection degrades to append-everything, the same
silent-degradation class as defect 7. Behavior 8 cites only integer coercion; `parseInlineValue` also
maps `null`/`~`→null and `true`/`false`→boolean (`yaml.mjs:175-178`). No per-field length cap and no
entry-count cap.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK — 7 blockers, 5 warnings, 2 suggestions

### CON-1 — blocker — contract
- **blocker_id:** `consistency-analyzer:contract:2b76bb63`
- **section_anchor:** `target-state-improvements`

L116-117 ("The write is inert. An extension cannot contribute an executable field at all — `command`
is absent from the `gates.yaml` allowlist, so neither collision nor append can introduce one") is
verbatim rev-3 text reversed by L144 ("Executable contributions — permitted"), L152-153, the L184
allowlist row, Invariant 6 (L319-321) and AC L400. Rewrite to the rev-4 premise: the write is bounded
when it executes.

### CON-2 — blocker — contract
- **blocker_id:** `consistency-analyzer:contract:37e994e0`
- **section_anchor:** `changes-catalog-added-per-registry-field-allowlist`

The gates.yaml rationale negates the gates.yaml table row two paragraphs above it: L184 lists
`command`; L215-219 says "**`command` is deliberately absent from the `gates.yaml` row**". This was
flagged at rev 3 as SEC-6(c); rev 4 added the row *with* `command` and left the rationale untouched,
converting a dangling reference into an active contradiction. Verified: `merge-gates.mjs:29-32`
discards any gate lacking `command`, so a gates row without `command` describes an entry its own
consumer throws away. Delete L215-221 or reduce it to the one surviving true clause.

### CON-3 — blocker — contract
- **blocker_id:** `consistency-analyzer:contract:1580dfd7`
- **section_anchor:** `changes-catalog-added-per-registry-field-allowlist`

The diagnostics-runner redirect is offered as a remedy 68 lines after the spec declares it does not
exist. L149-151: "the diagnostics-runner alternative it offered in exchange **does not exist**".
L218-219: "An extension needing to run something ships a `diagnostics.yaml` runner". Confirmed:
`content-install.mjs` writes only to `domains/`, `governance/`, `samples/`, `skill-extensions/`. Rev-3
SEC-3 was relocated, not closed.

### CON-4 — blocker — contract
- **blocker_id:** `consistency-analyzer:contract:fcbdc9e1`
- **section_anchor:** `changes-catalog-added-error-codes`

Three of nine error codes are undeclared. L230-231 enumerates six; `GOVERNANCE_COMMAND_NOT_ARGV`,
`GOVERNANCE_COMMAND_ESCAPES_EXTENSION` and `GOVERNANCE_EXEC_NOT_CONSENTED` appear only in Behaviors
9-10, the Error Cases table and the ACs. `GOVERNANCE_EXEC_NOT_CONSENTED` appears in *no* Behavior at
all — Behavior 10 describes the refusal without naming a code. Add all three to L230-231 and name the
consent code in Behavior 10.

### CON-5 — blocker — contract
- **blocker_id:** `consistency-analyzer:contract:1f3c4a71`
- **section_anchor:** `changes-catalog-added-per-registry-field-allowlist`

The one-level object cap makes both object-valued fields it admits unusable — rev-3 CON-2 relocated.
`review-config.mjs:97-104` and `shouldDispatch:163-171`: the only non-degenerate object form of
`dispatch` is `{ triggered: { patterns, keywords, min_score } }` — two levels, with array leaves.
`review-config.mjs:418` (`validated.args = pkg.args ?? {}`) makes a `package` carrying `args` two
levels as well. AC L405 therefore requires the same entry to round-trip *and* be refused, and AC L411
cannot pass for `review.yaml`. Either raise the cap to two for `dispatch`/`package` specifically
(naming the permitted key set at each level and stating array leaves are element-checked per Behavior
7), or drop the triggered form and `package.args` from extension-contributable scope and rewrite
L405.

### CON-6 — blocker — contract
- **blocker_id:** `consistency-analyzer:contract:13decc5e`
- **section_anchor:** `executable-contributions`

The argv containment base contradicts how the reference extension's command actually resolves at run
time (concurs with SA-3/SEC-3). Additionally: L159 claims `installSamples` verifies with "`resolve()`
+ `startsWith(resolvedPath + sep)` + `realpathSync`" — `content-install.mjs:307-318` uses `resolve()`
+ `startsWith` only, with **no** `realpathSync`. The pattern the spec says it is copying does not
include the step it relies on.

### CON-7 — blocker — contract
- **blocker_id:** `consistency-analyzer:contract:538e014f`
- **section_anchor:** `module-impact-map`

L370 states the rev-3 conclusion ("`gates.yaml` becomes non-writable by extensions entirely"), and
L302's Step 3 Verify says an extension cannot introduce a `command` "whether by collision **or by
appending a new one**". Both contradict L133, L138, Behavior 9 (L342) and AC L401. Note L395 ("onto an
**existing** entry") is correct and traces to Behavior 4; it is L302's append clause and L370 that
carry the rev-3 premise.

### CON-8 — warning
The gates.yaml row's own justification excludes two of the fields it lists. L193-196 says fields
outside what `merge-gates.mjs` projects must not be allowlisted; L184 adds `enabled` and
`disabled_reason`, which neither `merge-gates.mjs` nor `doctor.mjs` reads. AC L411's round-trip will
drop them, along with `source` and `exec_consented_at`. Scope AC L411 to fields the loader reads
today.

### CON-9 — warning
`boundaries.yaml` is given `enabled`/`disabled_reason` on the authority of a spec that does not cover
it: `explicit-governance-registries.spec.md:101` names `review.yaml`, `diagnostics.yaml`,
`gates.yaml`, `validate.yaml` — four registries, not `boundaries.yaml`. (Everything else in the
cross-artifact claim checks out: that spec's `depends-on` at `:4-5` names this spec, and `:105`
confirms `source` is declared here — Integration Point 1 is accurate.)

### CON-10 — warning
"the five functions above" (L237) does not match the four listed at L103-108. The missing fifth is
`isValidGovernanceValue`, which L198-201 says this spec extends but which has no Target State row.
L368's "Four of the five" additionally implies one is out of scope, which is not the case. The
consent mechanism at L169-172 names the picker and a `--allow-exec` flag, neither of which appears in
MODIFIED or the Impact Map. (The *writable-registry* count "five" is consistent throughout; rev-3
SA-3 is closed.)

### CON-11 — warning
Behaviors 3, 5 and 11 have no acceptance criterion; AC L404 (`kind` outside the four values) has no
Behavior — it traces to the Error Cases row at L361 but Behavior 5 governs *fields*, not field
*values*. Widen Behavior 5 or add a distinct `GOVERNANCE_FIELD_VALUE_INVALID` code.

### CON-12 — warning
`__source` still unnamed — rev-3 SA-5(a) not closed. `review-config.mjs:315-328, :390` reads a live
provenance field `__source` straight off `raw`; a supplied `__source` falls through to
`GOVERNANCE_FIELD_NOT_ALLOWED`, contradicting Behavior 6's precedence guarantee. `exec_consented_at`
is likewise installer-stamped but named in no invariant and no allowlist row.

### CON-13 — suggestion
"writes nothing" is still per-target, not per-install — rev-3 SEC-4 unaddressed (concurs with SA-9,
SEC-8).

### CON-14 — suggestion
Minor citation drift, all others verified accurate: L54-55 cites `validateGovernanceEntry` as
`:101-119` validating "only `id`" — `:121-132` also validates every field value; the function ends at
`:133`. L95/L240 cite `example-validation-check-install.test.mjs:206` for `validators || checks` —
`:206-207` is the comment, the assignment is at `:208`. L311 cites `yaml.mjs:193` for flow-map parsing
— `:193` is the missing-colon throw; the dispatch is `:180` and the parser body `:185-200`.

---

## Summary

**Total findings:** 34 (18 blockers, 12 warnings, 4 suggestions)

**Convergence note.** Revision trajectory: rev 1 = 12 blockers, rev 2 = 11, rev 3 = 6, rev 4 = 18.
The count rose because rev 4 introduced a large new normative section and three reviewers each
audited it against the code independently; the blockers are heavily overlapping, not eighteen
distinct problems. Deduplicated, rev 4 has **five** underlying defects:

1. **The rev-3 design is still in the document.** Four sites state the opposite of rev 4's decision
   verbatim: L115-116, L215-221, L302, L370. (SA-1, SEC-5, CON-1, CON-2, CON-3, CON-7)
2. **Bound 1 (containment) has no durable base and no run-time counterpart.** `resolvedPath` is
   deleted after install for npm/git sources, nothing copies the executable into the project, both
   executors run with `cwd` = project root, and the spec never states the resolution base. The
   shipped reference extension fails it under either reading. (SA-3, SEC-2, SEC-3, CON-6)
3. **Bound 2 (argv-only) rests on a false premise.** `doctor.mjs:963` shell-executes `gates.yaml`
   commands and never passes through `merge-gates.mjs`. The property the spec wants is real, but it
   comes from `normaliseCommand`/`NEEDS_QUOTING`, which the spec never names and does not pin.
   (SA-2, SEC-1)
4. **Bound 3 (consent) has no mechanism and no plumbing.** Zero occurrences of `--allow-exec`,
   `allowExec` or `exec_consented_at` in the codebase; `adev extension install` is non-interactive
   and never reaches the picker; `mergeGovernanceEntries` cannot see consent or `resolvedPath`, and
   no signature change is specified. (SA-4, SA-5, SEC-4)
5. **The `review.yaml` allowlist row is wrong for the third time.** `dispatch` is string-valued by
   default and its object form is two levels deep; `package.args` is two levels; the one-level cap
   makes AC L405 self-contradictory and AC L411 unsatisfiable. (SA-6, CON-5)

Plus three undeclared error codes (CON-4) and one incorrect claim about the `installSamples` pattern
the spec says it is copying (CON-6).

**Action required:** Run `/adev:specify --revise` against
`.context-index/specs/cross-cutting/extension-governance-merge-hardening.blockers.md` to produce
revision 5, then re-review. The unblocking work is largely specification rather than redesign — no
reviewer contests the operator's decision to permit bounded executable contributions. The two
decisions that must be made rather than merely written down are (a) where an extension's executable
payload lives after install, since that determines the containment base, and (b) whether
`dispatch: triggered` and `package.args` are extension-contributable at all.

**Transition gate:** `.context-index/governance/gates.yaml` defines `transitions: {}` — no
`spec-to-plan` approver role configured (informational).
