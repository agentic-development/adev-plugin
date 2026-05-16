# Check 11: Visual Verification (UI projects)

**Trigger:** If any file touched by the implementation matches UI patterns (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `components/**`, `app/**/page.*`, `app/**/layout.*`, `pages/**`).

**Playwright MCP required.** Check for the Playwright MCP browser tools (`browser_navigate`, `browser_snapshot`). If they are not available, **BLOCK validation** and tell the user:

```
BLOCKED: This implementation includes UI files but no browser verification tool is available.

Install the Playwright MCP server so the agent can visually verify UI work:
  npm install -g @anthropic/mcp-playwright

Then add it to your Claude Code MCP config and restart.

Without visual verification, UI implementations cannot be fully validated.
```

Do not record SKIP. Do not proceed without it. UI code without visual verification is unvalidated code.

**If Playwright is available:**

1. **Dev server.** Ensure the dev server is running. If not, start it. Wait for it to be ready.
2. **Visual Expectations check.** If the spec has a `## Visual Expectations` section, verify each expectation:
   - Navigate to the relevant route.
   - Take a browser snapshot.
   - Verify each visual expectation against the snapshot.
   - Record PASS or FAIL per expectation with a description of what was seen.
3. **Responsive check.** Test at three breakpoints:
   - Mobile: 375px width
   - Tablet: 768px width
   - Desktop: 1280px width
   If the spec mentions specific responsive behavior, verify it. Otherwise, verify no layout breakage (overlapping elements, horizontal scroll, invisible content).
4. **Baseline check (no Visual Expectations).** If the spec has no Visual Expectations section, still verify the minimum:
   - Page loads without blank screen or error page.
   - Key elements from acceptance criteria are visible on screen.
   - No console errors (use browser console messages tool if available).
5. **Dark mode.** If the project uses dark mode (check for `dark:` classes in CSS or `darkMode` config), toggle and verify no contrast or visibility issues.

Record per visual expectation: PASS or FAIL with description.
Overall: PASS if all expectations met, FAIL if any expectation fails or if page does not load.
