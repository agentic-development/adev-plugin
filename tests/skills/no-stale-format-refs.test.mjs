/**
 * Static checks asserting that lifecycle skills use the new JSON/JSONL
 * APIs and do not reference legacy formats.
 *
 * This file fuses two related concerns:
 *
 *   A. Plan-task channel hygiene
 *      (plan-task-events.spec.md): `/adev:plan` emits `reportPlanTask`
 *      pending events instead of creating per-task issues; `/adev:implement`
 *      reads from `currentState(...).planTasks` and emits transitions;
 *      no plan template carries a Status column.
 *
 *   B. Audit-target grep gates
 *      (lifecycle-skill-instruction-updates.spec.md § Removed Prose): every
 *      lifecycle skill's SKILL.md is scrubbed of references to legacy
 *      formats — `tasks.md` parsing, `.context-index/build-state`,
 *      `.execution-state.md`, markdown-table issue-board columns,
 *      `.review.md` greps, `last-reviewed-revision` / `file-sha` frontmatter
 *      manipulation, `git hash-object`, and hardcoded plugin-root paths.
 *
 * Specs:
 *   - .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
 *   - .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { strict as assert } from "node:assert";

const __filename = fileURLToPath(import.meta.url);
const PLUGIN_ROOT = join(__filename, "..", "..", "..");
const SKILLS_ROOT = join(PLUGIN_ROOT, "skills");

const PLAN_SKILL_FILES = [
  "skills/plan/SKILL.md",
  "skills/plan/references/feature-mode.md",
  "skills/plan/references/epic-mode.md",
  "skills/plan/references/release-mode.md",
  "skills/plan/references/milestone-mode.md",
];

// ────────────────────────────────────────────────────────────────────
// Task 1: /adev:plan switches to reportPlanTask
// ────────────────────────────────────────────────────────────────────

test("no-stale-format-refs / /adev:plan does not create per-task issues", () => {
  for (const f of PLAN_SKILL_FILES) {
    const content = readFileSync(f, "utf8");
    assert.ok(
      !/create\([^)]*planTask\s*:/.test(content),
      `${f} still references create({ ..., planTask: ... })`,
    );
  }
});

test("no-stale-format-refs / /adev:plan SKILL.md references reportPlanTask", () => {
  // The canonical reportPlanTask block lives in the base SKILL.md. The mode
  // files inherit task emission behavior; we do not require every mode file
  // to spell it out, but the base must.
  const content = readFileSync("skills/plan/SKILL.md", "utf8");
  assert.ok(
    /reportPlanTask/.test(content),
    "skills/plan/SKILL.md does not reference reportPlanTask",
  );
});

// ────────────────────────────────────────────────────────────────────
// Task 2: /adev:implement reads from planTasks + emits transitions
// ────────────────────────────────────────────────────────────────────

test("no-stale-format-refs / /adev:implement reads from planTasks projection", () => {
  const content = readFileSync("skills/implement/SKILL.md", "utf8");
  assert.ok(
    !/check the box|update the issue for this task|tick the checkbox/i.test(
      content,
    ),
    "plan-checkbox mutation prose still present in /adev:implement",
  );
  assert.ok(
    /currentState\([^)]*\)\.planTasks/.test(content),
    "/adev:implement does not read currentState(...).planTasks",
  );
  assert.ok(
    /reportPlanTask\([^)]*['"]in_progress['"]/.test(content) ||
      /reportPlanTask\([^)]*status:\s*['"]in_progress/.test(content),
    "/adev:implement does not emit reportPlanTask in_progress transitions",
  );
});

test("no-stale-format-refs / /adev:implement does not mutate plan checkboxes", () => {
  const content = readFileSync("skills/implement/SKILL.md", "utf8");
  assert.ok(
    !/Update plan file checkboxes/i.test(content),
    "/adev:implement still instructs the agent to update plan file checkboxes",
  );
  // Also guard against the regex that flips - [ ] to - [x] on the plan markdown.
  assert.ok(
    !/mark all `- \[ \]` checkboxes/i.test(content),
    "/adev:implement still instructs the agent to mark - [ ] checkboxes as - [x]",
  );
});

// ────────────────────────────────────────────────────────────────────
// Task 3: clarifying note + no Status column in any plan template
// ────────────────────────────────────────────────────────────────────

test("skills/plan/SKILL.md: clarifying note about lifecycle log status tracking", () => {
  const content = readFileSync("skills/plan/SKILL.md", "utf8");
  assert.match(
    content,
    /(status .*lifecycle event log|checkboxes? are authoring guides only|not mutated by skills)/i,
    "skills/plan/SKILL.md missing the clarifying note about checkbox/status semantics",
  );
});

test("no plan-template carries a Status column", () => {
  // Audit every place a plan stencil could live: the canonical inline template
  // in skills/plan/SKILL.md, and any plan-template files under templates/.
  const candidatePaths = ["skills/plan/SKILL.md"];
  try {
    for (const f of readdirSync("templates/")) {
      if (/^plan-template/.test(f)) candidatePaths.push(`templates/${f}`);
    }
  } catch {
    /* templates/ may not exist */
  }
  for (const p of candidatePaths) {
    const content = readFileSync(p, "utf8");
    // Look at lines that introduce a plan-task table header (must contain
    // a # or Title column AND one of the canonical plan-task columns).
    const taskHeaderLines = content
      .split("\n")
      .filter(
        (l) =>
          /^\|.*\|.*\|/.test(l) &&
          /\b(#|Title)\b.*\|.*\b(Complexity|Files|Estimated)/.test(l),
      );
    for (const header of taskHeaderLines) {
      assert.ok(
        !/\|\s*Status\s*\|/i.test(header),
        `${p}: plan-task table header still contains a Status column: ${header}`,
      );
    }
  }
});

// ────────────────────────────────────────────────────────────────────
// Part B: Audit-target grep gates across skills/**/*.md
// (lifecycle-skill-instruction-updates.spec.md § Removed Prose)
// ────────────────────────────────────────────────────────────────────

const EXCLUDED_SKILLS_AUDIT = new Set([
  "init",
  "repomap",
  "assess",
  "retro",
  "codehealth",
  "document",
  "eval",
  "learn",
  "sample",
  "prototype",
  "deploy",
  "recover",
  "route",
]);

const STALE_PATTERNS_AUDIT = [
  // 1. tasks.md parsing instructions
  { name: "tasks.md parsing outside render/issues", regex: /\btasks\.md\b/ },
  // 2. build-state directory references
  {
    name: "build-state directory",
    regex: /\.context-index\/build-state\b/,
  },
  // 3. .execution-state.md YAML frontmatter parsing
  {
    name: ".execution-state.md YAML parsing",
    regex: /\.execution-state\.md\b/,
  },
  // 4. Markdown-table column lists for issue board
  {
    name: "issue-board markdown table columns",
    regex: /\|\s*id\s*\|\s*title\s*\|\s*status\s*\|/i,
  },
  // 5. .review.md grep instructions
  {
    name: ".review.md grep instructions",
    regex: /grep[^\n]*\.review\.md/,
  },
  // 6. last-reviewed-revision frontmatter manipulation
  {
    name: "last-reviewed-revision field manipulation",
    regex: /last-reviewed-revision\s*:/,
  },
  // 6. file-sha frontmatter manipulation
  { name: "file-sha field manipulation", regex: /file-sha\s*:/ },
  // 7. git hash-object invocations
  { name: "git hash-object invocations", regex: /git\s+hash-object/ },
  // 8. Hardcoded plugin-root prefixes (non-<ADEV_ROOT>)
  {
    name: "non-<ADEV_ROOT> plugin-root prefix",
    regex: /~\/\.claude\/|\/Users\/[^/]+\/\.claude\//,
  },
];

// Allow-list: skill file (relative to skills/) → set of pattern names that
// are permitted to remain. Rationale:
//   - `issues/SKILL.md`: legacy-read prose under deprecation block may
//     mention `tasks.md` as the read-only consumer view target.
//   - `status/SKILL.md`: `--render` produces `tasks.md` as a write target.
//   - `sync/SKILL.md`: when `tasks.backend` is "file", the synced agent-file
//     task-management section points at the legacy `tasks.md` board; the prose
//     names that path as the file-backend reference target.
//   - `review-specs/SKILL.md`: owns `last-reviewed-revision` and `file-sha`
//     field writes; prose describes those fields directly.
const ALLOW_FILE_PATTERNS_AUDIT = {
  "issues/SKILL.md": ["tasks.md parsing outside render/issues"],
  "status/SKILL.md": ["tasks.md parsing outside render/issues"],
  "sync/SKILL.md": ["tasks.md parsing outside render/issues"],
  "review-specs/SKILL.md": [
    "last-reviewed-revision field manipulation",
    "file-sha field manipulation",
  ],
};

/**
 * Recursively collect all `*.md` files under `skills/` excluding
 * `*-prompt.md`. Returns paths relative to `skills/` (forward-slash form).
 */
function listSkillMarkdownFiles() {
  const entries = readdirSync(SKILLS_ROOT, {
    recursive: true,
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".md")) continue;
    if (entry.name.endsWith("-prompt.md")) continue;
    const parent = entry.parentPath ?? entry.path ?? SKILLS_ROOT;
    const abs = join(parent, entry.name);
    const rel = relative(SKILLS_ROOT, abs).split(sep).join("/");
    files.push(rel);
  }
  return files;
}

test("audit-target: skill files do not reference legacy formats", () => {
  const files = listSkillMarkdownFiles();
  assert.ok(files.length > 0, "expected to find skill markdown files");

  const violations = [];
  for (const rel of files) {
    const skill = rel.split("/")[0];
    if (EXCLUDED_SKILLS_AUDIT.has(skill)) continue;

    const abs = join(SKILLS_ROOT, rel);
    const content = readFileSync(abs, "utf8");
    const allowList = ALLOW_FILE_PATTERNS_AUDIT[rel] ?? [];

    for (const p of STALE_PATTERNS_AUDIT) {
      if (allowList.includes(p.name)) continue;
      if (p.regex.test(content)) {
        violations.push(`skills/${rel}: ${p.name}`);
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `Stale format references found:\n  ${violations.join("\n  ")}`,
  );
});
