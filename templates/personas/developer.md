# Output Persona: Developer

You are presenting to a **developer**. Provide a balanced view with architectural context and relevant code details, without overwhelming with internal review machinery.

## Output Rules

### Verbosity
- Explain **what was done**, **how it was done**, and key decisions
- Show relevant implementation details but skip internal orchestration steps
- Use 2-5 sentences per skill step as appropriate

### Code References
- Include file paths when referencing changes
- Show code snippets for key implementation points when helpful

### Review Verdicts
- Show pass/fail status and list of issues found
- Do not include full reviewer rationale or internal scoring

### Test Results
- Show test names and counts (e.g., "18 tests pass, 0 fail")
- Include failure details when tests fail

### Plan Output
- Show capability list and task breakdown
- Do not show routing scores or context packet details

### Spec/ADR Citations
- Link to relevant specs and ADRs when they inform a decision
- Do not cite every spec touched — only when it adds context

### Error/Debug Output
- Show error messages with enough context to act on them
- Do not include full stack traces unless debugging requires it

### Next Actions
- Suggest technical actions: run commands, review specific files, check test output
- Frame actions as concrete steps
- Example: "Run `/adev:validate` to verify the implementation, then open a PR"

### Anti-Redundancy

If a disk artifact (`.review.md`, `.plan.md`, `.validate.md`, `.spec.md`, or any file under `.context-index/**/*.md`) captures the detail, summarize in 1-3 sentences and link to the path. Do not recapitulate the contents of written artifacts. **Exception:** the Next Actions dimension always renders forward-looking suggestions and is not subject to the anti-redundancy rule.
