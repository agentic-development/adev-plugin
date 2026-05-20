← [README.md](./README.md)

# Partial Artifacts (`.partial` + atomic rename)

A reliability pattern for skill authors. Use this when your skill writes a non-trivial markdown artifact — a plan, a spec, a long validation report — and you want it to survive a mid-stream API failure with no silent loss.

## Why

The Claude API occasionally drops long `Write` tool calls mid-stream (issue-504). Without protection, a 30-minute `/adev:plan` run that crashes at section 6 of 8 loses every prior section. The user has no recoverable artifact and no way to know where the run got cut off.

The `.partial` pattern fixes this by:

1. **Checkpointing to disk frequently.** Write each H2 section to `<final-path>.partial` as soon as it is coherent.
2. **Using atomic rename as the "I'm done" signal.** The presence of `<final-path>` (no `.partial` suffix) is the only thing readers treat as authoritative.

A crash at any moment leaves either the prior `<final-path>` content OR a `<final-path>.partial` file — never a half-written final artifact.

## The four write-state suffixes

Four suffixes coordinate the write-state taxonomy. Each has exactly one owner and one purpose; tooling never aliases them.

| Suffix | Owner | Lifetime | Purpose |
|---|---|---|---|
| `.tmp` | `lib/build-state.mjs::atomicWriteJson`, `lib/issues/json-adapter.mjs::_write` | milliseconds | Byte-level atomic-rename staging. Single-write artifacts. Never recovered. |
| `.lock` | `lib/issues/json-adapter.mjs` (`tasks.json.lock`) | milliseconds | Byte-level exclusive-write coordination via `O_EXCL`. |
| `.partial` | `lib/partial-artifact.mjs` | minutes to hours | Artifact-level incremental authoring. Survives process exit. Recoverable. |
| `.partial.lock` | `lib/partial-artifact.mjs` | matches `.partial`'s authoring window | Sidecar coordination with `{pid, started_at}` for steal-on-stale. |

`.tmp` is for "one big atomic write of JSON state." `.partial` is for "a markdown artifact authored over many Write calls by an LLM." Don't confuse them — `lib/build-state.mjs::atomicWriteJson` is the right primitive for `.tmp`; `lib/partial-artifact.mjs` is the right primitive for `.partial`.

## Helper module API

`lib/partial-artifact.mjs` — pure helpers, zero external dependencies, all `node:fs` + `node:path` built-ins.

```javascript
import {
  partialPath,        // (finalPath) → '<finalPath>.partial'
  lockPath,           // (finalPath) → '<finalPath>.partial.lock'
  commitPartial,      // (finalPath) → atomic rename '.partial' → final
  assertWithin,       // (baseDir, target, errCode?) → throws INVALID_PARTIAL_PATH on escape
  validateSchemaMarker, // (raw)    → {skill, version}, throws PARTIAL_ARTIFACT_SCHEMA_MISMATCH
  isAllowedSchema,    // (raw)    → boolean (never throws)
  SCHEMA_ALLOWLIST,   // Map of {skill@version → true} for v1 adopting skills
  tryAcquireLock,     // (finalPath, opts?) → {acquired, ...}
  validateLockPayload, // (raw)   → {pid, started_at}, throws on garbage
  findPartials,       // (rootDir) → string[] of *.partial under rootDir
  isPartialStale,     // (path, thresholdHours, opts?) → boolean
  loadPartialKnobs,   // (projectRoot) → {partial_stale_seconds, ...}
  DEFAULT_PARTIAL_KNOBS,
} from '<ADEV_ROOT>/lib/partial-artifact.mjs';
```

### The schema marker

Every `.partial` file's first authored chunk MUST include a `partial_schema: <skill>@<version>` marker:

```markdown
<!-- partial_schema: plan@1 -->

# Implementation Plan: ...
```

Grammar: `/^[a-z][a-z0-9-]{0,31}@[0-9]{1,3}$/` (caps skill at 32 chars, version at 999 so the marker fits in the first ~64 bytes of the file). Allowed v1 markers: `plan@1`, `spec@1`, `validate@1`, `implement@1`.

The resume path reads the marker first; a missing or mismatched marker fails the recovery with `PARTIAL_ARTIFACT_SCHEMA_MISMATCH` and `--auto` mode falls back to discard with a logged warning.

### The lock-steal contract

When `tryAcquireLock` finds a lock owned by a dead pid that's older than `lifecycle.partial_stale_seconds` (default 30), it **steals**: unlinks both the lock AND the partial, then re-acquires fresh. This is the "stolen → discarded" contract — the prior partial's content is considered unrecoverable, and the next writer starts fresh. This sidesteps the TOCTOU window between "verify dead" and "resume content" that would otherwise plague any "preserve and resume" design.

Garbage lock payloads (non-JSON, missing fields, invalid pid) route to the same orphan-steal path WITHOUT invoking `process.kill` on the untrusted integer.

## CLI verbs

All adopting skills drive `.partial` recovery via `adev partial <subverb>`, NOT inline Node — per the `cli-driver-surface` charter's "no inline Node in SKILL.md" rule.

```bash
adev partial detect  --root <dir>                       # list *.partial under <dir>
adev partial inspect --artifact <path>                  # schema marker + lock state (read-only)
adev partial resume  --artifact <path>                  # last coherent section (informational)
adev partial discard --artifact <path> --spec <p>       # unlink + emit partial_recovery event
```

`inspect` and `resume` are read-only. `discard` is mutating and additionally emits a `partial_recovery` lifecycle event with `action: discarded` so `/adev:retro` can quantify the upstream API failure rate.

All `--artifact` and `--root` paths are containment-checked against the project root (via `assertWithin` with `INVALID_PARTIAL_PATH`), with realpath normalisation on macOS where `/var` → `/private/var` symlinks would otherwise cause spurious rejection.

## Lifecycle event: `partial_recovery`

Owned by `lifecycle-event-log.spec.md` per the cross-spec contract. Emitted via:

```javascript
import { reportPartialRecovery } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';

reportPartialRecovery(projectRoot, specPath, {
  artifact_path: 'specs/features/m/foo.spec.md',  // project-rel only — SEC-3
  prior_partial_ts: '2026-05-17T10:00:00.000Z',   // ISO-8601 mtime of prior partial
  action: 'resumed' | 'discarded' | 'stolen' | 'aborted',
  dispatch_mode: 'foreground' | 'subagent',
});
```

Validated at write: `action` against a closed enum, `artifact_path` rejected if absolute (SEC-3 data-exposure boundary). Surfaced under `state.partialRecoveries[]` on `currentState()` projections — NOT folded into `interventions[]` (SA-12/CON-11 decision).

## Adopting your skill

The minimum changes per SKILL.md (per `/adev:plan`, `/adev:specify`, `/adev:implement`, `/adev:validate`, `/adev:build` as exemplars):

1. **Step 0 (or equivalent first-run guard):** Run `adev partial inspect` on the prospective artifact path. On a resumable partial, offer **resume / discard / abort**. In `--auto` mode, default to resume; on schema mismatch, discard with logged warning.
2. **Write step:** Author each H2 section to `<final-path>.partial` with the schema marker in the first chunk. Cadence is per-H2 (one section per append).
3. **Commit step:** Atomically rename `<final-path>.partial` → `<final-path>` via `commitPartial(finalPath)` (or the CLI wrapper). Unlink the lock.
4. **On error or interrupt:** Leave the partial + lock in place. The next dispatch will find them.

### Threshold

Mandatory for artifacts whose final size would exceed ~2 KB (or ≥ 3 logical sections, or > 5 minutes of subagent reasoning). Below that, a single Write is cheap to retry and the `.partial` overhead isn't justified.

### Exemptions

- `/adev:validate` keeps the existing `.tmp` byte-level idiom because the entire validation report is computed in memory and written in one Write call — there's no incremental-checkpoint surface to protect. See `agent-reliable-state-artifacts/charter.md` Invariant #10.
- `/adev:implement` uses per-task git commits as its checkpointing primitive (one commit per task is MANDATORY per the spec's Integration Point 2). It does use `.partial` for source-manifest stamping (the spec frontmatter rewrite at the end), but not for per-task code changes.

## Configuration

Knobs live under `manifest.yaml::lifecycle.*` (per CON-9 — these knobs govern lifecycle-artifact write-state, which is a lifecycle concern even though the per-knob behavior is artifact-byte-management):

```yaml
lifecycle:
  partial_stale_seconds: 30           # lock-steal threshold (default 30)
  partial_stale_hours:   24           # orphan-content sweep threshold (default 24)
  partial_oversize_multiplier: 3      # runaway-write guard (default 3× expected size)
  partial_roots: []                   # optional containment-allowlist beyond .context-index/
```

Defaults are the documented values above. Invalid/missing values fall back to defaults — the helper degrades gracefully when the manifest is absent.

## See also

- `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md` — full behavioral contract, every error code, all invariants.
- `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` Invariant #10 — write-state suffix taxonomy.
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — `partial_recovery` event payload + helper signature.
