---
charter: session-awareness
status: validated
risk_level: low
milestone: 1
revision: 1
charter-revision: 2
created: 2026-04-06
updated: 2026-04-06
source-manifest:
  sha: "f078dad"
  files:
    - templates/manifest-template.yaml
    - tests/templates/manifest-template.test.mjs
  computed-at: "2026-04-12T11:47:08.344Z"
drift_detected: true
---

# Live Spec: Configurable Reminder Interval

## Behavioral Contract

### Preconditions

- `.context-index/manifest.yaml` exists and is readable
- The Issue Reminder Hook (see `issue-reminder-hook.md`) is the consumer of this configuration

### Behaviors

1. **When** `tasks.reminder_interval` is set to a positive integer in `manifest.yaml` **then** the Issue Reminder Hook uses that value as the number of tool calls between reminders.

2. **When** `tasks.reminder_interval` is absent from `manifest.yaml` **then** the Issue Reminder Hook uses a default interval of 25 tool calls.

3. **When** `tasks.reminder_interval` is set to 0 **then** reminders are disabled entirely. The Issue Reminder Hook skips counter logic and exits silently. Git commit triggers are also disabled.

4. **When** `tasks.reminder_interval` is set to a negative number or non-integer value **then** the Issue Reminder Hook treats it as absent and uses the default (25).

5. **When** `/adev:init` scaffolds a new project **then** `templates/manifest.yaml` includes `reminder_interval: 25` under the `tasks:` section with an inline comment explaining the setting.

6. **When** `tasks.reminder_interval` is set to 1 **then** the reminder fires on every tool call (useful for debugging the reminder system).

### Postconditions

- The interval value is always a positive integer or 0 at the point of use (after validation/defaulting)
- Changing the interval in `manifest.yaml` takes effect on the next hook invocation (no restart needed)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `tasks.reminder_interval` absent | Default to 25 | (no error) |
| `tasks.reminder_interval` is 0 | Reminders disabled | (no error) |
| `tasks.reminder_interval` is negative | Default to 25 | (no error) |
| `tasks.reminder_interval` is non-numeric | Default to 25 | (no error) |
| `manifest.yaml` unreadable | Default to 25 | (no error) |

## Manifest Schema

```yaml
tasks:
  backend: file
  reminder_interval: 25  # Tool calls between issue reminders. 0 to disable. Default: 25.
```

## System Constitution Reference

- **Principle 1: "Minimize external dependencies"** — Configuration read is a simple YAML field parse using the existing manifest read pattern. No new dependencies.
- **Principle 2: "Skills are primarily markdown"** — This is a configuration contract, not executable logic. The Issue Reminder Hook reads it.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update manifest template | Add `reminder_interval: 25` with comment to `templates/manifest.yaml` | small |
| Add interval parsing to reminder hook | Read and validate `tasks.reminder_interval` from manifest in the hook script | small |
| Add tests | Verify default, explicit value, 0 (disabled), negative, non-numeric cases | small |

## Acceptance Criteria

- [ ] `tasks.reminder_interval` is read from manifest and used by the Issue Reminder Hook
- [ ] Default interval is 25 when not configured
- [ ] Setting interval to 0 disables all reminders
- [ ] Invalid values (negative, non-numeric) fall back to default
- [ ] `templates/manifest.yaml` includes `reminder_interval` with explanatory comment
- [ ] All quality gates pass (`npm test`)
- [ ] No new dependencies added
- [ ] No constitutional violations introduced
