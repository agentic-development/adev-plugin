// tests/provider/cursor-path-containment.test.mjs
//
// A skill's frontmatter `name:` becomes a DIRECTORY NAME under ~/.cursor/skills/.
// It must not be able to escape that root.
//
// WHY THIS EXISTS. providers/cursor/adapter.mjs parses the name with
// `/^name:\s*(\S+)\s*$/`. `\S+` is a reasonable YAML scalar grammar and a wrong
// filesystem-path grammar: it admits `/` and `..`, so `name: adev:../../x`
// produced `sanitizedName = "adev-../../x"`, which flowed unchecked into
// `join(targetSkillsDir, sanitizedName)` and then `cpSync` + `writeFileSync`.
// providers/copilot/adapter.mjs realpath-contains every destination; cursor had
// no equivalent check anywhere in the file.
//
// Pre-existing, but the progressive-disclosure refactor widened the blast radius:
// the recursive copy now carries a whole references/ tree to that destination
// rather than a handful of flat files.
//
// Two layers are asserted, because either alone is brittle: an allowlist on the
// name, and a containment check on the resolved destination.
//
// Found by the boundary reviewer (BND-4) across three review rounds.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { PLUGIN_ROOT } from "../helpers.mjs";

const ADAPTER = pathToFileURL(join(PLUGIN_ROOT, "providers", "cursor", "adapter.mjs")).href;

/** A throwaway plugin tree holding one skill with the given frontmatter name. */
function fixture(nameValue) {
  const root = mkdtempSync(join(tmpdir(), "adev-cursor-containment-"));
  const skillDir = join(root, "src", "skills", "probe");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${nameValue}\ndescription: "probe"\n---\n\n# Probe\n`,
  );
  mkdirSync(join(skillDir, "references"), { recursive: true });
  writeFileSync(join(skillDir, "references", "companion.md"), "# companion\n");
  return { root, sourceSkills: join(root, "src", "skills"), target: join(root, "out", "skills") };
}

test("a traversing skill name is refused, and nothing is written outside the root", async () => {
  const mod = await import(ADAPTER);
  const publish = mod.publishSkillsFromCache ?? mod.default?.publishSkillsFromCache;
  if (typeof publish !== "function") {
    // The adapter does not expose the publish step directly; assert the guards
    // exist in source rather than skipping, so this test cannot silently pass.
    const src = (await import("node:fs")).readFileSync(
      join(PLUGIN_ROOT, "providers", "cursor", "adapter.mjs"), "utf8",
    );
    assert.match(src, /SAFE_SKILL_DIRNAME/, "name allowlist must exist");
    assert.match(src, /assertWithinSkillsRoot/, "containment check must exist");
    assert.match(src, /SKILL_PATH_ESCAPE/, "escape must be refused with a named error");
    return;
  }

  const { root, sourceSkills, target } = fixture("adev:../../escaped");
  try {
    const res = publish(sourceSkills, target);
    const escaped = join(root, "out", "escaped");
    assert.ok(!existsSync(escaped), `wrote outside the skills root: ${escaped}`);
    assert.ok(
      !(res?.published ?? []).some((n) => String(n).includes("..")),
      "a traversing name must not be reported as published",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the name allowlist rejects separators and traversal, accepts real skill names", async () => {
  const src = (await import("node:fs")).readFileSync(
    join(PLUGIN_ROOT, "providers", "cursor", "adapter.mjs"), "utf8",
  );
  const m = /const SAFE_SKILL_DIRNAME = (\/.*\/);/.exec(src);
  assert.ok(m, "SAFE_SKILL_DIRNAME must be declared as a regex literal");
  const re = new RegExp(m[1].slice(1, -1));

  // Only genuinely unsafe inputs. A trailing dot (`adev-.`) is a legal POSIX
  // directory name and not a traversal — traversal needs the SEGMENT to be `.`
  // or `..`, which the leading-alnum requirement already rejects. Asserting
  // against it would have meant distorting the guard to satisfy the test.
  for (const bad of [
    "adev-../../x",  // the reported vector
    "adev-a/b",      // any separator
    "../x",          // relative traversal
    "/abs",          // absolute
    ".hidden",       // leading dot
    "..",            // the traversal segment itself
    ".",             // the current-dir segment itself
  ]) {
    assert.ok(!re.test(bad), `allowlist must reject ${JSON.stringify(bad)}`);
  }
  for (const good of ["adev-build", "adev-review-specs", "adev-write-test", "adev-init"]) {
    assert.ok(re.test(good), `allowlist must accept the real name ${JSON.stringify(good)}`);
  }
});
