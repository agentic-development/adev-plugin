---
charter: lifecycle-artifacts
kind: integration
status: validated
risk_level: medium
milestone: spec-and-charter-taxonomy
revision: 2
charter-revision: 2
created: 2026-05-14

plan-ref: .context-index/specs/features/lifecycle-artifacts/read-time-defaulting.plan.md

source-manifest:
  sha: "2ddc7f1"
  files:
    - lib/git-timestamp.mjs
    - tests/integration/read-time-defaulting.test.mjs
    - tests/lib/git-timestamp.test.mjs
  computed-at: "2026-05-15T12:15:12.657Z"
---

# Live Spec: Read-Time Defaulting Integration

<!-- Wires lib/kinds.mjs, the spec-lifecycle frontmatter parser, and /adev:hygiene
     into the end-to-end read-time-defaulting + invalid-kind-reporting flow. -->

## Participants

| Module | Role |
|---|---|
| `lib/kinds.mjs` | Source of truth for valid kinds and per-layer defaults (`defaultKindFor`, `isValidKind`). |
| spec-lifecycle frontmatter parser (`lib/lifecycle-state.mjs` and adjacent modules) | Reads `.spec.md` and `charter.md` files; produces parsed frontmatter for consumers. |
| `/adev:hygiene` | Periodic audit skill; reports `INVALID_KIND` findings on misconfigured artifacts. |
| Downstream consumers (`/adev:status`, `/adev:plan`, `/adev:review-specs`, `/adev:build`, `/adev:retro`) | Read parsed frontmatter; rely on `kind` being non-null. |

## Interaction Contract

The flow that wires these participants:

**On spec/charter file read:**
1. Caller invokes the spec-lifecycle frontmatter parser with a file path.
2. Parser reads the file, extracts YAML frontmatter.
3. Parser determines artifact layer from the path (`.spec.md` → `'spec'`; `charter.md` → `'charter'`).
4. Parser checks for the `kind:` field (per `frontmatter-discriminator.spec.md`, which owns the field semantics):
   - **Present, valid:** expose `kind` set to the value; `kindValid: true`; `kindResolved: 'explicit'`.
   - **Present, invalid:** expose `kind` set to the raw value; `kindValid: false`; `kindResolved: 'explicit'`.
   - **Absent:** expose `kind` set to `defaultKindFor(layer)`; `kindValid: true`; `kindResolved: 'default'`.
5. Parser returns the result; disk content is never modified.

The three sentinel fields (`kind`, `kindValid`, `kindResolved`) are declared and owned by `frontmatter-discriminator.spec.md`. This integration spec consumes them and wires them through the parser → hygiene → consumer flow.

**On hygiene audit:**
1. `/adev:hygiene` enumerates all `.spec.md` and `charter.md` files via the file-suffix glob.
2. For each, invokes the parser; checks `kindValid`.
3. If `kindValid: false`: emits an `INVALID_KIND` finding (non-blocking).
4. If `kindResolved: 'default'` AND the artifact's creation timestamp is after the Layer 1 cutover date: emits a `MISSING_KIND` finding (non-blocking; old artifacts are silent).
5. Aggregates findings in the hygiene report.

**Timestamp source for cutover classification:** The cutover comparison uses **git's recorded creation timestamp** (`git log --follow --diff-filter=A --format=%aI -- <path>` returning the author date of the file's first commit) rather than filesystem `mtime`. Rationale: `mtime` is trivially forgeable (`touch -t`) and resets on checkout in some workflows; the git creation timestamp is authoritative for repo history. **Fallback:** if the file is not yet committed (new uncommitted spec) or git is unavailable, fall back to `mtime` with a `WARNING` note attached to the finding. Document this fallback in the hygiene report header so consumers know the timestamp basis.

**On spec/charter write by `/adev:specify` or `/adev:brainstorm`:**
1. Skill resolves the user's chosen kind (ask-first prompt or `--kind` flag).
2. Skill validates via `isValidKind(layer, kind)`. If invalid, re-prompt.
3. Skill writes frontmatter with explicit `kind:` value (never defaults on write).

## State Machine

```
                  ┌──────────────────────┐
                  │  Artifact on disk    │
                  └──────────┬───────────┘
                             │ parser reads
                             ▼
              ┌──────────────────────────────┐
              │  Frontmatter inspected       │
              └──────┬──────┬─────────┬──────┘
                     │      │         │
            present  │      │ absent  │ present-invalid
            valid    │      │         │
                     ▼      ▼         ▼
                ┌────────┐ ┌────────┐ ┌────────────────┐
                │ kind = │ │ kind = │ │ kind = raw     │
                │ explicit│ │ default│ │ kindValid:false│
                │ kindV=T │ │ kindV=T│ │                │
                │         │ │ kindR= │ │                │
                │         │ │ default│ │                │
                └────┬────┘ └────┬───┘ └────────┬───────┘
                     │           │              │
                     └───────────┴──────────────┘
                             │
                             ▼ exposed to consumer
                  ┌──────────────────────┐
                  │ Hygiene flags        │
                  │ kindValid=false      │
                  │ or post-cutover      │
                  │ kindResolved=default │
                  └──────────────────────┘
```

States exposed on parser result:
- `kind`: string (either explicit value or `defaultKindFor(layer)`)
- `kindValid`: boolean (false only for present-but-invalid)
- `kindResolved`: `'explicit' | 'default'` (distinguishes how kind got its value)

## Error Propagation

| Origin | Propagates as | Consumer behavior |
|---|---|---|
| Parser called on non-existent path | `FILE_NOT_FOUND` (existing) | Caller decides |
| Parser called on unparseable frontmatter | `INVALID_FRONTMATTER` (existing) | Caller decides; not specific to `kind:` |
| Invalid `kind:` value detected on parse | Exposed via `kindValid: false` on result | Hygiene reports; other consumers may ignore or fall back to default |
| Skill write rejects invalid kind | Skill re-prompts user; no exception leak to file system | User retries within the skill |
| Hygiene encounters an artifact it can't parse | Skipped with WARN; pass continues | Reported in hygiene summary as a parse failure (separate from INVALID_KIND) |

Critically: **the parser never throws on a missing or invalid `kind:`.** Read-time defaulting is non-blocking by design. Throwing on a missing field would break every legacy artifact at the moment of read, defeating the soft-validation posture.

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown — Companion code (helpers, validators) is allowed but must not be required for the skill to function"** — Applies: the parser integration adds the `kind` field on result; consumers can ignore it. Skills continue to work without consuming the new field.
- **Principle 5: "Version parity"** — Not directly applicable but relevant: any change to the parser API shape (new `kind`, `kindValid`, `kindResolved` fields) must land coherently across the codebase to avoid downstream breakage.

## Acceptance Criteria

- [ ] Frontmatter parser exposes `kind`, `kindValid`, and `kindResolved` on every result
- [ ] `kind` is non-null on every parsed result (explicit or defaulted)
- [ ] Disk content is never modified by read-path defaulting
- [ ] `/adev:hygiene` reports `INVALID_KIND` for present-but-invalid values
- [ ] `/adev:hygiene` reports `MISSING_KIND` only for artifacts modified after the cutover date
- [ ] `/adev:specify` and `/adev:brainstorm` write paths reject missing/invalid kind at authoring time
- [ ] Tests cover the full integration: parse legacy artifact (no kind), parse new artifact (explicit kind), parse artifact with invalid kind
- [ ] No constitutional violations introduced
