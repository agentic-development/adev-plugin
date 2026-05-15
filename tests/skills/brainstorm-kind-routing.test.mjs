import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "brainstorm", "SKILL.md");

describe("adev:brainstorm SKILL.md — kind routing (Step 2 Clarify)", () => {
  let content;

  before(() => {
    assert.ok(existsSync(SKILL_PATH), "skills/brainstorm/SKILL.md must exist");
    content = readFileSync(SKILL_PATH, "utf8");
  });

  it("SKILL.md documents the --kind flag in the Arguments section", () => {
    assert.ok(
      content.includes("`--kind"),
      "Must document --kind flag in Arguments"
    );
    // Must reference the valid kinds (CHARTER_KINDS) or the list of 4 charter kinds.
    assert.ok(
      content.includes("CHARTER_KINDS") ||
        (content.includes("module") &&
          content.includes("feature") &&
          content.includes("cross-cutting") &&
          content.includes("initiative")),
      "Must reference the four charter kinds: module, feature, cross-cutting, initiative"
    );
  });

  it("SKILL.md inserts kind prompt in Step 2 (Clarify) before approach selection", () => {
    // The kind prompt heading or text must appear within Step 2 (Clarify),
    // i.e. between '## Step 2: Clarify' and '## Step 3:'
    const step2Idx = content.indexOf("## Step 2: Clarify");
    const step3Idx = content.indexOf("## Step 3");
    assert.ok(step2Idx !== -1, "Step 2 (Clarify) must exist");
    assert.ok(step3Idx !== -1, "Step 3 must exist");
    assert.ok(step2Idx < step3Idx, "Step 2 must precede Step 3");

    const step2Block = content.slice(step2Idx, step3Idx);
    assert.ok(
      step2Block.includes("kind") || step2Block.includes("Kind"),
      "Step 2 must reference kind"
    );
    assert.ok(
      step2Block.includes("What kind of charter is this") ||
        step2Block.includes("kind of charter"),
      "Step 2 must contain the ask-first kind prompt"
    );
  });

  it("SKILL.md ask-first kind prompt lists all 4 charter kinds with one-line descriptions", () => {
    // The prompt block should describe each kind succinctly.
    assert.ok(
      content.includes("feature") && content.includes("discrete capability"),
      "Must describe kind: feature in the prompt"
    );
    assert.ok(
      content.includes("module") &&
        (content.includes("manifest.yaml") ||
          content.includes("lifecycle-slot")),
      "Must describe kind: module referencing manifest.yaml or lifecycle slot"
    );
    assert.ok(
      content.includes("cross-cutting") &&
        content.includes("specs/cross-cutting"),
      "Must describe kind: cross-cutting referencing specs/cross-cutting/"
    );
    assert.ok(
      content.includes("initiative") &&
        (content.includes("time-bounded") || content.includes("migration")),
      "Must describe kind: initiative referencing time-bounded effort"
    );
  });

  it("SKILL.md validates kind via isValidKind('charter', kind) — strict on write", () => {
    assert.ok(
      content.includes("isValidKind") && content.includes("'charter'"),
      "Must reference isValidKind('charter', kind) validation"
    );
    assert.ok(
      content.includes("re-prompt") ||
        content.includes("Re-prompt") ||
        content.includes("re-prompting"),
      "Must describe re-prompt behavior on invalid/missing kind"
    );
    assert.ok(
      content.includes("No defaulting on write") ||
        content.includes("no defaulting on write") ||
        content.includes("No silent defaulting") ||
        content.includes("no silent defaulting"),
      "Must state no silent defaulting on write"
    );
  });

  it("SKILL.md documents that kind shapes subsequent clarifying questions", () => {
    // The plan says: kind shapes subsequent clarifying questions, e.g.,
    // cross-cutting skips Domain Model.
    assert.ok(
      content.includes("kind: cross-cutting") ||
        content.includes("cross-cutting"),
      "Must reference how cross-cutting affects subsequent questions"
    );
    assert.ok(
      content.includes("Domain Model") || content.includes("section structure"),
      "Must reference how kind affects later sections (e.g., Domain Model)"
    );
  });
});

describe("adev:brainstorm SKILL.md — cross-cutting path policy (Task 2)", () => {
  let content;

  before(() => {
    content = readFileSync(SKILL_PATH, "utf8");
  });

  it("SKILL.md saves kind: cross-cutting charters to specs/cross-cutting/<slug>/charter.md", () => {
    assert.ok(
      content.includes("specs/cross-cutting/"),
      "Must reference the specs/cross-cutting/ save path"
    );
    // The Step 5 Write Charter section should describe path branching by kind.
    const step5Idx = content.indexOf("## Step 5: Write Charter");
    const step5bIdx = content.indexOf("## Step 5b");
    assert.ok(step5Idx !== -1, "Step 5: Write Charter must exist");
    assert.ok(step5bIdx !== -1, "Step 5b must exist");
    const step5Block = content.slice(step5Idx, step5bIdx);
    assert.ok(
      step5Block.includes("cross-cutting"),
      "Step 5 must branch on kind: cross-cutting for save path"
    );
  });

  it("SKILL.md prompts user before creating cross-cutting/ directory if missing", () => {
    // Spec SA-9: prompt user before creating cross-cutting/ parent directory.
    assert.ok(
      content.includes("specs/cross-cutting/") &&
        (content.includes("prompt") ||
          content.includes("Prompt") ||
          content.includes("ask")),
      "Must prompt or ask before creating cross-cutting/ directory"
    );
  });

  it("SKILL.md warns when kind: module has no matching manifest.yaml entry", () => {
    assert.ok(
      content.includes("manifest.yaml") && content.includes("kind: module"),
      "Must cross-reference kind: module against manifest.yaml"
    );
    assert.ok(
      content.includes("Module charters typically correspond to a manifest entry") ||
        content.includes("Module charters typically correspond"),
      "Must include the non-blocking warning text"
    );
    assert.ok(
      content.includes("non-blocking") ||
        content.includes("Warn") ||
        content.includes("warn"),
      "Must describe the warning as non-blocking"
    );
  });

  it("SKILL.md replaces hardcoded charter-template path with resolveTemplate('charter', kind, domain)", () => {
    assert.ok(
      content.includes("resolveTemplate") &&
        content.includes("'charter'"),
      "Must reference resolveTemplate('charter', kind, domain) call"
    );
    assert.ok(
      content.includes("template-resolution.mjs"),
      "Must import resolveTemplate from lib/template-resolution.mjs"
    );
  });
});

describe("adev:brainstorm — kind enumeration + template resolution sanity", () => {
  it("CHARTER_KINDS exports the 4 expected kinds in order", async () => {
    const mod = await import(join(PLUGIN_ROOT, "lib", "kinds.mjs"));
    assert.deepEqual(
      [...mod.CHARTER_KINDS],
      ["module", "feature", "cross-cutting", "initiative"],
      "CHARTER_KINDS must list module, feature, cross-cutting, initiative in order"
    );
  });

  it("isValidKind('charter', 'feature') is true; 'invalid' is false", async () => {
    const { isValidKind } = await import(
      join(PLUGIN_ROOT, "lib", "kinds.mjs")
    );
    for (const k of ["module", "feature", "cross-cutting", "initiative"]) {
      assert.equal(
        isValidKind("charter", k),
        true,
        `isValidKind('charter', '${k}') must be true`
      );
    }
    assert.equal(
      isValidKind("charter", "invalid-kind"),
      false,
      "Unknown kinds must fail validation"
    );
    assert.equal(
      isValidKind("charter", ""),
      false,
      "Empty string must fail validation"
    );
  });

  it("resolveTemplate('charter', kind, null) resolves each charter kind to a bundled template", async () => {
    const { resolveTemplate } = await import(
      join(PLUGIN_ROOT, "lib", "template-resolution.mjs")
    );
    for (const kind of ["module", "feature", "cross-cutting", "initiative"]) {
      const path = await resolveTemplate("charter", kind, null);
      assert.ok(
        path.endsWith(`charter-template.${kind}.md`),
        `resolveTemplate('charter', '${kind}', null) must end with charter-template.${kind}.md (got: ${path})`
      );
      assert.ok(
        existsSync(path),
        `Resolved template path for kind '${kind}' must exist on disk`
      );
    }
  });

  it("resolveTemplate('charter', 'bogus', null) throws INVALID_KIND", async () => {
    const { resolveTemplate } = await import(
      join(PLUGIN_ROOT, "lib", "template-resolution.mjs")
    );
    await assert.rejects(
      () => resolveTemplate("charter", "bogus", null),
      (err) => err.code === "INVALID_KIND",
      "Invalid charter kind must throw INVALID_KIND"
    );
  });
});
