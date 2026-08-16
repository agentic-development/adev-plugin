/**
 * Task 15 — this project's OWN `transitions:` block in
 * `.context-index/governance/gates.yaml`.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * Task 7 built the comparator (`lib/governance/transitions.mjs`) and Check 9
 * calls it, but this repository declared `transitions: {}` — so every run of
 * `adev gate transitions` on this project SKIPped, and the comparator was
 * exercised only by its own fixtures. These assertions are about the CONFIG
 * FILE, not about the comparator: they pin that what the file names is
 * something the file also declares, that the named gates are executable, and
 * that none of them has been switched off.
 *
 * Why "carries an argv command" rather than "exists": `gates.yaml` ships `lint`
 * and `typecheck` as COMMENTED-OUT templates with `command: ""`. Naming either
 * in `transitions` would produce a `required_gates` entry no gate declares —
 * the `MISSING_GATE_REF` finding `/adev:hygiene` Pass 8 raises, and the exact
 * state the spec's Error Cases row preserves. The gate set this project can
 * honestly require is the set with real argv commands behind it.
 *
 * The path is resolved from `import.meta.url` so the suite does not depend on
 * the runner's cwd.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../../lib/profiles/yaml.mjs";

const GATES_PATH = fileURLToPath(
  new URL("../../.context-index/governance/gates.yaml", import.meta.url),
);

function gatesDoc() {
  return parseYaml(readFileSync(GATES_PATH, "utf8"));
}

describe("this project's gates.yaml transitions block", () => {
  it("is non-empty, so Check 9 no longer SKIPs on this project", () => {
    // Guards the assertions below against vacuity: every `for` over
    // `doc.transitions` passes trivially while the map is `{}`, which is
    // precisely the state this task exists to leave behind.
    const transitions = gatesDoc().transitions ?? {};
    assert.ok(
      Object.keys(transitions).length > 0,
      "transitions is empty — `adev gate transitions` SKIPs, which asserts nothing",
    );
  });

  it("names only gates the same file declares, each carrying an argv command", () => {
    const doc = gatesDoc();
    const byId = new Map((doc.gates ?? []).map((g) => [g.id, g]));
    let checked = 0;
    for (const [name, transition] of Object.entries(doc.transitions ?? {})) {
      for (const id of transition?.required_gates ?? []) {
        const gate = byId.get(id);
        assert.ok(gate, `${name} requires unknown gate ${id}`);
        assert.ok(
          Array.isArray(gate.command) && gate.command.length > 0,
          `${name} requires ${id}, which has no argv command — a shell-form or empty ` +
            `command is dropped by mergeGates, so the gate would never resolve`,
        );
        assert.ok(
          gate.command.every((token) => typeof token === "string"),
          `${name} requires ${id}, whose command has a non-string argv element`,
        );
        checked++;
      }
    }
    assert.ok(checked > 0, "no required_gates were checked");
  });

  it("names no gate the registry switched off with enabled: false", () => {
    // A disabled gate cannot be attested — nothing runs it — so requiring one
    // makes the transition permanently non-passing (`disabled-gate`). This is
    // why the gate-enablement parity work lands before this block is populated:
    // without it, a disabled required gate silently resolved to `unknown-gate`
    // or, with a stale recorded outcome, to a PASS.
    const doc = gatesDoc();
    const byId = new Map((doc.gates ?? []).map((g) => [g.id, g]));
    for (const [name, transition] of Object.entries(doc.transitions ?? {})) {
      for (const id of transition?.required_gates ?? []) {
        assert.notEqual(
          byId.get(id)?.enabled,
          false,
          `${name} requires ${id}, which is disabled and can never record an outcome`,
        );
      }
    }
  });

  it("declares each transition as a map with a required_gates list", () => {
    for (const [name, transition] of Object.entries(gatesDoc().transitions ?? {})) {
      assert.ok(
        transition && typeof transition === "object" && !Array.isArray(transition),
        `transition ${name} is not a map`,
      );
      assert.ok(
        Array.isArray(transition.required_gates),
        `transition ${name} has no required_gates list`,
      );
    }
  });
});
