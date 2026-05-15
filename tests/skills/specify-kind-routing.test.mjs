/**
 * Fixture-based test of the /adev:specify kind-routing decision logic.
 *
 * Validates that skills/specify/SKILL.md (and provider mirrors) document:
 *   1. The `--kind <kind>` argument and ask-first prompt
 *   2. Resolution via `resolveTemplate('spec', kind, domain)`
 *   3. Strict-on-write semantics (no defaulting)
 *   4. Workflow/kind orthogonality (no `--mode` flag introduced)
 *
 * Also exercises the supporting library invariants directly:
 *   - `isValidKind('spec', 'unknown')` rejection
 *   - `resolveTemplate('spec', 'action', null)` resolves to the bundled
 *     `templates/spec-template.action.md`
 *   - `--extract --kind artifact` argument orthogonality survives parsing
 *
 * @see .context-index/specs/features/lifecycle-artifacts/specify-kind-routing.spec.md
 * @see .context-index/specs/features/lifecycle-artifacts/specify-kind-routing.plan.md
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT } from "../helpers.mjs";
import { isValidKind, SPEC_KINDS } from "../../lib/kinds.mjs";
import { resolveTemplate } from "../../lib/template-resolution.mjs";

const PRIMARY_SKILL = join(PLUGIN_ROOT, "skills", "specify", "SKILL.md");
const CODEX_SKILL = join(
  PLUGIN_ROOT,
  "providers",
  "codex",
  "skills",
  "specify",
  "SKILL.md",
);
const OPENCODE_SKILL = join(
  PLUGIN_ROOT,
  "providers",
  "opencode",
  "skills",
  "specify",
  "SKILL.md",
);

/**
 * Read a SKILL.md and return its content. Throws if the file does not exist —
 * the primary skill is mandatory; provider mirrors are required when they
 * already exist on disk (the plan explicitly enumerates them).
 */
function readSkill(path) {
  assert.ok(existsSync(path), `${path} must exist`);
  return readFileSync(path, "utf8");
}

describe("adev:specify SKILL.md — kind routing (Task 1)", () => {
  it("documents the --kind <kind> argument in the Arguments table", () => {
    const c = readSkill(PRIMARY_SKILL);
    assert.ok(
      c.includes("`--kind <kind>`") || c.includes("--kind <kind>"),
      "Must declare --kind <kind> in arguments",
    );
  });

  it("references the closed enumeration of 6 spec kinds", () => {
    const c = readSkill(PRIMARY_SKILL);
    for (const kind of SPEC_KINDS) {
      assert.ok(
        c.includes(kind),
        `Arguments / ask-first prompt must mention kind "${kind}"`,
      );
    }
  });

  it("introduces Step 3.5 (Resolve Kind) between Step 3 and Step 4", () => {
    const c = readSkill(PRIMARY_SKILL);
    const step3 = c.indexOf("### Step 3:");
    const step35 = c.indexOf("### Step 3.5");
    const step4 = c.indexOf("### Step 4:");
    assert.ok(step3 !== -1, "Step 3 header must exist");
    assert.ok(step35 !== -1, "Step 3.5 header must exist");
    assert.ok(step4 !== -1, "Step 4 header must exist");
    assert.ok(step3 < step35, "Step 3.5 must appear after Step 3");
    assert.ok(step35 < step4, "Step 3.5 must appear before Step 4");
  });

  it("Step 3.5 invokes isValidKind('spec', kind) for direct --kind validation", () => {
    const c = readSkill(PRIMARY_SKILL);
    const step35 = c.indexOf("### Step 3.5");
    assert.ok(step35 !== -1, "Step 3.5 header must exist");
    const section = c.slice(step35, step35 + 4000);
    assert.ok(
      section.includes("isValidKind"),
      "Step 3.5 must call isValidKind for validation",
    );
    assert.ok(
      section.includes("'spec'") || section.includes('"spec"'),
      "Step 3.5 must pass 'spec' as the layer argument",
    );
  });

  it("Step 3.5 documents ask-first menu when --kind is absent", () => {
    const c = readSkill(PRIMARY_SKILL);
    const step35 = c.indexOf("### Step 3.5");
    assert.ok(step35 !== -1, "Step 3.5 header must exist");
    const section = c.slice(step35, step35 + 4000);
    assert.ok(
      section.includes("ask-first") ||
        section.includes("prompt") ||
        section.includes("menu"),
      "Step 3.5 must describe the ask-first menu when --kind is absent",
    );
  });

  it("Step 3.5 enforces strict-on-write (no defaulting)", () => {
    const c = readSkill(PRIMARY_SKILL);
    const step35 = c.indexOf("### Step 3.5");
    const section = c.slice(step35, step35 + 4000);
    assert.ok(
      section.includes("strict-on-write") ||
        section.includes("re-prompt") ||
        section.includes("required") ||
        section.includes("No defaulting"),
      "Step 3.5 must describe strict-on-write / re-prompt behavior",
    );
  });

  it("explicitly preserves --extract, --refactor, --from-diff, --cross-cutting as direct flags (no --mode)", () => {
    const c = readSkill(PRIMARY_SKILL);
    assert.ok(c.includes("--extract"), "--extract must remain documented");
    assert.ok(c.includes("--refactor"), "--refactor must remain documented");
    assert.ok(c.includes("--from-diff"), "--from-diff must remain documented");
    assert.ok(
      c.includes("--cross-cutting"),
      "--cross-cutting must remain documented",
    );
  });

  it("does not introduce a --mode flag (workflow/kind orthogonality preserved)", () => {
    const c = readSkill(PRIMARY_SKILL);
    // A `--mode` flag declaration would surface as a row in the Arguments
    // table. The two existing references to `--mode` in the SKILL are inside
    // explicit negation prose ("No `--mode <name>` flag is introduced") — both
    // are immediately preceded by the word "No" or "no". Reject any
    // occurrence of `--mode` that does NOT appear in such a negation context.
    const modeMatches = [...c.matchAll(/--mode\b[^`]*/g)];
    for (const m of modeMatches) {
      const start = Math.max(0, m.index - 30);
      const ctx = c.slice(start, m.index + m[0].length);
      assert.ok(
        /[Nn]o\s+`?--mode/.test(ctx),
        `Stray --mode reference found at index ${m.index}: ${ctx}`,
      );
    }
    // Also: the Arguments table must NOT have a row whose first cell is `--mode`.
    assert.ok(
      !/\|\s*`--mode\b/.test(c),
      "Arguments table must not contain a --mode row",
    );
  });

  it("documents workflow/kind orthogonality (axes combine independently)", () => {
    const c = readSkill(PRIMARY_SKILL);
    assert.ok(
      c.includes("orthogonal") ||
        c.includes("independently") ||
        c.includes("combine"),
      "Skill must document that --kind and workflow flags are orthogonal",
    );
  });
});

describe("adev:specify SKILL.md — Step 5 wires resolveTemplate (Task 2)", () => {
  it("Step 5 (Write the Spec) references resolveTemplate('spec', kind, domain)", () => {
    const c = readSkill(PRIMARY_SKILL);
    const step5 = c.indexOf("### Step 5: Write the Spec");
    assert.ok(step5 !== -1, "Step 5: Write the Spec must exist");
    // Capture Step 5 through Step 5.5 boundary
    const step55 = c.indexOf("### Step 5.5", step5);
    const section = c.slice(step5, step55 === -1 ? step5 + 4000 : step55);
    assert.ok(
      section.includes("resolveTemplate"),
      "Step 5 must call resolveTemplate to pick the template body",
    );
    assert.ok(
      section.includes("'spec'") || section.includes('"spec"'),
      "Step 5 must pass 'spec' as the layer argument to resolveTemplate",
    );
  });

  it("Step 5 writes explicit kind: in frontmatter (no defaulting at write)", () => {
    const c = readSkill(PRIMARY_SKILL);
    const step5 = c.indexOf("### Step 5: Write the Spec");
    const step55 = c.indexOf("### Step 5.5", step5);
    const section = c.slice(step5, step55 === -1 ? step5 + 4000 : step55);
    assert.ok(
      section.includes("kind:") || section.includes("`kind`"),
      "Step 5 must instruct writing kind: into frontmatter",
    );
    assert.ok(
      section.includes("explicit") || section.includes("No defaulting") ||
        section.includes("no defaulting"),
      "Step 5 must call out explicit / no defaulting at write time",
    );
  });

  it("Step 5 documents TEMPLATE_NOT_FOUND error handling", () => {
    const c = readSkill(PRIMARY_SKILL);
    const step5 = c.indexOf("### Step 5: Write the Spec");
    const step55 = c.indexOf("### Step 5.5", step5);
    const section = c.slice(step5, step55 === -1 ? step5 + 4000 : step55);
    assert.ok(
      section.includes("TEMPLATE_NOT_FOUND"),
      "Step 5 must document TEMPLATE_NOT_FOUND error handling",
    );
  });

  it("Step 5 documents UNSAFE_TEMPLATE_PATH error handling", () => {
    const c = readSkill(PRIMARY_SKILL);
    const step5 = c.indexOf("### Step 5: Write the Spec");
    const step55 = c.indexOf("### Step 5.5", step5);
    const section = c.slice(step5, step55 === -1 ? step5 + 4000 : step55);
    assert.ok(
      section.includes("UNSAFE_TEMPLATE_PATH"),
      "Step 5 must document UNSAFE_TEMPLATE_PATH error handling",
    );
  });
});

describe("adev:specify SKILL.md — provider mirrors", () => {
  it("provider mirror (codex) inherits the --kind argument", () => {
    if (!existsSync(CODEX_SKILL)) return; // mirror is best-effort
    const c = readSkill(CODEX_SKILL);
    assert.ok(
      c.includes("--kind"),
      "providers/codex/skills/specify/SKILL.md must mirror --kind",
    );
  });

  it("provider mirror (opencode) inherits the --kind argument", () => {
    if (!existsSync(OPENCODE_SKILL)) return; // mirror is best-effort
    const c = readSkill(OPENCODE_SKILL);
    assert.ok(
      c.includes("--kind"),
      "providers/opencode/skills/specify/SKILL.md must mirror --kind",
    );
  });
});

describe("adev:specify kind routing — underlying library invariants", () => {
  it("--kind action resolves to bundled templates/spec-template.action.md", async () => {
    const resolved = await resolveTemplate("spec", "action", null);
    assert.ok(
      resolved.endsWith("/templates/spec-template.action.md"),
      `resolveTemplate('spec', 'action', null) should resolve to spec-template.action.md, got ${resolved}`,
    );
  });

  it("each enumerated kind resolves to a bundled template", async () => {
    for (const kind of SPEC_KINDS) {
      const resolved = await resolveTemplate("spec", kind, null);
      assert.ok(
        resolved.endsWith(`/templates/spec-template.${kind}.md`),
        `kind=${kind} should resolve to spec-template.${kind}.md, got ${resolved}`,
      );
    }
  });

  it("isValidKind rejects an unknown spec kind", () => {
    assert.equal(isValidKind("spec", "unknown"), false);
    assert.equal(isValidKind("spec", "asdfasdf"), false);
    assert.equal(isValidKind("spec", ""), false);
  });

  it("isValidKind accepts every enumerated spec kind", () => {
    for (const kind of SPEC_KINDS) {
      assert.equal(
        isValidKind("spec", kind),
        true,
        `kind=${kind} should be valid`,
      );
    }
  });

  it("workflow flag + --kind axes combine without aliasing", () => {
    // Simulate argv parsing for `--extract --kind artifact`.
    const argv = ["--extract", "--kind", "artifact"];
    const args = parseArgvLite(argv);
    assert.equal(args.extract, true, "--extract must remain a boolean flag");
    assert.equal(
      args.kind,
      "artifact",
      "--kind <value> must parse as a string flag",
    );
    // Same for --refactor + --kind refactor (the spec calls out this pairing
    // as semantically natural but independently parsed).
    const argv2 = ["--refactor", "--kind", "refactor"];
    const args2 = parseArgvLite(argv2);
    assert.equal(args2.refactor, true);
    assert.equal(args2.kind, "refactor");
  });

  it("missing kind on write throws KIND_REQUIRED-equivalent rejection", () => {
    // The skill itself enforces this via prose, but the underlying isValidKind
    // call must reject `undefined` / `null` / non-string inputs so the skill
    // has a deterministic rejection signal.
    assert.equal(isValidKind("spec", undefined), false);
    assert.equal(isValidKind("spec", null), false);
    assert.equal(isValidKind("spec", 42), false);
  });
});

/**
 * Minimal argv parser used only by the orthogonality test. Mirrors how the
 * skill would parse `--extract` (boolean) alongside `--kind <value>` (string).
 *
 * Keeping this local to the test avoids coupling the test to a future
 * `lib/specify-routing.mjs` extraction — if such a helper is introduced, the
 * test can simply import from it instead.
 */
function parseArgvLite(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "--kind") {
      out.kind = argv[++i];
    } else if (tok.startsWith("--")) {
      out[tok.slice(2)] = true;
    }
  }
  return out;
}
