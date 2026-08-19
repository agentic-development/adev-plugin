import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("plan SKILL.md — infrastructure requirements section (Behaviors 1-4, 7)", () => {
  it("describes ## Test Infrastructure Requirements section emission", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("Test Infrastructure Requirements"),
      "Must reference the ## Test Infrastructure Requirements section"
    );
  });

  it("triggers section on infra_requirements: frontmatter presence OR non-unit strategy", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("infra_requirements") && (c.includes("non-unit") || c.includes("unit strategy")),
      "Trigger must be based on frontmatter presence OR non-unit strategy"
    );
  });

  it("documents PLAN_INFRA_UNKNOWN advisory", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("PLAN_INFRA_UNKNOWN"),
      "Must document PLAN_INFRA_UNKNOWN advisory code"
    );
  });

  it("section is non-blocking — plan completes even when infra unresolved", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("PLAN_INFRA_UNKNOWN") &&
        (c.includes("non-blocking") || c.includes("does not block") || c.includes("Unresolved Requirements")),
      "Must document non-blocking behavior for unresolved infra"
    );
  });

  it("strategy summary includes infrastructure column (amends plan-integration Behavior 4)", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("infrastructure") && c.includes("Strategy Summary"),
      "Strategy Summary must include infrastructure column"
    );
  });

  it("section format specifies External Systems, Credentials, Pre-Provisioned State, CI Configuration", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(c.includes("External Systems"), "Must include External Systems subsection");
    assert.ok(c.includes("Credentials") || c.includes("Environment Variables"), "Must include Credentials subsection");
    assert.ok(c.includes("Pre-Provisioned State") || c.includes("Pre-provisioned"), "Must include Pre-Provisioned State subsection");
    assert.ok(c.includes("CI Configuration") || c.includes("ci_tag"), "Must include CI Configuration guidance");
  });

  it("documents the security invariant: no actual credential values in plan output", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("env var") && (c.includes("names only") || c.includes("MUST NOT") || c.includes("no actual")),
      "Must document security invariant: env var names only"
    );
  });

  it("documents low-confidence auto-detection advisory", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("low confidence") || c.includes("low-confidence") || c.includes("confidence"),
      "Must document low-confidence auto-detection advisory"
    );
    assert.ok(
      c.includes("advisory") || c.includes("review and confirm") || c.includes("⚠"),
      "Must indicate advisory/warning is emitted for low-confidence detection"
    );
  });

  it("documents that spec frontmatter infra_requirements: takes precedence over auto-detection", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("infra_requirements") && (
        c.includes("authoritative") ||
        c.includes("takes precedence") ||
        c.includes("skip auto-detection") ||
        c.includes("skip step 3")
      ),
      "Must document that spec frontmatter is authoritative over auto-detection"
    );
  });

  it("plan-reviewer-prompt.md includes infrastructure requirements completeness check", async () => {
    const c = await readFile("skills/plan/references/plan-reviewer-prompt.md", "utf8");
    assert.ok(
      c.includes("Infrastructure") || c.includes("infra"),
      "plan-reviewer-prompt must include an infrastructure requirements check"
    );
    assert.ok(
      c.includes("infra_requirements") || c.includes("Test Infrastructure Requirements"),
      "Must reference the infra_requirements field or Test Infrastructure Requirements section"
    );
  });
});
