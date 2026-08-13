import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseSpecFrontmatter } from "../../lib/meta-tools.mjs";

const dir = new URL("../../.context-index/specs/features/spec-lifecycle/", import.meta.url);
const dirPath = fileURLToPath(dir);

const BASE_SPEC_PATH = ".context-index/specs/features/spec-lifecycle/plan-test-mapping.spec.md";

function findAmendmentFile() {
  const files = readdirSync(dir).filter(
    (f) => f.startsWith("plan-test-mapping-") && f.endsWith(".spec.md"),
  );
  assert.ok(files.length > 0, "expected a plan-test-mapping-rev-*-*.spec.md amendment file");
  return files[0];
}

function readLogEvents() {
  const log = readFileSync(
    new URL("../../.context-index/lifecycle-state/plan-test-mapping.jsonl", import.meta.url),
    "utf8",
  );
  return log
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

test("an amendment artifact against plan-test-mapping.spec.md exists", () => {
  findAmendmentFile();
});

test("the amendment artifact's frontmatter points at the base spec and targets revision 2", () => {
  const file = findAmendmentFile();
  const fm = parseSpecFrontmatter(`${dirPath}${file}`);
  assert.equal(fm.amends, BASE_SPEC_PATH);
  assert.equal(Number(fm["target-revision"]), 2);
});

test("the base spec's lifecycle log recorded a well-formed spec_amended event matching the scaffolded file", () => {
  const events = readLogEvents().filter((e) => e.event === "spec_amended");
  assert.equal(events.length, 1, "expected exactly one spec_amended event");
  const ev = events[0];

  const file = findAmendmentFile();
  assert.equal(ev.amendment_path, `.context-index/specs/features/spec-lifecycle/${file}`);
  assert.equal(ev.target_revision, 2);
  assert.ok(typeof ev.amendment_slug === "string" && ev.amendment_slug.length > 0);
  assert.ok(typeof ev.ts === "string" && ev.ts.length > 0);
});

test("the base spec plan-test-mapping.spec.md was not mutated by the amendment", () => {
  const fm = parseSpecFrontmatter(`${dirPath}plan-test-mapping.spec.md`);
  assert.equal(Number(fm.revision), 1, "base spec revision must remain 1 — the base spec is immutable");
});
