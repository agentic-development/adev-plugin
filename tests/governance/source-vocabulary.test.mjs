// tests/governance/source-vocabulary.test.mjs
//
// DDR-4: the run-time `__source` vocabulary maps onto the ON-DISK `source`
// enum, once, in one place.
//
// Two loaders speak the run-time vocabulary (`bundled`, `project`,
// `governance`, `project-override`, `manifest-specialist`, `domain`) and one
// file format speaks the on-disk one (`project`, `bundled`, `domain:<slug>`,
// `extension:<name>`). Migration Step 6's drift exclusion reads the on-disk
// value, so a run-time value that never crosses the boundary — or crosses it
// into a fifth spelling — gives that pass undefined behaviour.
//
// Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
// Plan-task: 16.

import { test, describe, afterEach } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { cleanupTempDir, createTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import { parseYaml } from "../../lib/profiles/yaml.mjs";
import { stampMarker } from "../../lib/governance/registry-marker.mjs";
import {
  ON_DISK_SOURCE,
  deriveSource,
  mapSourceVocabulary,
} from "../../lib/governance/materialize.mjs";
import { loadReviewConfig } from "../../lib/governance/review-config.mjs";

const REVIEW = ".context-index/governance/review.yaml";
const GATES = ".context-index/governance/gates.yaml";
const DIAGNOSTICS = ".context-index/governance/diagnostics.yaml";

const tempDirs = [];
function tmp() {
  const d = createTempDir();
  tempDirs.push(d);
  return d;
}
afterEach(() => {
  while (tempDirs.length) cleanupTempDir(tempDirs.pop());
});

function runCli(dir, args) {
  const r = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), ...args], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
  });
  return { exitCode: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** A project root whose review registry is already materialized and empty. */
function seedProject(dir, reviewBody) {
  writeFixture(
    dir,
    ".context-index/manifest.yaml",
    "project:\n  name: fixture\n  domain: software\n",
  );
  writeFixture(dir, ".context-index/prompts/x.md", "# reviewer prompt\n");
  writeFixture(dir, REVIEW, stampMarker(reviewBody ?? "reviewers: []\n", "2026-08-15T00:00:00Z"));
  return dir;
}

function reviewerRow(id, extra = "") {
  return `  - id: ${id}\n    prompt: prompts/x.md\n${extra}`;
}

// ── 1. The mapping table itself ──────────────────────────────────────────────

describe("mapSourceVocabulary implements DDR-4's table", () => {
  test("bundled is identity", () => {
    assert.equal(mapSourceVocabulary("bundled", "acme"), "bundled");
  });

  test("project is identity", () => {
    assert.equal(mapSourceVocabulary("project", "acme"), "project");
  });

  test("governance collapses to project", () => {
    assert.equal(mapSourceVocabulary("governance", "acme"), "project");
  });

  test("project-override maps to project, not to a fifth value", () => {
    assert.equal(mapSourceVocabulary("project-override"), "project");
  });

  test("manifest-specialist maps to project", () => {
    assert.equal(mapSourceVocabulary("manifest-specialist"), "project");
  });

  test("domain carries the resolved slug", () => {
    assert.equal(mapSourceVocabulary("domain", "acme-corp"), "domain:acme-corp");
  });

  test("every mapped output is itself a member of the on-disk enum", () => {
    for (const runtime of [
      "bundled",
      "project",
      "governance",
      "project-override",
      "manifest-specialist",
    ]) {
      assert.match(mapSourceVocabulary(runtime, "acme"), ON_DISK_SOURCE);
    }
    assert.match(mapSourceVocabulary("domain", "acme"), ON_DISK_SOURCE);
  });

  test("an unknown runtime value throws rather than defaulting to project", () => {
    assert.throws(
      () => mapSourceVocabulary("from-mars", "acme"),
      (err) => err.code === "MATERIALIZE_SOURCE_UNMAPPED" && /from-mars/.test(err.message),
    );
    for (const bogus of [undefined, null, "", "extension", "Project"]) {
      assert.throws(
        () => mapSourceVocabulary(bogus, "acme"),
        (err) => err.code === "MATERIALIZE_SOURCE_UNMAPPED",
        `${JSON.stringify(bogus)} must not be silently accepted`,
      );
    }
  });

  test("the mapping validates its OWN output — a slug that is not enum-shaped is refused", () => {
    // The on-disk enum regex is anchored, so `domain:Bad Slug` is not a member
    // of it. Emitting one would put a value in the file that Migration Step 6's
    // matcher rejects, which is exactly the undefined behaviour this task
    // closes — so the mapping refuses at the boundary instead.
    for (const slug of ["Bad Slug", "UPPER", "trailing ", "", null, undefined, "a/b"]) {
      assert.throws(
        () => mapSourceVocabulary("domain", slug),
        (err) => err.code === "MATERIALIZE_SOURCE_UNMAPPED",
        `domain slug ${JSON.stringify(slug)} must be refused`,
      );
    }
  });

  test("the on-disk enum regex is anchored", () => {
    assert.match("project", ON_DISK_SOURCE);
    assert.match("bundled", ON_DISK_SOURCE);
    assert.match("domain:acme-1", ON_DISK_SOURCE);
    assert.match("extension:@acme/pack", ON_DISK_SOURCE);
    assert.doesNotMatch("project ", ON_DISK_SOURCE);
    assert.doesNotMatch(" project", ON_DISK_SOURCE);
    assert.doesNotMatch("domain:Bad Slug", ON_DISK_SOURCE);
    assert.doesNotMatch("domain:", ON_DISK_SOURCE);
    assert.doesNotMatch("project\nbundled", ON_DISK_SOURCE);
  });

  test("deriveSource reaches the SAME table, it does not carry a copy", () => {
    for (const runtime of [
      "bundled",
      "project",
      "governance",
      "project-override",
      "manifest-specialist",
    ]) {
      assert.equal(
        deriveSource({ id: "a", __source: runtime }, "review", "acme"),
        mapSourceVocabulary(runtime, "acme"),
      );
    }
    assert.equal(
      deriveSource({ id: "a", __source: "domain" }, "gates", "acme"),
      mapSourceVocabulary("domain", "acme"),
    );
  });
});

// ── 2. The producer: every materialized entry carries an enum member ─────────

describe("adev governance materialize stamps the on-disk enum", () => {
  test("every materialized reviewer carries a source from the on-disk enum", () => {
    const dir = seedProject(tmp(), `reviewers:\n${reviewerRow("mine")}`);
    const r = runCli(dir, ["governance", "materialize", "--registry", "review"]);
    assert.equal(r.exitCode, 0, r.stderr);

    const doc = parseYaml(readFileSync(join(dir, REVIEW), "utf8"));
    assert.ok(Array.isArray(doc.reviewers) && doc.reviewers.length > 0);
    for (const entry of doc.reviewers) {
      if (entry.id === "mine") continue; // already on disk, rule 3 does not rewrite it
      assert.match(String(entry.source), ON_DISK_SOURCE, `reviewer '${entry.id}'`);
    }
  });

  test("the domain's contribution lands as domain:<slug>, not as a bare slug", () => {
    const dir = seedProject(tmp());
    const r = runCli(dir, ["governance", "materialize", "--registry", "review"]);
    assert.equal(r.exitCode, 0, r.stderr);

    const doc = parseYaml(readFileSync(join(dir, REVIEW), "utf8"));
    const domainRows = doc.reviewers.filter((e) => String(e.source).startsWith("domain:"));
    assert.ok(domainRows.length > 0, "the `software` domain contributes reviewers");
    for (const entry of domainRows) {
      assert.equal(entry.source, "domain:software", `reviewer '${entry.id}'`);
    }
  });

  test("gates and diagnostics carry enum members too", () => {
    const dir = seedProject(tmp());
    writeFixture(
      dir,
      GATES,
      'gates:\n  - id: test\n    command: ["npm", "test"]\n    severity: error\n',
    );
    writeFixture(
      dir,
      DIAGNOSTICS,
      "diagnostics:\n  - id: adev/event-schema-valid\n" +
        "    runner: plugin:tier1/event-schema-valid.mjs\n" +
        "    severity: error\n    tier: 1\n    scope: event-impact\n",
    );
    for (const registry of ["gates", "diagnostics"]) {
      const r = runCli(dir, ["governance", "materialize", "--registry", registry]);
      assert.equal(r.exitCode, 0, `${registry}: ${r.stderr}`);
    }
    for (const [file, key] of [[GATES, "gates"], [DIAGNOSTICS, "diagnostics"]]) {
      const doc = parseYaml(readFileSync(join(dir, file), "utf8"));
      for (const entry of doc[key]) {
        if (entry.source === undefined) continue; // pre-existing on-disk row
        assert.match(String(entry.source), ON_DISK_SOURCE, `${key} '${entry.id}'`);
      }
    }
  });
});

// ── 3. The consumer: loadReviewConfig speaks BOTH vocabularies ───────────────

describe("loadReviewConfig surfaces the on-disk source alongside __source", () => {
  test("an entry carries the run-time provenance AND the on-disk source", () => {
    const dir = seedProject(tmp(), `reviewers:\n${reviewerRow("plain")}`);
    const cfg = loadReviewConfig(dir);
    assert.equal(cfg.errors.length, 0, JSON.stringify(cfg.errors, null, 2));

    const entry = cfg.reviewers.find((x) => x.id === "plain");
    assert.equal(entry.__source, "project", "run-time provenance must survive (Task 11)");
    assert.equal(entry.source, "project", "and the on-disk enum value must be surfaced beside it");
  });

  test("a declared on-disk source wins over derivation and is not rewritten", () => {
    const dir = seedProject(
      tmp(),
      `reviewers:\n${reviewerRow("declared", "    source: domain:acme\n")}`,
    );
    const cfg = loadReviewConfig(dir);
    assert.equal(cfg.errors.length, 0, JSON.stringify(cfg.errors, null, 2));

    const entry = cfg.reviewers.find((x) => x.id === "declared");
    assert.equal(entry.source, "domain:acme", "materialization RECORDED this; the load must not revise it");
    assert.equal(entry.__source, "project", "the CURRENT contributor is still the project file");
  });

  test("a manifest specialist maps to project, not to manifest-specialist", () => {
    const dir = seedProject(tmp(), "reviewers: []\n");
    const cfg = loadReviewConfig(dir, {
      manifest: { specialists: [{ id: "legacy-spec", prompt: "prompts/x.md" }] },
    });
    assert.equal(cfg.errors.length, 0, JSON.stringify(cfg.errors, null, 2));

    const entry = cfg.reviewers.find((x) => x.id === "legacy-spec");
    assert.ok(entry, "the deprecated manifest specialist still loads");
    assert.equal(entry.__source, "manifest-specialist", "run-time provenance is preserved");
    assert.equal(entry.source, "project", "and it is project-authored on disk");
  });

  test("a disabled reviewer keeps both vocabularies too", () => {
    const dir = seedProject(
      tmp(),
      `reviewers:\n${reviewerRow("off", "    enabled: false\n    disabled_reason: not needed\n")}`,
    );
    const cfg = loadReviewConfig(dir);
    const entry = cfg.reviewers.find((x) => x.id === "off");
    assert.equal(entry.enabled, false);
    assert.equal(entry.__source, "project");
    assert.equal(entry.source, "project", "a disabled row must stay visible to the drift pass");
  });

  test("every loaded reviewer's source is a member of the on-disk enum", () => {
    const dir = seedProject(
      tmp(),
      `reviewers:\n${reviewerRow("a")}${reviewerRow("b", "    source: bundled\n")}` +
        `${reviewerRow("c", "    enabled: false\n")}`,
    );
    const cfg = loadReviewConfig(dir);
    assert.equal(cfg.errors.length, 0, JSON.stringify(cfg.errors, null, 2));
    assert.equal(cfg.reviewers.length, 3);
    for (const entry of cfg.reviewers) {
      assert.match(String(entry.source), ON_DISK_SOURCE, `reviewer '${entry.id}'`);
      assert.equal(typeof entry.__source, "string", `reviewer '${entry.id}' lost __source`);
    }
  });
});
