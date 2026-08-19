## Amend Mode (`--amend <base-spec>`)

Seventh workflow axis. Scaffolds a **new co-located amendment** of an already-shipped (validated) base spec **without editing the base in place**. This formalizes the ad-hoc `<base>-rev-N-<descriptor>.spec.md` pattern into a governed relationship field plus a scaffolding verb.

**Distinct from `--revise`:** `--revise` bumps a *not-yet-shipped, review-blocked* spec in place (N → N+1, clears `.blockers.md`). `--amend` produces a *new artifact* that amends a *shipped/validated* spec while keeping the base immutable.

**Preconditions:**

1. The base spec exists on disk and ends with `.spec.md`.
2. The base is resolvable within the project root.

**Steps:**

1. **Resolve the descriptor.** `<descriptor>` is a kebab-case slug naming the amendment (e.g., `drop-coupon-field`). If the author did not supply `--descriptor`, prompt for it:

   ```
   → Descriptor for this amendment (kebab-case, e.g. drop-coupon-field):
   ```

   The descriptor is sanitized by the CLI verb against a strict kebab-case allowlist (SEC-1); illegal or path-traversal values are rejected with `INVALID_AMENDMENT_DESCRIPTOR`.

2. **Run the CLI verb** that does the amend work:

   ```bash
   adev specify amend --spec <base-spec> [--descriptor <slug>] [--kind <kind>] [--target-revision <N>]
   ```

   The verb wraps `lib/specify-amend.mjs::amendSpec` and:
   - Computes the co-located path `<base-dir>/<base-stem>-rev-<target>-<descriptor>.spec.md`.
   - Writes frontmatter `amends: <base path>`, `target-revision: <N>`, an inherited/overridable `kind:`, `revision: 1`, `status: review-pending` (keeps the `.spec.md` extension).
   - Sets `target-revision` to `base.revision + 1` by default; an explicit `--target-revision` must be strictly greater than the base revision, else `INVALID_TARGET_REVISION`.
   - Writes the amendment atomically (temp-then-rename) and never modifies the base spec.
   - Emits a `spec_amended` lifecycle event on the **base** spec's log carrying `{ amendment_slug, amendment_path, target_revision }`. The base gets no `specify` events — it was not re-specified.
   - Opens and closes `specify` on the **amendment's own** log (`started`, then `completed` with verdict `PASS`, in that order). Without this the amendment has no log, `specify` projects as `{status: "missing"}`, and `adev gate require --skill review-specs` exits 2 under the default strict mode — leaving the artifact unreviewable despite the scaffold promising it "is reviewed, planned, and validated on its own lifecycle". Do not re-emit these from the skill.

3. **Path containment (SEC-1):** the CLI verb re-asserts `assertWithin(projectRoot, specPath)` and rejects path-traversal with `INVALID_SPEC_PATH`. The skill MUST NOT pre-validate paths.

4. **Kind contract:** `--kind amendment` is rejected with the closed-enum `INVALID_KIND` — amendment is the `amends:` relationship overlay, not a kind.

5. **Mutual-exclusion contract:** combining `--amend` with any of `--revise`, `--extract`, `--refactor`, `--from-diff`, or `--cross-cutting` exits non-zero with `CONFLICTING_FLAGS`.

6. **Report** the result to the user (read from the verb's JSON stdout):

   ```
   Amended <base-spec>: new amendment <amendment-path> targeting rev <N>
   Next step: run /adev:review-specs --spec <amendment-path> to review the amendment.
   ```

**Error cases:**

| Condition | CLI exit | Error code | Action |
|-----------|----------|------------|--------|
| Base spec missing on disk | 1 | `INVALID_AMENDMENT_BASE` | Stop; report the missing base |
| Path traversal or spec outside `projectRoot` | 1 | `INVALID_SPEC_PATH` | Stop; report the malformed path |
| Illegal / traversal descriptor | 1 | `INVALID_AMENDMENT_DESCRIPTOR` | Re-prompt for a kebab-case descriptor |
| `--target-revision` ≤ base `revision:` | 1 | `INVALID_TARGET_REVISION` | Stop; report; the target must be strictly greater |
| `--kind amendment` supplied | 1 | `INVALID_KIND` | Stop; amendment is not a kind |
| Combining `--amend` with another workflow flag | 1 | `CONFLICTING_FLAGS` | Stop; report which flags conflict |

**Constitution alignment:** The skill names the CLI verb (`adev specify amend`) and contains no inline Node — all amend control flow (base resolution, target-revision computation, descriptor sanitization, event emission) lives in `lib/specify-amend.mjs` per the `cli-driver-surface` charter. The library uses only Node.js built-ins.

---
