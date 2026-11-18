## Code Quality Review Checklist

The code quality reviewer checks:

- Single responsibility per file, well-defined interfaces
- Test quality: tests verify real behavior, not mock behavior
- Test integrity: no loosened assertions, no conditional skips, no try/catch swallowing failures, no assertions against unseeded runtime data. Compare test assertions against spec requirements — if the assertion is weaker than the requirement, flag it. If any test was changed to fix a failure, verify the fix was grounded in spec/charter context, not just "make it green."
- Tests match the implementation mode named in the dispatch (`Implementation mode: <mode>`):
  - `tdd`: test files exist, tests are meaningful, and there is test-first evidence.
  - `test-required`: tests exist that cover the behavior this task adds or changes, with every addressed acceptance criterion asserted. Missing coverage is an Important finding: it is the mode's post-implementation coverage check. Test order is not a finding.
  - `agent-default`: no test requirement. If the task added or changed tests, they are meaningful (assert real behavior, no gaming patterns). A missing test is a finding only when the change is clearly unsafe without one, and then at most Minor.
- Naming, readability, maintainability
- Adherence to constitutional coding standards
- No unnecessary complexity (YAGNI)
- File sizes: did this task create large files or significantly grow existing ones?
