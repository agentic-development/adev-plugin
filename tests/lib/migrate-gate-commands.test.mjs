import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyCommand,
  toArgv,
  migrateGateCommands,
} from "../../lib/migrate-gate-commands.mjs";
import { mergeGates } from "../../lib/domains/merge-gates.mjs";
import { parseYaml } from "../../lib/profiles/yaml.mjs";

test("classifyCommand accepts a simple command", () => {
  assert.deepEqual(classifyCommand("npm test"), { safe: true });
  assert.deepEqual(classifyCommand("npx tsc --noEmit"), { safe: true });
});

test("classifyCommand refuses anything whose meaning depends on a shell", () => {
  // Splitting these on whitespace produces an argv that runs something else.
  for (const cmd of [
    "npm test && npm run lint",
    "cat x | grep y",
    "echo $HOME",
    "npm test > out.txt",
    "npm test; rm -rf /",
    "echo `whoami`",
  ]) {
    assert.equal(classifyCommand(cmd).safe, false, `${cmd} must not be auto-migrated`);
  }
});

test("classifyCommand refuses empty and non-string input", () => {
  assert.equal(classifyCommand("").safe, false);
  assert.equal(classifyCommand("   ").safe, false);
  assert.equal(classifyCommand(null).safe, false);
  assert.equal(classifyCommand(["npm", "test"]).safe, false);
});

test("toArgv collapses runs of whitespace", () => {
  assert.deepEqual(toArgv("  npm   run    test:evals "), ["npm", "run", "test:evals"]);
});

test("migrateGateCommands converts a quoted shell string to an argv list", () => {
  const src = ['gates:', '  - id: tests', '    command: "npm test"', '    required: true'].join("\n");
  const { content, migrated, skipped } = migrateGateCommands(src);

  assert.equal(migrated.length, 1);
  assert.deepEqual(migrated[0].to, ["npm", "test"]);
  assert.equal(skipped.length, 0);
  assert.match(content, /command: \[npm, test\]/);
});

test("migrateGateCommands leaves an existing argv list untouched", () => {
  const src = ['gates:', '  - id: tests', '    command: [npm, test]'].join("\n");
  const { content, migrated } = migrateGateCommands(src);

  assert.equal(migrated.length, 0);
  assert.equal(content, src, "an already-valid file must not be rewritten");
});

test("migrateGateCommands skips a chained command and reports why", () => {
  const src = ['gates:', '  - id: tests', '    command: "npm test && npm run lint"'].join("\n");
  const { content, migrated, skipped } = migrateGateCommands(src);

  assert.equal(migrated.length, 0);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /metacharacter/);
  assert.equal(content, src, "an unsafe command must be left exactly as authored");
});

test("migrateGateCommands preserves comments and surrounding structure", () => {
  const src = [
    "# Gate definitions",
    "gates:",
    "  # the only gate that matters",
    "  - id: tests",
    '    command: "npm test"   # runs the whole suite',
    "    required: true",
  ].join("\n");
  const { content } = migrateGateCommands(src);

  assert.match(content, /# Gate definitions/);
  assert.match(content, /# the only gate that matters/);
  assert.match(content, /command: \[npm, test\]\s+# runs the whole suite/);
  assert.match(content, /required: true/);
});

test("migrateGateCommands ignores the commented-out template placeholders", () => {
  // templates/gates-template.yaml ships commented examples like:
  //   #   command: ""                 # e.g., [npm, run, lint]
  // Those are not live gates and must not be counted as migrations.
  const src = ['#   command: ""                 # e.g., [npm, run, lint]'].join("\n");
  const { migrated, skipped, content } = migrateGateCommands(src);

  assert.equal(migrated.length, 0, "a commented placeholder is not a gate");
  assert.equal(skipped.length, 0);
  assert.equal(content, src);
});

// The point of the whole exercise: the migrated file must actually load.
test("a migrated gates.yaml is accepted by the loader that rejected it before", () => {
  const legacy = [
    "gates:",
    "  - id: tests",
    '    command: "npm test"',
    "    scope: project",
    "    required: true",
  ].join("\n");

  const before = mergeGates(null, parseYaml(legacy));
  assert.equal(before.gates.length, 0, "precondition: the legacy shape loads zero gates");
  assert.ok(
    before.warnings.some((w) => w.code === "INVALID_GATE"),
    "precondition: the loader reports INVALID_GATE",
  );

  const { content } = migrateGateCommands(legacy);
  const after = mergeGates(null, parseYaml(content));

  assert.equal(after.gates.length, 1, "the migrated file must load its gate");
  assert.deepEqual(after.gates[0].command, ["npm", "test"]);
  assert.equal(
    after.warnings.filter((w) => w.code === "INVALID_GATE").length,
    0,
    "no INVALID_GATE warning survives the migration",
  );
});
