---
charter: test-strategies
charter-extension: true
status: validated
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
---

# Live Spec: Visual Strategy Profile

## Capability

The **visual** test strategy profile governs visual regression testing with screenshot comparison for UI components. It defines the RED/GREEN contract, test authoring rules, anti-patterns, assertion constraints, seed data requirements, and handoff expectations for any project using screenshot-based quality gates.

This profile is loaded when a project's test strategy configuration includes `visual` as a registered strategy. The adev framework routes test writing and validation tasks through these rules when the visual profile is active.

## Behavioral Contract

### Preconditions

- A browser runtime (Playwright, Puppeteer, or equivalent) is available in the test environment.
- Component prop fixtures exist or can be derived; all fixture data is deterministic (no random avatars, timestamps, or IDs that change between runs).
- A baseline screenshot store exists or this is the first run (new baseline case).
- The project has specified which visual states are required for each component (at minimum: default + one error/edge state).
- Cross-browser and responsive breakpoint requirements are documented in the project manifest when applicable.

### Behaviors

**1. RED/GREEN definition**

- RED: a screenshot diff exits non-zero because the component does not match the approved baseline, or no baseline exists and this is treated as a new comparison that must be approved before GREEN is declared.
- GREEN: zero visual diffs from the approved baseline across all required states and breakpoints.

**2. Test authoring**

Write Storybook stories or Playwright screenshot tests for each required visual state before building the component. Required states per component: default, hover, error, loading, mobile (add further states when documented in project requirements). Each story or test captures the component in isolation.

Order of operations:
1. Author prop fixtures with deterministic data.
2. Write stories/tests for each required state — these will fail or produce no baseline (RED).
3. Build the component.
4. Run the visual test suite and approve correct baselines.
5. Confirm zero diffs (GREEN).

**3. Gaming patterns (prohibited)**

The following patterns are explicitly prohibited and will cause `/adev:validate` to block the PR:

- Setting pixel diff threshold so high that real regressions are silently ignored.
- Approving all diffs without individual review (rubber-stamping baselines).
- Writing stories or tests that render only the default state, omitting error, loading, and edge states.
- Using snapshot tests without meaningful visual assertions (e.g., serializing a DOM tree with no screenshot).

**4. Assertion rules**

- Each component must have stories or tests covering at minimum: default state + at least one error or edge state.
- Pixel diff threshold must be specific and justified in a comment or project config — a blanket tolerance (e.g., `threshold: 0.99`) without rationale is prohibited.
- Cross-browser testing is required when the project manifest specifies browser targets beyond a single engine.
- Responsive breakpoints must be covered when the project defines multiple viewport sizes.

**5. Seed data**

- All component prop fixtures must use deterministic values: static names, fixed dates, sequential IDs.
- API-dependent components must use mock data (MSW handlers, fixture files, or Storybook decorators).
- No live network calls during visual test runs.

**6. Handoff**

When handing off a completed visual test cycle, provide:

- Story or test file paths for all components covered.
- Baseline screenshot paths, or a note that this is a new baseline awaiting approval.
- Component prop fixture locations.
- Visual diff tool name and threshold configuration (value + justification).
- Explicit list of visual states captured per component.

**7. RED verification**

The screenshot test must fail because the component does not render correctly or does not exist yet. RED caused by the following is not a valid RED and must be fixed before the cycle continues:

- Font loading failures (pre-load fonts or use system fonts in test env).
- Network timeouts (mock all network dependencies).
- Environment rendering differences introduced by OS or CI image inconsistencies.

### Error Cases

| Code | Trigger | Behavior |
|---|---|---|
| `VISUAL_NO_BROWSER` | Browser binary not found | Advisory: "Visual tests require a browser — ensure Playwright/Puppeteer is installed." Do not block; surface as a setup warning. |
| `VISUAL_NEW_BASELINE` | Baseline screenshot not found | Proceed as first run. Generate screenshots, mark as pending approval. Do not fail the authoring step. |
| `VISUAL_ENV_DIFF` | Rendering differs across environments (font, OS, GPU) | Warn: "Rendering differences detected — pin font stack and OS image, or use a containerized test environment." |

## Constitution Reference

This spec operates under the adev constitution constraints:

- Tests are written before the implementation is complete (RED first).
- GREEN must be achieved through correct implementation, not by weakening assertions.
- Handoff artifacts are required before a cycle is considered done.
- Anti-patterns listed above constitute violations of the test-integrity principle.

See `.context-index/constitution.md` for the full constraint set.

## Actionable Task Map

| Phase | Task |
|---|---|
| Specify | Document required visual states and breakpoints per component in the task ticket. |
| Plan | Enumerate prop fixtures; identify API dependencies to mock; list browser/viewport targets. |
| Write-test | Author stories/Playwright tests for each required state using deterministic fixtures. Confirm RED. |
| Implement | Build the component until all screenshot tests produce zero diffs. |
| Validate | Run full visual suite; confirm no prohibited gaming patterns; verify threshold is justified; check all required states are present. |
| Handoff | Deliver file paths, baseline locations, fixture locations, tool config, and state list. |

## Acceptance Criteria

- [ ] Each component under visual testing has stories or tests for at minimum default + one error/edge state.
- [ ] Pixel diff threshold is explicitly set and accompanied by a justification comment or config note.
- [ ] All fixture data is deterministic (no random values).
- [ ] API-dependent components use mocked data exclusively during visual runs.
- [ ] RED is confirmed before implementation begins and is caused by a rendering failure, not an environment issue.
- [ ] GREEN is confirmed with zero diffs against approved baselines.
- [ ] Cross-browser tests are present when the project manifest lists multiple browser targets.
- [ ] Responsive breakpoints are covered when the project defines multiple viewport sizes.
- [ ] Handoff artifacts are complete: file paths, baseline paths, fixture locations, tool config, state list.
- [ ] No prohibited gaming patterns are present in the test suite.

## Permitted Tools

Chromatic, Percy, Playwright `toHaveScreenshot()`, Loki, Applitools, Storybook interaction tests, BackstopJS.
