// lib/cli/init-prompt-session-capture.mjs
//
// `adev init prompt session-capture` — interactive prompt verb that drives
// the session-capture step of skills/init/SKILL.md. Computes detection-based
// defaults (new project: hook,true; existing project: post-commit,false),
// honours stored manifest values when present (SA-4), and writes back the
// chosen values to manifest.yaml while preserving any existing
// `integrations.session_capture.provider` key (SA-5).
//
// Contract:
//   run({ projectRoot, argv, manifest }) — async, returns void
//   help() — prints usage to stdout
//
// Args:
//   --capture <hook|post-commit|off>   Skip prompt; use this value
//   --gitignored <true|false>          Skip prompt; use this value
//   --non-interactive                  Apply defaults without prompting
//
// Exit codes:
//   0  success
//   1  invalid argument (e.g., --capture other)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import readline from "node:readline";

import { detectExistingCapture } from "../session-capture.mjs";

const VALID_CAPTURE = new Set(["hook", "post-commit", "off"]);

const USAGE =
  "usage: adev init prompt session-capture [--capture hook|post-commit|off] [--gitignored true|false] [--non-interactive]";

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Prompt for integrations.session_capture.{capture, gitignored}.");
  console.log("Writes the result back to .context-index/manifest.yaml.");
  console.log("");
  console.log("Defaults:");
  console.log("  new project (no detection signals)        → capture: hook, gitignored: true");
  console.log("  existing project (legacy block / sessions) → capture: post-commit, gitignored: false");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--capture" && i + 1 < argv.length) {
      out.capture = argv[++i];
    } else if (a === "--gitignored" && i + 1 < argv.length) {
      out.gitignored = argv[++i];
    } else if (a === "--non-interactive") {
      out.nonInteractive = true;
    }
  }
  return out;
}

function parseBool(s) {
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
}

/**
 * Read the integrations.session_capture block from manifest.yaml without
 * pulling in the full YAML parser. Returns `{ provider, capture, gitignored }`
 * — all optional. Missing keys are undefined.
 *
 * Pure string scan (no YAML dep) so a malformed manifest never blocks the
 * init prompt; the worst case is treating all keys as undefined.
 *
 * @param {string} manifestPath
 * @returns {{ provider?: string, capture?: string, gitignored?: boolean, found: boolean }}
 */
function readSessionCaptureBlock(manifestPath) {
  if (!existsSync(manifestPath)) return { found: false };
  let raw;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch {
    return { found: false };
  }
  const lines = raw.split(/\r?\n/);
  const out = { found: false };
  let inBlock = false;
  let blockIndent = -1;
  for (const line of lines) {
    const trimmed = line.replace(/[\t ]+$/, "");
    if (/^\s*session_capture:\s*$/.test(trimmed)) {
      inBlock = true;
      const m = line.match(/^(\s*)session_capture:/);
      blockIndent = m ? m[1].length : 0;
      out.found = true;
      continue;
    }
    if (inBlock) {
      // Detect end of block: a non-empty, non-comment line at indent ≤ blockIndent.
      if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;
      const m = line.match(/^(\s*)([A-Za-z_]\w*):\s*(.*)$/);
      if (!m) continue;
      const [, indent, key, value] = m;
      if (indent.length <= blockIndent) {
        inBlock = false;
        break;
      }
      const v = value.replace(/\s+#.*$/, "").trim();
      if (key === "provider") out.provider = v;
      else if (key === "capture") out.capture = v;
      else if (key === "gitignored") out.gitignored = v === "true";
    }
  }
  return out;
}

/**
 * Rewrite the session_capture block in the manifest, preserving any
 * unrelated keys (notably `provider`). Idempotent: re-running with the
 * same values produces byte-identical output.
 *
 * @param {string} manifestPath
 * @param {{ provider?: string, capture: string, gitignored: boolean }} values
 */
function writeSessionCaptureBlock(manifestPath, values) {
  let raw = "";
  if (existsSync(manifestPath)) {
    raw = readFileSync(manifestPath, "utf8");
  }
  const lines = raw.split(/\r?\n/);

  const newSubBlock = [];
  if (values.provider) newSubBlock.push(`    provider: ${values.provider}`);
  newSubBlock.push(`    capture: ${values.capture}`);
  newSubBlock.push(`    gitignored: ${values.gitignored}`);

  // Find existing session_capture block boundaries.
  let blockStart = -1;
  let blockEnd = -1;
  let blockIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*session_capture:\s*$/.test(lines[i])) {
      blockStart = i;
      const m = lines[i].match(/^(\s*)/);
      blockIndent = m ? m[1].length : 0;
      // Scan forward to the end of the block.
      let j = i + 1;
      while (j < lines.length) {
        const ln = lines[j];
        if (/^\s*$/.test(ln) || /^\s*#/.test(ln)) {
          j++;
          continue;
        }
        const m2 = ln.match(/^(\s*)/);
        const ind = m2 ? m2[1].length : 0;
        if (ind <= blockIndent) break;
        j++;
      }
      blockEnd = j;
      break;
    }
  }

  if (blockStart >= 0) {
    // Replace the existing block's body lines (preserve header line itself).
    const before = lines.slice(0, blockStart + 1);
    const after = lines.slice(blockEnd);
    const newLines = [...before, ...newSubBlock, ...after];
    writeFileSync(manifestPath, newLines.join("\n"));
    return;
  }

  // No block exists. Look for an existing `integrations:` key to nest under.
  let integrationsLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*integrations:\s*$/.test(lines[i])) {
      integrationsLine = i;
      break;
    }
  }
  if (integrationsLine >= 0) {
    // Insert `  session_capture:\n` + newSubBlock right after `integrations:`.
    const before = lines.slice(0, integrationsLine + 1);
    const after = lines.slice(integrationsLine + 1);
    const block = ["  session_capture:", ...newSubBlock];
    writeFileSync(manifestPath, [...before, ...block, ...after].join("\n"));
    return;
  }

  // Append a new integrations block at the end.
  mkdirSync(join(manifestPath, ".."), { recursive: true });
  const appended =
    (raw.length > 0 && !raw.endsWith("\n") ? "\n" : "") +
    [
      "",
      "integrations:",
      "  session_capture:",
      ...newSubBlock,
      "",
    ].join("\n");
  writeFileSync(manifestPath, raw + appended);
}

async function promptText(rl, question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a)));
}

/**
 * @param {{ projectRoot: string, argv: string[], manifest: any }} ctx
 */
export async function run({ projectRoot, argv, manifest: _manifest }) {
  const args = parseArgs(argv);

  // Validate provided --capture, if any.
  if (args.capture && !VALID_CAPTURE.has(args.capture)) {
    console.error(`Error: capture must be one of: hook, post-commit, off`);
    process.exit(1);
  }
  let gitignoredFlag = null;
  if (args.gitignored !== undefined) {
    gitignoredFlag = parseBool(args.gitignored);
    if (gitignoredFlag === null) {
      console.error(`Error: gitignored must be true or false`);
      process.exit(1);
    }
  }

  const manifestPath = join(projectRoot, ".context-index", "manifest.yaml");
  const existing = readSessionCaptureBlock(manifestPath);
  const detection = await detectExistingCapture(projectRoot);

  // Resolve defaults:
  //   - Stored config (SA-4) takes precedence when present.
  //   - Otherwise, detection signals select existing-vs-new defaults.
  let defaultCapture;
  let defaultGitignored;
  if (existing.capture && VALID_CAPTURE.has(existing.capture)) {
    defaultCapture = existing.capture;
    defaultGitignored =
      typeof existing.gitignored === "boolean" ? existing.gitignored : false;
  } else if (detection.existing) {
    defaultCapture = "post-commit";
    defaultGitignored = false;
  } else {
    defaultCapture = "hook";
    defaultGitignored = true;
  }

  // SA-4: warn when stored config contradicts detection.
  const conflict = (() => {
    if (!existing.capture) return null;
    if (existing.capture === "post-commit" && !detection.existing) {
      return `manifest says capture: post-commit but no legacy block detected`;
    }
    if (existing.capture === "hook" && detection.signals.includes("post-commit-legacy-signature")) {
      return `manifest says capture: hook but .githooks/post-commit still contains the legacy block`;
    }
    return null;
  })();

  // ── Prompt rendering ──
  // CON-8 anchors the warning ABOVE the default-accept question.
  console.log("");
  console.log("  Session Capture");
  console.log("  ───────────────");
  if (detection.signals.length > 0) {
    console.log(`  Detected: ${detection.signals.join(", ")}`);
  } else {
    console.log("  Detected: new project (no session-capture signals)");
  }
  if (conflict) {
    console.log("");
    console.log(`  [warning] ${conflict} — stored config will be applied as-is.`);
  }
  console.log("");
  console.log(`  capture:    ${defaultCapture} [default]`);
  console.log(`  gitignored: ${defaultGitignored} [default]`);
  console.log("");

  // Resolve values: CLI flags > prompt > default.
  let chosenCapture = args.capture;
  let chosenGitignored = gitignoredFlag;

  const interactive =
    !args.nonInteractive &&
    (chosenCapture === undefined || chosenGitignored === null) &&
    process.stdin.isTTY === true;

  if (interactive) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      if (chosenCapture === undefined) {
        const ans = (await promptText(rl, `  Accept capture default (${defaultCapture})? [Y/n/value]: `)).trim();
        if (ans === "" || /^y(es)?$/i.test(ans)) {
          chosenCapture = defaultCapture;
        } else if (/^n(o)?$/i.test(ans)) {
          const v = (await promptText(rl, "  capture (hook|post-commit|off): ")).trim();
          chosenCapture = v;
        } else {
          chosenCapture = ans;
        }
      }
      if (chosenGitignored === null) {
        const ans = (await promptText(rl, `  Accept gitignored default (${defaultGitignored})? [Y/n]: `)).trim();
        if (ans === "" || /^y(es)?$/i.test(ans)) {
          chosenGitignored = defaultGitignored;
        } else {
          chosenGitignored = !defaultGitignored;
        }
      }
    } finally {
      rl.close();
    }
  } else {
    if (chosenCapture === undefined) chosenCapture = defaultCapture;
    if (chosenGitignored === null) chosenGitignored = defaultGitignored;
  }

  // Validate the chosen capture value.
  if (!VALID_CAPTURE.has(chosenCapture)) {
    console.error(`Error: capture must be one of: hook, post-commit, off`);
    process.exit(1);
  }

  // Write back. Preserve any existing `provider` key verbatim.
  writeSessionCaptureBlock(manifestPath, {
    provider: existing.provider,
    capture: chosenCapture,
    gitignored: chosenGitignored,
  });

  console.log("");
  console.log(`  Wrote: capture: ${chosenCapture}, gitignored: ${chosenGitignored}`);
  console.log("");
}

export default { run, help };
