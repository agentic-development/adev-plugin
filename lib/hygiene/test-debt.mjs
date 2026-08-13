/**
 * Test-debt audit pass for `/adev:hygiene` (Audit Pass 23).
 *
 * Surfaces five categories of accreted test-suite debt. Detection and reporting
 * ONLY — the pass never edits, deletes, or rewrites a test file, never throws,
 * and never mutates `process.exitCode`.
 *
 * Layer 1 posture (inherited from Audit Pass 18, Kind Validity): every finding
 * is advisory. Severity (`error` / `warn` / `info`) conveys human-triage
 * priority, never gate-blocking semantics.
 *
 * @module lib/hygiene/test-debt
 * @see .context-index/specs/features/maintenance/hygiene-test-debt.spec.md
 */

import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname, basename, sep } from "node:path";

import { loadManifest } from "../manifest.mjs";

/** Closed enumeration of detector codes. */
export const DETECTOR_CODES = Object.freeze([
  "APPEND_CHAIN",
  "REV_NUMBERED",
  "PLAN_TASK_STRUCTURED",
  "DEAD_TEST_REFERENCE",
  "PROSE_ASSERTION",
]);

/** Built-in defaults for `hygiene.test_debt` (spec § Behaviors 1, Detectors). */
export const DEFAULT_TEST_DEBT_CONFIG = Object.freeze({
  enabled: true,
  test_globs: Object.freeze([
    "**/*.test.mjs",
    "**/*.test.js",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.js",
    "**/*.spec.ts",
    "**/*_test.go",
    "**/*_test.py",
    "**/test_*.py",
  ]),
  exclude: Object.freeze([]),
  append_chain_threshold: 4,
  prose_ratio_threshold: 0.5,
  rev_numbered_prefixes: Object.freeze(["rev"]),
});

/** Directories never descended, regardless of configuration. */
const HARD_SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

/** Source file extensions recognised in subprocess-argument position. */
const SOURCE_EXTENSIONS = [".mjs", ".cjs", ".js", ".ts", ".tsx", ".py", ".go", ".sh"];

class TestDebtConfigError extends Error {
  constructor(message) {
    super(message);
    this.code = "INVALID_TEST_DEBT_CONFIG";
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Merge and validate `hygiene.test_debt` config over the built-in defaults.
 *
 * @param {object|null} manifest
 * @returns {object} Effective configuration.
 * @throws {TestDebtConfigError} on any out-of-contract value.
 */
export function resolveTestDebtConfig(manifest) {
  const raw = manifest?.hygiene?.test_debt ?? {};
  const cfg = {
    ...DEFAULT_TEST_DEBT_CONFIG,
    test_globs: [...DEFAULT_TEST_DEBT_CONFIG.test_globs],
    exclude: [...DEFAULT_TEST_DEBT_CONFIG.exclude],
    rev_numbered_prefixes: [...DEFAULT_TEST_DEBT_CONFIG.rev_numbered_prefixes],
  };

  if (raw.enabled !== undefined) cfg.enabled = raw.enabled !== false;

  if (raw.test_globs !== undefined) {
    if (!Array.isArray(raw.test_globs) || raw.test_globs.some((g) => typeof g !== "string" || !g)) {
      throw new TestDebtConfigError("hygiene.test_debt.test_globs must be an array of non-empty strings");
    }
    cfg.test_globs = [...raw.test_globs];
  }

  if (raw.exclude !== undefined) {
    if (!Array.isArray(raw.exclude) || raw.exclude.some((g) => typeof g !== "string" || !g)) {
      throw new TestDebtConfigError("hygiene.test_debt.exclude must be an array of non-empty strings");
    }
    cfg.exclude = [...raw.exclude];
  }

  if (raw.append_chain_threshold !== undefined) {
    const n = raw.append_chain_threshold;
    if (!Number.isInteger(n) || n < 2) {
      throw new TestDebtConfigError(
        `hygiene.test_debt.append_chain_threshold must be an integer >= 2 (received: ${JSON.stringify(n)})`,
      );
    }
    cfg.append_chain_threshold = n;
  }

  if (raw.prose_ratio_threshold !== undefined) {
    const n = raw.prose_ratio_threshold;
    if (typeof n !== "number" || Number.isNaN(n) || n <= 0 || n > 1) {
      throw new TestDebtConfigError(
        `hygiene.test_debt.prose_ratio_threshold must be a number in (0, 1] (received: ${JSON.stringify(n)})`,
      );
    }
    cfg.prose_ratio_threshold = n;
  }

  if (raw.rev_numbered_prefixes !== undefined) {
    const arr = raw.rev_numbered_prefixes;
    if (!Array.isArray(arr) || arr.some((p) => typeof p !== "string" || !/^[A-Za-z]+$/.test(p))) {
      throw new TestDebtConfigError(
        "hygiene.test_debt.rev_numbered_prefixes must be an array of non-empty alphabetic strings",
      );
    }
    cfg.rev_numbered_prefixes = [...arr];
  }

  return cfg;
}

// ---------------------------------------------------------------------------
// Discovery — hand-rolled glob (zero deps) + symlink-safe walk
// ---------------------------------------------------------------------------

/**
 * Compile a subset-glob (`**`, `*`, `?`) into an anchored RegExp.
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` matches zero or more path segments; bare `**` matches anything.
        if (glob[i + 2] === "/") {
          out += "(?:[^/]*\\/)*";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

function matchesAny(relPath, globs) {
  return globs.some((g) => globToRegExp(g).test(relPath));
}

/**
 * Walk `scanRoot` collecting project-root-relative paths of test files.
 * Symlinked directories are never descended (spec Behavior 1c).
 *
 * NOTE: `hygiene.coverage_exclude` is deliberately NOT applied here — see
 * spec Behavior 1b. That key exists for codehealth's orphan detection and its
 * `tests/**` entry is precisely why test debt is invisible today.
 *
 * @param {string} projectRoot
 * @param {string} scanRoot
 * @param {object} cfg
 * @param {string[]} headerNotes
 * @returns {string[]}
 */
export function discoverTestFiles(projectRoot, scanRoot, cfg, headerNotes = []) {
  const found = [];
  const testRegexes = cfg.test_globs.map(globToRegExp);
  const excludeRegexes = cfg.exclude.map(globToRegExp);

  const walk = (absDir) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      headerNotes.push(`unreadable directory skipped: ${relative(projectRoot, absDir) || "."} (${err.code ?? "ERR"})`);
      return;
    }
    for (const entry of entries) {
      const abs = join(absDir, entry.name);
      if (entry.isSymbolicLink()) continue; // never follow links (Behavior 1c)
      let isDir = entry.isDirectory();
      if (!isDir && !entry.isFile()) {
        try {
          isDir = lstatSync(abs).isDirectory();
        } catch {
          continue;
        }
      }
      if (isDir) {
        if (HARD_SKIP_DIRS.has(entry.name)) continue;
        walk(abs);
        continue;
      }
      const rel = relative(projectRoot, abs).split(sep).join("/");
      if (!testRegexes.some((re) => re.test(rel))) continue;
      if (excludeRegexes.some((re) => re.test(rel))) continue;
      found.push(rel);
    }
  };

  walk(scanRoot);
  found.sort();
  return found;
}

// ---------------------------------------------------------------------------
// Anchor classification + reference extraction
// ---------------------------------------------------------------------------

const REPO_ANCHOR_TOKENS = /import\.meta\.(?:url|dirname|filename)|__dirname|__filename|PLUGIN_ROOT|REPO_ROOT/;
const TEMP_ANCHOR_TOKENS = /createTempDir\s*\(|mkdtempSync\s*\(|tmpdir\s*\(|mkdtemp\s*\(/;

/**
 * Scan same-file `const X = <expr>` bindings and resolve each identifier to an
 * anchor class (`repo` / `temp` / `unknown`) AND, for repo-anchored ones, the
 * project-root-relative directory it denotes.
 *
 * Resolving the *directory* (not just the class) is what keeps a fixture-tree
 * anchor from being mistaken for a real source path: `join(FIXTURE_DIR,
 * "lib/orphan.mjs")` denotes `tests/…/fixtures/lib/orphan.mjs`, not
 * `lib/orphan.mjs`, and must not be reported as a dead reference to `lib/`.
 *
 * @param {string} source
 * @param {string} testRelPath - project-root-relative path of the test file
 * @returns {Map<string, { class: 'repo'|'temp'|'unknown', dir: string|null }>}
 */
export function classifyAnchors(source, testRelPath = "") {
  const exprs = new Map();
  const re = /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/gm;
  let m;
  while ((m = re.exec(source)) !== null) exprs.set(m[1], m[2]);

  const testDir = testRelPath ? dirname(testRelPath) : "";
  const cache = new Map();

  const resolveName = (name, seen = new Set()) => {
    if (cache.has(name)) return cache.get(name);
    if (seen.has(name)) return { class: "unknown", dir: null };
    seen.add(name);

    const expr = exprs.get(name);
    if (expr === undefined) return { class: "unknown", dir: null };

    let out = { class: "unknown", dir: null };

    if (TEMP_ANCHOR_TOKENS.test(expr)) {
      out = { class: "temp", dir: null };
    } else {
      // Base of the expression: a repo-anchored token or another const.
      let baseDir = null;
      let baseClass = "unknown";
      if (/import\.meta\.(?:dirname|url|filename)|__dirname|__filename/.test(expr)) {
        baseDir = testDir;
        baseClass = "repo";
      } else if (/\b(?:PLUGIN_ROOT|REPO_ROOT)\b/.test(expr) && !exprs.has("PLUGIN_ROOT") && !exprs.has("REPO_ROOT")) {
        baseDir = "";
        baseClass = "repo";
      } else {
        for (const ident of expr.match(/[A-Za-z_$][\w$]*/g) ?? []) {
          if (ident === name || !exprs.has(ident)) continue;
          const sub = resolveName(ident, seen);
          if (sub.class !== "unknown") {
            baseClass = sub.class;
            baseDir = sub.dir;
            break;
          }
        }
      }

      if (baseClass === "repo") {
        const segments = [...expr.matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
        const joined = [baseDir ?? "", ...segments].filter(Boolean).join("/");
        // Normalise `..` without escaping the project root.
        const parts = [];
        for (const seg of joined.split("/")) {
          if (seg === "." || seg === "") continue;
          if (seg === "..") {
            if (parts.length === 0) return cacheAndReturn(name, { class: "unknown", dir: null });
            parts.pop();
          } else parts.push(seg);
        }
        out = { class: "repo", dir: parts.join("/") };
      } else if (baseClass === "temp") {
        out = { class: "temp", dir: null };
      }
    }

    return cacheAndReturn(name, out);
  };

  function cacheAndReturn(name, value) {
    cache.set(name, value);
    return value;
  }

  const out = new Map();
  for (const name of exprs.keys()) out.set(name, resolveName(name));
  return out;
}

const CLASS_A_PATTERNS = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']/g,
];

const SUBPROCESS_CALL = /\b(?:spawnSync|spawn|execFileSync|execFile|execSync|subprocess\.run|subprocess\.check_output)\s*\(/;

const READ_CALL = /\b(?:readFileSync|readFile|read_text|open)\s*\(|\bnew\s+URL\s*\(/;

/**
 * Extract the literal path segments of a read/URL expression plus the anchor
 * identifier (if any), for one source line.
 *
 * @param {string} line
 * @param {Map<string,string>} anchors
 * @returns {{ path: string, anchor: 'repo'|'temp'|'unknown'|'literal' }[]}
 */
function extractClassBFromLine(line, anchors, testDir) {
  if (!READ_CALL.test(line)) return [];
  const out = [];

  // `new URL("<literal>", import.meta.url)` — repo-anchored, based at the test's dir.
  const urlRe = /new\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*(import\.meta\.url|[A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = urlRe.exec(line)) !== null) {
    const anchorExpr = m[2];
    const info = anchorExpr.startsWith("import.meta")
      ? { class: "repo", dir: testDir }
      : (anchors.get(anchorExpr) ?? { class: "unknown", dir: null });
    out.push({ path: m[1], anchor: info.class, anchorDir: info.dir });
  }

  // `readFileSync(join(ANCHOR, "a", "b"))` / `readFileSync("literal")` / `open("literal")`
  const readRe = /(?:readFileSync|readFile|read_text|open)\s*\(\s*([^)]*)\)/g;
  while ((m = readRe.exec(line)) !== null) {
    const args = m[1];
    if (/new\s+URL/.test(args)) continue; // already handled above
    const literals = [...args.matchAll(/["']([^"']+)["']/g)]
      .map((x) => x[1])
      .filter((s) => s !== "utf8" && s !== "utf-8" && s !== "r" && s !== "rb");
    if (literals.length === 0) continue;

    const joinMatch = args.match(/(?:join|resolve)\s*\(\s*([A-Za-z_$][\w$.]*)((?:\s*,\s*[^,)]+)*)/);
    let anchor;
    let anchorDir = null;
    if (joinMatch) {
      const head = joinMatch[1];
      // A non-literal argument AFTER the anchor head (a loop variable, a
      // function call) leaves the path underdetermined: the literal segments
      // no longer describe a real location. Downgrade to `unknown` so the
      // reference can cluster but can never assert a missing file.
      const tail = (joinMatch[2] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const hasVariableSegment = tail.some((seg) => !/^["'][^"']*["']$/.test(seg));

      if (hasVariableSegment) {
        anchor = "unknown";
      } else if (head.startsWith("import.meta") || head === "__dirname") {
        anchor = "repo";
        anchorDir = testDir;
      } else {
        const info = anchors.get(head) ?? { class: "unknown", dir: null };
        anchor = info.class;
        anchorDir = info.dir;
      }
    } else if (/^\s*["']/.test(args)) {
      anchor = "literal";
    } else {
      anchor = "unknown";
    }
    out.push({ path: literals.join("/"), anchor, anchorDir });
  }

  return out;
}

/**
 * Extract all references from one test file.
 *
 * @param {string} source
 * @param {string} testRelPath - project-root-relative path of the test file
 * @returns {{ classA: {path:string}[], classB: {path:string, anchor:string}[] }}
 */
export function extractReferences(source, testRelPath) {
  const testDir = dirname(testRelPath);
  const anchors = classifyAnchors(source, testRelPath);
  const classA = [];
  const classB = [];

  for (const pattern of CLASS_A_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(source)) !== null) classA.push({ path: m[1] });
  }

  // Python module imports → a/b.py
  const pyRe = /^\s*(?:from\s+([\w.]+)\s+import\b|import\s+([\w.]+))/gm;
  let pm;
  while ((pm = pyRe.exec(source)) !== null) {
    const mod = pm[1] ?? pm[2];
    if (mod && mod.includes(".")) classA.push({ path: `${mod.split(".").join("/")}.py` });
  }

  for (const line of source.split("\n")) {
    if (SUBPROCESS_CALL.test(line)) {
      for (const lit of line.matchAll(/["']([^"']+)["']/g)) {
        if (SOURCE_EXTENSIONS.some((ext) => lit[1].endsWith(ext))) classA.push({ path: lit[1] });
      }
    }
    for (const ref of extractClassBFromLine(line, anchors, testDir)) classB.push(ref);
  }

  return { classA, classB, testRelPath };
}

/**
 * Normalise an extracted reference to a project-root-relative path, or null
 * when it escapes the project root or is not a path-like reference.
 *
 * @param {string} refPath
 * @param {string} testRelPath
 * @param {string[]} sourceRoots
 * @returns {string|null}
 */
export function normaliseReference(refPath, testRelPath, sourceRoots, anchorDir = null) {
  if (!refPath || refPath.startsWith("node:") || refPath.startsWith("http")) return null;

  let rel;
  if (anchorDir !== null && anchorDir !== undefined) {
    // Anchor resolved to a concrete project-root-relative directory: the
    // reference lives THERE, not wherever its literal segments happen to look
    // like they point (e.g. join(FIXTURE_DIR, "lib/orphan.mjs")).
    rel = join(anchorDir, refPath).split(sep).join("/");
  } else if (refPath.startsWith(".")) {
    rel = join(dirname(testRelPath), refPath).split(sep).join("/");
  } else {
    // Bare specifier: keep only when it already names a repo-relative path
    // beneath a configured source root (e.g. "skills/hygiene/SKILL.md").
    rel = refPath.replace(/^\/+/, "");
  }
  if (rel.startsWith("..")) return null; // escapes the project root
  if (sourceRoots.length > 0) {
    const underRoot = sourceRoots.some((r) => rel === r.replace(/\/$/, "") || rel.startsWith(r.replace(/\/$/, "") + "/"));
    if (!underRoot) return null;
  }
  return rel;
}

// ---------------------------------------------------------------------------
// Assertion-line taxonomy (spec § Assertion-line taxonomy)
// ---------------------------------------------------------------------------

const ASSERTION_LINE =
  /assert\.|assert\(|expect\(|should\.|\bt\.is\(|\bt\.deepEqual\(|self\.assert|assertEqual|assertTrue|assertFalse|assertRaises|pytest\.raises/;

const CONTAINMENT_ASSERTION =
  /\.includes\(|\.match\(|\.test\(|toContain|assertIn|\bin\s+\w*(?:content|text|body|src|md|skill)\w*\b/i;

/**
 * @param {string} source
 * @returns {{ denominator: number, numerator: number, ratio: number }}
 */
export function assertionRatio(source) {
  let denominator = 0;
  let numerator = 0;
  for (const line of source.split("\n")) {
    if (!ASSERTION_LINE.test(line)) continue;
    denominator += 1;
    if (CONTAINMENT_ASSERTION.test(line)) numerator += 1;
  }
  return { denominator, numerator, ratio: denominator === 0 ? 0 : numerator / denominator };
}

const TEST_DECLARATION = /\b(?:describe|it|test)\s*\(|^\s*def\s+test_/;
const PLAN_TASK_LITERAL = /\bplan-task\s+\d+|\bTask\s+\d+\b/;

// ---------------------------------------------------------------------------
// Pass entry point
// ---------------------------------------------------------------------------

/**
 * Run the test-debt audit pass.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @param {object} [options]
 * @param {string} [options.scanRoot] - Absolute path narrowing the scan subtree.
 * @param {string} [options.detector] - Restrict to one detector code.
 * @param {object} [options.manifest] - Pre-loaded manifest (test seam).
 * @returns {{ verdict: string, findings: object[], summary: object, headerNotes: string[], scannedFileCount: number }}
 */
export function runTestDebtPass(projectRoot, options = {}) {
  const headerNotes = [];
  const findings = [];

  let manifest = options.manifest;
  if (manifest === undefined) {
    try {
      manifest = loadManifest(projectRoot);
    } catch {
      manifest = null;
      headerNotes.push("manifest.yaml missing or unparseable — using built-in test-debt defaults");
    }
  }

  const cfg = resolveTestDebtConfig(manifest);
  if (!cfg.enabled) {
    return {
      verdict: "SKIP",
      findings: [],
      summary: { reason: "disabled by manifest" },
      headerNotes,
      scannedFileCount: 0,
    };
  }

  const sourceRoots = (manifest?.hygiene?.source_roots ?? []).map((r) => String(r).replace(/\/+$/, ""));
  if (sourceRoots.length === 0) {
    headerNotes.push(
      "hygiene.source_roots is absent — APPEND_CHAIN module attribution and DEAD_TEST_REFERENCE are skipped",
    );
  }

  const scanRoot = options.scanRoot ?? projectRoot;
  const testFiles = discoverTestFiles(projectRoot, scanRoot, cfg, headerNotes);

  if (testFiles.length === 0) {
    return {
      verdict: "SKIP",
      findings: [],
      summary: { reason: "no test files discovered" },
      headerNotes,
      scannedFileCount: 0,
    };
  }

  const wanted = options.detector ? new Set([options.detector]) : new Set(DETECTOR_CODES);
  const revRegexes = cfg.rev_numbered_prefixes.map((p) => new RegExp(`(^|[._-])${p}\\d+([._-]|$)`, "i"));
  /** @type {Map<string, Set<string>>} module -> test files */
  const moduleClusters = new Map();

  for (const rel of testFiles) {
    let source;
    try {
      source = readFileSync(join(projectRoot, rel), "utf8");
    } catch (err) {
      headerNotes.push(`unreadable test file skipped: ${rel} (${err.code ?? "ERR"})`);
      continue;
    }

    if (wanted.has("REV_NUMBERED")) {
      const base = basename(rel);
      if (revRegexes.some((re) => re.test(base))) {
        findings.push({
          code: "REV_NUMBERED",
          severity: "warn",
          path: rel,
          reason: `filename carries a revision marker (prefixes: ${cfg.rev_numbered_prefixes.join(", ")}) — candidate for consolidation`,
        });
      }
    }

    if (wanted.has("PLAN_TASK_STRUCTURED")) {
      const titles = [];
      for (const line of source.split("\n")) {
        if (TEST_DECLARATION.test(line) && PLAN_TASK_LITERAL.test(line)) titles.push(line.trim().slice(0, 140));
      }
      if (titles.length > 0) {
        findings.push({
          code: "PLAN_TASK_STRUCTURED",
          severity: "warn",
          path: rel,
          count: titles.length,
          samples: titles.slice(0, 3),
          reason: `${titles.length} test title(s) structured around plan tasks rather than behavior — candidate for review`,
        });
      }
    }

    const { classA, classB } = extractReferences(source, rel);

    if (wanted.has("PROSE_ASSERTION")) {
      const mdRefs = [...new Set(classB.filter((r) => r.path.endsWith(".md")).map((r) => r.path))];
      if (mdRefs.length > 0) {
        const { numerator, denominator, ratio } = assertionRatio(source);
        if (denominator > 0 && ratio >= cfg.prose_ratio_threshold) {
          findings.push({
            code: "PROSE_ASSERTION",
            severity: "info",
            path: rel,
            ratio: Number(ratio.toFixed(2)),
            numerator,
            denominator,
            samples: mdRefs.slice(0, 3),
            reason: `${numerator}/${denominator} assertions are containment checks over markdown — candidate for behavioral coverage review`,
          });
        }
      }
    }

    if (sourceRoots.length === 0) continue;

    const resolvable = [
      ...classA.map((r) => ({ ...r, anchor: "literal" })),
      ...classB.filter((r) => r.anchor === "repo" || r.anchor === "literal"),
    ];
    const clusterable = [...resolvable, ...classB.filter((r) => r.anchor === "unknown")];

    if (wanted.has("APPEND_CHAIN")) {
      for (const ref of clusterable) {
        const target = normaliseReference(ref.path, rel, sourceRoots, ref.anchorDir ?? null);
        if (!target) continue;
        if (!moduleClusters.has(target)) moduleClusters.set(target, new Set());
        moduleClusters.get(target).add(rel);
      }
    }

    if (wanted.has("DEAD_TEST_REFERENCE")) {
      const seen = new Set();
      for (const ref of resolvable) {
        const target = normaliseReference(ref.path, rel, sourceRoots, ref.anchorDir ?? null);
        if (!target || seen.has(target)) continue;
        seen.add(target);
        if (!existsSync(join(projectRoot, target))) {
          findings.push({
            code: "DEAD_TEST_REFERENCE",
            severity: "error",
            path: rel,
            target,
            reason: `test references '${target}', which is not present under a configured source root — review whether the target moved or was removed`,
          });
        }
      }
    }
  }

  if (wanted.has("APPEND_CHAIN")) {
    const clusters = [...moduleClusters.entries()]
      .filter(([, files]) => files.size >= cfg.append_chain_threshold)
      .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
    for (const [module, files] of clusters) {
      const list = [...files].sort();
      findings.push({
        code: "APPEND_CHAIN",
        severity: "warn",
        path: module,
        count: files.size,
        samples: list.slice(0, 10),
        more: Math.max(0, list.length - 10),
        reason: `${files.size} test files reference this module — candidate append chain, review whether the suites are intentionally partitioned`,
      });
    }
  }

  const summary = {};
  for (const code of DETECTOR_CODES) {
    if (!wanted.has(code)) continue;
    summary[code] = findings.filter((f) => f.code === code).length;
  }

  return {
    verdict: findings.length === 0 ? "PASS" : "WARN",
    findings,
    summary,
    headerNotes,
    scannedFileCount: testFiles.length,
  };
}
