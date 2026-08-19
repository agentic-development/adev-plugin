// tests/skills/build-milestone-and-stale.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "build", "SKILL.md");
const MILESTONE_PATH = join(PLUGIN_ROOT, "skills", "build", "references", "milestone-mode.md");
const skill = readFileSync(SKILL_PATH, "utf8") + "\n" + readFileSync(MILESTONE_PATH, "utf8");

describe("adev:build SKILL.md — milestone filter and stale build detection", () => {
  it("Implement Pipeline milestone filter lists review-passed, implemented, validated explicitly (+8 more contract assertions)", () => {
    // Implement Pipeline milestone filter lists review-passed, implemented, validated explicitly
    assert.match(skill, /review-passed.*implemented.*validated|review-passed[^.]*implemented[^.]*validated/is,
    "Implement Pipeline milestone filter must explicitly list review-passed, implemented, validated");

    // Implement Pipeline milestone filter does NOT use 'review-pending or later'
    assert.doesNotMatch(skill, /review-pending or later/,
    "Must not use the old 'review-pending or later' filter text");

    // Implement Pipeline shows visible skip note for review-pending specs
    assert.match(skill, /[Ss]kipped.*review-pending|review-pending.*[Ss]kipp/i,
    "Must display a visible note when skipping review-pending specs");

    // Implement Pipeline shows visible skip note for review-blocked specs
    assert.match(skill, /[Ss]kipped.*review-blocked|review-blocked.*[Ss]kipp/i,
    "Must display a visible note when skipping review-blocked specs");

    // --phase --full includes review-pending specs
    assert.match(skill, /--full.*review-pending|review-pending.*--full/i,
    "--phase --full must include review-pending specs in the filter");

    // --phase --full includes review-blocked specs
    assert.match(skill, /--full.*review-blocked|review-blocked.*--full/i,
    "--phase --full must include review-blocked specs (Full Pipeline can auto-fix them)");

    // detects zombie builds (in_progress + all steps skipped)
    assert.match(skill, /zombie|stale build/i,
    "Must include zombie / stale build detection logic");

    // zombie detection checks for all recorded steps having status skipped
    assert.match(skill, /all.*steps.*skipped|all recorded steps.*skipped/i,
    "Zombie detection must check that all steps are skipped");

    // reports zombie build with a suggested --from resume command
    assert.match(skill, /--from implement|--from.*resume|resume.*--from/i,
    "Zombie build report must include a --from resume suggestion");
  });

  it("new --spec build warns if a zombie build exists for the same slug", () => {
    assert.match(skill, /zombie.*slug|slug.*stale|overwrite|same slug/i,
      "New --spec build must ask user to resume or overwrite when zombie exists for the same slug");
  });
});
