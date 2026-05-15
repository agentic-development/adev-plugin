import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONSTITUTION_PATH = resolve(__dirname, "..", ".context-index", "constitution.md");

test("constitution forbids inline-Node patterns in SKILL.md", () => {
  const content = readFileSync(CONSTITUTION_PATH, "utf8");
  assert.match(
    content,
    /No `Run inline Node\.js:` step directives, `node --input-type=module -e/,
    "constitution must explicitly forbid 'Run inline Node.js:' step directives and node --input-type=module -e heredocs in SKILL.md",
  );
  assert.match(
    content,
    /Skills name a CLI subcommand \(`adev <verb>/,
    "constitution must direct skills to call CLI subcommands instead of inline-Node",
  );
});

test("constitution forbids both-forms within an H3 section", () => {
  const content = readFileSync(CONSTITUTION_PATH, "utf8");
  assert.match(
    content,
    /No SKILL\.md contains both an inline-Node block AND an `adev <verb>` invocation within the same H3 section/,
    "constitution must forbid both inline-Node and adev <verb> co-existing in the same H3 section",
  );
});

test("constitution preserves existing Anti-Patterns bullets", () => {
  const content = readFileSync(CONSTITUTION_PATH, "utf8");
  assert.match(content, /No CommonJS \(`require`, `module\.exports`\)/);
  assert.match(content, /No executable logic inside SKILL\.md files/);
  assert.match(content, /No hardcoded paths to `~\/\.claude\/`/);
});
