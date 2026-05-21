/**
 * Session summary persistence — write and read structured markdown
 * session summaries with YAML frontmatter.
 *
 * Uses only Node.js built-ins (fs/promises, path, crypto).
 * Pure ESM, named exports.
 */

import { mkdir, writeFile, readFile, access } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// redactSecrets — SEC-1, SEC-9: scrub secrets before they are rendered into
// the session summary markdown body. Order matters: PEM blocks are processed
// first because they are multiline containers that may include narrower
// secret patterns inside.
// ─────────────────────────────────────────────────────────────────────────────

const REDACTION_PATTERNS = [
  // PEM private-key blocks (multiline). Process first.
  {
    re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END \1?PRIVATE KEY-----/g,
    replacement: "[REDACTED:private-key]",
  },
  // AWS access keys
  { re: /AKIA[A-Z0-9]{16}/g, replacement: "[REDACTED:aws-access-key]" },
  // GitHub tokens (ghp_, gho_, ghs_, ghr_, ghu_)
  {
    re: /gh[pousr]_[A-Za-z0-9]{36,}/g,
    replacement: "[REDACTED:github-token]",
  },
  // OpenAI / Anthropic sk- keys (hyphen separator; sk-ant-… included)
  {
    re: /sk-(?:ant-)?[A-Za-z0-9_-]{20,}/g,
    replacement: "[REDACTED:llm-key]",
  },
  // Stripe sk_live_ / sk_test_ keys (underscore separator; do NOT collapse
  // with the LLM-key pattern)
  {
    re: /sk_(?:live|test)_[0-9A-Za-z]{24,}/g,
    replacement: "[REDACTED:stripe-key]",
  },
  // Slack tokens (xoxa, xoxb, xoxp, xoxr, xoxs)
  {
    re: /xox[abprs]-[0-9A-Za-z-]+/g,
    replacement: "[REDACTED:slack-token]",
  },
  // Google API keys
  { re: /AIza[0-9A-Za-z_-]{35}/g, replacement: "[REDACTED:google-api-key]" },
  // Generic JWTs (three dot-separated base64-ish parts)
  {
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: "[REDACTED:jwt]",
  },
  // Authorization: Bearer headers (per spec SEC-1, the replacement collapses
  // both the "Bearer" keyword and the token into [REDACTED:bearer])
  {
    re: /Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi,
    replacement: "Authorization: [REDACTED:bearer]",
  },
  // env-style KEY=VALUE secrets (api_key, token, secret, password, auth,
  // private_key — case-insensitive, hyphen or underscore separator).
  // Order: this runs LAST. We exclude `[REDACTED:...]` placeholders so that
  // values already redacted by an earlier (more specific) pattern are not
  // re-mangled into the generic env-secret token.
  {
    re: /(?<head>(?:^|[^A-Za-z0-9_])(?:api[_-]?key|token|secret|password|auth|private[_-]?key)\s*=\s*)(?!\[REDACTED:)\S+/gi,
    replacement: "$<head>[REDACTED:env-secret]",
  },
];

/**
 * Redact secrets in arbitrary text. Applies a fixed ordered list of regexes
 * matching common secret shapes. Returns the input unchanged when no pattern
 * matches. Non-string input becomes the empty string (graceful degradation;
 * the caller is responsible for invariant preservation upstream).
 *
 * @param {string} text
 * @returns {string}
 */
export function redactSecrets(text) {
  if (typeof text !== "string") return "";
  let out = text;
  for (const { re, replacement } of REDACTION_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// fromTranscript — read a Claude Code transcript JSONL and render the
// session-summary markdown body. Applies redactSecrets unconditionally.
// Returns kind: 'session-end' on success; kind: 'placeholder' on any failure
// (filesystem, parse, empty). Never throws.
//
// Optional metadata fields extracted from the transcript per SEC-12/SEC-13:
//   - inputTokens  (Number.isInteger, 0 ≤ v < 1e9)
//   - outputTokens (Number.isInteger, 0 ≤ v < 1e9)
//   - costUsd      (Number.isFinite, 0 ≤ v < 1e6, 4 decimals)
//   - model        (^[A-Za-z0-9._-]{1,64}$)
// Validation failures OMIT the field from metadata; required keys
// (kind, session_id, date) are unaffected.
// ─────────────────────────────────────────────────────────────────────────────

function validateInputTokens(v) {
  return Number.isInteger(v) && v >= 0 && v < 1e9 ? v : undefined;
}
function validateOutputTokens(v) {
  return Number.isInteger(v) && v >= 0 && v < 1e9 ? v : undefined;
}
function validateCostUsd(v) {
  return Number.isFinite(v) && v >= 0 && v < 1e6 ? Number(v.toFixed(4)) : undefined;
}
const MODEL_RE = /^[A-Za-z0-9._-]{1,64}$/;
function validateModel(v) {
  return typeof v === "string" && MODEL_RE.test(v) ? v : undefined;
}

function extractMessageText(line) {
  // Claude Code transcript JSONL has multiple shapes. Try common ones; missing
  // shapes contribute nothing (silent skip).
  if (!line || typeof line !== "object") return null;
  // Shape A: { role, message: { content } }
  const msg = line.message;
  if (msg && typeof msg.content === "string") return msg.content;
  if (msg && Array.isArray(msg.content)) {
    // content blocks — string-block items have a `text` field
    return msg.content
      .map((b) => (typeof b === "string" ? b : b?.text))
      .filter(Boolean)
      .join("\n");
  }
  // Shape B: top-level { role, content }
  if (typeof line.content === "string") return line.content;
  return null;
}

function extractRole(line) {
  if (!line || typeof line !== "object") return null;
  if (typeof line.role === "string") return line.role;
  if (line.message && typeof line.message.role === "string") return line.message.role;
  if (line.type === "user" || line.type === "assistant") return line.type;
  return null;
}

function extractUsage(line) {
  const usage = line?.message?.usage || line?.usage;
  if (!usage || typeof usage !== "object") return null;
  return usage;
}

function extractModel(line) {
  return line?.message?.model || line?.model || null;
}

/**
 * Parse a transcript JSONL file and render a session-summary markdown body.
 * Always returns a result object — never throws.
 *
 * @param {string} transcriptPath
 * @param {object} [opts] - Reserved for future options (unused at present).
 * @returns {Promise<{ kind: 'session-end' | 'placeholder', body: string, metadata?: object }>}
 */
export async function fromTranscript(transcriptPath, _opts = {}) {
  let raw;
  try {
    raw = await readFile(transcriptPath, "utf8");
  } catch {
    return {
      kind: "placeholder",
      body: "_Transcript unavailable — placeholder summary._\n",
    };
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return {
      kind: "placeholder",
      body: "_Transcript empty — placeholder summary._\n",
    };
  }

  // Parse each line; collect role+text and usage metadata. Tolerate parse
  // failures per line (skip silently) so a single bad line does not poison
  // the whole transcript.
  const turns = [];
  const modelCounts = new Map();
  let lastModel = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let anyParsed = false;

  for (const lineText of lines) {
    let parsed;
    try {
      parsed = JSON.parse(lineText);
    } catch {
      continue; // tolerate malformed line
    }
    anyParsed = true;

    const role = extractRole(parsed);
    const text = extractMessageText(parsed);
    if (role && text) turns.push({ role, text });

    const usage = extractUsage(parsed);
    if (usage) {
      if (typeof usage.input_tokens === "number") {
        inputTokens += usage.input_tokens;
      }
      if (typeof usage.output_tokens === "number") {
        outputTokens += usage.output_tokens;
      }
      if (typeof usage.cost_usd === "number") {
        costUsd += usage.cost_usd;
      }
    }

    const model = extractModel(parsed);
    if (model && typeof model === "string") {
      modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
      lastModel = model;
    }
  }

  if (!anyParsed) {
    return {
      kind: "placeholder",
      body: "_Transcript could not be parsed — placeholder summary._\n",
    };
  }

  // Render the markdown body with redaction applied per turn.
  const bodyLines = ["## Conversation", ""];
  for (const t of turns) {
    const redacted = redactSecrets(t.text);
    bodyLines.push(`### ${t.role}`, "", redacted, "");
  }
  const body = bodyLines.join("\n");

  // Resolve most-frequent model (ties broken by last-used).
  let bestModel = null;
  let bestCount = -1;
  for (const [m, c] of modelCounts) {
    if (c > bestCount || (c === bestCount && m === lastModel)) {
      bestModel = m;
      bestCount = c;
    }
  }

  // Validate optional metadata fields per SEC-12/SEC-13.
  const metadata = {};
  const it = validateInputTokens(inputTokens);
  if (it !== undefined && it > 0) metadata.inputTokens = it;
  const ot = validateOutputTokens(outputTokens);
  if (ot !== undefined && ot > 0) metadata.outputTokens = ot;
  const cu = validateCostUsd(costUsd);
  if (cu !== undefined && cu > 0) metadata.costUsd = cu;
  const mv = validateModel(bestModel);
  if (mv !== undefined) metadata.model = mv;

  return {
    kind: "session-end",
    body,
    metadata,
  };
}

/**
 * Convert a camelCase key to kebab-case.
 * @param {string} key
 * @returns {string}
 */
function toKebab(key) {
  return key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Convert a kebab-case key to camelCase.
 * @param {string} key
 * @returns {string}
 */
function toCamel(key) {
  return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Serialize a metadata value for YAML frontmatter.
 * Arrays become YAML flow sequences; everything else is a plain scalar.
 * @param {*} value
 * @returns {string}
 */
function yamlValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${value.join(", ")}]`;
  }
  return String(value);
}

/**
 * Build the markdown content for a session summary.
 * @param {string} condensed - The condensed transcript / content body.
 * @param {object} metadata - Metadata fields (camelCase keys).
 * @returns {string}
 */
function buildMarkdown(condensed, metadata) {
  const frontmatterLines = ["---"];
  for (const [key, value] of Object.entries(metadata)) {
    frontmatterLines.push(`${toKebab(key)}: ${yamlValue(value)}`);
  }
  frontmatterLines.push("---");

  return `${frontmatterLines.join("\n")}\n\n${condensed}\n`;
}

/**
 * Generate a short hash from the condensed content + timestamp.
 * @param {string} condensed
 * @returns {string} 7-char hex hash
 */
function shortHash(condensed) {
  return createHash("sha256")
    .update(condensed + Date.now())
    .digest("hex")
    .slice(0, 7);
}

/**
 * Check if a file exists.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a session summary to disk.
 *
 * File naming: `<date>-<short-hash>.md`
 * Duplicate names get a counter suffix (e.g., `-2.md`).
 * Creates outputDir if missing. Never throws — logs a warning on failure.
 *
 * @param {string} condensed - The condensed session content.
 * @param {object} metadata - Session metadata (camelCase keys: date, type, mode, agent, specsTouched, commits).
 * @param {string} outputDir - Directory to write the summary file into.
 * @returns {Promise<string|null>} The written file path, or null on failure.
 */
export async function writeSummary(condensed, metadata, outputDir) {
  try {
    await mkdir(outputDir, { recursive: true });

    const date = metadata.date || new Date().toISOString().slice(0, 10);
    const hash = shortHash(condensed);
    const baseName = `${date}-${hash}`;

    let fileName = `${baseName}.md`;
    let filePath = join(outputDir, fileName);
    let counter = 1;

    while (await fileExists(filePath)) {
      counter += 1;
      fileName = `${baseName}-${counter}.md`;
      filePath = join(outputDir, fileName);
    }

    const markdown = buildMarkdown(condensed, metadata);
    await writeFile(filePath, markdown, "utf8");
    return filePath;
  } catch (err) {
    console.warn(`[session-summary] writeSummary failed: ${err.message}`);
    return null;
  }
}

/**
 * Parse simple YAML frontmatter from a markdown string.
 * Returns an object with kebab-case keys converted to camelCase.
 * @param {string} raw
 * @returns {{ metadata: object, body: string } | null}
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const [, yamlBlock, body] = match;
  const metadata = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Parse YAML flow sequences
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      value = inner.length === 0 ? [] : inner.split(",").map((s) => s.trim());
    }

    metadata[toCamel(key)] = value;
  }

  return { metadata, body: body.trim() };
}

/**
 * Parse content sections from the markdown body.
 * Looks for ## headings matching the known section names.
 * @param {string} body
 * @returns {object}
 */
function parseSections(body) {
  const sectionMap = {
    intent: "intent",
    outcome: "outcome",
    learnings: "learnings",
    friction: "friction",
    open_items: "openItems",
    "open items": "openItems",
  };

  const sections = {
    intent: null,
    outcome: null,
    learnings: null,
    friction: null,
    openItems: null,
  };

  // Split body by ## headings
  const parts = body.split(/^## /m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf("\n");
    if (newlineIdx === -1) continue;
    const heading = part.slice(0, newlineIdx).trim().toLowerCase();
    const content = part.slice(newlineIdx + 1).trim();

    const key = sectionMap[heading];
    if (key) {
      sections[key] = content || null;
    }
  }

  return sections;
}

/**
 * Read and parse a session summary file.
 *
 * Returns a structured object with metadata and content sections.
 * Returns null for non-existent files.
 * Returns a partial object for malformed files.
 *
 * @param {string} summaryPath - Absolute path to the summary markdown file.
 * @returns {Promise<{ metadata: object, content: object } | null>}
 */
export async function readSummary(summaryPath) {
  let raw;
  try {
    raw = await readFile(summaryPath, "utf8");
  } catch {
    return null;
  }

  const parsed = parseFrontmatter(raw);

  if (!parsed) {
    // Malformed — no valid frontmatter. Return partial object.
    return {
      metadata: {},
      content: parseSections(raw),
    };
  }

  return {
    metadata: parsed.metadata,
    content: parseSections(parsed.body),
  };
}
