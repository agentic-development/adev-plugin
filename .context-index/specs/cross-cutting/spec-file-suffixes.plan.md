# Implementation Plan: Standardize Spec File Suffixes

> **Methodology:** adev
> **Spec:** .context-index/specs/cross-cutting/spec-file-suffixes.md
> **Review:** PASS_WITH_NOTES (2026-05-04)
> **Platform:** JavaScript (ESM), Node.js, npm

**Goal:** Replace negative-exclusion spec scanning with positive `.spec.md` glob matching by renaming all live specs and normalizing validation reports.

**Architecture:** Purely mechanical — file renames via `git mv`, then sed-based reference updates across plans, reviews, source code, skills, and templates. No behavioral changes.

---

## File Structure

**Rename (132 live specs):**
- `.context-index/specs/features/**/<name>.md` → `<name>.spec.md`
- `.context-index/specs/cross-cutting/<name>.md` → `<name>.spec.md`

**Rename (39 validation reports):**
- `.context-index/specs/features/**/<name>-validation.md` → `<name>.validate.md`

**Modify (source code):**
- `lib/meta-tools.mjs:155-157` — spec filter logic
- `lib/spec-drift.mjs:58,64` — `.md` extension checks
- `lib/source-manifest.mjs:145` — `.endsWith(".md")` filter
- `lib/reality-check.mjs:288-321` — spec scanning and validation path construction

**Modify (documentation):**
- `.context-index/constitution.md:42` — Spec trailer example path
- `CLAUDE.md:43` — synced copy

**Modify (skills — extensive, see Task 5):**
- All skills referencing spec paths or using exclusion-list scanning

**Reference (read, do not modify):**
- `.context-index/specs/cross-cutting/spec-file-suffixes.md` — the spec
- `.context-index/specs/cross-cutting/spec-file-suffixes.review.md` — review report

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (renames must complete before reference updates)
- Group B (after Group A): Task 4 + Task 5 + Task 6 can run in parallel (independent file sets)
- Group C (after all): Task 7 (verification)

---

### Task 1: Rename live specs to .spec.md [specialist: none]

**Charter capability:** Cross-cutting refactoring
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Rename: 132 files under `.context-index/specs/features/` and `.context-index/specs/cross-cutting/`

**Steps:**

- [ ] **Generate rename script**

```bash
# Rename live specs in features/
find .context-index/specs/features -name '*.md' \
  -not -name 'charter.md' -not -name '*.plan.md' -not -name '*.review.md' \
  -not -name '*-validation.md' -not -name '*.validate.md' \
  -not -name '*-research.md' -not -name '*-summary.md' -not -name '*-findings.md' \
  -not -name '.*' -not -name '*-template*' | while IFS= read -r f; do
  git mv "$f" "${f%.md}.spec.md"
done

# Rename live specs in cross-cutting/
find .context-index/specs/cross-cutting -name '*.md' \
  -not -name '*.plan.md' -not -name '*.review.md' \
  -not -name '*.validate.md' \
  -not -name '.*' | while IFS= read -r f; do
  git mv "$f" "${f%.md}.spec.md"
done
```

- [ ] **Verify renames**

Run: `find .context-index/specs/features .context-index/specs/cross-cutting -name '*.spec.md' | wc -l`
Expected: 132 (or current count)

Run: `git status --short | grep '^R' | wc -l`
Expected: all renames show as R (rename), not D+A (delete+add)

- [ ] **Commit**

```bash
git commit -m "refactor: rename live specs to .spec.md suffix (Task 1/7)"
```

---

### Task 2: Normalize validation reports to .validate.md [specialist: none]

**Charter capability:** Cross-cutting refactoring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Rename: 39 files matching `*-validation.md`

**Steps:**

- [ ] **Rename validation reports**

```bash
find .context-index/specs/features -name '*-validation.md' | while IFS= read -r f; do
  dir=$(dirname "$f")
  base=$(basename "$f" -validation.md)
  git mv "$f" "$dir/${base}.validate.md"
done
```

- [ ] **Verify renames**

Run: `find .context-index/specs -name '*-validation.md' | wc -l`
Expected: 0

Run: `find .context-index/specs -name '*.validate.md' | wc -l`
Expected: 42 (39 renamed + 3 existing)

- [ ] **Commit**

```bash
git commit -m "refactor: normalize validation reports to .validate.md suffix (Task 2/7)"
```

---

### Task 3: Update cross-references in plans and reviews [specialist: none]

**Charter capability:** Cross-cutting refactoring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Modify: ~55 plan files, ~104 review files, tasks.md

**Steps:**

- [ ] **Update spec references in plans**

For each `.plan.md` file, replace spec path references from `<name>.md` to `<name>.spec.md`:
```bash
find .context-index/specs -name '*.plan.md' -exec sed -i '' \
  's|/specs/features/\([^/]*/\)\([^.]*\)\.md|/specs/features/\1\2.spec.md|g' {} +
find .context-index/specs -name '*.plan.md' -exec sed -i '' \
  's|/specs/cross-cutting/\([^.]*\)\.md|/specs/cross-cutting/\1.spec.md|g' {} +
```

- [ ] **Update spec references in reviews**

Same pattern for `.review.md` files.

- [ ] **Update validation report references**

In any file referencing `-validation.md`, update to `.validate.md`:
```bash
find .context-index/specs -name '*.plan.md' -o -name '*.review.md' | \
  xargs sed -i '' 's|-validation\.md|.validate.md|g'
```

- [ ] **Update issue board spec paths**

In `.context-index/tasks/tasks.md`, update any Spec-Ref column paths.

- [ ] **Verify no broken references**

```bash
rg '\.context-index/specs/features/[^/]*/[^/]*[^.]\.md' .context-index/specs/ --glob '*.plan.md' --glob '*.review.md' | grep -v '.spec.md\|.plan.md\|.review.md\|.validate.md\|charter.md'
```
Expected: 0 matches (no old-style references remain)

- [ ] **Commit**

```bash
git commit -m "refactor: update cross-references in plans, reviews, and issue board (Task 3/7)"
```

---

### Task 4: Update source code spec path patterns [specialist: none]

**Charter capability:** Cross-cutting refactoring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/meta-tools.mjs:155-157`
- Modify: `lib/spec-drift.mjs:58,64`
- Modify: `lib/source-manifest.mjs:145`
- Modify: `lib/reality-check.mjs:288-321`
- Modify: `.context-index/constitution.md:42`
- Modify: `CLAUDE.md:43`

**Steps:**

- [ ] **Update lib/meta-tools.mjs**

Change the spec filter at lines 155-157:
```javascript
// Old: if (!file.endsWith('.md') || file === 'charter.md' || file.endsWith('.plan.md') || ...)
// New:
if (!file.endsWith('.spec.md')) continue;
```

- [ ] **Update lib/source-manifest.mjs**

Change the `.endsWith(".md")` filter at line 145 to `.endsWith(".spec.md")`.

- [ ] **Update lib/spec-drift.mjs**

Change `.endsWith(".md")` at line 58 to `.endsWith(".spec.md")`.
Update `.replace(/\.md$/, "")` at line 64 to `.replace(/\.spec\.md$/, "")`.

- [ ] **Update lib/reality-check.mjs**

Lines 288-289: Replace negative exclusion list with `if (!f.endsWith(".spec.md")) continue;`
Line 296: Update `.replace(/\.md$/, ".review.md")` to `.replace(/\.spec\.md$/, ".review.md")`
Lines 299, 321: Update `-validation.md` references to `.validate.md`
Line 88: Update `.replace(/\.md$/, ".plan.md")` to `.replace(/\.spec\.md$/, ".plan.md")`

- [ ] **Update constitution and CLAUDE.md**

Change `Spec: .context-index/specs/features/<module>/<spec-slug>.md` to `Spec: .context-index/specs/features/<module>/<spec-slug>.spec.md` in both files.

- [ ] **Run tests**

Run: `npm test`
Expected: 1669 pass, 0 fail

- [ ] **Commit**

```bash
git commit -m "refactor: update source code spec path patterns to .spec.md (Task 4/7)"
```

---

### Task 5: Update SKILL.md files and provider copies [specialist: none]

**Charter capability:** Cross-cutting refactoring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: skills/hygiene/SKILL.md, skills/status/SKILL.md, skills/specify/SKILL.md, skills/plan/SKILL.md, skills/implement/SKILL.md, skills/validate/SKILL.md, skills/review-specs/SKILL.md, skills/reconcile/SKILL.md, skills/build/SKILL.md, skills/debug/SKILL.md, skills/retro/SKILL.md, skills/plan/phase-mode.md, skills/build/phase-mode.md
- Modify: all matching files under providers/codex/skills/ and providers/opencode/skills/

**Steps:**

- [ ] **Replace negative exclusion lists with positive glob**

In all skills that currently use `(excluding charter.md, *.plan.md, *.review.md, *-validation.md, *.validate.md, *-research.md, *-summary.md, *-findings.md, CONSISTENCY-REVIEW.md)`:

Replace with: `(matching *.spec.md)`

- [ ] **Update spec output naming in specify SKILL.md**

Change output file naming from `<slug>.md` to `<slug>.spec.md`.

- [ ] **Update validation report naming in validate SKILL.md**

Change output from `<slug>-validation.md` to `<slug>.validate.md`.

- [ ] **Update spec path references in all skills**

Any hardcoded path like `.context-index/specs/features/<module>/<name>.md` becomes `.spec.md`.

- [ ] **Mirror all changes to provider copies**

Apply identical changes to `providers/codex/skills/` and `providers/opencode/skills/`.

- [ ] **Commit**

```bash
git commit -m "refactor: update SKILL.md files to use *.spec.md positive matching (Task 5/7)"
```

---

### Task 6: Update templates [specialist: none]

**Charter capability:** Cross-cutting refactoring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `templates/live-spec-template.md` (rename to `templates/live-spec-template.spec.md` or update internal references)
- Modify: `templates/refactoring-spec-template.md` (same)
- Modify: `templates/manifest-template.yaml` (update any spec path examples)

**Steps:**

- [ ] **Update spec path examples in templates**

Change any example paths referencing `<name>.md` to `<name>.spec.md`.

- [ ] **Update validation report examples**

Change any example paths referencing `<name>-validation.md` to `<name>.validate.md`.

- [ ] **Commit**

```bash
git commit -m "refactor: update templates with .spec.md naming convention (Task 6/7)"
```

---

### Task 7: Verification and cleanup [specialist: none]

**Charter capability:** Cross-cutting refactoring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 4, Task 5, Task 6

**Steps:**

- [ ] **Run full test suite**

Run: `npm test`
Expected: 1669 pass, 0 fail

- [ ] **Verify no old-style spec references remain**

```bash
# Should find ZERO matches of bare .md spec paths (not .spec.md, .plan.md, .review.md, .validate.md, charter.md)
rg '\.context-index/specs/features/[^/]*/[^/]*[^.]\.md' \
  --glob '!node_modules/**' --glob '!.claude/**' --glob '!package-lock.json' \
  . | grep -v '.spec.md\|.plan.md\|.review.md\|.validate.md\|charter.md\|-research.md\|-summary.md\|-findings.md'
```
Expected: 0 matches

- [ ] **Verify git mv integrity**

```bash
git status --short | grep -v '^R' | grep -v '^\?' | grep -v '^ M'
```
Expected: no unexpected D (delete) entries without matching renames

- [ ] **Verify positive matching works**

```bash
find .context-index/specs -name '*.spec.md' | wc -l
```
Expected: 132

- [ ] **Final commit**

```bash
git commit -m "refactor: verify spec suffix migration complete (Task 7/7)"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied
- [ ] No broken spec path references (verified by grep in Task 7)
- [ ] Git history shows only renames (verified in Task 7)
