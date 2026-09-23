## Audit Pass 19: Governance Registry Drift

**Goal:** Surface divergence between the project's four governance registries — `validate.yaml`, `review.yaml`, `diagnostics.yaml`, `gates.yaml` — and the starters they came from, plus three sub-audits the id-set half cannot see. Purpose is **visibility, not nagging**: divergence is expected from customization and the pass never blocks.

**Why this pass carries weight now.** Run-time composition was removed (`explicit-governance-registries.spec.md`): a new bundled or domain entry no longer activates by itself — someone must run `adev governance materialize`. **Pass 19 is the only channel through which a plugin or domain upgrade becomes visible.** `boundaries.yaml` is out of remit.

**Severity policy.** All findings are **INFO** except `hygiene/disabled-bundled-entry` and `hygiene/entry-field-drift`, which are **WARN**: switching off a bundled check, and an entry's fields silently diverging from the profile it was copied from, are both changes someone should see. No finding gates the `/adev:hygiene` exit code; the verb always exits 0.

**Steps:**

1. Run `adev governance drift --json` from the project root; `--registry <validate|review|diagnostics|gates>` narrows it to one. The verb resolves the domain, loads each starter, reads each project registry, and returns every finding.
2. Read the envelope: `verdict` (`PASS` | `FINDINGS`), `findings[]`, `headerNotes[]`, `summary`.
3. Render `findings[]` grouped by `registry`. Each carries `id`/`severity`/`registry`/`entry_id`/`message`; execution-bearing findings also carry `fields`/`source`; field-drift findings also carry `field`/`project_value`/`profile_value`/`source`.
4. Surface `headerNotes[]` in the report header.
5. Do not paraphrase a `message` so that it adds a value the verb did not print.

**Finding ids:**

| Severity | Finding id | Trigger |
|---|---|---|
| `warning` | `hygiene/disabled-bundled-entry` | `enabled: false` on an entry whose `source` is `bundled` or `domain:*` — confirm it was meant to be off, and `disabled_reason` says why |
| `warning` | `hygiene/entry-field-drift` | A `bundled`/`domain:*`-sourced entry's `context_pack`/`profile`/`severity_cap`/`dispatch` no longer matches the matching-id entry in the source its own `source:` names |
| `info` | `hygiene/unadopted-upgrade` | The starter declares an id the project's registry does not — adopt with `adev governance materialize --registry <name>`, or record the decision not to |
| `info` | `hygiene/project-addition` | The project declares an id the starter does not, `source: project` — customization |
| `info` | `hygiene/non-project-execution-field` | A non-`project` entry carries `command`, `runner`, `prompt` or `pattern` — confirm it is meant to run |
| `info` | `hygiene/registry-not-materialized` | A marked registry (`review`, `diagnostics`, `gates`) has no top-level `materialized_at` — it was NOT audited; materialize it |
| `info` | `hygiene/registry-absent` / `hygiene/registry-unreadable` | No such file (`/adev:init`), or unparseable YAML — the registry was not audited |
| `info` | `hygiene/starter-unavailable` | No starter under the resolved domain — the unadopted-upgrade comparison was skipped |

**Why the sub-audits exist.** The id-set half reports only *unadopted new* entries — a bundled check switched off, or an entry whose FIELDS drifted while its id stayed put, both stay invisible without their own sub-audit (SEC-4; see `lib/hygiene/registry-drift.mjs`'s module header for the incident that motivated field-drift). The non-`project` `source` exclusion is narrowed to unadopted-upgrade findings only (DDR-6).

**Redaction, scoped to `hygiene/non-project-execution-field` only.** It emits the field NAME, never the literal value of a `command`/`runner`/`prompt`/`pattern` field — those can embed internal codenames. `hygiene/entry-field-drift` prints both values: `context_pack`/`profile`/`severity_cap`/`dispatch` are short enum config, not paths, and the finding is not actionable without them.

**Deferred.** A *changed-since* diff and its install-time summary need an install ledger; none exists.

**Output format:**
```
## Governance Registry Drift

- PASS: All four registries match their starters; nothing disabled, nothing unexpected executing
- FINDINGS: N findings (M warning, N-M info) — non-blocking

| Registry | Entry | Severity | Finding | Detail |
|---|---|---|---|---|
| review | security-reviewer | warning | hygiene/disabled-bundled-entry | enabled: false on a bundled entry (no disabled_reason) |
| review | consistency-analyzer | warning | hygiene/entry-field-drift | context_pack: 'base' vs profile's 'consistency' |
| gates | new-lint-gate | info | hygiene/unadopted-upgrade | starter declares it; gates.yaml does not |

**Actions:**
- [ ] Review each `hygiene/disabled-bundled-entry` — confirm the check was meant to be off
- [ ] Review each `hygiene/entry-field-drift` — adopt the profile's new value, or keep the customization deliberately
- [ ] Adopt wanted upgrades with `adev governance materialize --registry <name>`
- [ ] Confirm every listed non-project execution-bearing entry is meant to run
- [ ] Materialize any registry reported as `hygiene/registry-not-materialized` — it was not audited
```

**Integration with summary table:**
```
| Governance Registry Drift | WARN | 6 findings (1 disabled bundled entry) |
```
