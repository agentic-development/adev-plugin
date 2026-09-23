// lib/session-capture-installer.mjs
//
// Installer helper for the session-capture feature. Reads
// integrations.session_capture from manifest.yaml and dispatches to one of
// three branches (hook / post-commit / off). Owns:
//
//   - hooks/hooks.json registration for SessionEnd + PreCompact
//   - .gitignore paired-marker block management
//   - .githooks/post-commit sentinel cleanup with SEC-11 mismatch branch
//   - one-time post-commit sentinel-wrap migration
//
// Pure library: no console output from happy-paths; stderr only for
// diagnostics (SEC-7 format). Returns a small structured report so the
// caller can decide what to print to the install summary.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
} from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

import { detectExistingCapture, formatDiagnostic } from "./session-capture.mjs";

const GITIGNORE_OPEN = "# >>> adev:session-capture-gitignore >>>";
const GITIGNORE_CLOSE = "# <<< adev:session-capture-gitignore <<<";
const POSTCOMMIT_OPEN = "# >>> adev:session-capture >>>";
const POSTCOMMIT_CLOSE = "# <<< adev:session-capture <<<";

const SESSIONEND_HOOK_PATH = "${CLAUDE_PLUGIN_ROOT}/hooks/session-end.sh";
const PRECOMPACT_HOOK_PATH = "${CLAUDE_PLUGIN_ROOT}/hooks/pre-compact.sh";

/**
 * Read integrations.session_capture.capture from manifest.yaml (string scan
 * — no YAML dep). Returns the value or null.
 *
 * @param {string} projectRoot
 * @returns {string|null}
 */
export function readCaptureMode(projectRoot) {
  const manifestPath = join(projectRoot, ".context-index", "manifest.yaml");
  if (!existsSync(manifestPath)) return null;
  let raw;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/);
  let inBlock = false;
  let blockIndent = -1;
  for (const line of lines) {
    if (/^\s*session_capture:\s*$/.test(line)) {
      inBlock = true;
      const m = line.match(/^(\s*)/);
      blockIndent = m ? m[1].length : 0;
      continue;
    }
    if (inBlock) {
      if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
      const m = line.match(/^(\s*)([A-Za-z_]\w*):\s*(.*)$/);
      if (!m) continue;
      const [, indent, key, value] = m;
      if (indent.length <= blockIndent) {
        inBlock = false;
        break;
      }
      if (key === "capture") {
        return value.replace(/\s+#.*$/, "").trim();
      }
    }
  }
  return null;
}

function readGitignoredFlag(projectRoot) {
  const manifestPath = join(projectRoot, ".context-index", "manifest.yaml");
  if (!existsSync(manifestPath)) return false;
  const raw = readFileSync(manifestPath, "utf8");
  const lines = raw.split(/\r?\n/);
  let inBlock = false;
  let blockIndent = -1;
  for (const line of lines) {
    if (/^\s*session_capture:\s*$/.test(line)) {
      inBlock = true;
      const m = line.match(/^(\s*)/);
      blockIndent = m ? m[1].length : 0;
      continue;
    }
    if (inBlock) {
      if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
      const m = line.match(/^(\s*)([A-Za-z_]\w*):\s*(.*)$/);
      if (!m) continue;
      const [, indent, key, value] = m;
      if (indent.length <= blockIndent) {
        inBlock = false;
        break;
      }
      if (key === "gitignored") {
        return value.replace(/\s+#.*$/, "").trim() === "true";
      }
    }
  }
  return false;
}

// ─── gitignore paired-marker management ─────────────────────────────────────

/**
 * Append or update the paired-marker session-capture block in `.gitignore`.
 * Operates strictly between the OPEN/CLOSE sentinels. User content outside
 * the markers is preserved verbatim. Idempotent.
 *
 * @param {string} projectRoot
 * @returns {string} one of "added", "updated", "noop"
 */
export function appendSessionCaptureGitignoreBlock(projectRoot) {
  const gitignorePath = join(projectRoot, ".gitignore");
  const blockBody = ".context-index/sessions/";
  let content = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf8")
    : "";

  const openIdx = content.indexOf(GITIGNORE_OPEN);
  const closeIdx = content.indexOf(GITIGNORE_CLOSE);
  if (openIdx >= 0 && closeIdx > openIdx) {
    const before = content.slice(0, openIdx);
    const after = content.slice(closeIdx + GITIGNORE_CLOSE.length);
    const newBlock = `${GITIGNORE_OPEN}\n${blockBody}\n${GITIGNORE_CLOSE}`;
    const next = before + newBlock + after;
    if (next === content) return "noop";
    writeFileSync(gitignorePath, next);
    return "updated";
  }

  // No block — append at end.
  const prefix = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  const tail = content.length > 0 ? "\n" : "";
  const newBlock = `${prefix}${tail}${GITIGNORE_OPEN}\n${blockBody}\n${GITIGNORE_CLOSE}\n`;
  writeFileSync(gitignorePath, content + newBlock);
  return "added";
}

/**
 * Remove the paired-marker session-capture block from `.gitignore`. User
 * content outside markers preserved.
 *
 * @param {string} projectRoot
 * @returns {string} "removed" | "noop"
 */
export function removeSessionCaptureGitignoreBlock(projectRoot) {
  const gitignorePath = join(projectRoot, ".gitignore");
  if (!existsSync(gitignorePath)) return "noop";
  const content = readFileSync(gitignorePath, "utf8");
  const openIdx = content.indexOf(GITIGNORE_OPEN);
  const closeIdx = content.indexOf(GITIGNORE_CLOSE);
  if (openIdx < 0 || closeIdx <= openIdx) return "noop";
  const before = content.slice(0, openIdx).replace(/\n+$/, "\n");
  const after = content.slice(closeIdx + GITIGNORE_CLOSE.length).replace(/^\n+/, "\n");
  const next = (before + after).replace(/\n{3,}/g, "\n\n");
  writeFileSync(gitignorePath, next);
  return "removed";
}

// ─── post-commit sentinel cleanup + sentinel-wrap migration ─────────────────

/**
 * Detect whether `.githooks/post-commit` content contains the legacy
 * session-capture signature WITHOUT any sentinel markers. Used by the
 * one-time wrap migration.
 *
 * @param {string} content
 * @returns {boolean}
 */
function looksLikeLegacyPostCommitBlock(content) {
  const signals = [
    /session[\s_-]?capture/i.test(content),
    /\.context-index\/sessions/.test(content),
    /node\s+.*lib\/session-summary/.test(content) ||
      /session-tracking/.test(content),
  ];
  return signals.filter(Boolean).length >= 2;
}

/**
 * Locate the line that actually invokes the capture writer — the
 * `node --input-type=module -e ...` block (or, for older/hand-authored
 * variants, a `node ... lib/session-summary` call). This is a NARROWER
 * signal than `looksLikeLegacyPostCommitBlock`'s generic "mentions
 * session-capture" scan (issue-588): the self-skip guard's diagnostic
 * (`echo "session-capture skipped: ..."`) also matches that generic scan,
 * and it lives INSIDE the self-skip guard's `if` blocks. Anchoring a
 * sentinel there opens the block mid-way through an unclosed shell control
 * structure the block does not also enclose — the later sentinel-bounded
 * removal then deletes the guard's closing `fi`s and leaves invalid bash.
 * Anchoring on the writer invocation itself avoids that failure mode.
 *
 * @param {string[]} lines
 * @returns {number} index of the writer-invocation line, or -1 if not found
 */
function findWriterInvocationLine(lines) {
  const WRITER_RE = /^\s*node\b.*(?:--input-type=module|lib\/session-summary)/;
  for (let i = 0; i < lines.length; i++) {
    if (WRITER_RE.test(lines[i])) return i;
  }
  return -1;
}

/**
 * Validate a candidate `.githooks/post-commit` script body with `bash -n`
 * (syntax-check only, no execution) before it is written to disk. Spawns
 * `bash` via node:child_process, feeding the script over stdin — no
 * temp-file write is needed for the check itself.
 *
 * @param {string} content
 * @returns {boolean} true when the script parses cleanly
 */
function validateBashSyntax(content) {
  const result = spawnSync("bash", ["-n"], {
    input: content,
    encoding: "utf8",
  });
  return result.status === 0;
}

/**
 * Remove the sentinel-bounded session-capture block from `.githooks/post-commit`.
 *
 * Returns one of:
 *  - "removed"          — block found between paired markers; removed
 *  - "noop"             — both markers absent; nothing to do
 *  - "sentinel-mismatch"— exactly one marker present (SEC-11); no modification
 *  - "legacy-no-sentinels" — legacy signature detected but no sentinels —
 *                            installer prints manual-migration instruction
 *  - "syntax-guard"     — removal would leave invalid bash (issue-588); no
 *                          modification, diagnostic printed to stderr
 *
 * @param {string} projectRoot
 * @returns {string}
 */
export function removeSessionCapturePostCommitBlock(projectRoot) {
  const path = join(projectRoot, ".githooks", "post-commit");
  if (!existsSync(path)) return "noop";
  const content = readFileSync(path, "utf8");
  const openIdx = content.indexOf(POSTCOMMIT_OPEN);
  const closeIdx = content.indexOf(POSTCOMMIT_CLOSE);

  // SEC-11: exactly one sentinel present → no modification, emit stderr.
  if ((openIdx >= 0) !== (closeIdx >= 0)) {
    const rel = relative(projectRoot, path);
    process.stderr.write(
      formatDiagnostic("validation-error", {
        subject: "sentinel-mismatch",
        path: rel,
      }) + "\n",
    );
    return "sentinel-mismatch";
  }

  if (openIdx >= 0 && closeIdx > openIdx) {
    const before = content.slice(0, openIdx).replace(/\n+$/, "\n");
    const after = content.slice(closeIdx + POSTCOMMIT_CLOSE.length).replace(/^\n+/, "\n");
    const next = (before + after).replace(/\n{3,}/g, "\n\n");

    // issue-588: a mis-anchored sentinel (e.g. opened inside an unclosed
    // shell control structure it doesn't also enclose) can turn a clean
    // removal into invalid bash. Validate BEFORE writing — never leave the
    // hook script in a broken state.
    if (!validateBashSyntax(next)) {
      const rel = relative(projectRoot, path);
      process.stderr.write(
        formatDiagnostic("syntax-guard", {
          subject: "post-commit-removal-would-break-script",
          path: rel,
        }) + "\n",
      );
      return "syntax-guard";
    }

    writeFileSync(path, next);
    return "removed";
  }

  if (looksLikeLegacyPostCommitBlock(content)) {
    return "legacy-no-sentinels";
  }
  return "noop";
}

/**
 * One-time migration: when `.githooks/post-commit` has the legacy capture
 * block but NO sentinel markers, wrap the block in paired sentinels.
 *
 * Idempotent: re-runs no-op once sentinels exist. The bounds are detected
 * by scanning for the actual capture-writer invocation (the
 * `node --input-type=module -e ...` block, or a `node ... lib/session-summary`
 * call for older variants — see `findWriterInvocationLine`) and ending at
 * the next blank-line-followed-by-non-capture-line.
 *
 * issue-588: bounds are deliberately NOT anchored on any line merely
 * mentioning "session-capture" — the self-skip guard's diagnostic echo
 * matches that generic text but sits inside the guard's own (unclosed, from
 * the block's point of view) `if` structure. Anchoring there opened a
 * sentinel mid-way through that structure; the later sentinel-bounded
 * removal then deleted the guard's closing `fi`s and left invalid bash.
 * Anchoring on the writer invocation itself keeps the wrapped block
 * self-contained.
 *
 * Conservative: when bounds are ambiguous, we wrap the entire file content
 * after the shebang up to the final `exit 0`. Operators who need a tighter
 * fence can hand-edit; the installer never re-applies once sentinels exist.
 *
 * @param {string} projectRoot
 * @returns {"wrapped" | "noop" | "already-sentinel" | "syntax-guard"}
 */
export function wrapLegacyPostCommitWithSentinels(projectRoot) {
  const path = join(projectRoot, ".githooks", "post-commit");
  if (!existsSync(path)) return "noop";
  const content = readFileSync(path, "utf8");
  if (content.includes(POSTCOMMIT_OPEN) || content.includes(POSTCOMMIT_CLOSE)) {
    return "already-sentinel";
  }
  if (!looksLikeLegacyPostCommitBlock(content)) return "noop";

  // Bound detection: shebang region (line 1-2) stays outside; everything
  // from the writer invocation to the last `exit 0` (or end of file) gets
  // wrapped.
  const lines = content.split("\n");
  let startLine = findWriterInvocationLine(lines);
  if (startLine < 0) return "noop";

  // Walk backwards to include leading comment lines that describe the block.
  while (startLine > 0 && /^\s*#/.test(lines[startLine - 1])) {
    startLine--;
  }

  // End: last non-empty line OR the line before a final `exit 0`.
  let endLine = lines.length - 1;
  while (endLine > startLine && lines[endLine].trim() === "") endLine--;
  // Exclude a final `exit 0` so the hook still exits cleanly.
  if (/^\s*exit\s+0\s*$/.test(lines[endLine])) endLine--;

  const before = lines.slice(0, startLine);
  const block = lines.slice(startLine, endLine + 1);
  const after = lines.slice(endLine + 1);

  const wrapped = [
    ...before,
    POSTCOMMIT_OPEN,
    ...block,
    POSTCOMMIT_CLOSE,
    ...after,
  ];
  const wrappedContent = wrapped.join("\n");

  // Defense in depth: if the wrap itself would somehow produce invalid
  // bash (e.g. an unusual layout not covered by the writer-invocation
  // anchor), refuse to write rather than corrupt the hook.
  if (!validateBashSyntax(wrappedContent)) {
    const rel = relative(projectRoot, path);
    process.stderr.write(
      formatDiagnostic("syntax-guard", {
        subject: "post-commit-wrap-would-break-script",
        path: rel,
      }) + "\n",
    );
    return "syntax-guard";
  }

  writeFileSync(path, wrappedContent);
  return "wrapped";
}

// ─── hooks.json registration ─────────────────────────────────────────────────

const HOOKS_JSON_REL = join("hooks", "hooks.json");

function readHooksJson(projectRoot, pluginRoot) {
  // The hooks.json shipped with the plugin lives at <pluginRoot>/hooks/hooks.json.
  // The installer mutates the plugin's bundled file at install time per the
  // existing hooks.json contract (plugin-side ownership).
  const path = join(pluginRoot, HOOKS_JSON_REL);
  if (!existsSync(path)) return { path, data: { hooks: {} } };
  try {
    const raw = readFileSync(path, "utf8");
    return { path, data: JSON.parse(raw) };
  } catch {
    return { path, data: { hooks: {} } };
  }
}

function writeHooksJson(path, data) {
  // Defensive: ensure the parent dir exists. Plugins ship hooks/hooks.json
  // so this is usually a no-op, but tests and brand-new install dirs may
  // not have the directory yet.
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function hookEntryShape(scriptPath) {
  return {
    type: "command",
    command: `bash "${scriptPath}"`,
  };
}

function findEntryIndex(entries, command) {
  return entries.findIndex((e) => e?.command === command);
}

/**
 * Idempotently register SessionEnd + PreCompact hooks into hooks.json under
 * a `.*` matcher.
 *
 * @param {string} pluginRoot
 * @returns {"added" | "noop"}
 */
export function registerSessionCaptureHooks(pluginRoot) {
  const { path, data } = readHooksJson(null, pluginRoot);
  data.hooks ||= {};

  function ensureMatcherWithHook(eventName, scriptPath) {
    data.hooks[eventName] ||= [];
    const entry = hookEntryShape(scriptPath);
    // Look for any matcher row that already lists our exact command.
    for (const row of data.hooks[eventName]) {
      if (!Array.isArray(row.hooks)) continue;
      if (findEntryIndex(row.hooks, entry.command) >= 0) {
        return false; // already present
      }
    }
    // Append a new matcher row with our hook.
    data.hooks[eventName].push({
      matcher: ".*",
      hooks: [entry],
    });
    return true;
  }

  const addedA = ensureMatcherWithHook("SessionEnd", SESSIONEND_HOOK_PATH);
  const addedB = ensureMatcherWithHook("PreCompact", PRECOMPACT_HOOK_PATH);
  if (addedA || addedB) {
    writeHooksJson(path, data);
    return "added";
  }
  return "noop";
}

/**
 * Idempotently remove SessionEnd + PreCompact hook entries.
 *
 * @param {string} pluginRoot
 * @returns {"removed" | "noop"}
 */
export function unregisterSessionCaptureHooks(pluginRoot) {
  const { path, data } = readHooksJson(null, pluginRoot);
  if (!data.hooks) return "noop";

  function dropEntry(eventName, scriptPath) {
    const rows = data.hooks[eventName];
    if (!Array.isArray(rows)) return false;
    const cmd = hookEntryShape(scriptPath).command;
    let mutated = false;
    for (const row of rows) {
      if (!Array.isArray(row.hooks)) continue;
      const before = row.hooks.length;
      row.hooks = row.hooks.filter((h) => h?.command !== cmd);
      if (row.hooks.length !== before) mutated = true;
    }
    // Drop empty matcher rows AND rows that originally only carried our hook.
    data.hooks[eventName] = rows.filter(
      (r) => Array.isArray(r.hooks) && r.hooks.length > 0,
    );
    return mutated;
  }

  const a = dropEntry("SessionEnd", SESSIONEND_HOOK_PATH);
  const b = dropEntry("PreCompact", PRECOMPACT_HOOK_PATH);
  if (a || b) {
    writeHooksJson(path, data);
    return "removed";
  }
  return "noop";
}

// ─── Top-level dispatcher ────────────────────────────────────────────────────

/**
 * Dispatch installer side-effects per `integrations.session_capture.capture`.
 *
 * @param {string} projectRoot - the user's project root
 * @param {string} pluginRoot  - the plugin install root (owns hooks.json)
 * @returns {Promise<{
 *   mode: string,
 *   actions: string[],
 *   sessionFiles: string[],
 * }>}
 */
export async function dispatchInstallerByCaptureMode(projectRoot, pluginRoot) {
  const mode = readCaptureMode(projectRoot) || "off";
  const gitignored = readGitignoredFlag(projectRoot);
  const actions = [];

  // Run the one-time sentinel-wrap migration unconditionally — idempotent.
  const wrap = wrapLegacyPostCommitWithSentinels(projectRoot);
  if (wrap === "wrapped") actions.push("post-commit: wrapped legacy block in sentinels");
  else if (wrap === "syntax-guard") {
    actions.push(
      "post-commit: sentinel-wrap migration aborted — would break the script (bash -n failed); left unmodified",
    );
  }

  if (mode === "hook") {
    const hookReg = registerSessionCaptureHooks(pluginRoot);
    if (hookReg === "added") actions.push("hooks.json: registered SessionEnd + PreCompact");
    const cleanup = removeSessionCapturePostCommitBlock(projectRoot);
    if (cleanup === "removed") actions.push("post-commit: removed legacy capture block");
    else if (cleanup === "legacy-no-sentinels") {
      actions.push(
        "post-commit: legacy block detected without sentinels — manual migration required",
      );
    } else if (cleanup === "syntax-guard") {
      actions.push(
        "post-commit: removal aborted — would break the script (bash -n failed); left unmodified",
      );
    }
    if (gitignored) {
      const gi = appendSessionCaptureGitignoreBlock(projectRoot);
      if (gi !== "noop") actions.push(`gitignore: ${gi} sessions/ block`);
    } else {
      const gi = removeSessionCaptureGitignoreBlock(projectRoot);
      if (gi === "removed") actions.push("gitignore: removed sessions/ block");
    }
  } else if (mode === "post-commit") {
    const hookReg = unregisterSessionCaptureHooks(pluginRoot);
    if (hookReg === "removed") actions.push("hooks.json: unregistered SessionEnd + PreCompact");
    if (gitignored) {
      const gi = appendSessionCaptureGitignoreBlock(projectRoot);
      if (gi !== "noop") actions.push(`gitignore: ${gi} sessions/ block`);
    } else {
      const gi = removeSessionCaptureGitignoreBlock(projectRoot);
      if (gi === "removed") actions.push("gitignore: removed sessions/ block");
    }
    // post-commit mode: leave .githooks/post-commit intact.
  } else {
    // off
    const hookReg = unregisterSessionCaptureHooks(pluginRoot);
    if (hookReg === "removed") actions.push("hooks.json: unregistered SessionEnd + PreCompact");
    const cleanup = removeSessionCapturePostCommitBlock(projectRoot);
    if (cleanup === "removed") actions.push("post-commit: removed legacy capture block");
    else if (cleanup === "syntax-guard") {
      actions.push(
        "post-commit: removal aborted — would break the script (bash -n failed); left unmodified",
      );
    }
    const gi = removeSessionCaptureGitignoreBlock(projectRoot);
    if (gi === "removed") actions.push("gitignore: removed sessions/ block");
  }

  // List existing sessions files for the off-mode hint (and informational
  // for other modes; caller decides whether to print).
  const sessionsDir = join(projectRoot, ".context-index", "sessions");
  let sessionFiles = [];
  if (existsSync(sessionsDir)) {
    try {
      sessionFiles = readdirSync(sessionsDir)
        .filter((n) => n.endsWith(".md"))
        .map((n) => join(".context-index", "sessions", n));
    } catch {
      sessionFiles = [];
    }
  }

  return { mode, actions, sessionFiles };
}

export default {
  dispatchInstallerByCaptureMode,
  registerSessionCaptureHooks,
  unregisterSessionCaptureHooks,
  appendSessionCaptureGitignoreBlock,
  removeSessionCaptureGitignoreBlock,
  removeSessionCapturePostCommitBlock,
  wrapLegacyPostCommitWithSentinels,
  readCaptureMode,
};
