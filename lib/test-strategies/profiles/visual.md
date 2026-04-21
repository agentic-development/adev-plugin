---
strategy_id: visual
red_exit_condition: "Screenshot diff exits non-zero because the component does not match the approved baseline or no baseline exists yet"
green_exit_condition: "Zero visual diffs from the approved baseline — all component states match within the configured pixel threshold"
gaming_blockers:
  - "Pixel diff threshold set too high — ignoring real visual regressions"
  - "Approving all visual diffs without individual review — rubber-stamping baselines"
  - "Stories/tests that only render the default state — missing error, loading, empty, and edge states"
  - "Snapshot tests that serialize DOM structure without actual screenshot comparison"
  - "Tests without responsive breakpoint coverage when the component is responsive"
assertion_rules: "Each component must have tests for at least default state plus one error or edge state. Pixel diff threshold must be specific and justified — not a blanket tolerance. Responsive breakpoints must be covered when applicable."
seed_data_rule: "Component props/fixtures with deterministic data — no random avatars, timestamps, or auto-generated IDs that change between runs. Mock data for API-dependent components. Consistent fonts and rendering environment."
handoff_format: "Story/test file paths + baseline screenshot paths (or 'new baseline' note) + component prop fixtures + visual diff tool and threshold config + list of states captured"
permitted_tools:
  - "Chromatic"
  - "Percy"
  - "Playwright toHaveScreenshot()"
  - "Loki"
  - "Applitools"
  - "Storybook interaction tests"
  - "BackstopJS"
  - "reg-suit"
---

# Visual Strategy Profile

Visual regression testing profile for UI components. Verifies component appearance through screenshot comparison against approved baselines across multiple states.
