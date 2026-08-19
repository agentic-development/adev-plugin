# Software Domain: Specify Guidance

<!-- Bundled default for the `software` domain. Loaded by
     `adev domain load-guidance --module <slug>` and rendered by
     /adev:specify Step 4 as illustrative examples for Behaviors and Error
     Cases. This domain is CLI/library-shaped: examples below are drawn from
     command verbs, flags, and process exit semantics — not web request/response
     cycles or graphical UI interactions. -->

## Behaviors

Write each behavior as **When** (trigger) / **Then** (observable result),
scoped to a single CLI verb or library entry point. Prefer flag validation
and idempotency over end-to-end scenarios — those belong in Acceptance
Criteria.

- **BEH-1** — **When** the `--output` flag is passed a value that is not one
  of the accepted formats (e.g. `--output=xml` where only `json` and `table`
  are supported), **then** the command exits without performing any work and
  reports the invalid flag value before any other validation runs.
- **BEH-2** — **When** the command is invoked a second time with identical
  arguments against state it already produced (e.g. re-running an `init` or
  `sync` verb on an already-initialized target), **then** the command
  succeeds without duplicating output or mutating already-correct state, and
  reports that no changes were needed.

## Error Cases

Frame error rows around thrown error codes and process exit codes, not
HTTP status codes. Each row should name the condition, the observable
behavior (message, exit code), and a stable machine-readable error code the
caller or a test can assert on.

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Required flag omitted (e.g. `--module` not passed) | Command exits 1 and prints usage naming the missing flag | `MISSING_ARG` |
| Malformed or out-of-range flag value (e.g. an unsupported `--output` format) | Command exits 1 before any side effects occur | `INVALID_ARG` |
| Referenced path escapes the project root (e.g. a `--charter` value resolving outside the repo) | Command exits 1 and refuses to read or write the path | `PATH_ESCAPE` |
| Internal invariant violated (e.g. a config file fails schema validation) | Command exits 2 and reports the offending file and field | `CONFIG_INVALID` |

<!-- Exit code convention for this domain: 0 = success, 1 = caller/argument
     error (bad input, missing flag, not found), 2 = internal/policy
     violation (blocked operation, invariant failure). Keep new error codes
     SCREAMING_SNAKE_CASE and specific to the failure, not generic. -->
