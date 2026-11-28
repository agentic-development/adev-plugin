import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  PLUGIN_ROOT,
  createTempDir,
  cleanupTempDir,
  writeFixture,
} from "../helpers.mjs";

const SYNC_SKILL = join(PLUGIN_ROOT, "skills", "sync", "SKILL.md");
const CONSTITUTION_TEMPLATE = join(PLUGIN_ROOT, "templates", "constitution-template.md");

const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;
const BACKEND_READ = /\btasks\??\.backend\b/;

// Every file here was checked against `tasks.backend: github`. A new reader
// fails the audit until someone checks it too and adds it.
const REVIEWED_READERS = [
  "cli/index.mjs",
  "lib/cli/issues-claim.mjs",
  "lib/cli/issues-migrate.mjs",
  "lib/cli/issues-next.mjs",
  "lib/cost-summary.mjs",
  "lib/issues/file-adapter.mjs",
  "lib/issues/registry.mjs",
];

function listMjs(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listMjs(full));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(full);
  }
  return files;
}

function backendReaders(root, dirs) {
  const matched = new Set();
  for (const dir of dirs) {
    for (const file of listMjs(join(root, dir))) {
      const lines = readFileSync(file, "utf8").split("\n");
      if (lines.some((line) => !COMMENT_LINE.test(line) && BACKEND_READ.test(line))) {
        matched.add(relative(root, file).split(sep).join("/"));
      }
    }
  }
  return [...matched].sort();
}

function taskManagementBlocks(markdown) {
  const blocks = [];
  const re = /<!-- BEGIN TASK MANAGEMENT -->([\s\S]*?)<!-- END TASK MANAGEMENT -->/g;
  let m;
  while ((m = re.exec(markdown)) !== null) blocks.push(m[1]);
  return blocks;
}

// The github case of the sync block, from its opening line to the next
// backend case or the unconfigured clause.
function githubCase(block) {
  const m = block.match(
    /tasks\.backend is "github"[\s\S]*?(?=\n\s*-\s*If tasks\.backend is "|\n\s*-\s*If constitution has no|\n\s*If tasks\.backend is NOT|$)/,
  );
  return m ? m[0] : null;
}

// The template's `When \`tasks.backend: github\`:` subsection, up to the next
// `When` subsection or heading.
function templateGithubSection(template) {
  const m = template.match(/When `tasks\.backend: github`[^\n]*\n([\s\S]*?)(?=\nWhen `tasks\.backend|\n#{2,3} )/);
  return m ? m[1] : null;
}

function taskManagementSection(template) {
  const m = template.match(/\n## Task Management\n([\s\S]*?)(?=\n## |$)/);
  return m ? m[1] : null;
}

describe("/adev:sync Task Management block — github case", () => {
  const skill = readFileSync(SYNC_SKILL, "utf8");
  const blocks = taskManagementBlocks(skill);

  test("the sync skill carries a Task Management block", () => {
    assert.ok(blocks.length >= 1, "expected a BEGIN/END TASK MANAGEMENT block in skills/sync/SKILL.md");
  });

  test("the Claude-format block names the github case", () => {
    assert.match(blocks[0], /If tasks\.backend is "github"/);
  });

  test("the github case keeps every existing backend case", () => {
    for (const backend of ["beads", "json", "file"]) {
      assert.match(blocks[0], new RegExp(`If tasks\\.backend is "${backend}"`), `missing the ${backend} case`);
    }
    assert.match(blocks[0], /If tasks\.backend is NOT configured/);
  });

  test("the github case says the board lives on the configured Projects v2 project", () => {
    const gh = githubCase(blocks[0]);
    assert.notEqual(gh, null, "github case not found");
    assert.match(gh, /Projects v2/);
    assert.match(gh, /tasks\.github/);
  });

  test("the github case directs agents to `adev issues` verbs, never raw `br`", () => {
    const gh = githubCase(blocks[0]);
    assert.notEqual(gh, null, "github case not found");
    assert.match(gh, /`adev issues\b/);
    assert.doesNotMatch(gh, /`br [a-z]/, "the github case must not reference raw br commands");
  });

  test("the github case names the gh-<n> ID shape", () => {
    const gh = githubCase(blocks[0]);
    assert.notEqual(gh, null, "github case not found");
    assert.match(gh, /gh-<n>/);
  });

  test("the github case states that network access and gh authentication are required", () => {
    const gh = githubCase(blocks[0]);
    assert.notEqual(gh, null, "github case not found");
    assert.match(gh, /network/i);
    assert.match(gh, /`gh` (CLI )?auth/i);
  });

  test("the github case adds no inline Node to SKILL.md", () => {
    const gh = githubCase(blocks[0]);
    assert.notEqual(gh, null, "github case not found");
    assert.doesNotMatch(gh, /node (--input-type=module )?-e\b/);
    assert.doesNotMatch(gh, /Run inline Node/);
  });

  test("the AGENTS.md block inherits the Claude-format logic", () => {
    assert.ok(blocks.length >= 2, "expected the AGENTS.md Task Management block");
    assert.match(blocks[1], /Same logic as Claude format/);
  });
});

describe("constitution template — Task Management lists github", () => {
  const template = readFileSync(CONSTITUTION_TEMPLATE, "utf8");

  test("the Task Management section has a github subsection", () => {
    const section = taskManagementSection(template);
    assert.notEqual(section, null, "Task Management section not found");
    assert.match(section, /When `tasks\.backend: github`/);
  });

  test("the backend options comment lists github", () => {
    const section = taskManagementSection(template);
    assert.notEqual(section, null, "Task Management section not found");
    const options = section.match(/Options:([^\n]*(?:\n(?!\s*-->)[^\n]*)*)/);
    assert.notEqual(options, null, "Options comment not found");
    assert.match(options[1], /\bgithub\b/);
  });

  test("the github subsection uses `adev issues` verbs and gh-<n> IDs, not br", () => {
    const gh = templateGithubSection(template);
    assert.notEqual(gh, null, "github subsection not found");
    assert.match(gh, /`adev issues\b/);
    assert.match(gh, /gh-<n>/);
    assert.doesNotMatch(gh, /`br [a-z]/);
  });

  test("the github subsection names the configured project and the network requirement", () => {
    const gh = templateGithubSection(template);
    assert.notEqual(gh, null, "github subsection not found");
    assert.match(gh, /Projects v2/);
    assert.match(gh, /network/i);
  });

  test("the beads subsection is still present", () => {
    const section = taskManagementSection(template);
    assert.notEqual(section, null, "Task Management section not found");
    assert.match(section, /When `tasks\.backend: beads`/);
  });
});

describe("tasks.backend reader audit", () => {
  test("every code reader of tasks.backend under lib/ and cli/ is on the reviewed allowlist", () => {
    assert.deepEqual(backendReaders(PLUGIN_ROOT, ["lib", "cli"]), REVIEWED_READERS);
  });

  test("comment-only mentions are excluded from the audit", () => {
    const manifestSrc = readFileSync(join(PLUGIN_ROOT, "lib", "manifest.mjs"), "utf8");
    const beadsSrc = readFileSync(join(PLUGIN_ROOT, "lib", "issues", "beads-adapter.mjs"), "utf8");
    assert.match(manifestSrc, BACKEND_READ, "lib/manifest.mjs docblock no longer mentions tasks.backend");
    assert.match(beadsSrc, BACKEND_READ, "beads-adapter.mjs comments no longer mention tasks.backend");
    const readers = backendReaders(PLUGIN_ROOT, ["lib", "cli"]);
    assert.equal(readers.includes("lib/manifest.mjs"), false);
    assert.equal(readers.includes("lib/issues/beads-adapter.mjs"), false);
  });

  describe("predicate boundaries (seeded tree)", () => {
    function withTree(files, fn) {
      const dir = createTempDir();
      try {
        for (const [path, content] of Object.entries(files)) writeFixture(dir, path, content);
        return fn(dir);
      } finally {
        cleanupTempDir(dir);
      }
    }

    test("matches property reads, optional chaining and string literals", () => {
      withTree(
        {
          "lib/a.mjs": "const b = manifest.tasks.backend;\n",
          "lib/b.mjs": "if (manifest?.tasks?.backend) {}\n",
          "lib/c.mjs": 'throw new Error("set tasks.backend: json");\n',
        },
        (dir) => {
          assert.deepEqual(backendReaders(dir, ["lib"]), ["lib/a.mjs", "lib/b.mjs", "lib/c.mjs"]);
        },
      );
    });

    test("skips //, * and /* comment lines but not trailing comments on code", () => {
      withTree(
        {
          "lib/line.mjs": "  // reads tasks.backend\nconst x = 1;\n",
          "lib/doc.mjs": "/**\n * Reads `tasks.backend`.\n */\nexport const y = 2;\n",
          "lib/block.mjs": "/* tasks.backend */\nexport const z = 3;\n",
          "lib/trailing.mjs": "const k = 4; // tasks.backend\n",
        },
        (dir) => {
          assert.deepEqual(backendReaders(dir, ["lib"]), ["lib/trailing.mjs"]);
        },
      );
    });

    test("respects word boundaries on both ends", () => {
      withTree(
        {
          "lib/sub.mjs": "const s = subtasks.backend;\n",
          "lib/suffix.mjs": "const t = tasks.backendKind;\n",
          "lib/other.mjs": "const u = tasks.github.backend;\n",
        },
        (dir) => {
          assert.deepEqual(backendReaders(dir, ["lib"]), []);
        },
      );
    });

    test("recurses into subdirectories, scans only .mjs files, and only the given roots", () => {
      withTree(
        {
          "lib/issues/github/deep.mjs": "const d = cfg.tasks.backend;\n",
          "lib/notes.md": "tasks.backend\n",
          "lib/legacy.js": "const e = cfg.tasks.backend;\n",
          "cli/index.mjs": "if (manifest?.tasks?.backend !== 'beads') return;\n",
          "scripts/tool.mjs": "const f = cfg.tasks.backend;\n",
        },
        (dir) => {
          assert.deepEqual(backendReaders(dir, ["lib", "cli"]), ["cli/index.mjs", "lib/issues/github/deep.mjs"]);
        },
      );
    });
  });
});
