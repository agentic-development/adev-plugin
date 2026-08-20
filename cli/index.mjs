#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readSync, writeFileSync, cpSync, chmodSync } from "fs";
import { join, resolve, dirname, relative, isAbsolute } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { getProvider, getProviderNames } from "../lib/provider/registry.mjs";
import { resolveExtensionSource } from "../lib/extensions/resolve-source.mjs";
import { installExtension, readManifestStamps } from "../lib/extensions/install.mjs";
import { loadManifest } from "../lib/manifest.mjs";
import { safeRealpath as resolveSymlink, lenientRealpath } from "../lib/path-safety.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, "..");
const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8")
).version;

function log(msg) {
  console.log(`  ${msg}`);
}

function success(msg) {
  console.log(`  ✓ ${msg}`);
}

function warn(msg) {
  console.log(`  ⚠ ${msg}`);
}

function error(msg) {
  console.error(`  ✗ ${msg}`);
}

function heading(msg) {
  console.log(`\n  ${msg}\n`);
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Ask the operator a question and read one line back, SYNCHRONOUSLY.
 *
 * `ask()` cannot be used for install consent. `resolveExecConsent`
 * (lib/extensions/exec-consent.mjs) calls its `promptFn` synchronously, and its
 * whole contract — only an explicit y/yes grants; an empty answer, EOF, any
 * other answer, or a throwing prompt all refuse — is pinned by SYNCHRONOUS
 * tests using `assert.throws`. Making the consent resolution async would turn
 * every one of those refusals from a throw into a rejection and break the
 * module that owns the fail-closed guarantee. So the prompt is made
 * synchronous rather than the consent made asynchronous.
 *
 * Read one byte at a time so the read stops at the newline and does not swallow
 * input belonging to whatever runs next. Any read failure (EOF, EAGAIN on a
 * non-blocking TTY, a closed stdin) propagates to `resolveExecConsent`, which
 * catches it and refuses — the fail-closed direction.
 *
 * @param {string} text - Prompt to display.
 * @returns {string} The line the operator typed, without its terminator.
 */
export function readConsentAnswerSync(text) {
  process.stdout.write(`${text} `);
  const byte = Buffer.alloc(1);
  let answer = "";
  for (;;) {
    const bytesRead = readSync(0, byte, 0, 1, null);
    if (bytesRead === 0) break; // EOF — an empty answer, which refuses.
    const ch = byte.toString("utf8");
    if (ch === "\n") break;
    if (ch !== "\r") answer += ch;
  }
  return answer;
}

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function parseProviderFlags() {
  const providers = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--provider" && argv[i + 1]) {
      const p = argv[i + 1];
      if (!getProviderNames().includes(p)) {
        error(`Unknown provider: ${p}`);
        error(`Available: ${getProviderNames().join(", ")}`);
        process.exit(1);
      }
      providers.push(p);
      i++;
    }
  }
  return providers;
}

/**
 * Parse `--target <name>` (Copilot's CLI surface — `adev install --target copilot`).
 * Returns the target name or null. Validates the name is a known provider.
 *
 * @returns {string|null}
 */
function parseTargetFlag() {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--target" && argv[i + 1]) {
      const t = argv[i + 1];
      if (!getProviderNames().includes(t)) {
        error(`Unknown target: ${t}`);
        error(`Available: ${getProviderNames().join(", ")}`);
        process.exit(1);
      }
      return t;
    }
  }
  return null;
}

function parseBooleanFlag(name) {
  return process.argv.includes(name);
}

async function selectProviders({ ask: askFn = ask } = {}) {
  const explicitProviders = parseProviderFlags();
  if (explicitProviders.length > 0) {
    return explicitProviders;
  }

  console.log("  Which AI coding assistant(s) do you want to use?\n");
  console.log("    [1] Claude Code only (default)");
  console.log("    [2] OpenCode only");
  console.log("    [3] OpenAI Codex only");
  console.log("    [4] Cursor only");
  console.log("    [5] Claude Code and OpenCode");
  console.log("    [6] Claude Code and OpenAI Codex");
  console.log("    [7] All four providers (Claude Code, OpenCode, Codex, Cursor)\n");

  const answer = await askFn("Enter choice (1-7) [1]: ");

  switch (answer) {
    case "2":
      return ["opencode"];
    case "3":
      return ["codex"];
    case "4":
      return ["cursor"];
    case "5":
      return ["claude-code", "opencode"];
    case "6":
      return ["claude-code", "codex"];
    case "7":
      return ["claude-code", "opencode", "codex", "cursor"];
    default:
      return ["claude-code"];
  }
}

/**
 * Determine whether an existing `.context-index/` has actually been configured
 * by the user, versus still being in the pristine template state that
 * `adev install` scaffolds (and `/adev:init` later fills in).
 *
 * `adev install` copies `manifest.yaml` and `constitution.md` verbatim from the
 * templates (only `adev_version` is stamped), so unreplaced `{{ project_name }}` /
 * `{{ project_description }}` placeholders are a reliable "not yet configured"
 * signal. This mirrors the detection rule in skills/init/SKILL.md.
 *
 * @param {string} contextIndex - Absolute path to the `.context-index/` directory.
 * @returns {boolean} true if configured (placeholders replaced), false if pristine.
 */
function isContextIndexConfigured(contextIndex) {
  const placeholder = /\{\{\s*project_(?:name|description)\s*\}\}/;
  const candidates = ["manifest.yaml", "constitution.md"];
  let sawAny = false;
  for (const rel of candidates) {
    const p = join(contextIndex, rel);
    if (!existsSync(p)) continue;
    sawAny = true;
    try {
      if (placeholder.test(readFileSync(p, "utf8"))) return false;
    } catch {}
  }
  // If neither file exists, treat as unconfigured (nothing real to diagnose).
  return sawAny;
}

/**
 * Detect the project state for init routing.
 *
 * `configured` distinguishes a context index the user has actually set up from
 * one that `adev install` merely scaffolded from templates. Existence of
 * `.context-index/` alone is NOT enough — install always creates it before the
 * user runs `/adev:init`. Callers gate "use upgrade" / diagnostic behavior on
 * `configured`, not on `mode` alone.
 *
 * @returns {{ mode: 'greenfield'|'brownfield-no-adev'|'brownfield-outdated'|'brownfield-current', version: string|null, hasGit: boolean, hasCode: boolean, configured: boolean }}
 */
function detectProjectState() {
  const cwd = process.cwd();
  const contextIndex = join(cwd, ".context-index");
  const manifestPath = join(contextIndex, "manifest.yaml");
  const hasGit = existsSync(join(cwd, ".git"));
  // Heuristic: has code if package.json, Cargo.toml, go.mod, pyproject.toml, or src/ exists
  const codeMarkers = ["package.json", "Cargo.toml", "go.mod", "pyproject.toml", "requirements.txt", "Gemfile", "pom.xml"];
  const hasCode = codeMarkers.some(m => existsSync(join(cwd, m))) || existsSync(join(cwd, "src"));

  if (!existsSync(contextIndex)) {
    return { mode: hasCode ? "brownfield-no-adev" : "greenfield", version: null, hasGit, hasCode, configured: false };
  }

  const configured = isContextIndexConfigured(contextIndex);

  // Context index exists — check version
  let installedVersion = null;
  if (existsSync(manifestPath)) {
    try {
      const manifest = readFileSync(manifestPath, "utf8");
      const vm = manifest.match(/adev_version:\s*["']?([^"'\s]+)/);
      if (vm) installedVersion = vm[1];
    } catch {}
  }

  if (!installedVersion) {
    // Has context-index but no version stamp — pre-versioning install
    return { mode: "brownfield-outdated", version: null, hasGit, hasCode, configured };
  }

  if (installedVersion === PLUGIN_VERSION) {
    return { mode: "brownfield-current", version: installedVersion, hasGit, hasCode, configured };
  }

  return { mode: "brownfield-outdated", version: installedVersion, hasGit, hasCode, configured };
}

/**
 * Compute what needs upgrading between installed version and current.
 * @param {string|null} fromVersion
 * @returns {{ hooks: boolean, templates: boolean, provenance: boolean, description: string[] }}
 */
function computeUpgradeDelta(fromVersion) {
  const delta = { hooks: false, templates: false, provenance: false, description: [] };

  if (!fromVersion) {
    // Pre-versioning: everything is new
    delta.hooks = true;
    delta.templates = true;
    delta.provenance = true;
    delta.description.push("Git hooks (commit-msg lifecycle enforcement, trailer injection)");
    delta.description.push("Provenance tracking (Author-type, Operator, Spec trailers)");
    delta.description.push("Charter template (Deferred Capabilities table)");
    return delta;
  }

  // Parse semver for comparison
  const [fMaj, fMin] = fromVersion.split(".").map(Number);
  const [tMaj, tMin] = PLUGIN_VERSION.split(".").map(Number);

  // commit-msg hook added in 0.13.0
  if (fMaj === 0 && fMin < 13) {
    delta.hooks = true;
    delta.provenance = true;
    delta.description.push("commit-msg hook (lifecycle enforcement for manifest-claimed files)");
    delta.description.push("Provenance config (Author-type, Operator trailers + CI gate)");
    delta.description.push("Issue/Author-type/Operator trailers in prepare-commit-msg");
  }

  // Deferred Capabilities in charter template added in 0.13.0
  if (fMaj === 0 && fMin < 13) {
    delta.templates = true;
    delta.description.push("Charter template updated (Deferred Capabilities table)");
  }

  return delta;
}

function scaffoldContextKit() {
  const root = join(process.cwd(), ".context-index");
  const created = [];

  const dirs = [
    "",
    "specs",
    "specs/cross-cutting",
    "specs/features",
    "adrs",
    "samples",
    "orientation",
    "specialists",
    "hygiene",
    "sessions",
    "governance",
  ];

  for (const dir of dirs) {
    const path = join(root, dir);
    if (!existsSync(path)) {
      ensureDir(path);
      created.push(dir || ".context-index/");
    }
  }

  const templates = [
    { src: "constitution-template.md", dest: "constitution.md" },
    { src: "manifest-template.yaml", dest: "manifest.yaml" },
    { src: "adr-template.md", dest: "adrs/.template.md" },
    { src: "charter-template.feature.md", dest: "specs/features/.charter-template.feature.md" },
    { src: "spec-template.behavioral.md", dest: "specs/features/.spec-template.behavioral.md" },
    { src: "spec-template.refactor.md", dest: "specs/features/.spec-template.refactor.md" },
    { src: "context-index-readme.md", dest: "README.md" },
    { src: "diagnostics-template.yaml", dest: "governance/diagnostics.yaml" },
  ];

  const templatesDir = join(PLUGIN_ROOT, "templates");
  for (const { src, dest } of templates) {
    const destPath = join(root, dest);
    if (!existsSync(destPath) && existsSync(join(templatesDir, src))) {
      cpSync(join(templatesDir, src), destPath);
      created.push(dest);
    }
  }

  const gitignorePath = join(process.cwd(), ".gitignore");
  const ephemeralEntries = [
    ".context-index/hygiene/",
    ".context-index/.token-cursor.json",
    ".context-index/.reminder-counter",
    ".context-index/.session-tracking.jsonl",
    ".context-index/user-config",
  ];
  if (existsSync(gitignorePath)) {
    let content = readFileSync(gitignorePath, "utf8");
    const missing = ephemeralEntries.filter((e) => !content.includes(e));
    if (missing.length) {
      const needsHeader = !content.includes(".context-index/hygiene");
      const block = (needsHeader ? "\n# adev context index\n" : "") + missing.join("\n") + "\n";
      content = content.trimEnd() + "\n" + block;
      writeFileSync(gitignorePath, content);
      created.push(".gitignore (updated)");
    }
  } else {
    writeFileSync(gitignorePath, "# adev context index\n" + ephemeralEntries.join("\n") + "\n");
    created.push(".gitignore (created)");
  }

  return created;
}

/**
 * Detect the current git core.hooksPath setting.
 * @returns {string|null} The configured hooks path, or null if unset / not a git repo.
 */
/**
 * Quote a string as a bash single-quoted literal.
 *
 * Inside single quotes bash expands nothing — no `$(…)`, no backticks, no `$`.
 * The only character that cannot appear is `'` itself, which is emitted by
 * closing the literal, adding an escaped quote, and reopening: `'\''`.
 *
 * Used for every externally-sourced value written into a generated hook.
 */
function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * True iff `candidatePath`, once every symlink component is resolved,
 * escapes `root`. Shared by `validateHooksPath` (the raw `core.hooksPath`
 * string) and the `originalHookPath` re-check (the concrete, per-hook-name
 * resolved file) so both containment checks are backed by one implementation
 * rather than two independently-maintained copies of the same comparison.
 *
 * `lenientRealpath` (not `realpathSync`) because either argument can be a
 * path that doesn't fully exist yet — see its own doc comment in
 * lib/path-safety.mjs. A pathological symlink cycle makes `lenientRealpath`
 * throw rather than hang; that is treated as an escape (fail closed) instead
 * of letting the exception crash the installer.
 */
function escapesRepoPhysically(candidatePath, root) {
  try {
    const realRoot = lenientRealpath(root);
    const realCandidate = lenientRealpath(candidatePath);
    const rel = relative(realRoot, realCandidate);
    return rel.startsWith("..") || isAbsolute(rel);
  } catch {
    return true;
  }
}

/**
 * Reject a `core.hooksPath` that cannot be safely used.
 *
 * Three independent problems, all reachable WITHOUT `.git/config` write
 * access — a tracked symlink rides along with an ordinary `git clone`, and
 * `core.hooksPath = .husky` is the everyday value husky's own postinstall
 * writes:
 *
 *   1. Shell metacharacters become code in the generated wrapper. Quoting
 *      (shellSingleQuote) is the containment; this allowlist is the control.
 *   2. A path outside the repository is "relative" but not "contained" —
 *      `../../husky/pre-commit` resolves to a directory the installer does not
 *      own on a teammate's machine or a CI runner, and the wrapper executes
 *      whatever is there.
 *   3. `resolve()`/`relative()` are pure string operations — they never touch
 *      the filesystem. A tracked in-repo symlink (`.husky -> ../shared-hooks`,
 *      or a file symlink `hooks/pre-commit -> ../../evil.sh`) is lexically
 *      "under" repoRoot yet physically resolves somewhere else entirely
 *      (CWE-22). `lenientRealpath` is used instead of `realpathSync` because
 *      the candidate — or a directory symlink's target — may not exist yet
 *      (a fresh `.githooks/` about to be scaffolded, or a dangling symlink
 *      shipped in the repo), and `realpathSync` throws `ENOENT` the moment
 *      any part of that chain is missing. `repoRoot` itself is realpath'd
 *      too — on macOS `TMPDIR` (and other paths) sit behind a `/var` ->
 *      `/private/var` symlink, so comparing an un-realpath'd repoRoot against
 *      a realpath'd candidate would falsely reject a legitimate same-repo path.
 *
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateHooksPath(rawPath, repoRoot) {
  if (!/^[A-Za-z0-9._\/-]+$/.test(rawPath)) {
    return {
      ok: false,
      reason: "contains characters that are unsafe in a generated shell script (allowed: letters, digits, . _ - /)",
    };
  }
  const resolved = resolve(repoRoot, rawPath);
  const rel = relative(repoRoot, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { ok: false, reason: `resolves outside the repository (${resolved})` };
  }

  if (escapesRepoPhysically(resolved, repoRoot)) {
    let realResolved;
    try {
      realResolved = lenientRealpath(resolved);
    } catch (err) {
      return { ok: false, reason: `could not be resolved safely (${err.message})` };
    }
    return {
      ok: false,
      reason: `resolves outside the repository through a symlink (${realResolved})`,
    };
  }
  return { ok: true };
}

function getExistingHooksPath() {
  try {
    const raw = execSync("git config --get core.hooksPath", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return raw.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Generate a wrapper hook script that chains the adev hook with an existing one.
 * The adev hook runs first; if it exits non-zero (blocking), the original is skipped.
 * @param {string} adevHookPath - Relative path to the .adev hook variant.
 * @param {string} originalHookPath - Absolute or relative path to the original hook.
 * @param {string} hookName - The hook name (for the comment).
 * @returns {string} Shell script content.
 */
function buildChainedHook(adevHookPath, originalHookPath, hookName) {
  return `#!/usr/bin/env bash
# Chained ${hookName} — runs adev hook first, then the original.
# Auto-generated by adev init. Edit with care.
#
# FAILS CLOSED. The previous version guarded both hooks with \`[ -x ]\` and fell
# through to \`exit 0\`, which conflates three different states — absent,
# present-but-not-executable, and runnable — into "skip silently". A guard that
# was disabled then looked exactly like a guard that approved the commit.
# The executable bit does not survive every round trip (archive/restore, zip,
# some CI checkouts, Windows/WSL), so this is a state hooks reach in practice.
#
# The original hook is resolved relative to the repository root, never as an
# absolute path from the installing machine: .githooks/ is tracked, so this
# file is read on other people's clones.
#
# Escape hatch: ADEV_HOOK_CHAIN_ALLOW_MISSING=1 downgrades an unusable hook to
# a warning. Explicit and announced, per the fail-open rule in the constitution
# (hooks exit 0 to allow, non-zero to block — never silently).

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
# Anchor to THIS file's location, not to \`git rev-parse\`. The wrapper lives in
# <repo>/.githooks/, so its parent is the repo root by construction — and that
# holds under \`git --git-dir\`, in a linked worktree, and when a hook is invoked
# with an unexpected cwd, all of which can make rev-parse answer for a
# different repository than the one this wrapper was installed into.
REPO_ROOT="$(cd "$HOOK_DIR/.." && pwd)"

# Resolve one hook and refuse to continue when it cannot run.
#   $1 = path, $2 = human label
# Returns 0 to run it, 1 to skip (only under the announced escape hatch).
adev_require_hook() {
  adev_hook_path="$1"
  adev_hook_label="$2"

  if [ ! -e "$adev_hook_path" ]; then
    if [ "\${ADEV_HOOK_CHAIN_ALLOW_MISSING:-}" = "1" ]; then
      echo "adev(${hookName}): WARNING — $adev_hook_label not found at $adev_hook_path; skipping (ADEV_HOOK_CHAIN_ALLOW_MISSING=1)." >&2
      return 1
    fi
    echo "adev(${hookName}): $adev_hook_label not found at $adev_hook_path" >&2
    echo "  Refusing to continue: a hook that cannot run must not look like a hook that passed." >&2
    echo "  Re-run 'adev upgrade' to reinstall, or set ADEV_HOOK_CHAIN_ALLOW_MISSING=1 to skip." >&2
    exit 1
  fi

  if [ ! -x "$adev_hook_path" ]; then
    if [ "\${ADEV_HOOK_CHAIN_ALLOW_MISSING:-}" = "1" ]; then
      echo "adev(${hookName}): WARNING — $adev_hook_label at $adev_hook_path is not executable; skipping (ADEV_HOOK_CHAIN_ALLOW_MISSING=1)." >&2
      return 1
    fi
    echo "adev(${hookName}): $adev_hook_label at $adev_hook_path is not executable" >&2
    echo "  The executable bit does not survive every checkout. Fix with:" >&2
    echo "    chmod +x $adev_hook_path" >&2
    exit 1
  fi

  return 0
}

# Run adev hook
ADEV_HOOK="$HOOK_DIR/${adevHookPath}"
if adev_require_hook "$ADEV_HOOK" "adev hook"; then
  "$ADEV_HOOK" "$@"
  ADEV_EXIT=$?
  if [ $ADEV_EXIT -ne 0 ]; then
    exit $ADEV_EXIT
  fi
fi

# Run original hook — repo-relative, resolved here at run time.
# The path is a SINGLE-QUOTED literal on purpose: $(…) and backticks expand
# inside double quotes, so a crafted core.hooksPath would otherwise become code
# in this file — which is chmod 755, tracked, and run by git on every commit.
# $REPO_ROOT is concatenated outside the literal so it still expands.
ORIGINAL="$REPO_ROOT"/${shellSingleQuote(originalHookPath)}
if adev_require_hook "$ORIGINAL" "chained original hook"; then
  "$ORIGINAL" "$@"
  exit $?
fi

exit 0
`;
}

/**
 * Set up git hooks in .githooks/ with conflict detection.
 * If core.hooksPath already points elsewhere, offers to chain hooks.
 * @returns {Promise<string[]>} List of created/updated items.
 */
async function setupGitHooks() {
  const created = [];
  const cwd = process.cwd();
  const githooksDir = join(cwd, ".githooks");
  const hookNames = ["pre-commit", "prepare-commit-msg", "commit-msg", "post-commit"];
  const pluginHooksDir = join(PLUGIN_ROOT, ".githooks");

  // Detect existing core.hooksPath
  const existingHooksPath = getExistingHooksPath();
  const isConflict = existingHooksPath && existingHooksPath !== ".githooks" && existingHooksPath !== ".githooks/";
  let chainFromPath = null;

  if (isConflict) {
    // Validate BEFORE offering to chain. This value is written by whatever set
    // core.hooksPath — an npm postinstall or a bootstrap script can put shell
    // metacharacters or an out-of-repo path there, and chaining would bake it
    // into a tracked, executable wrapper that git runs on every commit.
    const verdict = validateHooksPath(existingHooksPath, cwd);
    if (!verdict.ok) {
      warn(`Refusing to chain: core.hooksPath ${verdict.reason}`);
      console.log();
      console.log(`  Value: ${existingHooksPath}`);
      console.log("  adev will not generate a hook wrapper from this path.");
      console.log("  Fix core.hooksPath (git config core.hooksPath <path>), then re-run.\n");
      console.log("    [1] Replace — switch to .githooks/ and discard the old hooks path");
      console.log("    [2] Skip — don't install git hooks (default)\n");

      const unsafeChoice = await ask("Enter choice (1-2) [2]: ");
      if (unsafeChoice !== "1") {
        log("Skipped git hooks. Claude Code merge-guard hook is still active.");
        return created;
      }
      // Fall through with chainFromPath left null — behaves as "replace".
      ensureDir(githooksDir);
      warn("Replacing hooks path; the previous hooks are no longer invoked.");
    } else {

    warn(`Existing core.hooksPath detected: ${existingHooksPath}`);
    console.log();
    console.log("  adev uses .githooks/ for git hooks (commit guards, spec trailers).");
    console.log(`  This project already uses ${existingHooksPath} (e.g. husky, lefthook).\n`);
    console.log("    [1] Chain hooks — run adev hooks first, then originals from " + existingHooksPath + " (default)");
    console.log("    [2] Replace — switch to .githooks/ and discard the old hooks path");
    console.log("    [3] Skip — don't install git hooks (Claude Code hooks still active)\n");

    const choice = await ask("Enter choice (1-3) [1]: ");

    if (choice === "3") {
      log("Skipped git hooks. Claude Code merge-guard hook is still active.");
      return created;
    }

    if (choice !== "2") {
      // Default: chain
      chainFromPath = resolve(cwd, existingHooksPath);

      // Chaining REWRITES tracked files: each real hook body is moved to a
      // <name>.adev sibling and the tracked .githooks/<name> is replaced by a
      // wrapper. In this repo that presented as 639 deleted lines across four
      // hooks, which is indistinguishable from repo corruption to anyone
      // reading the diff. Say so before doing it, not only afterward.
      const trackedHooks = hookNames.filter((h) => existsSync(join(githooksDir, h)));
      if (trackedHooks.length > 0) {
        console.log();
        warn(`Chaining will REWRITE ${trackedHooks.length} existing file(s) in .githooks/:`);
        for (const h of trackedHooks) {
          console.log(`    .githooks/${h} → body moved to ${h}.adev, replaced by a wrapper`);
        }
        log("  If these are tracked by git, expect a large deletion diff. That is the rewrite, not corruption.");
        log("  The .adev files are generated and gitignored — do not commit them.");
      }
    }
    } // end of the validated-path branch
  }

  ensureDir(githooksDir);

  for (const hookName of hookNames) {
    const srcPath = join(pluginHooksDir, hookName);
    const destPath = join(githooksDir, hookName);
    if (!existsSync(srcPath)) continue;

    const srcContent = readFileSync(srcPath);

    if (chainFromPath) {
      // Chaining mode: write adev hook as .adev variant, create wrapper
      const adevVariant = `${hookName}.adev`;
      const adevPath = join(githooksDir, adevVariant);
      const originalHookPath = join(chainFromPath, hookName);

      // Re-check containment on THIS concrete file, not just the directory
      // string validated by validateHooksPath() above. That check only ever
      // saw `existingHooksPath` (e.g. "hooks") — an individual file inside a
      // legitimately-contained directory can independently be a symlink
      // escaping the repo (`hooks/pre-commit -> ../../evil.sh`), which a
      // directory-level check can't see. A symlink could also be introduced
      // between config-read time and this line (TOCTOU). Skip chaining just
      // this one hook rather than aborting the whole run — same fallback the
      // "no original hook for this name" branch below already takes.
      const originalEscapesRepo = escapesRepoPhysically(originalHookPath, cwd);
      if (originalEscapesRepo) {
        const describedTarget = resolveSymlink(originalHookPath);
        warn(
          `Refusing to chain ${hookName}: ${existingHooksPath}/${hookName} resolves outside the repository through a symlink (${describedTarget})`,
        );
      }

      // Write the adev hook as the .adev variant
      const needsUpdate = !existsSync(adevPath) || Buffer.compare(srcContent, readFileSync(adevPath)) !== 0;
      if (needsUpdate) {
        cpSync(srcPath, adevPath);
        chmodSync(adevPath, 0o755);
        created.push(`.githooks/${adevVariant}`);
      }

      // Create chained wrapper (or update if it's not already a chained wrapper)
      //
      // Guard against chaining a hook to ITSELF. `isConflict` above already
      // tries to rule this out with a literal string compare against
      // ".githooks"/".githooks/", but `existingHooksPath` can take other
      // forms — an absolute path, a "./.githooks" spelling, or a relative
      // path resolved from a different cwd than this run — that still
      // resolve to the exact same directory without matching that string
      // check. Without this guard, `originalHookPath` collapses to
      // `destPath`, and the wrapper this branch writes ends up invoking
      // itself: unbounded recursion on every git commit.
      const chainsToSelf = resolve(originalHookPath) === resolve(destPath);
      if (existsSync(originalHookPath) && !chainsToSelf && !originalEscapesRepo) {
        // Pass a REPO-RELATIVE path. The wrapper is written into tracked
        // .githooks/, so an absolute path from this machine would not resolve
        // on a teammate's clone — and the old fail-open guard turned that into
        // a silent skip of their original hook.
        const originalRelPath = relative(cwd, originalHookPath);
        const wrapper = buildChainedHook(adevVariant, originalRelPath, hookName);
        writeFileSync(destPath, wrapper);
        chmodSync(destPath, 0o755);
        created.push(`.githooks/${hookName} (chained with ${existingHooksPath}/${hookName})`);
      } else if (resolve(srcPath) !== resolve(destPath)) {
        // No original hook for this name — just install the adev hook directly
        cpSync(srcPath, destPath);
        chmodSync(destPath, 0o755);
        created.push(`.githooks/${hookName}`);
      }
    } else if (existsSync(destPath)) {
      // No chaining — standard conflict handling
      const destContent = readFileSync(destPath);
      if (Buffer.compare(srcContent, destContent) === 0) continue;

      const altPath = join(githooksDir, `${hookName}.adev`);
      if (existsSync(altPath)) {
        const altContent = readFileSync(altPath);
        if (Buffer.compare(srcContent, altContent) === 0) continue;
      }
      cpSync(srcPath, altPath);
      chmodSync(altPath, 0o755);
      created.push(`.githooks/${hookName}.adev (existing hook preserved)`);
      warn(`.githooks/${hookName} already exists — wrote ${hookName}.adev instead`);
    } else if (resolve(srcPath) !== resolve(destPath)) {
      cpSync(srcPath, destPath);
      chmodSync(destPath, 0o755);
      created.push(`.githooks/${hookName}`);
    }
  }

  // Install auxiliary hook scripts (not git-named hooks; invoked by the
  // standard hooks above). These are simple copies — no chaining, no
  // alt-variant handling, since they aren't git's standard hook names and
  // therefore cannot collide with project-owned hooks.
  const auxHooks = ["pre-commit-no-inline-node"];
  for (const auxName of auxHooks) {
    const srcPath = join(pluginHooksDir, auxName);
    const destPath = join(githooksDir, auxName);
    if (!existsSync(srcPath)) continue;
    if (resolve(srcPath) === resolve(destPath)) continue;
    if (existsSync(destPath)) {
      const srcContent = readFileSync(srcPath);
      const destContent = readFileSync(destPath);
      if (Buffer.compare(srcContent, destContent) === 0) continue;
    }
    cpSync(srcPath, destPath);
    chmodSync(destPath, 0o755);
    created.push(`.githooks/${auxName}`);
  }

  // Set core.hooksPath to .githooks/ (skip if already set)
  const currentHooksPath = getExistingHooksPath();
  if (currentHooksPath !== ".githooks" && currentHooksPath !== ".githooks/") {
    try {
      execSync("git config core.hooksPath .githooks", {
        cwd,
        stdio: "ignore",
      });
      created.push("git config core.hooksPath .githooks");
    } catch {
      // Not a git repo or git not available — skip silently
    }
  }

  return created;
}

async function handleDualSyncTargets(providerNames) {
  if (providerNames.length < 2) return;

  const manifestPath = join(process.cwd(), ".context-index", "manifest.yaml");

  if (!existsSync(manifestPath)) {
    log("Configuring sync targets for dual setup...");
    const templateContent = readFileSync(join(PLUGIN_ROOT, "templates", "manifest-template.yaml"), "utf8");
    const dualContent = templateContent.replace(
      /# Claude Code.*?# OpenCode.*?# Cursor.*?# GitHub Copilot/s,
      `# Claude Code (primary)
    - path: CLAUDE.md
      format: claude
      providers: [claude-code]

    # OpenCode (primary)
    - path: AGENTS.md
      format: agents
      providers: [opencode]

    # Cursor
    - path: .cursor/rules/adev.mdc
      format: cursor
      providers: [cursor]

    # GitHub Copilot
    # - path: .github/copilot-instructions.md
    #   format: copilot
    #   providers: [copilot]`
    );
    writeFileSync(manifestPath, dualContent);
    success("Added both CLAUDE.md and AGENTS.md sync targets");
  } else {
    // An existing manifest already has sync targets, and changing them is
    // context-layer configuration — the CLI charter names "sync targets"
    // explicitly as /adev:init's territory. Report the situation and let the
    // user decide there, rather than rewriting their manifest mid-upgrade.
    console.log("\n  Dual-setup detected (multiple providers, existing manifest).");
    log("  Sync targets are already configured in .context-index/manifest.yaml.");
    log("  To change which agent files are generated, run /adev:init.");
  }
}

function updateManifestSyncTargets(manifestPath, choice) {
  let content = readFileSync(manifestPath, "utf8");

  const hasClaude = content.includes("path: CLAUDE.md");
  const hasAgents = content.includes("path: AGENTS.md");

  if (choice === "2" && hasAgents) {
    content = content.replace(/- path: AGENTS\.md[\s\S]*?providers: \[opencode\]\n\n?/m, "");
    writeFileSync(manifestPath, content);
    success("Removed AGENTS.md sync target");
  } else if (choice === "3" && hasClaude) {
    content = content.replace(/- path: CLAUDE\.md[\s\S]*?providers: \[claude-code\]\n\n?/m, "");
    writeFileSync(manifestPath, content);
    success("Removed CLAUDE.md sync target");
  }
}

/**
 * Stamp adev_version in manifest.yaml.
 */
function stampVersion() {
  const manifestPath = join(process.cwd(), ".context-index", "manifest.yaml");
  if (!existsSync(manifestPath)) return;
  let manifest = readFileSync(manifestPath, "utf8");
  const versionLine = `adev_version: "${PLUGIN_VERSION}"`;
  if (manifest.includes("adev_version:")) {
    manifest = manifest.replace(/adev_version:\s*["']?[^"'\s\n]+["']?/, versionLine);
  } else {
    const projectMatch = manifest.match(/(project:\s*\n\s+name:\s*.+\n)/);
    if (projectMatch) {
      manifest = manifest.replace(projectMatch[1], projectMatch[1] + `  ${versionLine}\n`);
    } else {
      manifest = `${versionLine}\n${manifest}`;
    }
  }
  writeFileSync(manifestPath, manifest);
  success(`Stamped adev_version: ${PLUGIN_VERSION} in manifest.yaml`);
}

/**
 * Install providers (Claude Code, OpenCode, Codex, Cursor).
 * @param {string[]} providerNames
 * @param {{ ask?: (q: string) => Promise<string> }} [opts] — optional ask
 *   injector for testability. Default uses the production readline ask helper.
 */
async function installProviders(providerNames, { ask: askFn = ask } = {}) {
  for (const providerName of providerNames) {
    const provider = getProvider(providerName);
    heading(`Installing for ${provider.name}`);

    if (providerName === "claude-code") {
      // Ask BEFORE installing. provider.install() enables the plugin as part of
      // its work, so calling it first defaulted the scope to "user" and wrote the
      // user-level Claude Code settings file before the user had answered — making
      // the prompt cosmetic for anyone who chose "project". The codex branch below
      // has always had this ordering; this matches it.
      const scope = await askFn("Install for all projects (user) or this project only (project)? [user/project]");
      const targetScope = scope === "project" ? "project" : "user";

      const { installed, path: pluginPath } = await provider.install({ scope: targetScope });
      if (installed) {
        success(`Plugin v${PLUGIN_VERSION} installed to ${pluginPath}`);
      } else {
        success(`Plugin v${PLUGIN_VERSION} already installed`);
      }

      const settingsPath = provider.enable(targetScope);
      success(`Plugin enabled in ${settingsPath}`);
      if (targetScope === "project") {
        log("Scoped to this project. Any machine-wide enablement of adev was removed.");
      }

      const conflicts = provider.detectConflicts();
      if (conflicts.length === 0) {
        success("No conflicting plugins detected");
      } else {
        for (const conflict of conflicts) {
          warn(`${conflict.name} — ${conflict.reason}`);
          const disable = await askFn(`Disable ${conflict.name} for THIS project? (yes/no)`);
          if (disable === "yes" || disable === "y") {
            provider.disableConflictingPlugin(conflict.key);
            success(`${conflict.name} disabled for this project`);
          }
        }
      }
    } else if (providerName === "opencode") {
      const { installed, path: pluginPath } = await provider.install();
      if (installed) {
        success(`Plugin v${PLUGIN_VERSION} installed to ${pluginPath}`);
      } else {
        success(`Plugin v${PLUGIN_VERSION} already installed`);
      }

      const opencodeConfigPath = join(process.env.HOME || process.env.USERPROFILE, ".config", "opencode", "opencode.json");
      const opencodeConfigDir = join(process.env.HOME || process.env.USERPROFILE, ".config", "opencode");
      let config = { plugin: [] };

      if (existsSync(opencodeConfigPath)) {
        try {
          config = JSON.parse(readFileSync(opencodeConfigPath, "utf8"));
        } catch {}
      }

      const pluginEntry = `file://${pluginPath}/providers/opencode`;
      if (!config.plugin) {
        config.plugin = [];
      }

      const alreadyAdded = config.plugin.some(p =>
        p.includes("adev") || p.includes("adev-plugin") || p === pluginEntry
      );

      if (!alreadyAdded) {
        config.plugin.push(pluginEntry);
        ensureDir(opencodeConfigDir);
        writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2) + "\n");
        success(`Registered plugin in ${opencodeConfigPath}`);
      } else {
        success("Plugin already registered in opencode.json");
      }

      log("Skills are available via ~/.config/opencode/skills/");
    } else if (providerName === "codex") {
      const scope = await askFn("Install Codex skills for all projects (user) or this project only (project)? [user/project]");
      const targetScope = scope === "project" ? "project" : "user";
      const { installed, path: pluginPath } = await provider.install({ scope: targetScope });
      if (installed) {
        success(`Plugin v${PLUGIN_VERSION} installed to ${pluginPath}`);
      } else {
        success(`Plugin v${PLUGIN_VERSION} already installed`);
      }

      const skillsPath = provider.enable(targetScope);
      success(`Codex skills linked in ${skillsPath}`);
    } else if (providerName === "cursor") {
      const { installed, path: pluginPath } = await provider.install({ scope: "user" });
      if (installed) {
        success(`Plugin v${PLUGIN_VERSION} installed to ${pluginPath}`);
      } else {
        success(`Plugin v${PLUGIN_VERSION} already installed`);
      }

      const conflicts = provider.detectConflicts();
      if (conflicts.length === 0) {
        success("No conflicting plugins detected");
      } else {
        for (const conflict of conflicts) {
          warn(`${conflict.name} — ${conflict.reason}`);
          const disable = await askFn(`Disable ${conflict.name} for THIS project? (yes/no)`);
          if (disable === "yes" || disable === "y") {
            // claude-code surfaces { key } for the disable target; the cursor
            // adapter's Superpowers guard returns { name, reason } only.
            // Prefer key when present, fall back to name.
            provider.disableConflictingPlugin(conflict.key ?? conflict.name);
            success(`${conflict.name} disabled for this project`);
          }
        }
      }
    }
  }
}

/**
 * Apply integrations.session_capture mode by dispatching to the install
 * helper (`lib/cli/install-session-capture.mjs`). Prints a one-line summary
 * per action. No-op when the manifest has no `integrations.session_capture`
 * block (treated as `off`, per Error Cases table).
 *
 * Spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
 * Plan-task: 11, 16
 */
async function applySessionCaptureMode() {
  let dispatch;
  try {
    const mod = await import("../lib/session-capture-installer.mjs");
    dispatch = mod.dispatchInstallerByCaptureMode;
  } catch {
    return; // module not present — skip silently
  }
  try {
    const projectRoot = process.cwd();
    const result = await dispatch(projectRoot, PLUGIN_ROOT);
    if (result.actions.length > 0) {
      console.log();
      heading("Session Capture");
      success(`Mode: ${result.mode}`);
      for (const a of result.actions) {
        success(a);
      }
      if (result.mode === "off" && result.sessionFiles.length > 0) {
        console.log();
        log(`Existing session files (preserved on disk):`);
        for (const f of result.sessionFiles.slice(0, 10)) {
          log(`  - ${f}`);
        }
        if (result.sessionFiles.length > 10) {
          log(`  …and ${result.sessionFiles.length - 10} more`);
        }
      }
    }
  } catch (err) {
    // Best-effort — never block install.
    warn(`Session-capture dispatch skipped: ${err.message}`);
  }
}

/**
 * Apply the managed `adev:gitignore` block dispatcher. Gated by the
 * `setup.managed_gitignore` manifest knob (default: `true`). When `false`,
 * prints the advisory line and returns without writing. Errors from the
 * installer are downgraded to stderr warnings — installer failure must
 * never block `adev install` / `adev upgrade`.
 *
 * Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
 * Plan-task: 5
 *
 * @param {string} projectRoot
 * @param {object|null} manifest - parsed manifest.yaml or null
 */
export async function maybeEnsureManagedGitignore(projectRoot, manifest) {
  const knob = manifest?.setup?.managed_gitignore;
  const enabled = knob !== false; // default true; only literal false disables
  if (!enabled) {
    console.log("managed gitignore: disabled by manifest");
    return;
  }
  let ensureManagedBlock;
  try {
    const mod = await import("../lib/gitignore-installer.mjs");
    ensureManagedBlock = mod.ensureManagedBlock;
  } catch {
    return; // module not present — skip silently
  }
  try {
    const result = ensureManagedBlock(projectRoot);
    if (result !== "noop") {
      console.log(`managed gitignore: ${result}`);
    }
  } catch (err) {
    if (err?.code === "UNSAFE_GITIGNORE_PATH") {
      console.error("warn: adev:gitignore not written — path-containment violation");
      return;
    }
    if (err?.code === "EACCES") {
      console.error("warn: adev:gitignore not written — .gitignore is read-only");
      return;
    }
    console.error(`warn: adev:gitignore dispatch skipped: ${err.message}`);
  }
}

/**
 * `adev install --target copilot [--user] [--dry-run]` — per-target adapter
 * invocation. Routes through CopilotAdapter.install() and prints its return
 * value as a status line. Mirrors the documented Behaviors §7 surface.
 */
async function cmdInstallCopilot() {
  const adapter = getProvider("copilot");
  const dryRun = parseBooleanFlag("--dry-run");
  const user = parseBooleanFlag("--user");
  try {
    const result = adapter.install({ projectRoot: process.cwd(), dryRun, user });
    if (result.dryRun) {
      console.log(`Would write ${result.wouldWrite.length} paths under ${result.location}${user ? " and " + adapter.getCopilotHome() : ""}`);
      for (const p of result.wouldWrite) console.log(`  + ${p}`);
    } else if (result.installed) {
      success(`Copilot adapter v${result.version} installed at ${result.location}${result.userSeeded ? " (user-scope mirrored to " + adapter.getCopilotHome() + ")" : ""}`);
    } else {
      log(`Copilot adapter already installed at ${result.location}`);
    }
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

/**
 * `adev uninstall --target copilot [--force]` — per-target adapter invocation.
 */
async function cmdUninstallCopilot() {
  const adapter = getProvider("copilot");
  const force = parseBooleanFlag("--force");
  try {
    const result = adapter.uninstall({ projectRoot: process.cwd(), force });
    if (result.removed) {
      success(`Copilot adapter uninstalled from ${process.cwd()}/.github`);
      if (result.residual && result.residual.length > 0) {
        warn(`Residual entries (skipped — not removed):`);
        for (const r of result.residual) warn(`  ${r}`);
      }
    } else {
      log(`Copilot adapter was not installed; nothing to uninstall.`);
    }
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

/**
 * `adev status --target copilot` — per-target status query.
 */
async function cmdStatusCopilot() {
  const adapter = getProvider("copilot");
  try {
    const result = adapter.status({ projectRoot: process.cwd() });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}


/**
 * Repair `governance/gates.yaml` entries whose `command` is a shell string.
 *
 * merge-gates.mjs rejects string commands (SEC-2, shipped in v0.25.0) and
 * drops the gate at load. Because scaffolding skips files that already exist,
 * upgrade never fixed the very files that needed it — a project silently ran
 * zero gates. This runs on upgrade so the repair reaches existing installs.
 *
 * Non-fatal by construction: a project with no gates.yaml, or one already in
 * argv form, is a no-op. Commands that need a shell are reported, never
 * rewritten — splitting them on whitespace would change what they run.
 */
async function migrateLegacyGateCommands() {
  const gatesPath = join(process.cwd(), ".context-index", "governance", "gates.yaml");
  if (!existsSync(gatesPath)) return;

  const { migrateGateCommands } = await import("../lib/migrate-gate-commands.mjs");
  const source = readFileSync(gatesPath, "utf8");
  const { content, migrated, skipped } = migrateGateCommands(source);

  if (migrated.length === 0 && skipped.length === 0) return;

  heading("Quality Gates");

  if (migrated.length > 0) {
    writeFileSync(gatesPath, content);
    for (const { from, to } of migrated) {
      success(`Migrated gate command: "${from}" → [${to.join(", ")}]`);
    }
    log("These gates were being dropped at load and never ran.");
  }

  for (const { command, reason } of skipped) {
    warn(`Gate command needs a shell and was left as-is: "${command}" (${reason})`);
    log("  Rewrite it as an argv list, or split it into separate gates.");
  }
}

async function cmdInstall() {
  // --target <name> branch: per-target adapter invocation (Copilot uses this).
  // Skips the interactive provider selection + scaffolding flow used by the
  // generic `adev install` entry point.
  const target = parseTargetFlag();
  if (target === "copilot") {
    return cmdInstallCopilot();
  }

  console.log();
  console.log("  adev — Agentic Development Framework");
  console.log("  ─────────────────────────────────────");
  console.log();

  // --- Detect project state ---
  const state = detectProjectState();

  if ((state.mode === "brownfield-outdated" || state.mode === "brownfield-current") && state.configured) {
    log(`Detected: existing adev install (v${state.version || "pre-versioning"})`);
    log("Use `npx @adev-org/adev-cli@latest upgrade` to update to the latest version.");
    console.log();
    return;
  }

  if (state.mode === "greenfield") {
    log("Detected: new project (no existing code or context index)");
  } else if (state.mode === "brownfield-no-adev") {
    log("Detected: existing project without adev");
  } else {
    // .context-index/ exists but is still pristine template state (placeholders
    // not yet replaced). install previously bounced these to `upgrade`; instead
    // continue setup idempotently — scaffold fills any missing files, re-stamps.
    log("Detected: scaffolded adev context index (not yet configured) — continuing setup");
  }

  console.log();

  // --- Provider installation ---
  const providerNames = await selectProviders();
  await installProviders(providerNames);

  // --- Minimal context index scaffolding ---
  heading("Context Index");
  const scaffoldCreated = scaffoldContextKit();
  if (scaffoldCreated.length > 0) {
    for (const item of scaffoldCreated) {
      success(item);
    }
  } else {
    log("All context files present.");
  }

  // --- Stamp adev_version in manifest ---
  stampVersion();

  // The domain-extension picker used to run here. It writes `domain:` into
  // manifest.yaml, which is context-layer configuration — owned by /adev:init
  // per the CLI charter ("All context-layer configuration … remains in the
  // /adev:init skill, not the CLI"). At install time the project has only
  // pristine templates, so there is nothing yet to pick a domain *for*.

  // --- Git hooks ---
  heading("Git Hooks");
  const hookItems = await setupGitHooks();
  if (hookItems.length > 0) {
    for (const item of hookItems) {
      success(item);
    }
  } else {
    log("Git hooks already up to date.");
  }

  // --- Session Capture (integrations.session_capture dispatch) ---
  await applySessionCaptureMode();

  // --- Managed gitignore block (setup.managed_gitignore dispatch) ---
  {
    let m = null;
    try {
      m = loadManifest(process.cwd());
    } catch {
      m = null;
    }
    await maybeEnsureManagedGitignore(process.cwd(), m);
  }

  // --- Summary ---
  heading(`Done! Plugin installed — adev v${PLUGIN_VERSION}.`);

  log("Next steps:");
  console.log();
  if (providerNames.includes("claude-code")) {
    log("  1. Open Claude Code:  claude");
    log("  2. Configure context: /adev:init");
    log("  3. Start working:     /adev:work");
  }
  if (providerNames.includes("opencode")) {
    log("  1. Open OpenCode:     opencode");
    log("  2. Configure context: /adev:init");
  }
  if (providerNames.includes("codex")) {
    log("  1. Open Codex:        codex");
    log("  2. Configure context: $adev:init");
  }
  console.log();
  log("/adev:init walks you through constitution, governance, and project setup.");
  console.log();
  log("Docs:       https://agentic-dev.org");
  log("Repository: https://github.com/agentic-development/adev-plugin");
  console.log();
}

async function cmdUpgrade() {
  console.log();
  console.log("  adev — Agentic Development Framework");
  console.log("  ─────────────────────────────────────");
  console.log();

  const state = detectProjectState();

  if (state.mode === "greenfield" || state.mode === "brownfield-no-adev") {
    log("No existing adev installation found.");
    log("Use `npx @adev-org/adev-cli install` for first-time setup.");
    console.log();
    return;
  }

  if (state.mode === "brownfield-current") {
    log(`adev v${state.version} is already current.`);
    log("Checking for missing components...");
    console.log();
  } else {
    const fromLabel = state.version || "pre-versioning";
    log(`Upgrading from v${fromLabel} to v${PLUGIN_VERSION}`);
    const delta = computeUpgradeDelta(state.version);
    if (delta.description.length > 0) {
      console.log();
      log("New in v" + PLUGIN_VERSION + ":");
      for (const d of delta.description) {
        log(`  + ${d}`);
      }
    }
    console.log();
    const proceed = await ask(`Proceed with upgrade? (yes/no) [yes]`);
    if (proceed === "no" || proceed === "n") {
      log("Upgrade skipped.");
      return;
    }
  }

  // --- Re-install providers ---
  heading("Providers");
  const providerNames = await selectProviders();
  await installProviders(providerNames);

  // --- Fill in missing scaffold files ---
  heading("Context Index");
  const scaffoldCreated = scaffoldContextKit();
  if (scaffoldCreated.length > 0) {
    log("Added missing files:");
    for (const item of scaffoldCreated) {
      success(item);
    }
  } else {
    log("All context files present.");
  }

  // --- Stamp adev_version ---
  stampVersion();

  // Provenance enforcement used to be prompted for here. It writes a
  // `provenance:` block into manifest.yaml — context-layer configuration owned
  // by /adev:init, not the CLI. `adev upgrade` still needs the delta below for
  // its own reporting, but it no longer asks the question or writes the block.
  const manifestPath = join(process.cwd(), ".context-index", "manifest.yaml");
  const delta = computeUpgradeDelta(state.version);
  if (delta.provenance && existsSync(manifestPath)) {
    const manifest = readFileSync(manifestPath, "utf8");
    if (!manifest.includes("provenance:")) {
      heading("Provenance Tracking");
      log("This version can enforce Author-type + Operator commit trailers.");
      log("Run /adev:init to enable it — it is project configuration, not an install step.");
    }
  }

  // --- Legacy gate command migration ---
  // Templates are scaffolded with `if (!existsSync(destPath))`, so an existing
  // governance/gates.yaml is never touched by install/upgrade — including one
  // whose `command:` is a shell string, which merge-gates.mjs drops at load
  // (SEC-2). Such a project runs zero gates and looks like it passed them.
  await migrateLegacyGateCommands();

  // The domain-extension picker used to run here too — same reason as
  // cmdInstall: it writes `domain:` into manifest.yaml. /adev:init owns it.

  // --- Git hooks ---
  heading("Git Hooks");
  const hookItems = await setupGitHooks();
  if (hookItems.length > 0) {
    for (const item of hookItems) {
      success(item);
    }
  } else {
    log("Git hooks already up to date.");
  }

  // --- Session Capture (integrations.session_capture dispatch) ---
  await applySessionCaptureMode();

  // --- Managed gitignore block (setup.managed_gitignore dispatch) ---
  {
    let m = null;
    try {
      m = loadManifest(process.cwd());
    } catch {
      m = null;
    }
    await maybeEnsureManagedGitignore(process.cwd(), m);
  }

  // --- Dual sync targets ---
  await handleDualSyncTargets(providerNames);

  // --- Summary ---
  const fromLabel = state.version || "pre-versioning";
  if (state.mode === "brownfield-outdated") {
    heading(`Done! Upgraded from v${fromLabel} to v${PLUGIN_VERSION}.`);
  } else {
    heading(`Done! adev v${PLUGIN_VERSION} is up to date.`);
  }

  log("Next steps:");
  console.log();
  log("  1. Run /adev:init to review and update project configuration");
  log("  2. Run /adev:hygiene to check context health");
  log("  3. Run /adev:sync to update agent files");
  console.log();
  log("Docs:       https://agentic-dev.org");
  log("Repository: https://github.com/agentic-development/adev-plugin");
  console.log();
}

async function cmdUninstall() {
  // --target <name> branch: per-target adapter invocation (Copilot uses this).
  const target = parseTargetFlag();
  if (target === "copilot") {
    return cmdUninstallCopilot();
  }

  const providerNames = await selectProviders();

  for (const providerName of providerNames) {
    const provider = getProvider(providerName);
    heading(`Uninstalling from ${provider.name}`);

    if (providerName === "codex") {
      const scope = await ask("Remove Codex skills for all projects (user) or this project only (project)? [user/project]");
      await provider.uninstall({ scope: scope === "project" ? "project" : "user" });
    } else {
      await provider.uninstall();
    }

    success(`Uninstalled from ${provider.name}`);
  }

  log(".context-index/ directory was NOT removed (your project context is preserved).");
  console.log();
}

async function cmdExtension() {
  const subcommand = process.argv[3];

  switch (subcommand) {
    case "install": {
      // Minimal flag scan: --allow-exec anywhere, first non-flag token is the source.
      const args = process.argv.slice(4);
      const allowExec = args.includes("--allow-exec");
      const source = args.find((a) => !a.startsWith("--"));
      if (!source) {
        error("Missing source argument.");
        log("Usage: npx adev-cli extension install <source> [--allow-exec]");
        log("  <source> can be a local path, npm package, or git URL.");
        log("  --allow-exec approves the extension's executable contributions");
        log("  (gate commands, reviewer skills/adapters) without prompting.");
        log("  Consent applies to this install only and is never remembered.");
        process.exit(1);
      }

      try {
        const resolved = await resolveExtensionSource(source);
        const projectRoot = process.cwd();
        const report = await installExtension(resolved.resolved_path, projectRoot, {
          pluginRoot: PLUGIN_ROOT,
          sourceUri: source,
          _tmpDir: resolved._tmpDir,
          allowExec,
          interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
          promptFn: readConsentAnswerSync,
        });

        heading("Extension Installed");
        success(`${report.name} v${report.version}`);

        if (report.filesWritten.length > 0) {
          log("Files written:");
          for (const f of report.filesWritten) {
            log(`  ${f}`);
          }
        }
        if (report.mergesApplied.length > 0) {
          log("Merges applied:");
          for (const m of report.mergesApplied) {
            log(`  ${m}`);
          }
        }
      } catch (err) {
        error(err.message);
        process.exit(1);
      }
      break;
    }

    case "list": {
      const projectRoot = process.cwd();
      const manifestPath = join(projectRoot, ".context-index", "manifest.yaml");
      if (!existsSync(manifestPath)) {
        error("manifest.yaml not found. Run /adev:init first.");
        process.exit(1);
      }

      const stamps = readManifestStamps(projectRoot);
      if (stamps.length === 0) {
        log("No extensions installed.");
        return;
      }

      heading("Installed Extensions");
      // Table header
      const nameW = Math.max(4, ...stamps.map(s => s.name.length));
      const verW = Math.max(7, ...stamps.map(s => (s.version || "").length));
      const dateW = Math.max(9, ...stamps.map(s => (s.installed_date || "").slice(0, 10).length));
      const srcW = Math.max(6, ...stamps.map(s => (s.source_uri || "").length));

      const header = `${"Name".padEnd(nameW)}  ${"Version".padEnd(verW)}  ${"Installed".padEnd(dateW)}  Source`;
      const sep = `${"─".repeat(nameW)}  ${"─".repeat(verW)}  ${"─".repeat(dateW)}  ${"─".repeat(srcW)}`;
      log(header);
      log(sep);

      for (const s of stamps) {
        const date = (s.installed_date || "").slice(0, 10);
        log(`${s.name.padEnd(nameW)}  ${(s.version || "").padEnd(verW)}  ${date.padEnd(dateW)}  ${s.source_uri || ""}`);
      }
      break;
    }

    default:
      log("Usage: npx adev-cli extension <subcommand>");
      log("");
      log("Subcommands:");
      log("  install <source>   Install an extension from a local path, npm package, or git URL");
      log("  list               List installed extensions");
      if (!subcommand) {
        process.exit(1);
      }
      break;
  }
}

// ── status subcommand (markdown-rendering-layer spec) ─────────────────────

/**
 * Implement `adev status [--render] [--pipeline]`. Operator-on-demand.
 *
 * --render:   regenerate tasks.md and every <slug>.md in lifecycle-state/.
 *             Exit 1 only on INVALID_PROJECT_ROOT / INVALID_STORAGE_PATH /
 *             unrecoverable fs error. Advisory-skipped files
 *             (SKIPPED_INVALID_SLUG, OVERSIZED_LOG_SKIPPED, MALFORMED_FILE_SKIPPED)
 *             do NOT affect the exit code per SA-2.
 *
 * --pipeline: print an aggregate per-spec table to stdout.
 *
 * When both are passed, render runs first, a divider is printed, then
 * pipeline. SA-3: composite exit code is the max of the two halves.
 */
async function cmdStatus() {
  // --target <name> branch: per-target adapter status query (Copilot uses this).
  const target = parseTargetFlag();
  if (target === "copilot") {
    return cmdStatusCopilot();
  }

  const args = process.argv.slice(3);
  const wantRender = args.includes("--render");
  const wantPipeline = args.includes("--pipeline");
  const cwd = process.cwd();

  if (!wantRender && !wantPipeline) {
    log("Usage: npx adev-cli status [--render] [--pipeline]");
    log("");
    log("  --render    Regenerate tasks.md and lifecycle <slug>.md files");
    log("  --pipeline  Print the per-spec pipeline table to stdout");
    process.exit(1);
  }

  let exit = 0;

  if (wantRender) {
    try {
      const { writeTasksMd } = await import("../lib/issues/render-markdown.mjs");
      const { listLifecycleStates, currentState, renderMarkdown } = await import(
        "../lib/lifecycle-state.mjs"
      );
      const { existsSync: exists, mkdirSync: mkd, readdirSync, writeFileSync: wfs, renameSync, unlinkSync, statSync } =
        await import("node:fs");
      const { randomBytes } = await import("node:crypto");
      const path = await import("node:path");

      // tasks.md
      try {
        await writeTasksMd(cwd);
        console.log("  ✓ tasks.md");
      } catch (err) {
        if (err && (err.code === "INVALID_PROJECT_ROOT" || err.code === "INVALID_STORAGE_PATH")) {
          console.error(`  ✗ ${err.code}: ${err.message}`);
          process.exit(1);
        }
        // Non-validation fs error → hard fail.
        console.error(`  ✗ ${err?.code ?? "FS_ERROR"}: ${err?.message ?? err}`);
        process.exit(1);
      }

      // <slug>.md per lifecycle-state/<slug>.jsonl
      const lsDir = path.join(cwd, ".context-index", "lifecycle-state");
      if (exists(lsDir)) {
        const ALLOW = /^[a-z0-9._-]+$/;
        const MAX = 50 * 1024 * 1024;
        let entries;
        try {
          entries = readdirSync(lsDir, { withFileTypes: true });
        } catch {
          entries = [];
        }
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          if (!entry.name.endsWith(".jsonl")) continue;
          const slug = entry.name.slice(0, -".jsonl".length);
          if (!ALLOW.test(slug)) {
            console.log(`  ⚠ skipped: ${entry.name} (SKIPPED_INVALID_SLUG)`);
            continue;
          }
          const sourcePath = path.join(lsDir, entry.name);
          try {
            const st = statSync(sourcePath);
            if (st.size > MAX) {
              console.log(`  ⚠ skipped: ${slug} (OVERSIZED_LOG_SKIPPED)`);
              continue;
            }
          } catch {
            console.log(`  ⚠ skipped: ${slug} (STAT_FAILED)`);
            continue;
          }
          const syntheticSpec = `.context-index/specs/.synthetic/${slug}.spec.md`;
          let state;
          try {
            state = currentState(cwd, syntheticSpec);
          } catch {
            console.log(`  ⚠ skipped: ${slug} (MALFORMED_FILE_SKIPPED)`);
            continue;
          }
          let rendered;
          try {
            rendered = renderMarkdown(state);
          } catch (e) {
            console.log(`  ⚠ skipped: ${slug} (${e?.code ?? "RENDER_FAILED"})`);
            continue;
          }
          // Atomic temp-then-rename mirroring atomicWriteFile.
          const target = path.join(lsDir, `${slug}.md`);
          const tmp = target + "." + randomBytes(4).toString("hex") + ".tmp";
          try {
            mkd(lsDir, { recursive: true });
            wfs(tmp, rendered);
            try {
              renameSync(tmp, target);
            } catch (rErr) {
              try { unlinkSync(tmp); } catch { /* swallow */ }
              throw rErr;
            }
            console.log(`  ✓ ${slug}.md`);
          } catch (e) {
            console.error(`  ✗ ${slug}.md: ${e?.code ?? e}`);
            exit = Math.max(exit, 1);
          }
        }
      }
    } catch (err) {
      console.error(`  ✗ ${err?.code ?? "ERROR"}: ${err?.message ?? err}`);
      exit = Math.max(exit, 1);
    }
  }

  if (wantRender && wantPipeline) {
    console.log("");
    console.log("─".repeat(60));
    console.log("");
  }

  if (wantPipeline) {
    try {
      const { listLifecycleStates } = await import("../lib/lifecycle-state.mjs");
      const records = listLifecycleStates(cwd);
      if (records.length === 0) {
        console.log("No specs found in .context-index/lifecycle-state/");
      } else {
        // Truncate spec paths to 40 chars with ellipsis.
        const truncate = (s, n) => {
          if (!s) return "—";
          const str = String(s);
          if (str.length <= n) return str;
          return str.slice(0, n - 1) + "…";
        };
        const rows = records.map((r) => ({
          spec: truncate(r.spec, 40),
          status: String(r.status ?? "—"),
          currentStep: String(r.currentStep ?? "—"),
          updated: String(r.updated ?? "—"),
        }));
        const headers = { spec: "Spec", status: "Status", currentStep: "Current Step", updated: "Updated" };
        const widths = {
          spec: Math.max(headers.spec.length, ...rows.map((r) => r.spec.length)),
          status: Math.max(headers.status.length, ...rows.map((r) => r.status.length)),
          currentStep: Math.max(headers.currentStep.length, ...rows.map((r) => r.currentStep.length)),
          updated: Math.max(headers.updated.length, ...rows.map((r) => r.updated.length)),
        };
        const fmt = (r) =>
          `${r.spec.padEnd(widths.spec)}  ${r.status.padEnd(widths.status)}  ${r.currentStep.padEnd(widths.currentStep)}  ${r.updated.padEnd(widths.updated)}`;
        console.log(fmt(headers));
        console.log(
          `${"-".repeat(widths.spec)}  ${"-".repeat(widths.status)}  ${"-".repeat(widths.currentStep)}  ${"-".repeat(widths.updated)}`,
        );
        for (const r of rows) console.log(fmt(r));
      }
    } catch (err) {
      if (err && err.code === "INVALID_PROJECT_ROOT") {
        console.error(`  ✗ ${err.code}: ${err.message}`);
        process.exit(1);
      }
      console.error(`  ✗ ${err?.code ?? "ERROR"}: ${err?.message ?? err}`);
      exit = Math.max(exit, 1);
    }
  }

  if (exit !== 0) process.exit(exit);
}

/**
 * `adev migrate` — one-shot conversion of legacy state artifacts to the
 * charter-era shapes. Wraps `lib/migrate-state-artifacts.mjs::migrateAll`.
 *
 * DEPRECATED (issue-580): this verb existed to carry individual repos through
 * the 2026-05 state-artifact migration (tasks.md→tasks.json,
 * build-state/*.json→lifecycle-state/*.jsonl, .execution-state.md→.json,
 * milestones.yaml→.json). That migration is complete on this repo, but other
 * installations may still be on pre-migration artifact shapes, so the verb
 * and `lib/migrate-state-artifacts.mjs` remain shipped as an upgrade path.
 * Slated for removal once telemetry/support signal shows pre-migration
 * installs have aged out. Do not build new functionality on top of it.
 *
 * Flags:
 *   --dry-run                  Print plan without writing
 *   --artifact=<name>          Scope to a single artifact
 *
 * Exit codes:
 *   0  success / no work to do / valid dry-run
 *   1  parse error / containment violation / fatal collision / unknown artifact
 */
async function cmdMigrate(argv) {
  const cwd = process.cwd();
  warn(
    "adev migrate is DEPRECATED: it is a one-shot upgrade path for the 2026-05 " +
    "state-artifact migration, slated for removal. If this repo has already " +
    "migrated, you do not need to run it.",
  );
  // Parse flags from argv[3..]
  const flags = argv.slice(3);
  let dryRun = false;
  let artifact = "all";

  for (const flag of flags) {
    if (flag === "--dry-run") {
      dryRun = true;
    } else if (flag === "--help" || flag === "-h") {
      console.log(`
  adev migrate — convert legacy state artifacts to charter-era shapes.

  Usage:
    adev migrate                           Run full migration
    adev migrate --dry-run                 Preview without writing
    adev migrate --artifact=<name>         Migrate only the named artifact

  Valid artifact names:
    tasks                          tasks.md → tasks.json
    lifecycle-state                build-state/*.json → lifecycle-state/*.jsonl
                                   (per-file translation + directory rename)
    lifecycle-state-skip-rename    Per-file translation only (recovery flow)
    execution-state                .execution-state.md → .execution-state.json
    milestones                     milestones.yaml → milestones.json
    constitution                   Update Context Routing row only
    validate-config                Scaffold governance/validate.yaml from domain
                                   starter (refuses to overwrite malformed files)
    all                            Default — run every artifact in order
      `);
      return 0;
    } else if (flag.startsWith("--artifact=")) {
      artifact = flag.slice("--artifact=".length);
    } else {
      error(`Unknown flag: ${flag}`);
      return 1;
    }
  }

  // Lazy-import the library so first-load cost is paid only on this subcommand.
  const { migrateAll } = await import("../lib/migrate-state-artifacts.mjs");

  let result;
  try {
    result = await migrateAll(cwd, { dryRun, artifact });
  } catch (e) {
    error(`${e.code ?? "ERROR"}: ${e.message}`);
    return 1;
  }

  if (result.failed) {
    console.log();
    error("Pre-flight failed:");
    for (const f of result.preflight.failures) {
      const line = `  - ${f.code}${f.artifact ? ` (${f.artifact})` : ""}${f.file ? ` — ${f.file}` : ""}`;
      console.log(line);
      if (f.size != null && f.cap != null) {
        console.log(`      size=${f.size} cap=${f.cap}`);
      }
    }
    return 1;
  }

  console.log();
  if (dryRun) {
    heading("Dry-run plan");
  } else {
    heading("Migration result");
  }
  for (const r of result.results) {
    const label = r.action === "skipped" ? "·" : r.action === "migrated" ? "✓" : "→";
    console.log(`  ${label} ${r.artifact}: ${r.action}${r.target ? ` → ${r.target}` : ""}`);
    for (const adv of r.advisories ?? []) {
      console.log(`      ${adv.code}: ${adv.message ?? ""}`);
    }
  }

  if (result.advisorySync && !dryRun) {
    console.log();
    warn(
      "Constitution Context Routing row updated. Run /adev:sync to propagate the change to CLAUDE.md.",
    );
  }

  return 0;
}

function cmdHelp() {
  console.log(`
  adev — Agentic Development Framework CLI

  Usage:
    npx @adev-org/adev-cli install           First-time plugin setup
    npx @adev-org/adev-cli upgrade           Update existing install to latest version
    npx @adev-org/adev-cli uninstall         Uninstall plugin(s)
    npx @adev-org/adev-cli extension install <source>  Install an extension
    npx @adev-org/adev-cli extension list              List installed extensions
    npx @adev-org/adev-cli migrate                     Convert legacy state artifacts (one-shot)

  Provider Selection:
    --provider claude-code        Install for Claude Code only
    --provider opencode           Install for OpenCode only
    --provider codex              Install for OpenAI Codex only
    --provider claude-code --provider opencode  Install for both
    --provider claude-code --provider codex     Install for Claude + Codex

  Examples:
    npx @adev-org/adev-cli install                          # Claude Code (default)
    npx @adev-org/adev-cli install --provider opencode      # OpenCode only
    npx @adev-org/adev-cli install --provider codex         # OpenAI Codex only
    npx @adev-org/adev-cli upgrade                          # Upgrade existing install
    npx @adev-org/adev-cli uninstall                        # Remove from selected providers

  After install, run /adev:init inside your AI coding assistant
  to configure constitution, governance, and project context.

  Repository: https://github.com/agentic-development/adev-plugin
  `);
}

export {
  scaffoldContextKit,
  setupGitHooks,
  detectProjectState,
  isContextIndexConfigured,
  PLUGIN_ROOT,
  PLUGIN_VERSION,
  selectProviders,
  installProviders,
  buildChainedHook,
  validateHooksPath,
  escapesRepoPhysically,
};

// Re-export Claude Code adapter functions for backward compatibility
export const enablePlugin = getProvider("claude-code").enable;
export const detectConflicts = getProvider("claude-code").detectConflicts;
export const disableConflictingPlugin = getProvider("claude-code").disableConflictingPlugin;

// ============================================================================
// CLI Verb Registry
// ----------------------------------------------------------------------------
// Each entry maps a verb name to a factory that returns
// { run, help, LIFECYCLE_STEP? }. Contract:
//
//   run({ projectRoot, argv, manifest }) => Promise<void>
//   help() => void  (mandatory; prints help text to stdout)
//   LIFECYCLE_STEP?: string  (modules bound to a lifecycle step;
//                              run() must call requireGate() first)
//
// Exit codes (per hook protocol):
//   0  success
//   1  fatal error (unknown verb, missing argument, unexpected exception)
//   2  gate-blocked (GateError thrown from run())
//
// Adding a verb: create lib/cli/<verb>.mjs and add one line below.
//
// Legacy commands (install/upgrade/uninstall/init/extension/status/migrate/help)
// are wrapped in inline adapter closures that take no args and read
// process.argv internally — preserved unchanged. New-pattern helpers are
// dynamic imports of lib/cli/<verb>.mjs modules.
// ============================================================================

const VERB_REGISTRY = new Map([
  ["install",   () => ({ run: () => cmdInstall(),                help: () => cmdHelp() })],
  ["upgrade",   () => ({ run: () => cmdUpgrade(),                help: () => cmdHelp() })],
  ["uninstall", () => ({ run: () => cmdUninstall(),              help: () => cmdHelp() })],
  ["init",      () => ({ run: async () => {
                          // Sub-verb: `adev init prompt session-capture` delegates to the
                          // init-prompt-session-capture module (SA-5). This keeps the
                          // skills/init/SKILL.md prose readable as a 3-token verb while
                          // the dispatcher remains a single-token registry.
                          const sub = process.argv[3];
                          if (sub === "prompt" && process.argv[4] === "session-capture") {
                            const mod = await import("../lib/cli/init-prompt-session-capture.mjs");
                            const projectRoot = process.cwd();
                            await mod.run({ projectRoot, argv: process.argv.slice(5), manifest: null });
                            return;
                          }
                          if (sub === "ensure-gitignore") {
                            const mod = await import("../lib/cli/init-ensure-gitignore.mjs");
                            const projectRoot = process.cwd();
                            let m = null;
                            try { m = loadManifest(projectRoot); } catch { m = null; }
                            await mod.run({ projectRoot, argv: process.argv.slice(4), manifest: m });
                            return;
                          }
                          warn("`init` is deprecated. Use `install` (first-time) or `upgrade` (existing).");
                          console.log();
                          const state = detectProjectState();
                          if ((state.mode === "brownfield-outdated" || state.mode === "brownfield-current") && state.configured) {
                            await cmdUpgrade();
                          } else {
                            await cmdInstall();
                          }
                        }, help: () => cmdHelp() })],
  ["extension", () => ({ run: () => cmdExtension(),              help: () => cmdHelp() })],
  ["status",    () => ({ run: () => cmdStatus(),                 help: () => cmdHelp() })],
  ["migrate",   () => ({ run: async () => {
                          const exitCode = await cmdMigrate(process.argv);
                          if (exitCode !== 0) process.exit(exitCode);
                        }, help: () => cmdHelp() })],
  ["help",      () => ({ run: () => cmdHelp(),                   help: () => cmdHelp() })],
  ["gate",            () => import("../lib/cli/gate.mjs")],
  ["boundaries",      () => import("../lib/cli/boundaries.mjs")],
  ["governance",      () => import("../lib/cli/governance.mjs")],
  ["diagnose",        () => import("../lib/cli/diagnose.mjs")],
  ["heuristics",      () => import("../lib/cli/heuristics.mjs")],
  ["report",          () => import("../lib/cli/report.mjs")],
  ["source-manifest", () => import("../lib/cli/source-manifest.mjs")],
  ["domain",          () => import("../lib/cli/domain.mjs")],
  // Registered so /adev:init can run the picker. The module always exported a
  // run()/help() pair, but had no registry entry, so its only caller was
  // cmdInstall/cmdUpgrade calling runPicker() directly — which is what put a
  // manifest-writing prompt inside the installer.
  ["domain-picker",   () => import("../lib/cli/domain-extension-picker.mjs")],
  ["context",         () => import("../lib/cli/context.mjs")],
  ["verify",          () => import("../lib/cli/verify.mjs")],
  ["state",           () => import("../lib/cli/state.mjs")],
  ["execution-state", () => import("../lib/cli/execution-state.mjs")],
  ["build-state",     () => import("../lib/cli/build-state.mjs")],
  ["bugfix-loop",     () => import("../lib/cli/bugfix-loop.mjs")],
  ["preflight",       () => import("../lib/cli/preflight.mjs")],
  ["prototype",       () => import("../lib/cli/prototype.mjs")],
  ["artifact",        () => import("../lib/cli/artifact.mjs")],
  ["partial",         () => import("../lib/cli/partial.mjs")],
  ["route",           () => import("../lib/cli/route.mjs")],
  ["implement",       () => import("../lib/cli/implement.mjs")],
  ["specify",         () => import("../lib/cli/specify.mjs")],
  ["issues",          () => import("../lib/cli/issues.mjs")],
  ["retro",           () => import("../lib/cli/retro.mjs")],
  ["cost",            () => import("../lib/cli/cost.mjs")],
  ["skill-ext",       () => import("../lib/cli/skill-ext.mjs")],
  ["worktree",        () => import("../lib/cli/worktree.mjs")],
  ["parallel",        () => import("../lib/cli/parallel.mjs")],
  ["test-policy",     () => import("../lib/cli/test-policy.mjs")],
  ["test-helpers",    () => import("../lib/cli/test-helpers.mjs")],
  ["coordination",    () => import("../lib/cli/coordination.mjs")],
  ["test-debt",       () => import("../lib/cli/test-debt.mjs")],
]);

// Strip ANSI color codes from messages before printing to stdout/stderr
// (sanitises verb names and error messages — SEC-2 from spec review).
function stripAnsi(s) {
  return typeof s === "string" ? s.replace(/\x1b\[[0-9;]*m/g, "") : s;
}

function printVerbRegistry(stream = "stdout") {
  const out = stream === "stderr" ? (m) => console.error(m) : (m) => console.log(m);
  out("Usage: adev <verb> [args]");
  out("");
  out("Verbs:");
  for (const verb of VERB_REGISTRY.keys()) {
    out(`  ${verb}`);
  }
}

async function dispatch(argv) {
  const verb = argv[2];
  if (!verb) {
    printVerbRegistry();
    process.exit(1);
  }
  const factory = VERB_REGISTRY.get(verb);
  if (!factory) {
    console.error(`unknown verb: ${stripAnsi(verb)}`);
    printVerbRegistry("stderr");
    process.exit(1);
  }
  const verbArgs = argv.slice(3);

  let mod;
  try {
    mod = await factory();
  } catch (err) {
    // Module import failure (e.g., missing run export)
    console.error(stripAnsi(err && err.message ? err.message : String(err)));
    process.exit(1);
  }

  // Validate that the resolved module exposes the contract.
  if (typeof mod.run !== "function") {
    console.error(`verb ${stripAnsi(verb)} missing run export`);
    process.exit(1);
  }

  // --help short-circuit applies only to new-contract modules. Legacy
  // adapters (run.length === 0) read process.argv themselves and may
  // implement verb-specific --help; defer to them.
  if (mod.run.length > 0 && (verbArgs.includes("--help") || verbArgs.includes("-h"))) {
    if (typeof mod.help === "function") {
      mod.help();
      process.exit(0);
    }
  }

  try {
    // New-contract modules (lib/cli/*.mjs) accept { projectRoot, argv, manifest }.
    // Legacy adapter closures (install/upgrade/etc.) take no args and read
    // process.argv internally. Branch on run.length.
    let returnCode = 0;
    if (mod.run.length === 0) {
      await mod.run();
    } else {
      const projectRoot = process.cwd();
      let manifest = null;
      try {
        manifest = loadManifest(projectRoot);
      } catch {
        // Manifest may legitimately not exist (e.g., before /adev:init). New-
        // contract helpers that need it should fail with their own error.
        manifest = null;
      }
      // New-pattern helpers may return a numeric exit code (e.g., issues
      // sub-dispatcher returns 1 for unknown subcommand). Most existing
      // helpers call process.exit() inline and return undefined; treat
      // undefined / non-number as 0 for backward compatibility.
      const ret = await mod.run({ projectRoot, argv: verbArgs, manifest });
      if (typeof ret === "number" && Number.isInteger(ret)) {
        returnCode = ret;
      }
    }
    process.exit(returnCode);
  } catch (err) {
    // GateError detection: use err.code === 'GATE_BLOCKED' rather than
    // instanceof — robust across module-instance boundaries.
    if (err && err.code === "GATE_BLOCKED") {
      console.error(stripAnsi(err.message));
      process.exit(2);
    }
    console.error(stripAnsi(err && err.message ? err.message : String(err)));
    if (err && err.stack) console.error(stripAnsi(err.stack));
    process.exit(1);
  }
}

const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  const argvPath = resolveSymlink(process.argv[1]);
  const filenamePath = resolve(__filename);
  return argvPath === filenamePath;
})();

if (isDirectRun) {
  await dispatch(process.argv);
}

export { VERB_REGISTRY, cmdExtension, dispatch, printVerbRegistry, stripAnsi };
