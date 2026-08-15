# Check 1: Quality Gates

Run the project's resolved quality-gate set, then record what each gate did on a single attested
`validator_report`.

This check is the **only sanctioned writer of `gate_outcomes`**. Every other producer of a
`validator_report` — every subagent-review check, every deterministic check, every skill that
reports a validator verdict — MUST omit `gate_outcomes` entirely. A downstream reader treats a
`gate_outcomes` record as evidence that the named gates actually executed against the code the
spec's source manifest pins; a record written by anything other than this check is an assertion
nobody ran, and the attestation rule will refuse it.

## Steps

1. Resolve the gate set. `/adev:validate` Step 0 has already run:

   ```
   adev domain load-gates --module <module-slug> [--charter <charter-path>]
   ```

   Reuse that JSON envelope — do not re-read `governance/gates.yaml` directly, and do not call the
   verb a second time. It carries `domain`, `gates`, and `warnings`. Each element of `gates` has
   `id`, `command` (an argv list), `tier`, `severity`, and **`command_sha`** — the SHA-256 of that
   gate's resolved argv, computed by the loader. The loader is where that hash is computed
   precisely so this check never has to compute one, and it is also where the `tier` default is
   applied, so every gate in the envelope already carries a tier.

2. Execute the gates by tier (fast → integration → e2e) with the semantics described in
   `skills/validate/SKILL.md` § Check 1: intra-tier fail-fast on an error-severity failure, and
   later tiers skipped once an error-severity tier fails.

3. Build one outcome object per gate in the resolved set — including gates that never ran because
   an earlier gate failed, and gates skipped as probabilistic. A gate absent from the array is
   indistinguishable from a gate that was never declared:

   | Field | Value |
   |---|---|
   | `id` | the gate's `id`, verbatim from the resolved set |
   | `verdict` | `pass`, `fail`, or `skip` — lowercase, this closed set only |
   | `tier` | the gate's `tier`, verbatim from the resolved set (`fast`, `integration`, `e2e`) — the loader already defaults a gate that declares none to `fast`, so take the value as given and never leave it empty |
   | `command_sha` | the gate's `command_sha`, verbatim from the resolved set |

   No other key is accepted. `reportValidator` refuses an unknown key rather than dropping it.

4. Write the array to a scratch JSON file and emit **exactly one** event for the whole check:

   ```
   adev report --type validator \
     --spec "<spec-path>" \
     --step validate \
     --validator validate.check-1-quality-gates \
     --verdict <PASS|PASS_WITH_NOTES|FAIL> \
     --gate-outcomes @.adev/tmp/gate-outcomes.json \
     --manifest-sha "<source-manifest sha>"
   ```

   One invocation for the entire gate set — never one per gate. The record is the unit the
   attestation rule reads back; a per-gate emission produces N partial records and no complete one.

   The `@<path>` form is the recommended form. A non-trivial gate set serialises to more JSON than
   an argv element can reliably carry, and the failure mode of a too-long argument is a truncated
   or rejected command rather than a clear error. Pass a JSON literal only for a one- or two-gate
   set. The path must resolve inside the project root.

   `--manifest-sha` is the `sha` from the spec's `source-manifest` frontmatter block (the one
   Check 1.5 verifies). Omit the flag when the spec carries no `source-manifest` block; do not
   invent a value.

5. Record the check result from the tier outcomes: FAIL if any error-severity gate failed, PASS
   with notes if only warning-severity gates failed, PASS otherwise. Report the tier summary in the
   validation report as `/adev:validate` § Check 1 describes.

## What each outcome value means

| `verdict` | What it means |
|---|---|
| `pass` | The gate ran to completion and exited zero. |
| `fail` | The gate ran and exited non-zero. Severity decides whether that fails validation. |
| `skip` | The gate did not run: probabilistic (no machine verdict available), or its tier was skipped after an earlier error-severity failure, or it declares no runnable command. |

An empty resolved gate set is not an outcome array of zero elements plus a PASS — it is a SKIP of
this check with the advisory `/adev:validate` § Check 1 specifies. Emitting a PASS with no outcomes
would record that a project with no gates passed its gates.

## Do not

- Do not emit `gate_outcomes` from any other check. This check is the sole writer; a second writer
  makes the attestation meaningless because a reader cannot tell which record is the executed one.
- Do not compute `command_sha` here. It arrives on the resolved gate set. Recomputing it from a
  gate's `command` by hand risks a different serialisation than the loader's, and a mismatched hash
  reads downstream as a tampered gate rather than as an arithmetic slip.
- Do not include a gate that is not in the resolved set, and do not rename an `id` to something
  more readable. The `id` is the join key against `gates.yaml`.
- Do not omit `--manifest-sha` when the spec has a `source-manifest` block. Without it a reader
  falls back to a timestamp comparison, which is weaker evidence than a content hash.
- Do not report PASS for a gate that was auto-fixed and never re-run. Re-run it, then record the
  re-run's verdict.
