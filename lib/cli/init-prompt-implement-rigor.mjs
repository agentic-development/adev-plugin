// lib/cli/init-prompt-implement-rigor.mjs
//
// `adev init prompt implement-rigor` — onboarding verb that records a
// project's implement review depth (`implement_mode` in
// .context-index/governance/risk-policies.yaml) as lite | quick | full.
//
// Contract:
//   run({ projectRoot, argv, manifest, __scriptedInput }) — async, returns void
//   help() — prints usage to stdout
//
// Args:
//   --mode <lite|quick|full>                 Skip the prompt; use this value
//   --preset <prototype|standard|strict>     Preset whose default a
//                                            non-interactive run writes
//                                            (default: manifest risk_tier,
//                                            else standard)
//
// The choice is written to `medium` and `low`; `high` is written only for
// `full`, because `lite` is never legal for high-risk specs and `quick` must
// not lower a strict preset's high-risk `full`. Interactive input is matched
// exactly and case-sensitively, and the written value is always the matched
// CHOICES constant, never the raw input, so no typed text reaches the YAML.
//
// A run with no `--mode` and no TTY on stdin is non-interactive: it shows no
// prompt, never overwrites an existing implement_mode, and fills a missing
// one with the preset's non-lite default. `lite` is therefore only ever
// written by a typed choice or an explicit `--mode lite`. With no
// risk-policies.yaml a quick default writes nothing, since the implement
// fallback is already quick; a full default creates the file.
//
// The write is refused unless re-parsing the edited text yields the original
// document with only the targeted implement_mode values set, so a layout the
// line splice does not understand (flow style, anchors) is never corrupted.
//
// Exit codes:
//   0  success
//   1  INVALID_IMPLEMENT_RIGOR: a bad, unknown or repeated argument, three
//      invalid answers, input closed, scripted answers exhausted, or a
//      risk-policies.yaml that does not parse or cannot be edited faithfully

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import readline from "node:readline";
import { isDeepStrictEqual } from "node:util";

import { parseRigorPolicies } from "../governance/rigor-mode.mjs";
import { parseYaml } from "../profiles/yaml.mjs";

export const CHOICES = Object.freeze(["lite", "quick", "full"]);
export const MAX_ATTEMPTS = 3;

const PRESETS = Object.freeze(["prototype", "standard", "strict"]);
const PRESET_DEFAULTS = Object.freeze({ prototype: "quick", standard: "quick", strict: "full" });
const LEVELS = Object.freeze(["high", "medium", "low"]);
const POLICIES_REL = join(".context-index", "governance", "risk-policies.yaml");

const USAGE =
  "usage: adev init prompt implement-rigor [--mode lite|quick|full] [--preset prototype|standard|strict]";

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Prompt for the implement review depth (`implement_mode`) in");
  console.log(".context-index/governance/risk-policies.yaml.");
  console.log("");
  console.log(`Choices: ${CHOICES.join(", ")} (typed exactly, lowercase)`);
  console.log("Written to medium and low; full also writes high.");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function failInvalid(message) {
  fail(`INVALID_IMPLEMENT_RIGOR: ${message}`);
}

// Only `--mode <v>` and `--preset <v>`, each at most once. Anything else,
// including `--mode=<v>`, is refused rather than ignored, so a mistyped flag
// can never fall through to a non-interactive default.
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a !== "--mode" && a !== "--preset") {
      failInvalid(`unrecognized argument ${JSON.stringify(a)}. ${USAGE}. Nothing was written.`);
    }
    const key = a.slice(2);
    if (key in out) failInvalid(`${a} was given more than once. Nothing was written.`);
    out[key] = i + 1 < argv.length ? argv[++i] : "";
  }
  return out;
}

function choiceIndex(value) {
  return CHOICES.indexOf(value);
}

function readRiskTier(projectRoot) {
  const manifestPath = join(projectRoot, ".context-index", "manifest.yaml");
  if (!existsSync(manifestPath)) return null;
  let raw;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch {
    return null;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^risk_tier:\s*([^#\s]+)/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

const KEY_LINE = /^( *)([A-Za-z_][\w-]*):(.*)$/;

// Splits the text after a `key:` into its value and any trailing comment
// (`#` at the start or after whitespace), keeping the whitespace before it.
function splitComment(rest) {
  const m = rest.match(/^(.*?)(\s*)(#.*)?$/);
  return { value: m[1].trim(), gap: m[2], comment: m[3] ?? "" };
}

class UnsupportedLayoutError extends Error {}

// Line-level map of the `policies:` block: for each level, its header line,
// the indent its keys use, and its `implement_mode` line (if any). Only block
// style is edited; a `policies:` or level line carrying an inline (flow)
// value throws, because inserting lines beside it would add a duplicate key.
function locatePolicies(lines) {
  const policiesIdx = lines.findIndex((l) => /^policies:/.test(l));
  if (policiesIdx < 0) return null;
  if (splitComment(lines[policiesIdx].slice("policies:".length)).value !== "") {
    throw new UnsupportedLayoutError("`policies:` has an inline value");
  }

  let end = lines.length;
  for (let i = policiesIdx + 1; i < lines.length; i++) {
    if (/^[^\s#]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  while (end > policiesIdx + 1 && lines[end - 1].trim() === "") end--;

  let levelIndent = null;
  const headers = [];
  for (let i = policiesIdx + 1; i < end; i++) {
    const m = lines[i].match(KEY_LINE);
    if (!m || m[1].length === 0) continue;
    if (levelIndent === null) levelIndent = m[1].length;
    if (m[1].length !== levelIndent) continue;
    if (LEVELS.includes(m[2]) && splitComment(m[3]).value !== "") {
      throw new UnsupportedLayoutError(`\`${m[2]}:\` has an inline value`);
    }
    headers.push({ level: m[2], idx: i });
  }

  const levels = {};
  headers.forEach((h, n) => {
    const blockEnd = n + 1 < headers.length ? headers[n + 1].idx : end;
    let keyIndent = null;
    let modeIdx = -1;
    for (let i = h.idx + 1; i < blockEnd; i++) {
      const km = lines[i].match(KEY_LINE);
      if (!km || km[1].length <= levelIndent) continue;
      if (keyIndent === null) keyIndent = km[1].length;
      if (km[2] === "implement_mode" && km[1].length === keyIndent) modeIdx = i;
    }
    levels[h.level] = { headerIdx: h.idx, keyIndent: keyIndent ?? levelIndent + 2, modeIdx };
  });

  return { end, levelIndent: levelIndent ?? 2, levels };
}

function implementModeLine(line, mode) {
  const [, indent, , rest] = line.match(KEY_LINE);
  const { value, gap, comment } = splitComment(rest);
  if (!comment) return `${indent}implement_mode: ${mode}`;
  return `${indent}implement_mode: ${mode}${value === "" ? " " : gap}${comment}`;
}

// Returns the new file text with `implement_mode: <mode>` set for each level
// in `targets`, editing in place where the key exists and inserting only the
// missing lines. Line endings and the presence of a final newline follow the
// original text. Edits are applied bottom-up so earlier indices stay valid.
function spliceImplementMode(text, targets, mode) {
  const source = text ?? "";
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const finalEol = source === "" || /\n$/.test(source);
  const lines = source === "" ? [] : source.split(/\r?\n/);
  if (finalEol && lines.at(-1) === "") lines.pop();

  let located = locatePolicies(lines);
  if (!located) {
    lines.push("policies:");
    located = locatePolicies(lines);
  }

  const edits = [];
  const appended = [];
  for (const level of targets) {
    const entry = located.levels[level];
    if (!entry) {
      appended.push(
        `${" ".repeat(located.levelIndent)}${level}:`,
        `${" ".repeat(located.levelIndent + 2)}implement_mode: ${mode}`,
      );
    } else if (entry.modeIdx >= 0) {
      edits.push({ idx: entry.modeIdx, replace: implementModeLine(lines[entry.modeIdx], mode) });
    } else {
      edits.push({
        idx: entry.headerIdx + 1,
        insert: `${" ".repeat(entry.keyIndent)}implement_mode: ${mode}`,
      });
    }
  }

  if (appended.length > 0) lines.splice(located.end, 0, ...appended);
  edits.sort((a, b) => b.idx - a.idx);
  for (const e of edits) {
    if (e.replace !== undefined) lines[e.idx] = e.replace;
    else lines.splice(e.idx, 0, e.insert);
  }

  return lines.join(eol) + (finalEol ? eol : "");
}

// The document the splice must produce: the original parse with only
// `policies.<target>.implement_mode` set (creating `policies` and the level
// when absent). Anything else differing means the edit was not faithful.
function expectedDocument(before, targets, mode) {
  const doc = structuredClone(before ?? {});
  if (doc.policies == null) doc.policies = {};
  for (const level of targets) {
    if (doc.policies[level] == null) doc.policies[level] = {};
    doc.policies[level].implement_mode = mode;
  }
  return doc;
}

/** Thrown when the prompt ends without a valid choice; `message` is operator-facing. */
class NoChoiceError extends Error {
  constructor(message) {
    super(message);
    this.name = "NoChoiceError";
  }
}

const INPUT_CLOSED = "input closed before a valid choice was made; nothing was written.";

// Reads through the readline async iterator, not rl.question(): on piped
// stdin a second rl.question() can wait forever for a 'line' event that
// already fired, while the iterator serves one buffered line per call and
// resolves `done` at EOF.
async function promptChoice(scripted, iterator) {
  const question = `  Choose implement rigor (type ${CHOICES.join(", ")}): `;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let answer;
    if (scripted) {
      console.log(question);
      if (scripted.length === 0) throw new NoChoiceError(INPUT_CLOSED);
      answer = scripted.shift();
    } else {
      process.stdout.write(question);
      const { value, done } = await iterator.next();
      if (done) throw new NoChoiceError(INPUT_CLOSED);
      answer = value;
    }
    const idx = choiceIndex(answer);
    if (idx >= 0) return CHOICES[idx];
    const remaining = MAX_ATTEMPTS - attempt;
    console.log(
      `  ${JSON.stringify(answer)} is not one of ${CHOICES.join(", ")} (typed exactly, lowercase).` +
        (remaining > 0 ? ` ${remaining} attempt${remaining === 1 ? "" : "s"} left.` : ""),
    );
  }
  throw new NoChoiceError(
    `no valid choice after ${MAX_ATTEMPTS} attempts; nothing was written. Re-run and type ${CHOICES.join(", ")}, or pass --mode.`,
  );
}

function printLiteWarning() {
  console.log("");
  console.log("  [lite warning]");
  console.log("  With lite, per-task review is skipped for route-eligible tasks:");
  console.log("  /adev:implement runs them inline with no per-task reviewer, and");
  console.log("  their review is deferred to /adev:validate. A post-task tripwire");
  console.log("  still escalates a task that touches undeclared, sensitive or");
  console.log("  boundary paths, and high-risk specs never resolve lite.");
  console.log("");
}

/**
 * @param {{ projectRoot: string, argv: string[], manifest: any, __scriptedInput?: string[] }} ctx
 */
export async function run({ projectRoot, argv, manifest: _manifest, __scriptedInput }) {
  const args = parseArgs(argv);

  if (args.mode !== undefined && choiceIndex(args.mode) < 0) {
    failInvalid(
      `--mode must be one of ${CHOICES.join(", ")} (exact, lowercase); got ${JSON.stringify(args.mode)}. Nothing was written.`,
    );
  }
  if (args.preset !== undefined && !PRESETS.includes(args.preset)) {
    failInvalid(
      `--preset must be one of ${PRESETS.join(", ")}; got ${JSON.stringify(args.preset)}. Nothing was written.`,
    );
  }

  const policiesPath = join(projectRoot, POLICIES_REL);
  const text = existsSync(policiesPath) ? readFileSync(policiesPath, "utf8") : null;
  const refuse = (reason) =>
    failInvalid(
      `${policiesPath} ${reason}; set implement_mode by hand or fix the file; nothing was written.`,
    );
  let before = null;
  if (text !== null) {
    try {
      before = parseYaml(text) ?? {};
    } catch (err) {
      refuse(`does not parse (${err?.message ?? String(err)})`);
    }
    if (typeof before !== "object" || Array.isArray(before)) refuse("is not a YAML mapping");
    if (before.policies != null && (typeof before.policies !== "object" || Array.isArray(before.policies))) {
      refuse("has a `policies` value that is not a mapping");
    }
  }
  const existing = {};
  for (const level of LEVELS) {
    const value = before?.policies?.[level]?.implement_mode;
    existing[level] = typeof value === "string" && value !== "" ? value : null;
  }
  const interactive = args.mode === undefined && process.stdin.isTTY === true;

  let chosen;
  let targets;

  if (args.mode !== undefined || interactive) {
    if (interactive) {
      console.log("");
      console.log("  Implement Rigor");
      console.log("  ───────────────");
      console.log(
        `  Stored: ${LEVELS.map((l) => `${l}=${existing[l] ?? "(none)"}`).join(", ")}`,
      );
      console.log("");
      console.log("  - lite    route-eligible tasks run inline, no per-task review");
      console.log("  - quick   one synthesized reviewer per task (default)");
      console.log("  - full    spec-compliance then code-quality review per task");
      console.log("");

      const scripted = Array.isArray(__scriptedInput) ? [...__scriptedInput] : null;
      const rl = scripted
        ? null
        : readline.createInterface({ input: process.stdin, output: process.stdout });
      const iterator = rl ? rl[Symbol.asyncIterator]() : null;
      try {
        chosen = await promptChoice(scripted, iterator);
      } catch (err) {
        if (err instanceof NoChoiceError) failInvalid(err.message);
        throw err;
      } finally {
        if (rl) rl.close();
      }
    } else {
      chosen = CHOICES[choiceIndex(args.mode)];
    }
    targets = chosen === "full" ? ["high", "medium", "low"] : ["medium", "low"];
  } else {
    const tier = args.preset ?? readRiskTier(projectRoot);
    const preset = PRESETS.includes(tier) ? tier : "standard";
    chosen = PRESET_DEFAULTS[preset];
    const eligible = chosen === "full" ? ["high", "medium", "low"] : ["medium", "low"];
    targets = eligible.filter((level) => existing[level] === null);
    console.log("");
    console.log(`  Implement rigor (non-interactive, preset ${preset}): default ${chosen}`);
  }

  if (chosen === "lite") printLiteWarning();

  const nonInteractiveDefault = !interactive && args.mode === undefined;
  if (nonInteractiveDefault && text === null && chosen === "quick") {
    targets = [];
  }

  if (targets.length > 0) {
    let next;
    try {
      next = spliceImplementMode(text, targets, chosen);
    } catch (err) {
      if (err instanceof UnsupportedLayoutError) refuse(`has a layout the splice-edit cannot update (${err.message})`);
      throw err;
    }
    let after;
    try {
      after = parseYaml(next);
      parseRigorPolicies(next, policiesPath);
    } catch (err) {
      refuse(`could not be updated safely (${err?.message ?? String(err)})`);
    }
    if (!isDeepStrictEqual(after, expectedDocument(before, targets, chosen))) {
      refuse("has a layout the splice-edit cannot update faithfully");
    }
    if (next !== text) {
      mkdirSync(dirname(policiesPath), { recursive: true });
      writeFileSync(policiesPath, next);
    }
    console.log("");
    if (targets.includes("high") && existing.high === "lite") {
      console.log(`  Replaced illegal high.implement_mode: lite with ${chosen}.`);
    }
    console.log(`  Wrote: implement_mode: ${chosen} (${targets.join(", ")})`);
  } else if (text === null) {
    console.log("");
    console.log(`  No ${POLICIES_REL}; the implement quick fallback applies. Nothing written.`);
  } else {
    console.log("");
    console.log("  Kept: existing implement_mode values; nothing overwritten.");
  }

  if (nonInteractiveDefault) {
    console.log("  Note: lite is available through --mode lite.");
  }
  console.log("");
}

export default { run, help };
