/**
 * Test-support validator for the skill-regression catalog: the thirteen
 * `CATALOG_*` integrity rules from
 * `.context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`.
 *
 * This is NOT a library module. The spec's Consumers section states the catalog
 * introduces "no new library module" — it is read with the reader the rubric
 * loader already uses, and the charter's Interface Contracts table gains no
 * entry. So the validator lives beside the tests that are its only caller.
 * `scripts/run-tests.mjs::collectTestFiles` collects only `*.test.mjs`, so this
 * file is imported by the suite rather than executed as one.
 *
 * It was split out of `skill-regression-catalog.test.mjs` so the thirteen
 * rejecting fixtures (Task 7) have room to land in the test file.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CATALOG_ERROR_CODES } from "../../../lib/evals/catalog-codes.mjs";
import { isContained, lenientRealpath, resolveContained } from "../../../lib/path-safety.mjs";
import { parseYaml } from "../../../lib/profiles/yaml.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(HERE, "..", "..", "..");
export const FIXTURE_DIR = join(REPO_ROOT, "tests", "evals", "skill-regression");
export const CATALOG_PATH = join(FIXTURE_DIR, "catalog.yaml");

/**
 * The two rubric roots `CATALOG_UNRESOLVED_CITATION` scans by DEFAULT. Taken
 * as a parameter rather than hardcoded because two of Task 7's rejecting cases
 * cannot be built otherwise: the unresolvable-citation case needs a rubric
 * carrying a dangling citation, and the `catalog_id`-rename case needs one
 * carrying the renamed prefix, and neither real root can host either.
 */
export const DEFAULT_RUBRIC_ROOTS = Object.freeze([
  "tests/evals/skill-regression/rubrics/*.yaml",
  "skills/*/default-rubric.yaml",
]);

/** The five documented top-level keys — no `version`; see the spec's rationale. */
export const TOP_LEVEL_KEYS = Object.freeze([
  "catalog_id",
  "fixture_root",
  "planted_violations",
  "known_clean",
  "scaffolding",
]);

/** Per-collection required entry fields, from the spec's three field tables. */
export const ENTRY_FIELDS = Object.freeze({
  planted_violations: ["id", "path", "class", "anchor", "covers_skills", "twin", "detect_when"],
  known_clean: ["id", "path", "class", "anchor", "covers_skills", "twin", "must_not_flag_when"],
  scaffolding: ["id", "path", "role", "read_by"],
});

/** The documented `role` enum for `scaffolding` entries. */
export const ROLE_ENUM = Object.freeze([
  "constitution",
  "manifest",
  "charter",
  "live-spec",
  "plan",
  "adr",
  "heuristic",
  "lifecycle-log",
  "deploy-config",
  "agent-file",
  "golden-sample",
  "rubric",
  "eval-config",
  "verdict-input",
  "platform-context",
  "product-spec",
  "issue-board",
  "governance-config",
]);

/**
 * Fields whose value becomes a path segment, an identifier, or an enum member.
 * The flow-indicator / colon-space branch of `CATALOG_UNSAFE_SCALAR` applies to
 * these only: the failure it names is "an untrusted scalar becoming a path
 * segment". `anchor`, `detect_when` and `must_not_flag_when` quote literal file
 * content and English prose, both of which legitimately carry `: ` and
 * brackets. The coercion branch below applies to EVERY field, prose included —
 * an anchor that reparsed as the number 42 would silently match nothing.
 */
export const STRUCTURAL_FIELDS = new Set(["id", "path", "class", "twin", "role"]);

export const SLUG_RE = /^[a-z][a-z0-9-]*$/;

/**
 * The frontmatter/lifecycle-log pairs Seed Content declares, and the event-chain
 * shape each declared `status:` requires. `work` routes on the projected
 * lifecycle state, not on the frontmatter, so "consistent" has to be a
 * predicate over the log rather than a word.
 */
export const STATUS_CHAIN_SHAPES = Object.freeze({
  "review-pending": Object.freeze({
    requireCompleted: ["specify"],
    forbidSteps: ["review", "plan"],
    forbidPlanTasks: true,
  }),
  validated: Object.freeze({
    requireCompleted: ["specify", "review", "plan", "implement", "validate"],
    forbidSteps: [],
    forbidPlanTasks: false,
  }),
});

export const STATUS_EVENT_PAIRS = Object.freeze([
  {
    spec: ".context-index/specs/features/orders/shipping-rates.spec.md",
    log: ".context-index/lifecycle-state/shipping-rates.jsonl",
  },
  {
    spec: ".context-index/specs/features/orders/create-order.spec.md",
    log: ".context-index/lifecycle-state/create-order.jsonl",
  },
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isPlainMap(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function countOccurrences(haystack, needle) {
  if (needle === "") return 0;
  let n = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    n += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return n;
}

export function splitSlugs(value) {
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Frontmatter `status:` of a markdown file, or `null` when absent. */
export function readFrontmatterStatus(absPath) {
  const text = readFileSync(absPath, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find((l) => /^status:\s*/.test(l));
  return line ? line.replace(/^status:\s*/, "").trim() : null;
}

/** Parsed JSONL events, or `null` when a line fails to parse. */
export function readEvents(absPath) {
  const out = [];
  for (const line of readFileSync(absPath, "utf8").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      return null;
    }
  }
  return out;
}

/**
 * Expand a `a/b/*.ext`-style root into concrete absolute files. One `*` per
 * segment is all either default root needs; a missing directory expands to
 * nothing rather than throwing, since `tests/evals/skill-regression/rubrics/`
 * does not exist until a tier lands.
 */
export function expandRubricRoot(repoRoot, pattern) {
  let candidates = [repoRoot];
  for (const segment of pattern.split("/").filter((s) => s !== "")) {
    const next = [];
    for (const base of candidates) {
      if (!segment.includes("*")) {
        const child = join(base, segment);
        if (existsSync(child)) next.push(child);
        continue;
      }
      const re = new RegExp(`^${segment.split("*").map(escapeRe).join(".*")}$`);
      let entries;
      try {
        entries = readdirSync(base);
      } catch {
        continue;
      }
      for (const name of entries.sort()) {
        if (re.test(name)) next.push(join(base, name));
      }
    }
    candidates = next;
  }
  return candidates.filter((p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function walkFiles(root, prefix = "") {
  const out = [];
  for (const name of readdirSync(root).sort()) {
    const abs = join(root, name);
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    if (statSync(abs).isDirectory()) out.push(...walkFiles(abs, rel));
    else out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The validator: the thirteen CATALOG_* rules
// ---------------------------------------------------------------------------

/**
 * Apply the spec's thirteen Catalog Integrity Rules to a catalog file.
 *
 * @param {string} catalogPath absolute path to a `catalog.yaml`
 * @param {{rubricRoots?: string[], repoRoot?: string}} [options]
 * @returns {{errors: Array<{code: string, detail: string}>, checked: Record<string, number>,
 *            scannedRubricFiles: string[]}}
 */
export function validateCatalog(
  catalogPath,
  { rubricRoots = DEFAULT_RUBRIC_ROOTS, repoRoot = REPO_ROOT } = {},
) {
  const errors = [];
  const checked = {};
  for (const code of CATALOG_ERROR_CODES) checked[code] = 0;
  const fail = (code, detail) => {
    errors.push({ code, detail });
  };
  const count = (code) => {
    checked[code] += 1;
  };

  const catalogDir = dirname(catalogPath);
  const doc = parseYaml(readFileSync(catalogPath, "utf8"));

  // --- CATALOG_NESTED_MAP -------------------------------------------------
  for (const [key, value] of Object.entries(doc)) {
    count("CATALOG_NESTED_MAP");
    if (isPlainMap(value)) {
      fail("CATALOG_NESTED_MAP", `top-level "${key}" loaded as a map`);
      continue;
    }
    if (!Array.isArray(value)) continue;
    value.forEach((item, i) => {
      if (Array.isArray(item)) {
        count("CATALOG_NESTED_MAP");
        fail("CATALOG_NESTED_MAP", `${key}[${i}] is a list`);
        return;
      }
      if (!isPlainMap(item)) return;
      for (const [field, fieldValue] of Object.entries(item)) {
        count("CATALOG_NESTED_MAP");
        if (fieldValue !== null && typeof fieldValue === "object") {
          fail(
            "CATALOG_NESTED_MAP",
            `${key}[${i}].${field} loaded as a ${Array.isArray(fieldValue) ? "list" : "map"}`,
          );
        }
      }
    });
  }

  // --- CATALOG_MISSING_KEY (top level) ------------------------------------
  for (const key of TOP_LEVEL_KEYS) {
    count("CATALOG_MISSING_KEY");
    if (!(key in doc)) fail("CATALOG_MISSING_KEY", `top-level key "${key}" is absent`);
  }

  // A declared collection that is not a list of maps is `CATALOG_NESTED_MAP`,
  // not `CATALOG_MISSING_KEY`: MISSING_KEY's clause is about a NAMED key or
  // field being absent and presumes an entry that parsed as a map, while
  // NESTED_MAP's failure — "the reader loads the block as silence and the
  // catalog scores as empty" — is exactly what a discarded collection or list
  // item produces. Without this, `planted_violations: "oops"` (or a scalar in
  // the list) is filtered out silently and all thirteen rules report clean.
  // Shapes the top-level sweep above already reported (a collection that is a
  // map, a list item that is a list) are not re-reported here.
  const collections = {};
  for (const name of Object.keys(ENTRY_FIELDS)) {
    const raw = doc[name];
    if (!Array.isArray(raw)) {
      if (name in doc && !isPlainMap(raw)) {
        count("CATALOG_NESTED_MAP");
        fail(
          "CATALOG_NESTED_MAP",
          `top-level "${name}" is a ${raw === null ? "null" : typeof raw}, not a list of maps`,
        );
      }
      collections[name] = [];
      continue;
    }
    const kept = [];
    raw.forEach((item, i) => {
      if (isPlainMap(item)) {
        kept.push(item);
        return;
      }
      if (Array.isArray(item)) return; // already reported by the sweep above
      count("CATALOG_NESTED_MAP");
      fail(
        "CATALOG_NESTED_MAP",
        `${name}[${i}] is a ${item === null ? "null" : typeof item}, not a map`,
      );
    });
    collections[name] = kept;
  }
  const allEntries = [];
  for (const [name, entries] of Object.entries(collections)) {
    entries.forEach((entry, i) => allEntries.push({ collection: name, index: i, entry }));
  }

  // --- CATALOG_MISSING_KEY (entry fields) ---------------------------------
  for (const { collection, index, entry } of allEntries) {
    for (const field of ENTRY_FIELDS[collection]) {
      count("CATALOG_MISSING_KEY");
      if (!(field in entry)) {
        fail("CATALOG_MISSING_KEY", `${collection}[${index}] is missing "${field}"`);
      }
    }
  }

  // --- CATALOG_DUPLICATE_ID -----------------------------------------------
  const seenIds = new Map();
  for (const { collection, index, entry } of allEntries) {
    count("CATALOG_DUPLICATE_ID");
    const id = entry.id;
    if (typeof id !== "string") continue;
    if (seenIds.has(id)) {
      fail("CATALOG_DUPLICATE_ID", `id "${id}" appears in ${seenIds.get(id)} and ${collection}[${index}]`);
    } else {
      seenIds.set(id, `${collection}[${index}]`);
    }
  }

  // --- CATALOG_UNSAFE_SCALAR ----------------------------------------------
  const scalarCheck = (label, value, { structural }) => {
    count("CATALOG_UNSAFE_SCALAR");
    if (typeof value !== "string") {
      fail("CATALOG_UNSAFE_SCALAR", `${label} reparsed as ${value === null ? "null" : typeof value}, not a string`);
      return false;
    }
    if (value.trim() === "") {
      fail("CATALOG_UNSAFE_SCALAR", `${label} is empty`);
      return false;
    }
    if (structural) {
      if (/[{}[\]]/.test(value)) {
        fail("CATALOG_UNSAFE_SCALAR", `${label} carries a flow indicator: ${JSON.stringify(value)}`);
        return false;
      }
      if (value.includes(": ")) {
        fail("CATALOG_UNSAFE_SCALAR", `${label} carries colon-space: ${JSON.stringify(value)}`);
        return false;
      }
      if (value !== value.trim()) {
        fail("CATALOG_UNSAFE_SCALAR", `${label} carries edge whitespace: ${JSON.stringify(value)}`);
        return false;
      }
    }
    return true;
  };

  const catalogIdOk = scalarCheck("catalog_id", doc.catalog_id, { structural: true });
  count("CATALOG_UNSAFE_SCALAR");
  if (catalogIdOk && !SLUG_RE.test(doc.catalog_id)) {
    fail("CATALOG_UNSAFE_SCALAR", `catalog_id ${JSON.stringify(doc.catalog_id)} fails ${SLUG_RE}`);
  }

  // Guarded by its own scalar verdict, exactly as `catalog_id` is: a non-string
  // `fixture_root` is one fault, and reporting it as both "reparsed as number"
  // and "must be exactly project" double-counts a single edit.
  const fixtureRootOk = scalarCheck("fixture_root", doc.fixture_root, { structural: true });
  count("CATALOG_UNSAFE_SCALAR");
  if (fixtureRootOk && doc.fixture_root !== "project") {
    fail("CATALOG_UNSAFE_SCALAR", `fixture_root must be exactly "project", got ${JSON.stringify(doc.fixture_root)}`);
  }

  for (const { collection, index, entry } of allEntries) {
    for (const field of ENTRY_FIELDS[collection]) {
      if (!(field in entry)) continue;
      scalarCheck(`${collection}[${index}].${field}`, entry[field], {
        structural: STRUCTURAL_FIELDS.has(field),
      });
    }
  }

  // --- CATALOG_UNKNOWN_SKILL ----------------------------------------------
  for (const { collection, index, entry } of allEntries) {
    for (const field of ["covers_skills", "read_by"]) {
      if (typeof entry[field] !== "string") continue;
      for (const slug of splitSlugs(entry[field])) {
        count("CATALOG_UNKNOWN_SKILL");
        if (!SLUG_RE.test(slug)) {
          // Slug SHAPE is CATALOG_UNSAFE_SCALAR's branch; count it there too so
          // the two sub-conditions stay separately provable.
          count("CATALOG_UNSAFE_SCALAR");
          fail("CATALOG_UNSAFE_SCALAR", `${collection}[${index}].${field} component ${JSON.stringify(slug)} fails ${SLUG_RE}`);
          continue;
        }
        if (!existsSync(join(repoRoot, "skills", slug))) {
          fail("CATALOG_UNKNOWN_SKILL", `${collection}[${index}].${field} names unknown skill "${slug}"`);
        }
      }
    }
  }

  // --- CATALOG_UNPAIRED_TWIN ----------------------------------------------
  const byId = new Map();
  for (const { collection, entry } of allEntries) {
    if (typeof entry.id === "string") byId.set(entry.id, { collection, entry });
  }
  for (const { collection, index, entry } of allEntries) {
    if (collection === "scaffolding") continue;
    count("CATALOG_UNPAIRED_TWIN");
    const twin = byId.get(entry.twin);
    if (!twin) {
      fail("CATALOG_UNPAIRED_TWIN", `${collection}[${index}] (${entry.id}) names twin "${entry.twin}", which does not exist`);
      continue;
    }
    if (twin.entry.twin !== entry.id) {
      fail("CATALOG_UNPAIRED_TWIN", `${entry.id} names ${entry.twin}, which names back "${twin.entry.twin}"`);
    }
    if (twin.entry.class !== entry.class) {
      fail("CATALOG_UNPAIRED_TWIN", `${entry.id} (class ${entry.class}) is twinned with ${entry.twin} (class ${twin.entry.class})`);
    }
    if (twin.collection === collection) {
      fail("CATALOG_UNPAIRED_TWIN", `${entry.id} is twinned with ${entry.twin}, in the same collection`);
    }
  }

  // --- CATALOG_ROLE_UNKNOWN -----------------------------------------------
  for (const [index, entry] of collections.scaffolding.entries()) {
    count("CATALOG_ROLE_UNKNOWN");
    if (!ROLE_ENUM.includes(entry.role)) {
      fail("CATALOG_ROLE_UNKNOWN", `scaffolding[${index}] role ${JSON.stringify(entry.role)} is outside the enum`);
    }
  }

  // --- CATALOG_PATH_ESCAPE / _PATH_MISSING / _ANCHOR_NOT_UNIQUE -----------
  // Ordering, per the spec: escape is decided LEXICALLY (resolveContained,
  // before any fs call) so `../../../etc/passwd` on a machine lacking that file
  // reports as an escape rather than as merely missing; the symlink verdict is
  // then taken on the lenientRealpath'd pair. Both later rules open the
  // lenientRealpath-resolved value THIS step produced — never the raw
  // declaration, and never resolveContained's lexical output, which would
  // re-traverse symlinks at open time.
  const fixtureRootAbs = resolve(catalogDir, typeof doc.fixture_root === "string" ? doc.fixture_root : "");
  const fixtureRootReal = lenientRealpath(fixtureRootAbs);
  for (const { collection, index, entry } of allEntries) {
    if (typeof entry.path !== "string") continue;
    count("CATALOG_PATH_ESCAPE");
    const lexical = resolveContained(fixtureRootAbs, entry.path);
    if (lexical === null) {
      fail("CATALOG_PATH_ESCAPE", `${collection}[${index}] path ${JSON.stringify(entry.path)} escapes fixture_root`);
      continue;
    }
    const real = lenientRealpath(lexical);
    if (!isContained(real, fixtureRootReal)) {
      fail("CATALOG_PATH_ESCAPE", `${collection}[${index}] path ${JSON.stringify(entry.path)} escapes fixture_root via a symlink`);
      continue;
    }

    count("CATALOG_PATH_MISSING");
    if (!existsSync(real)) {
      fail("CATALOG_PATH_MISSING", `${collection}[${index}] path ${JSON.stringify(entry.path)} does not exist`);
      continue;
    }

    if (typeof entry.anchor !== "string") continue;
    count("CATALOG_ANCHOR_NOT_UNIQUE");
    const occurrences = countOccurrences(readFileSync(real, "utf8"), entry.anchor);
    if (occurrences !== 1) {
      fail(
        "CATALOG_ANCHOR_NOT_UNIQUE",
        `${entry.id} anchor ${JSON.stringify(entry.anchor)} occurs ${occurrences}x in ${entry.path}`,
      );
    }
  }

  // --- CATALOG_STATUS_EVENT_MISMATCH --------------------------------------
  for (const pair of STATUS_EVENT_PAIRS) {
    count("CATALOG_STATUS_EVENT_MISMATCH");
    const specAbs = join(fixtureRootReal, pair.spec);
    const logAbs = join(fixtureRootReal, pair.log);
    if (!existsSync(specAbs) || !existsSync(logAbs)) {
      fail("CATALOG_STATUS_EVENT_MISMATCH", `${pair.spec} or ${pair.log} is absent`);
      continue;
    }
    const status = readFrontmatterStatus(specAbs);
    const shape = STATUS_CHAIN_SHAPES[status];
    if (!shape) {
      fail("CATALOG_STATUS_EVENT_MISMATCH", `${pair.spec} declares status ${JSON.stringify(status)}, for which no chain shape is declared`);
      continue;
    }
    const events = readEvents(logAbs);
    if (events === null) {
      fail("CATALOG_STATUS_EVENT_MISMATCH", `${pair.log} has a line that is not JSON`);
      continue;
    }
    const completed = new Set(events.filter((e) => e.event === "step_completed").map((e) => e.step));
    const stepsSeen = new Set(events.map((e) => e.step).filter((s) => typeof s === "string"));
    for (const step of shape.requireCompleted) {
      if (!completed.has(step)) {
        fail("CATALOG_STATUS_EVENT_MISMATCH", `${pair.spec} is ${status} but ${pair.log} never completes "${step}"`);
      }
    }
    for (const step of shape.forbidSteps) {
      if (stepsSeen.has(step)) {
        fail("CATALOG_STATUS_EVENT_MISMATCH", `${pair.spec} is ${status} but ${pair.log} carries a "${step}" step`);
      }
    }
    if (shape.forbidPlanTasks && events.some((e) => e.event === "plan_task")) {
      fail("CATALOG_STATUS_EVENT_MISMATCH", `${pair.spec} is ${status} but ${pair.log} carries plan_task events`);
    }
  }

  // --- CATALOG_VERDICT_IDS_UNRESOLVED -------------------------------------
  const rubricAbs = join(fixtureRootReal, ".context-index", "evals", "orders-rubric.yaml");
  const verdictsAbs = join(fixtureRootReal, ".context-index", "evals", "orders-verdicts.json");
  let verdicts = null;
  count("CATALOG_VERDICT_IDS_UNRESOLVED");
  if (!existsSync(rubricAbs) || !existsSync(verdictsAbs)) {
    fail("CATALOG_VERDICT_IDS_UNRESOLVED", "orders-rubric.yaml or orders-verdicts.json is absent");
  } else {
    try {
      verdicts = JSON.parse(readFileSync(verdictsAbs, "utf8"));
    } catch (err) {
      fail("CATALOG_VERDICT_IDS_UNRESOLVED", `orders-verdicts.json failed to parse: ${err.message}`);
    }
  }
  if (Array.isArray(verdicts)) {
    const rubricDoc = parseYaml(readFileSync(rubricAbs, "utf8"));
    const rubricIds = new Set(
      [...(rubricDoc.required_elements ?? []), ...(rubricDoc.quality_dimensions ?? [])]
        .filter(isPlainMap)
        .map((e) => e.id),
    );
    for (const verdict of verdicts) {
      count("CATALOG_VERDICT_IDS_UNRESOLVED");
      if (!isPlainMap(verdict) || !rubricIds.has(verdict.id)) {
        fail("CATALOG_VERDICT_IDS_UNRESOLVED", `verdict id ${JSON.stringify(verdict?.id)} is absent from orders-rubric.yaml`);
      }
    }
  }

  // --- CATALOG_UNRESOLVED_CITATION ----------------------------------------
  // The only rule that reads outside the fixture directory. It asserts that
  // every catalog id a rubric CITES resolves — never that every catalog entry
  // is cited: an uncited entry is a fixture waiting for a rubric.
  //
  // Skipped entirely when `catalog_id` is not a string. An empty prefix
  // degrades the pattern to `:([A-Za-z0-9_-]+)`, which matches the value half
  // of every `key: value` line in every scanned rubric and reports each as an
  // unresolved citation — noise attributed to the wrong rule. The
  // CATALOG_UNSAFE_SCALAR check above is what reports that catalog_id.
  const citableIds = new Set(
    [...collections.planted_violations, ...collections.known_clean]
      .map((e) => e.id)
      .filter((id) => typeof id === "string"),
  );
  const scannedRubricFiles = [];
  if (typeof doc.catalog_id === "string" && doc.catalog_id !== "") {
    const citationRe = new RegExp(`${escapeRe(doc.catalog_id)}:([A-Za-z0-9_-]+)`, "g");
    for (const root of rubricRoots) {
      for (const file of expandRubricRoot(repoRoot, root)) {
        count("CATALOG_UNRESOLVED_CITATION");
        scannedRubricFiles.push(relative(repoRoot, file));
        const text = readFileSync(file, "utf8");
        for (const match of text.matchAll(citationRe)) {
          if (!citableIds.has(match[1])) {
            fail("CATALOG_UNRESOLVED_CITATION", `${relative(repoRoot, file)} cites ${match[0]}, which resolves to nothing`);
          }
        }
      }
    }
  }

  return { errors, checked, scannedRubricFiles };
}
