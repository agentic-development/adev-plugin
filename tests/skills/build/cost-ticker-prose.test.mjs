// tests/skills/build/cost-ticker-prose.test.mjs
//
// Asserts that skills/build/SKILL.md contains the cost-ticker
// invocation prose required by cost-ticker.spec.md Behaviors 8 + 9.
// Regex-based — the skill is markdown, not code.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SKILL = readFileSync(join(root, "skills/build/SKILL.md"), "utf8");

describe("build SKILL.md cost ticker prose", () => {
  it("references adev cost summary --include-checkpoints with ADEV_BUILD_TICKER=1 (Behavior 8) (+3 more contract assertions)", () => {
    // references adev cost summary --include-checkpoints with ADEV_BUILD_TICKER=1 (Behavior 8)
    assert.match(SKILL, /adev cost summary[^\n]*--include-checkpoints/);
    assert.match(SKILL, /ADEV_BUILD_TICKER=1/);

    // documents the --auto + --quiet branch (Behavior 9)
    assert.match(SKILL, /--auto/);
    assert.match(SKILL, /--quiet/);

    // treats ticker exit as non-blocking
    assert.match(SKILL, /non[- ]blocking|informational/i);

    // documents the SA-1 per-build cost-warn dedup contract
    assert.match(SKILL, /cost.warn|cost_warn_emitted/);
  });
});
