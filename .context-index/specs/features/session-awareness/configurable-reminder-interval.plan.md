# Implementation Plan: Configurable Reminder Interval

> **Methodology:** adev
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Spec:** .context-index/specs/features/session-awareness/configurable-reminder-interval.md
> **Review:** PASS (2026-04-06)
> **Platform:** JavaScript ESM, Node.js, node:test

**Goal:** Add `tasks.reminder_interval` to the manifest template so new projects scaffold with the reminder interval configuration.

**Architecture:** This is a template-only change. The `reminder_interval` field is added to the `tasks:` section of `templates/manifest-template.yaml`. No runtime code changes — the Issue Reminder Hook (future spec) will consume this field. A test verifies the template contains the field.

---

## File Structure

**Modify:**
- `templates/manifest-template.yaml` — Add `reminder_interval: 25` with comment under `tasks:` section

**Create:**
- `tests/templates/manifest-template.test.mjs` — Verify template contains expected fields

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/session-awareness/configurable-reminder-interval.md` (Manifest Schema, Behaviors 1-5)
- Charter: `.context-index/specs/features/session-awareness/charter.md` (capability: Configurable Reminder Interval)

## Parallelization

- Single group (sequential): Task 1

---

### Task 1: Add reminder_interval to manifest template [specialist: none]

**Charter capability:** Configurable Reminder Interval
**Files:**
- Modify: `templates/manifest-template.yaml`
- Test: `tests/templates/manifest-template.test.mjs`

**Tests:** `tests/templates/manifest-template.test.mjs`

- [ ] **Write failing test**

```javascript
it("includes reminder_interval under tasks section", () => {
  const content = readFileSync(join(TEMPLATE_DIR, "manifest-template.yaml"), "utf8");
  assert.match(content, /reminder_interval:\s*25/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/templates/manifest-template.test.mjs`
Expected: FAIL — template does not contain `reminder_interval`

- [ ] **Implement**

Add `reminder_interval: 25` with an explanatory comment to the `tasks:` section of `templates/manifest-template.yaml`.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS

- [ ] **Commit**

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria satisfied
