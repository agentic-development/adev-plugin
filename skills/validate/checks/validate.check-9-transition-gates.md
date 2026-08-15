# Check 9: Transition Gate Compliance

Verify that the lifecycle transition this skill drives — `implement-to-validate` — has a fresh,
attested, passing outcome recorded for every gate it requires.

**Which transition, and why.** `/adev:validate` sits at the `implemented → validated` boundary, so
`implement-to-validate` is the only transition whose preconditions are this run's business. A
project may declare others — this repo also declares `validate-to-merge` — but those are evaluated
by whoever drives that boundary (the merge guard), not here: at the moment Check 9 runs, validate
has not yet recorded its own outcome, so evaluating `validate-to-merge` would report a failure that
is simply the present tense.

Do not re-derive this from Check 1's in-memory results. The verb reads the spec's recorded
lifecycle history, which is what a later reader of the `.validate.md` report can also read.

## Steps

1. Run the transition comparator and capture its report:

   ```
   adev gate transitions --transition implement-to-validate --spec <spec-path> --json
   ```

   `<spec-path>` is the spec under validation. Add `--module <slug>` when Check 1 ran under a module
   scope, or `--charter <path>` when a charter's frontmatter names the domain (the charter wins).
   **`--module` MUST name the same scope Check 1 ran under** — a different scope resolves a
   different gate set, and every recorded outcome then reads as `unattested-gate-record`.

   The verb reads history only. It never runs a gate and never checks a workflow precondition; that
   is `adev gate require`. Exit 0 means the transition passes or SKIPs; 2 means a required gate has
   no fresh, attested, passing outcome; 1 means an argument error, a missing spec, or a project the
   comparator cannot read.

2. Parse the JSON envelope: `{transition, verdict, reason, gates}`. `gates` is keyed by gate id, and
   each value carries `id`, `verdict`, `reason` and `command_attested`.

   On exit 1 the envelope is instead `{transition, error, code}` on stdout as well as stderr. Record
   **FAIL** and quote `code` and `error` — the project declares transitions and the comparator
   cannot read them, which is a governance defect, not an absence of governance. The codes are
   `GATES_PARSE_ERROR`, `GATES_PATH_ESCAPE`, `GOVERNANCE_READ_ERROR`, `MANIFEST_PARSE_ERROR` and
   `INVALID_DOMAIN_NAME`.

3. Record the check result from `verdict` verbatim — do not recompute it from the `gates` map:

   - **`PASS`:** PASS. List each gate id and its recorded verdict.
   - **`FAIL`:** FAIL, listing every gate whose `verdict` is not `pass` together with its `reason`
     from the table below. This check's registry severity is `warning`, so it does not fail
     validation on its own — but each blocked gate names a precondition the project declared and
     cannot evidence.
   - **`SKIP`:** SKIP, quoting `reason`. The distinct SKIP reasons are "no transitions configured",
     `no transition configured named "implement-to-validate"`, "…requires no gates", and the
     unstamped-spec case in the table below. Report which one; they call for different actions.

4. Report `command_attested: false` on any gate whose outcome otherwise counts. Attestation is
   partial by design: `command_sha` catches drift and catches an outcome copied between gates whose
   resolved argv differ, but two gates resolving to the same command share a digest, and it catches
   no deliberate forgery at all. Say so rather than reporting the gate as fully verified.

## What each gate reason means

| Gate reason | What it means and what to do |
|---|---|
| `recorded-pass` | The gate has a fresh, attested, passing outcome. Nothing to do. |
| `recorded-fail` / `recorded-<verdict>` | An outcome exists and is not a pass. Fix the gate's cause and re-run Check 1; the transition cannot clear on history alone. |
| `no-recorded-outcome` | The gate is in the resolved set but nothing recorded an outcome for it. Run `/adev:validate`'s Check 1, which is the sole sanctioned writer of `gate_outcomes`. |
| `stale-gate-record` | The spec IS stamped and the recorded outcome predates the stamp (or its `manifest_sha` no longer matches). The code moved after the gate ran; re-run the gates. |
| `no-manifest-stamp` | The spec carries no `source-manifest` block at all, so no outcome can be judged fresh. The transition SKIPs — an unstamped spec has never completed implementation and owes no outcomes. Stamp it with `/adev:implement` to get a real verdict. Kept distinct from `stale-gate-record` precisely because the remedy differs. |
| `unattested-gate-record` | Attestation failed: the gate id is not in the resolved gate set, or its recorded `command_sha` does not match the hash of the argv resolved today. Check that `--module` / `--charter` names the same scope Check 1 ran under before concluding the record is bad. |
| `disabled-gate` | The gate IS declared but the registry switched it off with `enabled: false`, while the transition still requires it. Either re-enable the gate or stop requiring it — not both remedies, and neither is this check's to apply. |
| `unknown-gate` | The transition requires an id no gate declares. The `MISSING_GATE_REF` finding `/adev:hygiene` Pass 8 raises; fix `gates.yaml`. |

## Do not

- Do not evaluate `validate-to-merge` from this check. Its preconditions include this validation
  run's own outcome, which does not exist yet.
- Do not run any gate from this check. The comparator reads recorded history; executing a gate here
  would both re-enter validation and manufacture the evidence the check exists to audit.
- Do not write a `gate_outcomes` record to make a transition clear. Check 1 is the only sanctioned
  writer of `gate_outcomes`.
- Do not record PASS when the comparator SKIPs. A SKIP means no transition was evaluated.
