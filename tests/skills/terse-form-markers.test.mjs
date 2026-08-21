// Fence-aware guard for the `**Terse form:**` marker wiring across the
// verbosity-axis output-personas capability.
//
// Spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
// Plan-task: 1
//
// This suite is authored RED, before any `**Terse form:**` marker has been
// wired into skills/status, skills/route, skills/sample, or skills/learn
// (tasks 2-6 of the plan turn it green file by file). The scanner below is
// the executable definition of the section-extent rule (plan SA-3): a task-2
// prose document will describe the same grammar, but if the two ever
// disagree, this scanner is authoritative.
//
// The governed set is derived, never hardcoded: the 9 literal headings in
// route/sample/learn, union every fence-aware `^### Mode: ` heading found in
// status/SKILL.md at scan time. An eleventh `### Mode:` section added later
// must fail this suite only for lacking a marker, never for merely existing.
//
// Every scan below runs over the canonical skills/ file AND both provider
// mirrors (providers/codex/skills/, providers/opencode/skills/). That is
// this suite's MIRROR_DRIFT contribution — marker-level only. Byte-for-byte
// mirror parity is owned by tests/sync/provider-skill-parity.test.mjs; this
// suite does not re-run the sync script or duplicate byte-parity assertions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILLS = ["status", "route", "sample", "learn"];
const PROVIDERS = ["canonical", "codex", "opencode"];

function skillPath(provider, skill) {
  if (provider === "canonical") {
    return join(PLUGIN_ROOT, "skills", skill, "SKILL.md");
  }
  return join(PLUGIN_ROOT, "providers", provider, "skills", skill, "SKILL.md");
}

// Key a scan result by "<skill>/SKILL.md" regardless of which provider tree
// it came from, so governedSections() can dispatch on skill identity without
// caring about the absolute path prefix.
function skillKey(file) {
  const parts = file.split("/");
  return parts.slice(-2).join("/");
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^(\s*)(`{3,}|~{3,})/;

/**
 * scanSections(text, file) -> [{ file, startLine, endLine, depth, heading, body }]
 *
 * Fence-aware (``` and ~~~) and frontmatter-aware (leading `---` block).
 * Extent = heading line .. line before the next heading of equal-or-shallower
 * depth, else EOF. Returns EVERY heading in the document (governed or not) —
 * governedSections() below filters the result. Keyed by (file, startLine),
 * never by heading text, so two sections that share heading text (status's
 * two `--milestone` Mode sections) remain distinct entries.
 */
function scanSections(text, file) {
  const lines = text.split("\n");
  const headings = [];
  let inFrontmatter = false;
  let fence = null; // { char, len } | null

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].replace(/\r$/, "");

    if (lineNo === 1 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      continue;
    }

    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const char = fenceMatch[2][0];
      const len = fenceMatch[2].length;
      if (!fence) {
        fence = { char, len };
        continue;
      }
      if (fence.char === char && len >= fence.len) {
        fence = null;
        continue;
      }
      // A fence-marker-shaped line of a different character (or shorter run)
      // while already inside a fence is literal fenced content, not a close.
    }
    if (fence) continue;

    const m = line.match(HEADING_RE);
    if (m) {
      headings.push({ lineNo, depth: m[1].length, headingLine: line });
    }
  }

  const totalLines = lines.length;
  return headings.map((h, idx) => {
    let endLine = totalLines;
    for (let j = idx + 1; j < headings.length; j++) {
      if (headings[j].depth <= h.depth) {
        endLine = headings[j].lineNo - 1;
        break;
      }
    }
    const bodyLines = lines.slice(h.lineNo - 1, endLine);
    return {
      file,
      startLine: h.lineNo,
      endLine,
      depth: h.depth,
      heading: h.headingLine,
      body: bodyLines.join("\n"),
    };
  });
}

// The 9 literal governed headings outside status (spec: skill-output-rules-wiring).
const LITERAL_GOVERNED = {
  "route/SKILL.md": ["## Step 5: Report to User", "## Dry-Run Mode"],
  "sample/SKILL.md": [
    "#### Present Results",
    "### Step 5: Register",
    "## --score Mode",
    "## --refresh Mode",
  ],
  "learn/SKILL.md": [
    "## Step 4: Present for Confirmation",
    "## Step 6: Confirm",
    "## List Mode (`--list`)",
  ],
};

/**
 * governedSections(file, sections) -> the 9 literal headings + every
 * /^### Mode: / heading found in status. Derived from the scan, never a
 * hardcoded count — status contributes however many `### Mode:` sections
 * exist today, whatever that number happens to be.
 */
function governedSections(file, sections) {
  const key = skillKey(file);
  if (key === "status/SKILL.md") {
    return sections.filter((s) => /^### Mode: /.test(s.heading));
  }
  const literalSet = LITERAL_GOVERNED[key];
  if (!literalSet) return [];
  return sections.filter((s) => literalSet.includes(s.heading));
}

function allScans() {
  const results = [];
  for (const skill of SKILLS) {
    for (const provider of PROVIDERS) {
      const file = skillPath(provider, skill);
      const text = readFileSync(file, "utf8");
      const allSections = scanSections(text, file);
      const governed = governedSections(file, allSections);
      results.push({ provider, skill, file, text, allSections, governed });
    }
  }
  return results;
}

const MARKER_LINE_RE = /^\*\*Terse form:\*\*/;

function markerLinesIn(bodyText) {
  const lines = bodyText.split("\n");
  const out = [];
  lines.forEach((l, i) => {
    if (MARKER_LINE_RE.test(l)) out.push(i);
  });
  return out;
}

/** Extract the terse-form block text (marker line through end of section), or null. */
function extractTerseFormBlock(section) {
  const bodyLines = section.body.split("\n");
  const idx = bodyLines.findIndex((l) => MARKER_LINE_RE.test(l));
  if (idx === -1) return null;
  return bodyLines.slice(idx).join("\n");
}

// ---------------------------------------------------------------------------
// MISSING_TERSE_FORM
// ---------------------------------------------------------------------------

test("MISSING_TERSE_FORM: every governed section carries a **Terse form:** marker", () => {
  const violations = [];
  for (const { provider, skill, governed } of allScans()) {
    for (const section of governed) {
      const hasMarker = markerLinesIn(section.body).length > 0;
      if (!hasMarker) {
        violations.push(
          `MISSING_TERSE_FORM [${provider}] ${skill}/SKILL.md:${section.startLine} "${section.heading}"`,
        );
      }
    }
  }
  assert.deepEqual(violations, []);
});

// ---------------------------------------------------------------------------
// MARKER_OUT_OF_SCOPE
// ---------------------------------------------------------------------------

test("MARKER_OUT_OF_SCOPE: no **Terse form:** marker outside a governed extent", () => {
  const violations = [];
  for (const { provider, skill, text, governed } of allScans()) {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (!MARKER_LINE_RE.test(line)) return;
      const lineNo = i + 1;
      const inScope = governed.some((s) => lineNo >= s.startLine && lineNo <= s.endLine);
      if (!inScope) {
        violations.push(
          `MARKER_OUT_OF_SCOPE [${provider}] ${skill}/SKILL.md:${lineNo} — marker found outside any governed section extent`,
        );
      }
    });
  }
  assert.deepEqual(violations, []);
});

// ---------------------------------------------------------------------------
// Marker position: last block of its governed section
// ---------------------------------------------------------------------------

test("the marker is the last block of its governed section", () => {
  const violations = [];
  for (const { provider, skill, allSections, governed } of allScans()) {
    for (const section of governed) {
      const markerIdxs = markerLinesIn(section.body);
      if (markerIdxs.length === 0) continue; // absence is MISSING_TERSE_FORM's concern
      if (markerIdxs.length > 1) {
        violations.push(
          `[${provider}] ${skill}/SKILL.md:${section.startLine} "${section.heading}" has ${markerIdxs.length} Terse form markers, expected exactly one`,
        );
        continue;
      }
      const markerLine = section.startLine + markerIdxs[0];
      const laterHeading = allSections.find(
        (h) => h.startLine > markerLine && h.startLine <= section.endLine,
      );
      if (laterHeading) {
        violations.push(
          `[${provider}] ${skill}/SKILL.md:${section.startLine} "${section.heading}" marker at L${markerLine} is not the last block — heading "${laterHeading.heading}" (L${laterHeading.startLine}) follows within the section extent`,
        );
      }
    }
  }
  assert.deepEqual(violations, []);
});

// ---------------------------------------------------------------------------
// BEH-2: no absolute filesystem path in a terse-form block
// ---------------------------------------------------------------------------

// The character class must include ":" — without it, a match on "/adev:status"
// truncates at "/adev" (stopping before the colon), so `afterSlash` below can
// never equal "adev:..." and the adev-slash-command exemption a few lines
// down is unreachable dead code. Keep ":" in the class so the exemption can
// actually fire; this does not weaken absolute-path detection since a bare
// "/" followed by path-shaped text (with or without a colon inside it) is
// still captured and still flagged unless it is specifically the adev: form.
const UNIX_ABS_PATH_RE = /(^|[\s(`"'])\/[A-Za-z0-9._:\-/]+/g;
const WINDOWS_ABS_PATH_RE = /[A-Za-z]:\\/;

function findAbsolutePathLines(blockText) {
  const lines = blockText.split("\n");
  const offenders = [];
  let fence = null;
  for (const line of lines) {
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const char = fenceMatch[2][0];
      const len = fenceMatch[2].length;
      if (!fence) {
        fence = { char, len };
        continue;
      }
      if (fence.char === char && len >= fence.len) {
        fence = null;
        continue;
      }
    }
    if (fence) continue;

    if (WINDOWS_ABS_PATH_RE.test(line)) {
      offenders.push(line);
      continue;
    }

    UNIX_ABS_PATH_RE.lastIndex = 0;
    let m;
    let flagged = false;
    while ((m = UNIX_ABS_PATH_RE.exec(line))) {
      const matchText = m[0];
      const slashIdx = matchText.indexOf("/");
      const afterSlash = matchText.slice(slashIdx + 1);
      // adev slash-commands (e.g. "/adev:status --spec <path>") are commands,
      // not filesystem paths — exempt the leading "/adev:" token explicitly
      // rather than weakening the path regex generally.
      if (afterSlash.startsWith("adev:")) continue;
      flagged = true;
      break;
    }
    if (flagged) offenders.push(line);
  }
  return offenders;
}

test("BEH-2: no terse-form block emits an absolute filesystem path", () => {
  const violations = [];
  for (const { provider, skill, governed } of allScans()) {
    for (const section of governed) {
      const block = extractTerseFormBlock(section);
      if (!block) continue; // MISSING_TERSE_FORM already flags absence
      const offenders = findAbsolutePathLines(block);
      for (const line of offenders) {
        violations.push(
          `BEH-2 [${provider}] ${skill}/SKILL.md:${section.startLine} "${section.heading}" — absolute path in terse-form block: ${JSON.stringify(line)}`,
        );
      }
    }
  }
  assert.deepEqual(violations, []);
});

// ---------------------------------------------------------------------------
// BEH-3: at most one markdown table per terse-form block
// ---------------------------------------------------------------------------

const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;

function countTablesOpened(blockText) {
  let count = 0;
  let inTable = false;
  for (const line of blockText.split("\n")) {
    const isRow = TABLE_ROW_RE.test(line);
    if (isRow && !inTable) {
      count++;
      inTable = true;
    } else if (!isRow) {
      inTable = false;
    }
  }
  return count;
}

test("BEH-3: each terse-form block contains at most one markdown table", () => {
  const violations = [];
  for (const { provider, skill, governed } of allScans()) {
    for (const section of governed) {
      const block = extractTerseFormBlock(section);
      if (!block) continue;
      const tableCount = countTablesOpened(block);
      if (tableCount > 1) {
        violations.push(
          `BEH-3 [${provider}] ${skill}/SKILL.md:${section.startLine} "${section.heading}" — ${tableCount} tables opened in terse-form block, expected at most 1`,
        );
      }
    }
  }
  assert.deepEqual(violations, []);
});

// ---------------------------------------------------------------------------
// BEH-7: persona/verbosity footnote names the three overlays literally
// ---------------------------------------------------------------------------

const FOOTNOTE_MARKER = "**Persona adaptation:**";
const INTERPOLATION_PATTERNS = ["templates/verbosity/<", "${", "{{", "$VERBOSITY"];

function findFootnoteLine(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(FOOTNOTE_MARKER)) {
      return { lineNo: i + 1, text: lines[i] };
    }
  }
  return null;
}

test("BEH-7: each file's persona/verbosity footnote names terse.md, normal.md and deep.md literally, and interpolates no resolved value into a path", () => {
  const violations = [];
  for (const { provider, skill, text } of allScans()) {
    const footnote = findFootnoteLine(text);
    if (!footnote) {
      violations.push(`BEH-7 [${provider}] ${skill}/SKILL.md — no ${FOOTNOTE_MARKER} footnote found`);
      continue;
    }
    const { lineNo, text: line } = footnote;
    const hasFullTerse = line.includes("templates/verbosity/terse.md");
    const hasNormal = line.includes("templates/verbosity/normal.md") || line.includes("normal.md");
    const hasDeep = line.includes("templates/verbosity/deep.md") || line.includes("deep.md");
    const hasInterpolation = INTERPOLATION_PATTERNS.some((p) => line.includes(p));

    if (!hasFullTerse || !hasNormal || !hasDeep || hasInterpolation) {
      const missing = [];
      if (!hasFullTerse) missing.push("templates/verbosity/terse.md (full path)");
      if (!hasNormal) missing.push("normal.md");
      if (!hasDeep) missing.push("deep.md");
      if (hasInterpolation) missing.push("(contains an interpolation pattern)");
      violations.push(
        `BEH-7 [${provider}] ${skill}/SKILL.md:${lineNo} footnote missing/violating: ${missing.join(", ")} — line: ${JSON.stringify(line)}`,
      );
    }
  }
  assert.deepEqual(violations, []);
});

// ---------------------------------------------------------------------------
// BEH-8: no terse-form block relies solely on a sentence/paragraph/line/word count
// ---------------------------------------------------------------------------

const COUNT_ONLY_RE = /\b\d+\s*(sentence|paragraph|line|word)s?\b/;
const BULLET_RE = /^\s*[-*]\s+/;

function isCountOnlyBlock(blockText) {
  const bullets = blockText.split("\n").filter((l) => BULLET_RE.test(l));
  if (bullets.length === 0) return false;
  return bullets.every((b) => COUNT_ONLY_RE.test(b));
}

test("BEH-8: no terse-form block uses a sentence/paragraph count as its only constraint", () => {
  const violations = [];
  for (const { provider, skill, governed } of allScans()) {
    for (const section of governed) {
      const block = extractTerseFormBlock(section);
      if (!block) continue;
      if (isCountOnlyBlock(block)) {
        violations.push(
          `BEH-8 [${provider}] ${skill}/SKILL.md:${section.startLine} "${section.heading}" — terse-form block's only constraint bullet(s) are sentence/paragraph/line/word counts`,
        );
      }
    }
  }
  assert.deepEqual(violations, []);
});

// ---------------------------------------------------------------------------
// status's two identically-titled Mode sections are two distinct governed
// sections
// ---------------------------------------------------------------------------
//
// Derived, never hardcoded (plan-task 2 correction, per Task 1's "derive,
// never hardcode" mandate): status/SKILL.md has two
// "### Mode: `--milestone <name>`" sections. An earlier revision of this
// guard pinned their absolute line numbers, which churns every time a later
// task in this plan adds content earlier in the file (task 3 alone adds ten
// **Terse form:** blocks to this file). This version derives the duplicate
// pair by grouping governed sections on heading text at scan time, so it is
// insensitive to line-number drift while still catching a text-keyed map
// that conflates the two sections.

test("status's two identically-titled Mode sections are two distinct governed sections", () => {
  const file = skillPath("canonical", "status");
  const text = readFileSync(file, "utf8");
  const sections = scanSections(text, file);
  const governed = governedSections(file, sections);

  const byHeading = new Map();
  for (const section of governed) {
    if (!byHeading.has(section.heading)) byHeading.set(section.heading, []);
    byHeading.get(section.heading).push(section);
  }
  const duplicated = [...byHeading.entries()].filter(([, group]) => group.length > 1);

  assert.equal(
    duplicated.length,
    1,
    `expected exactly one heading text to occur more than once among status's governed sections, found ${duplicated.length}`,
  );

  const [heading, group] = duplicated[0];
  assert.equal(
    group.length,
    2,
    `expected "${heading}" to occur exactly twice among status's governed sections, found ${group.length}`,
  );

  const [a, b] = group.slice().sort((x, y) => x.startLine - y.startLine);
  assert.notEqual(a.startLine, b.startLine);
  assert.ok(
    a.endLine < b.startLine,
    `earlier "${heading}" section (ends L${a.endLine}) must not swallow the later one (starts L${b.startLine})`,
  );
});

// ---------------------------------------------------------------------------
// Provider mirrors carry the same markers as canonical (MIRROR_DRIFT, marker-level)
// ---------------------------------------------------------------------------

test("provider mirrors carry the same markers as the canonical skills/ files", () => {
  const violations = [];
  for (const skill of SKILLS) {
    const canonicalFile = skillPath("canonical", skill);
    const canonicalText = readFileSync(canonicalFile, "utf8");
    const canonicalGoverned = governedSections(canonicalFile, scanSections(canonicalText, canonicalFile));
    const canonicalMarkers = new Map(
      canonicalGoverned.map((s) => [s.startLine, extractTerseFormBlock(s)]),
    );

    for (const provider of ["codex", "opencode"]) {
      const mirrorFile = skillPath(provider, skill);
      const mirrorText = readFileSync(mirrorFile, "utf8");
      const mirrorGoverned = governedSections(mirrorFile, scanSections(mirrorText, mirrorFile));
      const mirrorMarkers = new Map(mirrorGoverned.map((s) => [s.startLine, extractTerseFormBlock(s)]));

      for (const [startLine, canonicalBlock] of canonicalMarkers) {
        const mirrorBlock = mirrorMarkers.has(startLine) ? mirrorMarkers.get(startLine) : undefined;
        if (mirrorBlock !== canonicalBlock) {
          violations.push(
            `MIRROR_DRIFT [${provider}] ${skill}/SKILL.md:${startLine} — canonical terse-form block does not match mirror`,
          );
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

// ---------------------------------------------------------------------------
// Charter capability row: describes the four-skill increment, not a
// 17-section connection (plan-task 8)
// ---------------------------------------------------------------------------

test("charter capability row describes the four-skill increment, not a 17-section connection", () => {
  const charterPath = join(
    PLUGIN_ROOT,
    ".context-index",
    "specs",
    "features",
    "output-personas",
    "charter.md",
  );
  const charterText = readFileSync(charterPath, "utf8");

  // Locate the row by capability name, not by line number — every prior
  // task in this plan lost work to line-number pinning.
  const row = charterText
    .split("\n")
    .find((line) => line.trim().startsWith("|") && line.includes("Skill output rules wiring"));

  assert.ok(
    row,
    `expected a Capability Map row for "Skill output rules wiring" in ${charterPath}, found none`,
  );

  assert.ok(
    !row.includes("17"),
    `capability row must not carry the old 17-section count, found: ${JSON.stringify(row)}`,
  );

  const nameSkill = (skill) =>
    row.includes(`\`${skill}\``) || row.includes(skill);
  const namesFourSkills = ["status", "route", "sample", "learn"].every(nameSkill);
  const namesNineteen = row.includes("19");

  assert.ok(
    namesNineteen && namesFourSkills,
    `capability row must name the four-skill, nineteen-section increment (19 and status/route/sample/learn), found: ${JSON.stringify(row)}`,
  );
});
