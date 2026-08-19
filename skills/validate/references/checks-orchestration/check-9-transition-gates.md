### Check 9: Transition Gates

Run the transition comparator for the transition this skill drives:

```
adev gate transitions --transition implement-to-validate --spec <spec-path> --json
```

`implement-to-validate` is the only transition Check 9 evaluates: `/adev:validate` sits at the `implemented → validated` boundary. A project may declare others (this repo also declares `validate-to-merge`), but those belong to whoever drives that boundary — at the moment Check 9 runs, validate has not recorded its own outcome yet.

Add `--module <slug>` or `--charter <path>` when Check 1 ran under a module scope; the slug MUST match, or the resolved gate set differs and every recorded outcome reads as `unattested-gate-record`.

The envelope is `{transition, verdict, reason, gates}`; take the `verdict` verbatim. On exit 1 it is `{transition, error, code}` instead (`GATES_PARSE_ERROR`, `GATES_PATH_ESCAPE`, `GOVERNANCE_READ_ERROR`, `MANIFEST_PARSE_ERROR`, `INVALID_DOMAIN_NAME`) — record FAIL and quote the code. Report each blocked gate's reason: `no-recorded-outcome`, `stale-gate-record`, `no-manifest-stamp`, `unattested-gate-record`, `disabled-gate` and `unknown-gate` each call for a different remedy.

A SKIP means no transition was evaluated, and the reason says which case: `no transitions configured`, no transition of that name, the transition requires no gates, or the spec carries no source-manifest stamp (`no-manifest-stamp` — an unstamped spec has never completed implementation, so it owes no outcomes).

The verb reads recorded history only. It never runs a gate — Check 1 remains the only sanctioned writer of `gate_outcomes`.

Full body, including the per-reason table: `skills/validate/checks/validate.check-9-transition-gates.md`.
