import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(p) {
  return readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
}

test("docs/test-strategies.md states plainly that the floor is advisory (+1 more contract assertions)", () => {
  // docs/test-strategies.md states plainly that the floor is advisory
  assert.match(read("docs/test-strategies.md"), /floor is advisory/i);

  // docs/getting-started.md explains what init asks about test_policy
  assert.match(read("docs/getting-started.md"), /test_policy|granularity/);
});

test("docs/governance.md documents test_depth and the advisory-floor statement", () => {
  const doc = read("docs/governance.md");
  assert.match(doc, /test_depth/);
  assert.match(doc, /advisory/i);
});

test("docs/configuration.md documents the test_policy block and escalation grammar", () => {
  const doc = read("docs/configuration.md");
  assert.match(doc, /test_policy/);
  assert.match(doc, /escalation_rules/);
});

test("docs/cli-reference.md documents all five adev test-policy subcommands", () => {
  const doc = read("docs/cli-reference.md");
  for (const sub of ["resolve", "assert-assigned", "show", "set", "explain"]) {
    assert.match(doc, new RegExp(`test-policy ${sub}|test-policy \\| .*${sub}`));
  }
});


test("docs/README.md indexes the updated pages", () => {
  const readme = read("docs/README.md");
  for (const page of ["test-strategies.md", "governance.md", "configuration.md", "cli-reference.md", "getting-started.md"]) {
    assert.match(readme, new RegExp(page.replace(".", "\\.")));
  }
});

test("upgrade note states fewer test files, per-task opt-out, and no new required config file", () => {
  const doc = read("docs/test-strategies.md");
  assert.match(doc, /fewer test files/i);
  assert.match(doc, /per-task/);
  assert.match(doc, /no new config file|no new file/i);
});
