import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(__dirname, "..", "..", "skills", "validate", "SKILL.md"), "utf8");
const start = content.indexOf("**Domain-Aware Gate Loading:**");
const end = content.indexOf("**Load Skill Extensions:**");
const preflight = content.substring(start, end);

test("preflight distinguishes absent-file (hard crash) from exists-but-empty (warn)", () => {
  assert.match(preflight, /MISSING_VALIDATE_CONFIG/);
  assert.match(preflight, /exists.*(zero|no).*enabled|enabled.*count.*zero/is);
  assert.match(preflight, /standing warning/i);
});

test("absent-file hard-crash wording is unchanged", () => {
  assert.match(preflight, /Run \/adev:init to scaffold the validate configuration/);
});
