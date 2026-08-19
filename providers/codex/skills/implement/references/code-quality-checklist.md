## Code Quality Review Checklist

The code quality reviewer checks:

- Single responsibility per file, well-defined interfaces
- Test quality: tests verify real behavior, not mock behavior
- Test integrity: no loosened assertions, no conditional skips, no try/catch swallowing failures, no assertions against unseeded runtime data. Compare test assertions against spec requirements — if the assertion is weaker than the requirement, flag it. If any test was changed to fix a failure, verify the fix was grounded in spec/charter context, not just "make it green."
- TDD was followed: test files exist, tests are meaningful, test-first evidence
- Naming, readability, maintainability
- Adherence to constitutional coding standards
- No unnecessary complexity (YAGNI)
- File sizes: did this task create large files or significantly grow existing ones?
