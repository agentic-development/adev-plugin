## Audit Pass 19: Governance Registry Drift

**Goal:** Surface divergence between the project's four governance registries — `validate.yaml`, `review.yaml`, `diagnostics.yaml`, `gates.yaml` — and the starters they came from, plus two sub-audits the divergence half structurally cannot see. Purpose is **visibility, not nagging**: divergence is the expected outcome of customization and the pass never blocks.

**Why this pass carries weight now.** Run-time composition was removed (`explicit-governance-registries.spec.md`): a new bundled or domain entry no longer activates by itself — someone must run `adev governance materialize`. **Pass 19 is now the only channel through which a plugin or domain upgrade becomes visible.** `boundaries.yaml` is out of remit: no starter to diverge from, no execution-bearing field.

**Severity policy.** All findings from this pass are **INFO**, not WARN, with one exception: `hygiene/disabled-bundled-entry` is WARN, because switching off a bundled check is a decision someone should see. No finding gates the `/adev:hygiene` exit code, and the verb exits 0 regardless of finding count.

**Steps:**

1. Run `adev governance drift --json` from the project root; `--registry <validate|review|diagnostics|gates>` narrows it to one. The verb resolves the domain, loads each starter (domain overlay, plus the bundled template for `diagnostics` and `gates`), reads each project registry, and returns every finding.
2. Read the envelope: `verdict` (`PASS` | `FINDINGS`), `findings[]`, `headerNotes[]`, `summary` (`domain`, `registries`, `finding_count`, `warning_count`).
3. Render `findings[]` grouped by `registry`. Each carries `id`, `severity`, `registry`, `entry_id`, `message`; execution-bearing findings also carry `fields` and `source`.
4. Surface `headerNotes[]` in the report header (a starter that would not load, a domain that would not resolve).
5. Do not paraphrase a `message` so that it adds a registry value the verb did not print.

**Finding ids:**

| Severity | Finding id | Trigger |
|---|---|---|
| `warning` | `hygiene/disabled-bundled-entry` | `enabled: false` on an entry whose `source` is `bundled` or `domain:*` — confirm it was meant to be off, and that `disabled_reason` says why |
| `info` | `hygiene/unadopted-upgrade` | The starter declares an id the project's registry does not — adopt with `adev governance materialize --registry <name>`, or record the decision not to |
| `info` | `hygiene/project-addition` | The project declares an id the starter does not, `source: project` — customization |
| `info` | `hygiene/non-project-execution-field` | A non-`project` entry carries `command`, `runner`, `prompt` or `pattern` — confirm it is meant to run |
| `info` | `hygiene/registry-not-materialized` | A marked registry (`review`, `diagnostics`, `gates`) has no top-level `materialized_at` — it was NOT audited; materialize it |
| `info` | `hygiene/registry-absent` / `hygiene/registry-unreadable` | No such file (`/adev:init`), or unparseable YAML — the registry was not audited |
| `info` | `hygiene/starter-unavailable` | No starter under the resolved domain — the unadopted-upgrade comparison was skipped |

**Why the sub-audits exist.** The divergence half reports only *unadopted new* entries — ones the project does NOT have — so a bundled check switched off in a one-line PR diff stays invisible without the disabled-entry audit (SEC-4). And the non-`project` `source` exclusion is narrowed to **unadopted-upgrade findings only** (DDR-6): a non-`project` entry stays exempt from "you have not adopted this" noise, but every one carrying an execution-bearing field is listed, so an extension-appended `command` reaching a subprocess at every post-task trigger is visible.

**Redaction rule (SEC-4), restated for the renderer.** Findings emit the field NAME and, where a value is unavoidable, its value **type** — never the literal value of a `prompt:` or `context_pack:` field. Hygiene output is routinely pasted into chat and PRs. Report `prompt`, not the prompt.

**Deferred (do not build here).** A *changed-since* diff ("this `command` appeared or changed since your last install") and the matching install-time summary line both need an install ledger; none exists. Until one does, the sub-audit lists the standing state every run.

**Output format:**
```
## Governance Registry Drift

- PASS: All four registries match their starters; nothing disabled, nothing unexpected executing
- FINDINGS: N findings (1 warning, N-1 info) — non-blocking

| Registry | Entry | Severity | Finding | Detail |
|---|---|---|---|---|
| review | security-reviewer | warning | hygiene/disabled-bundled-entry | enabled: false on a bundled entry (no disabled_reason) |
| gates | new-lint-gate | info | hygiene/unadopted-upgrade | starter declares it; gates.yaml does not |
| gates | ext-gate | info | hygiene/non-project-execution-field | extension:acme carries command |

**Actions:**
- [ ] Review each `hygiene/disabled-bundled-entry` — confirm the check was meant to be off
- [ ] Adopt wanted upgrades with `adev governance materialize --registry <name>`
- [ ] Confirm every listed non-project execution-bearing entry is meant to run
- [ ] Materialize any registry reported as `hygiene/registry-not-materialized` — it was not audited
```

**Integration with summary table:**
```
| Governance Registry Drift | WARN | 6 findings (1 disabled bundled entry) |
```
