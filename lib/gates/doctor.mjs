/**
 * Gate Doctor — verify that declared gates actually run and that declared
 * test suites actually get collected.
 *
 * Spec: .context-index/specs/features/unified-gates/gate-doctor.spec.md
 *
 * Why this exists: adev rigorously verifies test AUTHORSHIP — RED-state
 * verification, immutable handoff hashes, gaming detection — and never once
 * verified test COLLECTION or EXECUTION. The 2026-08-10 three-repo audit
 * found the consequence in all three repos it looked at:
 *
 *   - adev-plugin: `npm test` globbed `tests/**\/*.test.mjs`; npm runs scripts
 *     through `sh`, which has no globstar, so `**` degraded to `*` and 77 of
 *     416 test files were never handed to the runner. No error, no skip notice.
 *   - alteryx_migration: CI ran 19% of test files and zero Python tests —
 *     ~3,000 test functions across 70k LOC, never executed.
 *   - ambev accelerator: no CI at all, pytest not a declared dependency, and
 *     gate commands that `cd` into a gitignored directory, so they cannot
 *     execute for anyone but the person who created that directory.
 *
 * Every one of those is statically detectable from files already on disk.
 *
 * This module is a DOCTOR, not a GATE: it reports and never mutates. It also
 * must run against downstream projects that are not this repo, so nothing
 * about adev-plugin's own layout is hardcoded — no manifest is required, no
 * git repository, no CI provider, no particular language runtime.
 *
 * Static by default. `execute: true` is opt-in because this repo's own `test`
 * gate command is `npm test`, and the doctor is reachable from /adev:validate
 * and /adev:hygiene, both reachable from a test run. The ADEV_GATE_DOCTOR
 * environment guard terminates that cycle at depth one by construction rather
 * than by convention.
 *
 * Zero external dependencies (Constitution Principle 1).
 *
 * @module lib/gates/doctor
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

import { parseYaml } from "../profiles/yaml.mjs";

export const SCHEMA_VERSION = "1";

const DEFAULT_GATES_PATH = ".context-index/governance/gates.yaml";
const DEFAULT_TIMEOUT_MS = 120_000;

/** Directories never worth walking. Mirrors scripts/run-tests.mjs plus the
 *  usual per-ecosystem build and vendor trees (SEC-4: a monorepo walk must
 *  not wander into node_modules). */
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage", "out", "target",
  ".venv", "venv", "__pycache__", ".tox", ".next", ".nuxt", ".pytest_cache",
  ".mypy_cache", "vendor", ".gradle", ".idea", ".terraform",
]);

/** Hard ceiling on directory-walk steps, so a pathological tree degrades to
 *  an incomplete answer rather than to a hang. */
const WALK_BUDGET = 200_000;

/** Commands that are shell builtins or so universally present that treating
 *  them as unresolvable would be pure noise. */
const SHELL_BUILTINS = new Set([
  "cd", "echo", "true", "false", ":", "test", "export", "set", "unset",
  "source", ".", "exec", "eval", "exit", "read", "printf", "shift", "wait",
]);

/** Where CI configuration lives, by provider. Extending this set must never
 *  require touching the diff logic. */
const CI_LOCATIONS = [
  { kind: "dir", path: ".github/workflows", exts: [".yml", ".yaml"] },
  { kind: "file", path: ".gitlab-ci.yml" },
  { kind: "file", path: ".gitlab-ci.yaml" },
  { kind: "file", path: ".circleci/config.yml" },
  { kind: "file", path: "azure-pipelines.yml" },
  { kind: "file", path: "Jenkinsfile" },
  { kind: "file", path: ".travis.yml" },
  { kind: "file", path: "bitbucket-pipelines.yml" },
];

/**
 * Test runners the doctor understands.
 *
 * `collectQuery: null` is a first-class answer, not a gap: Node's own test
 * runner has no collect-only mode. Reporting UNKNOWN there is the whole
 * point — a doctor that silently passes on a runner it cannot interrogate
 * reproduces the exact failure mode it exists to catch.
 *
 * `parse` says what the collect query's stdout means:
 *   "paths" — lines are test file paths (possibly with a `::selector` suffix)
 *   "names" — lines are test function names; only emptiness is meaningful
 */
const RUNNERS = [
  {
    runner: "pytest",
    test: (c) => /(^|[\s;&|])pytest(\s|$)/.test(c) || /python[0-9.]*\s+-m\s+pytest/.test(c),
    collectQuery: "pytest --collect-only -q",
    parse: "paths",
    diskPatterns: ["**/test_*.py", "**/*_test.py"],
  },
  {
    runner: "vitest",
    test: (c) => /(^|[\s;&|])vitest(\s|$)/.test(c),
    collectQuery: "vitest list",
    parse: "paths",
    diskPatterns: ["**/*.test.ts", "**/*.test.js", "**/*.spec.ts", "**/*.spec.js"],
  },
  {
    runner: "jest",
    test: (c) => /(^|[\s;&|])jest(\s|$)/.test(c),
    collectQuery: "jest --listTests",
    parse: "paths",
    diskPatterns: ["**/*.test.ts", "**/*.test.js", "**/*.spec.ts", "**/*.spec.js"],
  },
  {
    runner: "go test",
    test: (c) => /(^|[\s;&|])go\s+test(\s|$)/.test(c),
    collectQuery: "go test -list .",
    parse: "names",
    diskPatterns: ["**/*_test.go"],
  },
  {
    runner: "node:test",
    test: (c) => /(^|[\s;&|])node\s+(--\S+\s+)*--test(\s|$|=)/.test(c),
    collectQuery: null, // Node's runner has no collect-only mode.
    parse: null,
    diskPatterns: ["**/*.test.mjs", "**/*.test.js", "**/*.test.ts"],
  },
];

// ── Primitives ──────────────────────────────────────────────────────────────

/**
 * Split a shell command into tokens, honouring single and double quotes and
 * treating operators as their own tokens. Not a POSIX shell parser — the
 * doctor's static analysis is explicitly heuristic (see the spec's Known
 * Limitations) — but quote-aware enough that `sh -c 'exit 3'` is three
 * tokens and not four.
 *
 * @param {string} command
 * @returns {string[]}
 */
export function tokenize(command) {
  return tokenizeDetailed(command ?? "").map((t) => t.value);
}

/**
 * As {@link tokenize}, but retaining each token's quote provenance.
 *
 * The provenance is what lets `splitOnOperators` tell `echo && npm test` (two
 * sub-commands) from `echo '&&'` (one sub-command passing a literal `&&` as an
 * argument). Comparing raw token VALUES cannot: by the time a token exists,
 * its quotes are gone. This is module-private and the exported {@link tokenize}
 * is a projection of it, so the public token contract is unchanged.
 *
 * `quoted` is true when ANY part of the token came from inside quotes, which
 * is the only granularity that matters here — an operator is only an operator
 * when the whole token is bare.
 *
 * @param {string} command
 * @returns {Array<{ value: string, quoted: boolean }>}
 */
function tokenizeDetailed(command) {
  const out = [];
  let cur = "";
  let quote = null;
  let has = false;
  let quoted = false;
  const push = () => {
    if (has) out.push({ value: cur, quoted });
    cur = "";
    has = false;
    quoted = false;
  };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      else {
        cur += ch;
        has = true;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
      quoted = true;
      continue;
    }
    if (/\s/.test(ch)) {
      push();
      continue;
    }
    if (ch === "&" || ch === "|" || ch === ";") {
      push();
      let op = ch;
      if (command[i + 1] === ch) {
        op += ch;
        i++;
      }
      out.push({ value: op, quoted: false });
      continue;
    }
    cur += ch;
    has = true;
  }
  push();
  return out;
}

/**
 * Characters that make a token unsafe to emit bare into a command string:
 * whitespace, quotes, and the shell metacharacters. A token carrying any of
 * them must be quoted or the join would change how the command tokenizes.
 */
const NEEDS_QUOTING = /[\s'"&|;<>()$`*?[\]!#~=%\\]/;

/**
 * Normalise a gate's declared `command` to a single command string.
 *
 * `lib/domains/merge-gates.mjs` enforces argv-list commands (SEC-2), so every
 * correctly-authored gate reaches the doctor as `["npm", "test"]`. Coercing a
 * non-string to `""` reported those as `empty-command` and skipped every
 * command-level check — placeholders, binary resolution, referenced paths,
 * globs, runner detection, CI wiring — for exactly the gates the framework
 * ships by default.
 *
 * Quoting is ALWAYS single-quote, never double. Under `--execute` the joined
 * string is handed to `sh -c`, and double quotes still interpolate `$(…)`,
 * backticks and `\` — a gate declaring `["touch", "a'b $(rm -rf /)"]` would
 * execute the substitution. Single quotes suppress every expansion, and a
 * literal single quote inside the token is emitted as `'\''` (close, escaped
 * quote, reopen), which is the POSIX-correct construction.
 *
 * The join is not lossy for `splitOnOperators`: a quoted token carries its
 * provenance through {@link tokenizeDetailed}, so an argv token that happens
 * to spell `&&` is an argument rather than an operator, and an argv gate is
 * always exactly one sub-command.
 *
 * Known limitation, deliberately accepted: `tokenize` has no backslash or
 * escape handling inside quotes, so a token containing a single quote does NOT
 * round-trip — the `'\''` construction re-tokenizes into several tokens and
 * static analysis loses fidelity on that token. That is the right trade. The
 * alternative (double quotes) buys analysis fidelity on an exotic token no
 * shipped default contains, and pays for it by handing `sh -c` an injection
 * vector, defeating the SEC-2 argv invariant this function exists to serve.
 *
 * @param {unknown} command
 * @returns {string} A command string; `""` when there is nothing to run.
 */
export function normaliseCommand(command) {
  if (typeof command === "string") return command;
  if (!Array.isArray(command)) return "";
  const parts = [];
  for (const token of command) {
    // A non-string element is a malformed gate, not a token to coerce.
    if (typeof token !== "string") return "";
    if (token === "" || NEEDS_QUOTING.test(token)) {
      parts.push(`'${token.replaceAll("'", "'\\''")}'`);
    } else {
      parts.push(token);
    }
  }
  return parts.join(" ");
}

/** Shell control operators, as whole tokens. */
const OPERATORS = new Set(["&&", "||", ";", "|", "&"]);

/**
 * Split a detailed token list into sub-commands at UNQUOTED shell operators.
 *
 * Quote provenance is load-bearing: `cd dist && npm test` is two sub-commands,
 * but `echo '&&'` is one sub-command whose argument happens to spell an
 * operator. Splitting on the token VALUE alone dropped that argument out of
 * every downstream check.
 *
 * @param {Array<{ value: string, quoted: boolean }>} tokens
 * @returns {string[][]}
 */
function splitOnOperators(tokens) {
  const segments = [[]];
  for (const t of tokens) {
    if (!t.quoted && OPERATORS.has(t.value)) segments.push([]);
    else segments[segments.length - 1].push(t.value);
  }
  return segments.filter((s) => s.length > 0);
}

/**
 * Every unsubstituted mustache placeholder in a command.
 *
 * A gate scaffolded from a template and never filled in is indistinguishable
 * from a working gate right up until it runs.
 *
 * @param {string} command
 * @returns {string[]}
 */
export function extractPlaceholders(command) {
  if (typeof command !== "string") return [];
  return command.match(/\{\{[^}]*\}\}/g) ?? [];
}

/**
 * Resolve the executable token of a command.
 *
 * Honours project-local `node_modules/.bin` as well as PATH: a gate command
 * of `jest` is satisfied by a devDependency that is never on the operator's
 * global PATH, and reporting that as missing would be a false alarm on most
 * JavaScript projects.
 *
 * @param {string} command
 * @param {string} projectRoot
 * @returns {{ resolved: boolean, token: string|null, via: string|null }}
 */
export function resolveBinary(command, projectRoot) {
  const segments = splitOnOperators(tokenizeDetailed(command ?? ""));
  if (segments.length === 0) return { resolved: true, token: null, via: null };

  // Only the first sub-command's executable is reported. Later ones are
  // reachable only if the first succeeds, so the first is where diagnosis
  // starts.
  let tokens = segments[0];
  // Skip leading VAR=value environment assignments (`CI=1 npm test`).
  while (tokens.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens = tokens.slice(1);
  if (tokens.length === 0) return { resolved: true, token: null, via: null };

  const token = tokens[0];
  if (SHELL_BUILTINS.has(token)) return { resolved: true, token, via: "builtin" };

  // An explicit path is checked directly rather than searched.
  if (token.includes("/")) {
    const abs = isAbsolute(token) ? token : resolve(projectRoot, token);
    return { resolved: existsSync(abs), token, via: existsSync(abs) ? "path" : null };
  }

  const localBin = join(projectRoot, "node_modules", ".bin", token);
  if (existsSync(localBin)) return { resolved: true, token, via: "node_modules/.bin" };

  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    if (existsSync(join(dir, token))) return { resolved: true, token, via: "PATH" };
  }
  return { resolved: false, token, via: null };
}

/**
 * Filesystem paths a command refers to: `cd` arguments, and any non-flag,
 * non-glob token carrying a path separator.
 *
 * @param {string} command
 * @returns {string[]}
 */
export function extractReferencedPaths(command) {
  return [...new Set(referencedPathsDetailed(command).map((r) => r.path))].filter(
    (p) => p.length > 0,
  );
}

/**
 * As {@link extractReferencedPaths}, but keeping the index of the sub-command
 * each path appeared in.
 *
 * The index decides severity for the gitignored case. `cd dist && npm test`
 * where `dist/` is gitignored is a perfectly ordinary gate whose earlier
 * sub-command builds `dist`; `cd vendored-repo && pytest` as the FIRST thing
 * a gate does requires the directory to already exist, and gitignored means
 * it does not exist for anyone but whoever created it.
 *
 * @param {string} command
 * @returns {Array<{ path: string, segmentIndex: number }>}
 */
function referencedPathsDetailed(command) {
  const out = [];
  const segments = splitOnOperators(tokenizeDetailed(command ?? ""));
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    for (let i = 0; i < seg.length; i++) {
      const t = seg[i];
      if (t === "cd" && seg[i + 1] && !seg[i + 1].startsWith("-")) {
        out.push({ path: seg[i + 1].replace(/\/+$/, ""), segmentIndex: s });
        i++;
        continue;
      }
      if (t.startsWith("-")) continue;
      if (!t.includes("/")) continue;
      if (t.includes("*") || t.includes("?")) continue; // globs: family (a)
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) continue; // URLs
      out.push({ path: t.replace(/\/+$/, ""), segmentIndex: s });
    }
  }
  const seen = new Set();
  return out.filter((r) => {
    if (r.path.length === 0 || seen.has(r.path)) return false;
    seen.add(r.path);
    return true;
  });
}

/** Glob patterns (tokens containing `**`) a command refers to. */
function extractGlobPatterns(command) {
  const out = [];
  for (const seg of splitOnOperators(tokenizeDetailed(command ?? ""))) {
    for (const t of seg) {
      if (t.startsWith("-")) continue;
      if (t.includes("**")) out.push(t);
    }
  }
  return [...new Set(out)];
}

/** Compile one glob path-segment to a regex. `*` never crosses `/`. */
function segmentToRegex(seg) {
  let re = "";
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else if (ch === "[") {
      let j = i + 1;
      let cls = "[";
      if (seg[j] === "!" || seg[j] === "^") {
        cls += "^";
        j++;
      }
      for (; j < seg.length && seg[j] !== "]"; j++) cls += seg[j].replace(/[\\\]^]/g, "\\$&");
      if (j < seg.length) {
        cls += "]";
        re += cls;
        i = j;
      } else {
        re += "\\[";
      }
    } else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "$");
}

function readdirSafe(abs) {
  try {
    return readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Expand a glob under POSIX-`sh` semantics — the semantics `npm` scripts
 * actually get, because npm runs them through `sh`.
 *
 * `sh` has no globstar. `**` is parsed as two adjacent `*`, each of which
 * matches within ONE path segment, so `**` matches exactly one directory
 * level. This function reproduces that faithfully; comparing it against
 * {@link walkMatching} is what makes the under-expansion class of bug
 * visible without executing anything.
 *
 * @param {string} pattern Glob relative to `root`.
 * @param {string} root Absolute directory the pattern is rooted at.
 * @returns {string[]} Matching paths relative to `root`, sorted.
 */
export function expandShGlob(pattern, root) {
  const segs = pattern.split("/").filter((s) => s.length > 0);
  if (segs.length === 0) return [];
  let budget = WALK_BUDGET;
  const out = [];

  function step(relDir, si) {
    if (budget-- <= 0) return;
    const seg = segs[si];
    const re = segmentToRegex(seg);
    const abs = relDir ? join(root, relDir) : root;
    for (const entry of readdirSafe(abs)) {
      // sh never matches a leading dot unless the pattern is explicit.
      if (entry.name.startsWith(".") && !seg.startsWith(".")) continue;
      if (!re.test(entry.name)) continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (si === segs.length - 1) out.push(rel);
      else if (entry.isDirectory()) step(rel, si + 1);
    }
  }
  step("", 0);
  return [...new Set(out)].sort();
}

/**
 * Expand a glob with true `**` recursion — what the author of the pattern
 * meant, as opposed to what `sh` delivers.
 *
 * @param {string} pattern Glob relative to `root`.
 * @param {string} root Absolute directory the pattern is rooted at.
 * @returns {string[]} Matching paths relative to `root`, sorted.
 */
export function walkMatching(pattern, root) {
  const segs = pattern.split("/").filter((s) => s.length > 0);
  if (segs.length === 0) return [];
  let budget = WALK_BUDGET;
  const out = [];

  function step(relDir, si) {
    if (budget-- <= 0) return;
    if (si >= segs.length) return;
    const seg = segs[si];
    const abs = relDir ? join(root, relDir) : root;

    if (seg === "**") {
      step(relDir, si + 1); // `**` matches zero directory levels
      for (const entry of readdirSafe(abs)) {
        if (!entry.isDirectory()) continue;
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".")) continue;
        step(relDir ? `${relDir}/${entry.name}` : entry.name, si);
      }
      return;
    }

    const re = segmentToRegex(seg);
    for (const entry of readdirSafe(abs)) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".") && !seg.startsWith(".")) continue;
      if (!re.test(entry.name)) continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (si === segs.length - 1) out.push(rel);
      else if (entry.isDirectory()) step(rel, si + 1);
    }
  }
  step("", 0);
  return [...new Set(out)].sort();
}

/**
 * Identify the test runner behind a command.
 *
 * @param {string} command
 * @returns {{ runner: string|null, collectQuery: string|null, parse: string|null, diskPatterns: string[] }}
 */
export function detectRunner(command) {
  const c = command ?? "";
  for (const r of RUNNERS) {
    if (r.test(c)) {
      return {
        runner: r.runner,
        collectQuery: r.collectQuery,
        parse: r.parse,
        diskPatterns: r.diskPatterns,
      };
    }
  }
  return { runner: null, collectQuery: null, parse: null, diskPatterns: [] };
}

/**
 * CI configuration files present in a project.
 *
 * @param {string} projectRoot
 * @returns {Array<{ path: string, text: string }>}
 */
export function findCiConfigs(projectRoot) {
  const out = [];
  for (const loc of CI_LOCATIONS) {
    const abs = join(projectRoot, loc.path);
    if (loc.kind === "dir") {
      if (!existsSync(abs)) continue;
      for (const entry of readdirSafe(abs)) {
        if (!entry.isFile()) continue;
        if (!loc.exts.some((e) => entry.name.endsWith(e))) continue;
        out.push(readCi(projectRoot, join(abs, entry.name)));
      }
    } else if (existsSync(abs) && safeIsFile(abs)) {
      out.push(readCi(projectRoot, abs));
    }
  }
  return out.filter(Boolean);
}

function safeIsFile(abs) {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

function readCi(projectRoot, abs) {
  try {
    return { path: relative(projectRoot, abs), text: readFileSync(abs, "utf8") };
  } catch {
    return null;
  }
}

/**
 * True when git reports `relPath` ignored. Degrades to `false` — not to a
 * throw — outside a git repository, because the doctor must run on projects
 * that are not under version control.
 *
 * @param {string} projectRoot
 * @param {string} relPath
 * @returns {boolean}
 */
export function isGitignored(projectRoot, relPath) {
  const res = spawnSync("git", ["check-ignore", "-q", "--", relPath], {
    cwd: projectRoot,
    stdio: "ignore",
  });
  // 0 = ignored, 1 = not ignored, 128 = not a git repo / other failure.
  return res.status === 0;
}

/**
 * Follow package-manager script indirection.
 *
 * This matters more than it looks. The adev-plugin finding did not live in
 * the gate command — the gate command was `npm test`. It lived one hop away,
 * in `package.json`'s `scripts.test`, where the `**` glob was. A doctor that
 * only inspects the literal gate command would have missed the very bug that
 * motivated it.
 *
 * @param {string} command
 * @param {string} projectRoot
 * @returns {Array<{ command: string, source: string }>} The original command
 *   first, then any resolved script bodies, depth-limited and cycle-safe.
 */
export function resolveCommandChain(command, projectRoot) {
  const chain = [{ command, source: "gates.yaml" }];
  const seen = new Set();
  let pkg = null;
  const pkgPath = join(projectRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    } catch {
      pkg = null;
    }
  }
  if (!pkg || typeof pkg.scripts !== "object" || pkg.scripts === null) return chain;

  let cursor = command;
  for (let depth = 0; depth < 3; depth++) {
    const script = scriptNameOf(cursor);
    if (!script || seen.has(script)) break;
    seen.add(script);
    const body = pkg.scripts[script];
    if (typeof body !== "string" || body.length === 0) break;
    chain.push({ command: body, source: `package.json:scripts.${script}` });
    cursor = body;
  }
  return chain;
}

/** `npm test` / `npm run build` / `yarn lint` / `pnpm run x` → script name. */
function scriptNameOf(command) {
  const tokens = splitOnOperators(tokenizeDetailed(command ?? ""))[0] ?? [];
  if (tokens.length < 2) return null;
  const [pm, second] = tokens;
  if (!["npm", "yarn", "pnpm", "bun"].includes(pm)) return null;
  if (second === "run" || second === "run-script") {
    // Skip flags between the verb and the script name (`npm run --if-present
    // test:integration`), or the chain resolver looks up scripts["--if-present"].
    let i = 2;
    while (i < tokens.length && tokens[i].startsWith("-")) i++;
    return tokens[i] ?? null;
  }
  if (second.startsWith("-")) return null;
  // `npm test` / `npm start` are the built-in aliases; `yarn <script>` is
  // the shorthand form for any script.
  if (pm === "npm" || pm === "bun") return ["test", "start", "stop", "restart"].includes(second) ? second : null;
  return second;
}

// ── Orchestrator ────────────────────────────────────────────────────────────

function finding(id, severity, message, extra = {}) {
  return { id, severity, message, ...extra };
}

/**
 * Environment for a spawned command.
 *
 * Two details that are easy to get wrong and both produce wrong diagnoses:
 *
 *  - `node_modules/.bin` is prepended to PATH. `resolveBinary` already counts
 *    a local bin as resolved, so omitting it here would make the doctor
 *    contradict itself: static analysis says the binary is fine, execution
 *    reports exit 127.
 *  - `PWD` is overwritten. `spawnSync` sets the child's working directory but
 *    inherits the PARENT's `PWD` variable, so a command that interpolates
 *    `$PWD` silently reports paths from the wrong tree.
 */
/** Package managers whose bare name says nothing about which gate ran. */
const PACKAGE_MANAGERS = new Set(["npm", "yarn", "pnpm", "bun", "npx", "make", "sh", "bash", "python", "python3", "node", "go"]);

/**
 * Strings whose presence in a CI file counts as "this gate is invoked".
 *
 * The bare executable token is only a candidate when it is distinctive. An
 * earlier version fell back to it unconditionally, which meant a gate command
 * of `npm test` matched any CI file containing `npm ci` — making
 * `ci-gate-not-invoked` effectively unfirable on every JavaScript project,
 * the exact ecosystem the check most needs to work in.
 *
 * @param {string} command The literal gate command.
 * @param {Array<{command: string, source: string}>} chain Resolved command chain.
 * @param {string|null} exeToken The gate's executable token.
 * @returns {string[]}
 */
function ciMatchCandidates(command, chain, exeToken) {
  const out = new Set([command]);
  for (const link of chain) out.add(link.command);
  const script = scriptNameOf(command);
  if (script) {
    for (const pm of ["npm", "yarn", "pnpm", "bun"]) {
      out.add(`${pm} run ${script}`);
      out.add(`${pm} ${script}`);
    }
  }
  if (exeToken && exeToken.length > 3 && !PACKAGE_MANAGERS.has(exeToken)) out.add(exeToken);
  return [...out].filter((s) => s && s.length > 2);
}

function spawnEnv(projectRoot, envIn) {
  const localBin = join(projectRoot, "node_modules", ".bin");
  return {
    ...process.env,
    ...envIn,
    PWD: projectRoot,
    PATH: `${localBin}:${process.env.PATH ?? ""}`,
    ADEV_GATE_DOCTOR: "1",
  };
}

/**
 * Run every diagnostic family against a project.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot Absolute project root.
 * @param {boolean} [opts.execute=false] Opt into subprocess execution.
 * @param {number} [opts.timeoutMs=120000] Per-command budget under `execute`.
 * @param {string} [opts.gatesPath] Override for gates.yaml, project-relative.
 * @param {object} [opts.env=process.env] Environment consulted for the
 *   reentrancy guard. Spawned commands always receive the real process
 *   environment plus `ADEV_GATE_DOCTOR=1`.
 * @returns {Promise<object>} The report envelope.
 */
export async function runGateDoctor(opts) {
  const projectRoot = resolve(opts.projectRoot);
  const execute = Boolean(opts.execute);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const envIn = opts.env ?? process.env;
  const findings = [];
  const runners = [];

  const gatesRel = opts.gatesPath ?? DEFAULT_GATES_PATH;
  const gatesAbs = isAbsolute(gatesRel) ? gatesRel : resolve(projectRoot, gatesRel);
  if (!gatesAbs.startsWith(projectRoot + sep) && gatesAbs !== projectRoot) {
    throw new Error(`gates path escapes the project root: ${gatesRel}`);
  }

  const gates = loadGates(gatesAbs, findings);

  if (gates === null || gates.length === 0) {
    findings.push(
      finding(
        "gate-doctor/no-gates-configured",
        "warning",
        `No gates are declared in ${gatesRel}. A project without gates cannot be diagnosed — ` +
          `run /adev:init to scaffold governance/gates.yaml.`,
        { citation: gatesRel },
      ),
    );
    return envelope(findings, runners);
  }

  // Reentrancy guard (Behavior 11). Checked once, before any spawn.
  let mayExecute = execute;
  if (execute && envIn.ADEV_GATE_DOCTOR) {
    mayExecute = false;
    findings.push(
      finding(
        "gate-doctor/reentrant-execution-skipped",
        "warning",
        "ADEV_GATE_DOCTOR is already set — this doctor is running inside a gate it would " +
          "itself execute. Falling back to static analysis; no command was spawned.",
      ),
    );
  }

  const ciConfigs = findCiConfigs(projectRoot);
  if (ciConfigs.length === 0) {
    findings.push(
      finding(
        "gate-doctor/ci-config-missing",
        "warning",
        "No CI configuration found. Gates that only ever run on a developer's machine are " +
          "gates the project cannot rely on.",
      ),
    );
  }

  for (const gate of gates) {
    const id = gate?.id ?? "(unnamed)";
    const command = normaliseCommand(gate?.command);
    const kind = gate?.kind ?? "deterministic";

    // Probabilistic gates carry no command by charter invariant.
    if (kind === "probabilistic") continue;

    if (command.trim() === "") {
      findings.push(
        finding("gate-doctor/empty-command", "warning", `Gate '${id}' declares no command.`, {
          gate: id,
          citation: gatesRel,
        }),
      );
      continue;
    }

    // (d) placeholders — checked before anything that would parse the command
    // as if it were real, because it is not.
    const placeholders = extractPlaceholders(command);
    for (const p of placeholders) {
      findings.push(
        finding(
          "gate-doctor/unsubstituted-placeholder",
          "error",
          `Gate '${id}' has an unsubstituted template placeholder: ${p}`,
          { gate: id, citation: gatesRel },
        ),
      );
    }
    if (placeholders.length > 0) continue;

    const chain = resolveCommandChain(command, projectRoot);

    // (b, static) binary resolution
    const bin = resolveBinary(command, projectRoot);
    if (!bin.resolved) {
      findings.push(
        finding(
          "gate-doctor/binary-not-found",
          "error",
          `Gate '${id}': '${bin.token}' is not a shell builtin and was not found on PATH or in ` +
            `node_modules/.bin.`,
          { gate: id, citation: gatesRel },
        ),
      );
    }

    // (e) referenced paths
    for (const link of chain) {
      for (const { path: p, segmentIndex } of referencedPathsDetailed(link.command)) {
        const abs = isAbsolute(p) ? p : resolve(projectRoot, p);
        if (!existsSync(abs)) {
          // A path produced by an earlier sub-command legitimately does not
          // exist yet at analysis time. Only a path the gate needs BEFORE it
          // has run anything is provably missing.
          if (segmentIndex > 0) continue;
          findings.push(
            finding(
              "gate-doctor/path-missing",
              "error",
              `Gate '${id}' references '${p}', which does not exist (via ${link.source}).`,
              { gate: id, citation: link.source },
            ),
          );
          continue;
        }
        if (!isAbsolute(p) && isGitignored(projectRoot, p)) {
          const first = segmentIndex === 0;
          findings.push(
            finding(
              "gate-doctor/path-gitignored",
              first ? "error" : "warning",
              first
                ? `Gate '${id}' starts by entering '${p}', which is gitignored. Nothing runs ` +
                  `before it that could create that path, so the gate can only work for whoever ` +
                  `created it locally — never in CI, never for a fresh clone.`
                : `Gate '${id}' references '${p}', which is gitignored. An earlier step in the ` +
                  `same command may build it, so this is reported as a warning — confirm that ` +
                  `step runs in CI too.`,
              { gate: id, citation: link.source },
            ),
          );
        }
      }
    }

    // (a, static) sh-globstar under-expansion
    for (const link of chain) {
      for (const pattern of extractGlobPatterns(link.command)) {
        const shSet = expandShGlob(pattern, projectRoot);
        const deepSet = walkMatching(pattern, projectRoot);
        if (deepSet.length > shSet.length) {
          const dropped = deepSet.filter((f) => !shSet.includes(f)).slice(0, 10);
          findings.push(
            finding(
              "gate-doctor/glob-under-expansion",
              "error",
              `Gate '${id}': pattern '${pattern}' (via ${link.source}) matches ${deepSet.length} ` +
                `files with true '**' recursion but only ${shSet.length} under 'sh', which has no ` +
                `globstar and degrades '**' to a single '*'. ${deepSet.length - shSet.length} ` +
                `files are silently skipped: ${dropped.join(", ")}` +
                (deepSet.length - shSet.length > dropped.length ? ", …" : ""),
              { gate: id, citation: link.source },
            ),
          );
        }
      }
    }

    // (a) runner identification
    let detected = { runner: null, collectQuery: null, parse: null, diskPatterns: [] };
    let detectedVia = chain[0].source;
    for (const link of chain) {
      const d = detectRunner(link.command);
      if (d.runner) {
        detected = d;
        detectedVia = link.source;
        break;
      }
    }
    runners.push({ gate: id, runner: detected.runner, source: detectedVia });

    if (!detected.runner || !detected.collectQuery) {
      findings.push(
        finding(
          "gate-doctor/runner-unknown",
          "warning",
          detected.runner
            ? `Gate '${id}': runner '${detected.runner}' has no collect-only mode, so test ` +
              `collection cannot be verified. Coverage for this gate is the glob analysis only.`
            : `Gate '${id}': no known test runner identified in '${command}', so test collection ` +
              `cannot be verified. This is reported rather than passed silently.`,
          { gate: id, citation: gatesRel },
        ),
      );
    }

    // (c) CI wiring
    if (ciConfigs.length > 0) {
      const invoked = ciConfigs.some((c) =>
        ciMatchCandidates(command, chain, bin.token).some((cand) => c.text.includes(cand)),
      );
      if (!invoked) {
        findings.push(
          finding(
            "gate-doctor/ci-gate-not-invoked",
            "warning",
            `Gate '${id}' ('${command}') does not appear in any CI configuration ` +
              `(${ciConfigs.map((c) => c.path).join(", ")}). A gate CI never runs is a gate that ` +
              `only constrains whoever remembers to run it.`,
            { gate: id, citation: ciConfigs[0].path },
          ),
        );
      }
    }

    if (!mayExecute) continue;

    // (b, execute) gate smoke-run. stdout and stderr are discarded outright
    // (SEC-3): the doctor records status, never runner output, so a gate that
    // prints a token cannot leak it into a report.
    const res = spawnSync("sh", ["-c", command], {
      cwd: projectRoot,
      env: spawnEnv(projectRoot, envIn),
      timeout: timeoutMs,
      stdio: "ignore",
    });
    const timedOut =
      res.error?.code === "ETIMEDOUT" || (res.signal === "SIGTERM" && res.status === null);
    if (timedOut) {
      findings.push(
        finding(
          "gate-doctor/gate-not-executable",
          "error",
          `Gate '${id}' timed out after ${timeoutMs}ms without completing.`,
          { gate: id },
        ),
      );
    } else if (res.error?.code === "ENOENT" || res.status === 127) {
      findings.push(
        finding(
          "gate-doctor/gate-not-executable",
          "error",
          `Gate '${id}' cannot run: command not found (exit 127).`,
          { gate: id },
        ),
      );
    } else if (res.status !== 0) {
      findings.push(
        finding(
          "gate-doctor/gate-failed",
          "warning",
          `Gate '${id}' ran and exited ${res.status}. The gate is executable; that it fails is a ` +
            `real signal but a different one, and not the doctor's business.`,
          { gate: id },
        ),
      );
    }

    // (a, execute) collection diff
    if (detected.collectQuery) {
      collectionDiff({
        projectRoot,
        gateId: id,
        detected,
        timeoutMs,
        envIn,
        findings,
      });
    }
  }

  return envelope(findings, runners);
}

/**
 * Ask a runner what it collects and diff that against the disk.
 * Mutates `findings`.
 */
function collectionDiff({ projectRoot, gateId, detected, timeoutMs, envIn, findings }) {
  const res = spawnSync("sh", ["-c", detected.collectQuery], {
    cwd: projectRoot,
    env: spawnEnv(projectRoot, envIn),
    timeout: timeoutMs,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

  if (res.error || res.status === 127) {
    findings.push(
      finding(
        "gate-doctor/runner-unknown",
        "warning",
        `Gate '${gateId}': collection query '${detected.collectQuery}' could not run, so ` +
          `collection was not verified.`,
        { gate: gateId },
      ),
    );
    return;
  }

  const onDisk = new Set();
  for (const p of detected.diskPatterns) {
    for (const f of walkMatching(p, projectRoot)) onDisk.add(f);
  }

  if (detected.parse === "names") {
    const names = (res.stdout ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^(Test|Benchmark|Example|Fuzz)\w*$/.test(l));
    if (names.length === 0 && onDisk.size > 0) {
      findings.push(
        finding(
          "gate-doctor/no-tests-collected",
          "error",
          `Gate '${gateId}': ${onDisk.size} test files exist on disk but the runner collected ` +
            `zero tests.`,
          { gate: gateId },
        ),
      );
    }
    return;
  }

  const collected = new Set();
  for (const raw of (res.stdout ?? "").split("\n")) {
    let line = raw.trim();
    if (line === "") continue;
    line = line.split("::")[0].trim();
    if (!/\.[A-Za-z0-9]+$/.test(line)) continue;
    const rel = isAbsolute(line) ? relative(projectRoot, line) : line;
    if (rel.startsWith("..")) continue;
    collected.add(rel);
  }

  if (collected.size === 0 && onDisk.size > 0) {
    findings.push(
      finding(
        "gate-doctor/no-tests-collected",
        "error",
        `Gate '${gateId}': ${onDisk.size} test files exist on disk but '${detected.collectQuery}' ` +
          `collected none. Every one of them is dead weight.`,
        { gate: gateId },
      ),
    );
    return;
  }

  const missed = [...onDisk].filter((f) => !collected.has(f)).sort();
  if (missed.length > 0) {
    findings.push(
      finding(
        "gate-doctor/collection-gap",
        "error",
        `Gate '${gateId}': ${missed.length} of ${onDisk.size} test files on disk are not ` +
          `collected by '${detected.collectQuery}': ${missed.slice(0, 10).join(", ")}` +
          (missed.length > 10 ? ", …" : ""),
        { gate: gateId },
      ),
    );
  }
}

/** Read and shape gates.yaml. Returns null when absent or unparseable. */
function loadGates(gatesAbs, findings) {
  if (!existsSync(gatesAbs)) return null;
  let raw;
  try {
    raw = readFileSync(gatesAbs, "utf8");
  } catch {
    return null;
  }
  if (raw.trim() === "") return null;
  let doc;
  try {
    doc = parseYaml(raw);
  } catch (err) {
    findings.push(
      finding(
        "gate-doctor/gates-parse-error",
        "error",
        `Could not parse gates.yaml: ${err.message ?? err}`,
      ),
    );
    return [];
  }
  const gates = doc?.gates;
  if (!Array.isArray(gates)) return null;
  return gates.filter((g) => g && typeof g === "object");
}

function envelope(findings, runners) {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return {
    schema_version: SCHEMA_VERSION,
    findings,
    runners,
    summary: { total: findings.length, errors, warnings },
  };
}

/**
 * Which diagnostic family a finding belongs to, for grouped human output.
 * @param {string} id
 * @returns {string}
 */
export function familyOf(id) {
  if (id.includes("glob") || id.includes("collection") || id.includes("runner") || id.includes("tests-collected")) {
    return "Test collection";
  }
  if (id.includes("placeholder")) return "Placeholders";
  if (id.includes("ci-")) return "CI wiring";
  if (id.includes("path-")) return "Path reachability";
  return "Gate executability";
}
