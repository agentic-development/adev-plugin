// tests/evals/skill-disclosure/relocation-fidelity.eval.mjs
//
// TIER 2b — relocation fidelity. Deterministic, free, no dispatch.
//
// The question "did the reduced skill keep working?" splits into three, and only two
// of them are answerable cheaply:
//
//   1. is the CONTENT the same?        <- this file. deterministic.
//   2. does the agent LOAD it?         <- read-trace.eval.mjs. one dispatch.
//   3. does the agent BEHAVE the same? <- not answerable at n=1. see below.
//
// (3) was attempted: the same audit pass was run against the monolithic body on main
// and the split body on this branch, over an identical audit target. They produced
// different findings (3 vs 1). That looked alarming until (1) was checked — Pass 12's
// text is byte-identical across the refactor apart from one trailing newline, and the
// companion carries every finding type including the one the split run skipped. So the
// divergence was the model declining a step it had been given, not instructions that
// went missing. Two single runs cannot separate that from noise, and outcome
// comparison at n=1 is therefore not a usable regression signal for skills. Content
// equivalence is, and it is free.
//
// This asserts that prose moved into a companion is IDENTICAL to the prose it
// replaced in the pre-split body — the strongest available statement that a
// relocation changed nothing, and the one a prose-presence test cannot make, since
// that only asks whether a string exists somewhere.
//
// Run: node --test tests/evals/skill-disclosure/relocation-fidelity.eval.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The commit the split was measured against — the last monolithic state. */
const PRE_SPLIT = "main";

/**
 * Sections whose relocation must be lossless, as {companion, heading} pairs. The
 * heading is sliced out of the pre-split body and compared to the companion.
 *
 * Kept small and load-bearing rather than exhaustive: these are sections where a
 * silent truncation would change what an agent does, not merely how the file reads.
 */
const RELOCATIONS = [
  {
    companion: "skills/hygiene/references/audit-passes/pass-12-lifecycle-audit.md",
    from: "## Audit Pass 12:",
    to: "## Audit Pass 13:",
  },
  {
    companion: "skills/hygiene/references/audit-passes/pass-19-governance-registry-drift.md",
    from: "## Audit Pass 19:",
    to: "## Audit Pass 20:",
  },
  {
    companion: "skills/specify/references/modes/extract-mode.md",
    from: "## Extract Mode (`--extract`)",
    to: "## Refactor Mode (`--refactor`)",
  },
];

/** The pre-split body of the skill that owned `companion`. */
function preSplitBody(companion) {
  const skill = /^skills\/([a-z-]+)\//.exec(companion)[1];
  return execFileSync("git", ["show", `${PRE_SPLIT}:skills/${skill}/SKILL.md`], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  });
}

const norm = (s) => s.replace(/[ \t]+$/gm, "").replace(/\n+$/, "");

for (const { companion, from, to } of RELOCATIONS) {
  test(`${companion.split("/").pop()} is byte-identical to the prose it replaced`, () => {
    const body = preSplitBody(companion);
    const start = body.indexOf(from);
    assert.notEqual(start, -1, `"${from}" not found in the pre-split body — has the anchor moved?`);
    const end = body.indexOf(to, start);
    assert.notEqual(end, -1, `"${to}" not found after "${from}" — cannot bound the section`);

    const original = norm(body.slice(start, end));
    const relocated = norm(readFileSync(join(ROOT, companion), "utf8"));

    if (original === relocated) return;

    // Report the first divergence rather than dumping two 5 KB blobs.
    const a = original.split("\n"), b = relocated.split("\n");
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    assert.fail(
      `relocation changed the prose at line ${i + 1} of the section:\n` +
        `  pre-split: ${JSON.stringify(a[i] ?? "<end>")}\n` +
        `  companion: ${JSON.stringify(b[i] ?? "<end>")}\n` +
        `(${a.length} lines before, ${b.length} after)`,
    );
  });
}
