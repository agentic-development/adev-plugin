/**
 * Static content-presence tests for infrastructure preflight integration
 * across 7 SKILL.md files.
 *
 * Pattern: tests/skills/specify-feature-binding.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

function readSkill(name) {
  return readFileSync(join(PLUGIN_ROOT, "skills", name, "SKILL.md"), "utf8");
}

// ---------------------------------------------------------------------------
// implement
// ---------------------------------------------------------------------------

describe("implement SKILL.md — infrastructure preflight", () => {
  const c = readSkill("implement");

  it("documents --no-infra in Arguments section", () => {
    assert.ok(c.includes("--no-infra"), "must document --no-infra");
  });

  it("contains Infrastructure Preflight step", () => {
    assert.ok(
      c.includes("Infrastructure Preflight"),
      "must contain Infrastructure Preflight step"
    );
  });

  it("preflight step is after Load Context and before task execution", () => {
    const loadCtx = c.indexOf("Load Context");
    const preflight = c.indexOf("Infrastructure Preflight");
    assert.ok(loadCtx < preflight, "preflight must be after Load Context");
  });

  it("includes --task N option in blocking message", () => {
    assert.ok(
      c.includes("--task N") || c.includes("--task <N>"),
      "must include --task N option for mixed strategies"
    );
  });

  it("includes agent prohibition instruction", () => {
    assert.ok(
      c.includes("agent must never set") || c.includes("must never set"),
      "must include agent-prohibition instruction"
    );
  });

  it("sets ADEV_DISPATCHED_BY for write-test dispatch", () => {
    assert.ok(
      c.includes("ADEV_DISPATCHED_BY"),
      "must set ADEV_DISPATCHED_BY when dispatching write-test"
    );
  });

  it("includes runPreflight invocation pattern", () => {
    assert.ok(
      c.includes("runPreflight") && c.includes("infra-preflight.mjs"),
      "must include runPreflight invocation"
    );
  });
});

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

describe("validate SKILL.md — infrastructure preflight", () => {
  const c = readSkill("validate");

  it("documents --no-infra in Arguments", () => {
    assert.ok(c.includes("--no-infra"), "must document --no-infra");
  });

  it("contains Infrastructure preflight section", () => {
    assert.ok(
      c.includes("Infrastructure Verification") ||
        c.includes("Infrastructure Preflight"),
      "must contain preflight section"
    );
  });

  it("preflight is before Load Check Registry", () => {
    const preflight = c.indexOf("Infrastructure Verification") !== -1
      ? c.indexOf("Infrastructure Verification")
      : c.indexOf("Infrastructure Preflight");
    const checkRegistry = c.indexOf("Load Check Registry");
    assert.ok(preflight !== -1, "preflight section must exist");
    assert.ok(checkRegistry !== -1, "Load Check Registry must exist");
    assert.ok(preflight < checkRegistry, "preflight must be before Load Check Registry");
  });

  it("includes agent prohibition instruction", () => {
    assert.ok(
      c.includes("agent must never set") || c.includes("must never set"),
      "must include agent-prohibition instruction"
    );
  });
});

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

describe("build SKILL.md — infrastructure preflight", () => {
  const c = readSkill("build");

  it("documents --no-infra in Arguments", () => {
    assert.ok(c.includes("--no-infra"), "must document --no-infra");
  });

  it("propagates via ADEV_NO_INFRA", () => {
    assert.ok(
      c.includes("ADEV_NO_INFRA"),
      "must propagate --no-infra via ADEV_NO_INFRA env var"
    );
  });

  it("does NOT contain its own preflight step", () => {
    // Build should NOT have a separate preflight section with runPreflight
    // It delegates to sub-skills
    const hasOwnPreflight =
      c.includes("runPreflight") && c.includes("node --input-type=module");
    assert.ok(
      !hasOwnPreflight,
      "build must NOT have its own preflight invocation"
    );
  });
});

// ---------------------------------------------------------------------------
// write-test
// ---------------------------------------------------------------------------

describe("write-test SKILL.md — infrastructure preflight", () => {
  const c = readSkill("write-test");

  it("documents --no-infra", () => {
    assert.ok(c.includes("--no-infra"), "must document --no-infra");
  });

  it("contains preflight step", () => {
    assert.ok(
      c.includes("Infrastructure Preflight"),
      "must contain Infrastructure Preflight step"
    );
  });

  it("includes dispatch detection via ADEV_DISPATCHED_BY", () => {
    assert.ok(
      c.includes("ADEV_DISPATCHED_BY"),
      "must check ADEV_DISPATCHED_BY for dispatch detection"
    );
  });

  it("includes strategy-aware skip for unit strategy", () => {
    assert.ok(
      c.includes("unit") && c.includes("skip"),
      "must skip preflight for unit strategy"
    );
  });
});

// ---------------------------------------------------------------------------
// debug
// ---------------------------------------------------------------------------

describe("debug SKILL.md — infrastructure preflight", () => {
  const c = readSkill("debug");

  it("documents --no-infra in Arguments", () => {
    assert.ok(c.includes("--no-infra"), "must document --no-infra");
  });

  it("contains preflight step", () => {
    assert.ok(
      c.includes("Infrastructure Preflight"),
      "must contain Infrastructure Preflight step"
    );
  });

  it("includes three-tier resolution", () => {
    assert.ok(
      c.includes("tier") || (c.includes("Arguments") && c.includes("Active plan") && c.includes("Inference")),
      "must include three-tier resolution (arguments, active plan, inference)"
    );
  });

  it("includes non-blocking advisory for inferred context", () => {
    assert.ok(
      c.includes("Waiting for user direction") || c.includes("advisory") || c.includes("non-blocking"),
      "must include non-blocking advisory for inferred infra_requirements"
    );
  });

  it("includes agent prohibition instruction", () => {
    assert.ok(
      c.includes("agent must never set") || c.includes("must never set"),
      "must include agent-prohibition instruction"
    );
  });
});

// ---------------------------------------------------------------------------
// eval
// ---------------------------------------------------------------------------

describe("eval SKILL.md — infrastructure preflight", () => {
  const c = readSkill("eval");

  it("documents --no-infra in Arguments", () => {
    assert.ok(c.includes("--no-infra"), "must document --no-infra");
  });

  it("contains preflight section", () => {
    assert.ok(
      c.includes("Infrastructure Verification") ||
        c.includes("Infrastructure Preflight"),
      "must contain preflight section"
    );
  });

  it("includes layer-aware skip", () => {
    assert.ok(
      c.includes("--layer 1") || c.includes("layer 1"),
      "must reference layer-aware skip for layers 1 and 2"
    );
  });
});

// ---------------------------------------------------------------------------
// recover
// ---------------------------------------------------------------------------

describe("recover SKILL.md — infrastructure preflight", () => {
  const c = readSkill("recover");

  it("documents --no-infra in Arguments", () => {
    assert.ok(c.includes("--no-infra"), "must document --no-infra");
  });

  it("contains preflight step", () => {
    assert.ok(
      c.includes("Infrastructure Preflight"),
      "must contain Infrastructure Preflight step"
    );
  });

  it("includes corrective context injection for infra root causes", () => {
    assert.ok(
      c.includes("formatPreflightReport") || c.includes("corrective context"),
      "must include formatted preflight report in corrective context"
    );
  });

  it("includes agent prohibition instruction", () => {
    assert.ok(
      c.includes("agent must never set") || c.includes("must never set"),
      "must include agent-prohibition instruction"
    );
  });
});
