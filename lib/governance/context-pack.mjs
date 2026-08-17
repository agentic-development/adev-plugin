/**
 * Context-pack resolver.
 *
 * Shared between configurable-reviewers and configurable-checks specs.
 *
 * A pack is a named bundle of file globs (with an optional `extends` chain)
 * that is rendered into a single concatenated string for inclusion in a
 * subagent prompt.
 *
 * Contract (reviewer spec Behaviors 20-22, validate spec Behavior 23):
 *   - Pack name resolution: bundled defaults first; project `governance/*.yaml`
 *     entries layer on top (same name → full replacement).
 *   - `extends`: recursive; cycles fail load.
 *   - Glob includes: matched files concatenated, each wrapped in a per-render
 *     nonce fence `<<<ADEV-PACK-<nonce> path="<rel>">>> … <<<END-ADEV-PACK-<nonce>>>>`.
 *     Empty globs emit a `role="no-matches"` fence containing `<no matches>`.
 *   - `delivery: manifest` (BEH-10) inlines no bodies at all: each include emits
 *     ONE `role="path-manifest"` fence listing its matched repo-root-relative
 *     paths, one per line. `delivery: inline` is the default and is unchanged.
 *   - Denylist: `.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`,
 *     `**` + `/secrets/**` — matching globs fail load (not WARN). A denylisted
 *     file reached through a WILDCARD include is skipped with a WARN instead
 *     (Behavior 22p-bis); an enumerated include naming one still fails.
 *   - Traversal guard: every concrete path must remain under repoRoot after
 *     `path.resolve` + `fs.realpath`. `..` segments in globs are rejected.
 *
 * Zero external deps; simple glob implementation (``*``, ``**``, ``?``).
 */

import {
  readFileSync,
  readdirSync,
  existsSync,
  realpathSync,
  statSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve, join, relative, dirname, sep, basename } from "node:path";

/** Literal fence prefixes that must never appear inside a rendered body. */
const FENCE_PREFIX_RE = /<<<(?=(?:END-)?ADEV-PACK-)/g;
/** U+2039 SINGLE LEFT-POINTING ANGLE QUOTATION MARK replaces the middle `<`. */
const NEUTRALIZED_PREFIX = "<‹<";

/** Behavior 22k: byte budgets, overridable per pack in YAML. */
const DEFAULT_MAX_FILE_BYTES = 16384;
const DEFAULT_MAX_TOTAL_BYTES = 262144;

/** BEH-9: closed set of per-pack delivery modes; `inline` is the default. */
const PACK_DELIVERY_MODES = ["inline", "manifest"];
const DEFAULT_PACK_DELIVERY = "inline";

const DENYLIST_PATTERNS = [
  /(^|\/)\.env($|[^/])/,         // .env, .env*, .env.local, .envrc, .env/xxx
  /\.pem($|[^/])/,
  /\.key($|[^/])/,
  /(^|\/)id_[^/]*/,              // id_rsa, id_rsa*, id_ed25519*, ...
  /(^|\/)profiles\.yaml$/,
  /(^|\/)secrets(\/|$)/,
];

/**
 * @param {Record<string, any>} bundledPacks  from templates/*.yaml
 * @param {Record<string, any>} projectPacks  from governance/*.yaml
 * @returns {{ packs: Record<string, any>, warnings: any[], errors: any[] }}
 */
export function mergePacks(bundledPacks, projectPacks) {
  const warnings = [];
  const errors = [];
  const packs = { ...(bundledPacks || {}) };
  for (const [name, entry] of Object.entries(projectPacks || {})) {
    if (packs[name]) {
      warnings.push({
        code: "CONTEXT_PACK_OVERRIDE",
        message: `Context pack '${name}' overrides bundled default.`,
      });
    }
    packs[name] = entry;
  }
  return { packs, warnings, errors };
}

/**
 * Resolve a pack's effective include list by walking extends.
 * Returns the expanded include list (flattened, in order) plus the effective
 * byte budgets (Behavior 22k).
 *
 * Budget precedence: the pack's own `max_file_bytes` / `max_total_bytes` wins;
 * otherwise the nearest ancestor that declares one; otherwise the defaults.
 * This is the ONLY place budgets are computed — `renderPack` reads
 * `resolved.budgets` and never reaches into `packs[name]` directly, so an
 * `extends` chain can never be silently bypassed.
 *
 * `delivery` (BEH-9) follows the SAME precedence rule as the budgets: the
 * nearest declaration in the chain wins, defaulting to `inline`. It is a closed
 * enum — an unrecognised value anywhere in the chain fails load with
 * `INVALID_PACK_DELIVERY` rather than falling back silently.
 *
 * @returns {{ includes: any[], budgets: { maxFileBytes: number, maxTotalBytes: number }, delivery?: "inline"|"manifest", errors: any[] }}
 *   `delivery` is absent on the error paths, which return early.
 */
export function resolveExtends(packName, packs) {
  const errors = [];
  const seen = new Set();
  const chain = [];
  let cur = packName;
  while (cur !== undefined) {
    if (seen.has(cur)) {
      errors.push({
        code: "CONTEXT_PACK_CYCLE",
        message: `Context pack cycle detected: ${[...chain, cur].join(" → ")}.`,
      });
      return { includes: [], budgets: defaultBudgets(), errors };
    }
    if (!packs[cur]) {
      errors.push({
        code: "UNKNOWN_CONTEXT_PACK",
        message: `Unknown context pack '${cur}'${chain.length ? ` (referenced via ${chain.join(" → ")})` : ""}.`,
      });
      return { includes: [], budgets: defaultBudgets(), errors };
    }
    seen.add(cur);
    chain.push(cur);
    cur = packs[cur].extends;
  }

  // `chain` is child → root here, so the FIRST declaration found is the nearest.
  // This holds for the byte budgets and for `delivery` alike.
  let maxFileBytes;
  let maxTotalBytes;
  let delivery;
  for (const link of chain) {
    if (maxFileBytes === undefined && isPositiveInt(packs[link].max_file_bytes)) {
      maxFileBytes = packs[link].max_file_bytes;
    }
    if (maxTotalBytes === undefined && isPositiveInt(packs[link].max_total_bytes)) {
      maxTotalBytes = packs[link].max_total_bytes;
    }
    // Validate EVERY link's declared value, not just the winning one: a typo in
    // an ancestor that the child happens to override is still an authoring
    // error and must fail loud.
    const declared = packs[link].delivery;
    if (declared !== undefined) {
      if (!PACK_DELIVERY_MODES.includes(declared)) {
        errors.push({
          code: "INVALID_PACK_DELIVERY",
          message: `Context pack '${link}': delivery '${declared}' is not recognised — expected one of ${PACK_DELIVERY_MODES.join(", ")}.`,
        });
        return { includes: [], budgets: defaultBudgets(), errors };
      }
      if (delivery === undefined) delivery = declared;
    }
  }
  const budgets = {
    maxFileBytes: maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    maxTotalBytes: maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
  };

  // Walk root → child so child includes come last.
  chain.reverse();
  const includes = [];
  for (const link of chain) {
    const list = packs[link].include ?? [];
    for (const inc of list) includes.push(inc);
  }
  return { includes, budgets, delivery: delivery ?? DEFAULT_PACK_DELIVERY, errors };
}

function defaultBudgets() {
  return {
    maxFileBytes: DEFAULT_MAX_FILE_BYTES,
    maxTotalBytes: DEFAULT_MAX_TOTAL_BYTES,
  };
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * Truncate a UTF-8 buffer to at most `maxBytes`, never splitting a code point.
 *
 * If the first excluded byte is a continuation byte (`10xxxxxx`) the cut landed
 * mid-character, so we walk back until it does not. Behavior 22l.
 *
 * @param {Buffer} buf
 * @param {number} maxBytes
 * @returns {{ text: string, kept: number, total: number, truncated: boolean }}
 */
function truncateToBytes(buf, maxBytes) {
  if (buf.length <= maxBytes) {
    return { text: buf.toString("utf8"), kept: buf.length, total: buf.length, truncated: false };
  }
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return {
    text: buf.subarray(0, end).toString("utf8"),
    kept: end,
    total: buf.length,
    truncated: true,
  };
}

/**
 * Render a pack to a single string.
 *
 * @param {string} packName
 * @param {Record<string, any>} packs
 * @param {{ repoRoot: string, targetSpecPath?: string }} ctx
 * @returns {{ rendered: string, files: string[], nonce: string, warnings: any[], errors: any[] }}
 */
export function renderPack(packName, packs, ctx) {
  const { repoRoot, targetSpecPath } = ctx;
  const warnings = [];
  const errors = [];
  const sections = [];
  const files = [];
  // Behavior 22g: one nonce per render call, shared by every section it emits.
  const nonce = randomBytes(12).toString("base64url");

  const resolved = resolveExtends(packName, packs);
  errors.push(...resolved.errors);
  if (resolved.errors.length) {
    return { rendered: "", files: [], nonce, warnings, errors };
  }
  const { budgets } = resolved;
  // BEH-10: a manifest pack names paths for the reviewer to read *around* the
  // target spec, so the target spec is what the whole manifest is relative to.
  // Rendering one without a target is a misconfiguration, and it must fail even
  // when no include happens to carry a `<charter-dir>` / `<target-spec>` token —
  // token expansion alone would let `docs/*.md` slip through silently.
  if (resolved.delivery === "manifest" && !targetSpecPath) {
    errors.push({
      code: "CONTEXT_PACK_NO_TARGET",
      message: `Context pack '${packName}': delivery 'manifest' requires a targetSpecPath, but none was supplied.`,
    });
    return { rendered: "", files: [], nonce, warnings, errors };
  }

  // ---- Pass 1: resolve every include to concrete files ---------------------
  // The full matched set must be known BEFORE emission begins, so the aggregate
  // truncation notice can report a total that spans all includes (Behavior 22m).
  //
  // Every unit carries the `includeIndex` it came from, plus the manifest header
  // title resolved for that include. The inline branch ignores both fields — it
  // consumes `plan` as the flat list it always did, which is what keeps inline
  // output byte-identical to rev 4 — while the manifest branch groups on
  // `includeIndex` to satisfy BEH-10's one-section-per-include rule without a
  // second parallel structure to keep in sync.
  /** @type {Array<{kind:"file",abs:string,rel:string,includeIndex:number,manifestTitle:string|null}|{kind:"no-matches",attrs:string,includeIndex:number,manifestTitle:string|null}>} */
  const plan = [];

  for (let includeIndex = 0; includeIndex < resolved.includes.length; includeIndex++) {
    const entry = resolved.includes[includeIndex];
    const { glob, title, exclude } = normalizeInclude(entry);
    // Behavior 22f: expand target-relative tokens BEFORE any guard runs, so the
    // traversal/denylist guards see the concrete glob rather than the token.
    const expanded = expandTargetTokens(glob, targetSpecPath);
    if (expanded.needsTarget) {
      errors.push({
        code: "CONTEXT_PACK_NO_TARGET",
        message: `Context pack '${packName}': include '${glob}' uses a target-relative token but no targetSpecPath was supplied.`,
      });
      continue;
    }
    const effectiveGlob = expanded.value;

    const excludePatterns = [];
    let excludeNeedsTarget = false;
    for (const pattern of exclude) {
      const expandedExclude = expandTargetTokens(pattern, targetSpecPath);
      if (expandedExclude.needsTarget) {
        errors.push({
          code: "CONTEXT_PACK_NO_TARGET",
          message: `Context pack '${packName}': include '${pattern}' uses a target-relative token but no targetSpecPath was supplied.`,
        });
        excludeNeedsTarget = true;
        break;
      }
      excludePatterns.push(expandedExclude.value);
    }
    if (excludeNeedsTarget) continue;

    if (containsDotDot(effectiveGlob)) {
      errors.push({
        code: "CONTEXT_PACK_TRAVERSAL",
        message: `Context pack '${packName}': glob '${effectiveGlob}' contains '..' — path traversal is rejected.`,
      });
      continue;
    }
    if (isDenied(effectiveGlob)) {
      errors.push({
        code: "CONTEXT_PACK_DENYLIST",
        message: `Context pack '${packName}': glob '${effectiveGlob}' matches denylisted pattern (secrets/keys). Remove this include.`,
      });
      continue;
    }
    // Behavior 22p-bis: classify the include ONCE, from the EXPANDED glob. An
    // include with no `*`/`?` names a concrete path — it is *enumerated*, and the
    // author is on the hook for what it points at. Anything else is a wildcard
    // whose match set the author cannot fully predict.
    const isWildcard = /[*?]/.test(effectiveGlob);

    // BEH-10 title fallback chain: the include's declared `title`, else the glob
    // string, else nothing at all. `null` means the manifest header omits the
    // `title` attribute ENTIRELY — never `title=""`.
    const manifestTitle = title ?? (effectiveGlob || null);

    const matched = expandGlob(effectiveGlob, repoRoot);
    // Filter matched files through denylist + traversal guard
    const safe = [];
    for (const abs of matched) {
      let realPath;
      try {
        realPath = realpathSync(abs);
      } catch {
        continue; // vanished between readdir and realpath
      }
      if (!isUnderRoot(realPath, repoRoot)) {
        errors.push({
          code: "CONTEXT_PACK_ESCAPE",
          message: `Context pack '${packName}': resolved path '${abs}' escapes repo root via symlink — rejected.`,
        });
        continue;
      }
      const relPath = toPosix(relative(realpathSync(repoRoot), realPath));
      if (isDeniedPath(relPath)) {
        // Severity splits on how the file was named. A project that drops a
        // `profiles.yaml` into `.context-index/governance/` must not brick review
        // for the whole repo — a wildcard include swept it up incidentally, so we
        // skip the file and warn. Naming a secret file directly is an authoring
        // mistake in the pack itself and must fail loudly.
        if (isWildcard) {
          warnings.push({
            code: "CONTEXT_PACK_DENYLIST_SKIP",
            message: `Context pack '${packName}': skipping denylisted file '${relPath}' matched by wildcard include '${effectiveGlob}'.`,
          });
          continue;
        }
        errors.push({
          code: "CONTEXT_PACK_DENYLIST_MATCH",
          message: `Context pack '${packName}': matched file '${relPath}' is on the denylist.`,
        });
        continue;
      }
      if (excludePatterns.some((pattern) => matchesPattern(relPath, pattern))) {
        continue;
      }
      safe.push({ abs: realPath, rel: relPath });
    }

    if (safe.length === 0) {
      plan.push({
        kind: "no-matches",
        attrs: `path="${title ?? effectiveGlob}" role="no-matches"`,
        includeIndex,
        manifestTitle,
      });
      continue;
    }

    // Behavior 22n: within a single include, matched files sort by repo-relative
    // path in BYTE order. Never `localeCompare` — its collation is locale
    // dependent, which would make truncation non-reproducible across machines.
    safe.sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
    for (const unit of safe) plan.push({ kind: "file", ...unit, includeIndex, manifestTitle });
  }

  // ---- Pass 2 (manifest delivery): one path-manifest section per include ----
  // BEH-10. Each include becomes a single nonce-fenced `role="path-manifest"`
  // section whose body is one repo-root-relative path per line; an include that
  // matched nothing still emits its section, with body `<no matches>`. Because
  // `plan` is built in include declaration order and byte-sorted within each
  // include, a sequential scan over `includeIndex` preserves BEH-5's ordering
  // guarantee for free.
  //
  // No body is inlined here. `buildReviewerDispatches` appends the target spec
  // separately as its own `role="target-spec"` section carrying THIS nonce, so
  // inlining it here would ship the spec twice in every prompt.
  //
  // No `role="truncation-notice"` is emitted and no file is dropped: BEH-10
  // states that no file is omitted for budget reasons, so `omitted` is never
  // accumulated on this path rather than accumulated and then ignored.
  // KNOWN GAP (adev-plugin-j7pq.7): manifest caps are declared with no enforcement path — see SA-2
  if (resolved.delivery === "manifest") {
    for (let i = 0; i < plan.length; ) {
      const { includeIndex, manifestTitle } = plan[i];
      const group = [];
      while (i < plan.length && plan[i].includeIndex === includeIndex) group.push(plan[i++]);
      const attrs =
        manifestTitle == null
          ? 'role="path-manifest"'
          : `role="path-manifest" title="${manifestTitle}"`;
      // Sourced from the POST-denylist `safe` set, so a secret swept up by a
      // wildcard include is named neither in the body nor in `files`.
      const rels = group.filter((unit) => unit.kind === "file").map((unit) => unit.rel);
      const body = rels.length ? rels.join("\n") : "<no matches>";
      sections.push(fenceBlock({ nonce, attrs, body }).text);
      files.push(...rels);
    }
    return { rendered: sections.join("\n"), files, nonce, warnings, errors };
  }

  // ---- Pass 2: emit under the running byte budget --------------------------
  // Behavior 22m. `matchedTotal` counts every concrete file the includes matched,
  // across ALL includes, so the aggregate notice reports a stable denominator no
  // matter where the cap happened to land.
  const matchedTotal = plan.reduce((n, unit) => n + (unit.kind === "file" ? 1 : 0), 0);
  const omitted = [];
  let totalBytes = 0;

  for (let i = 0; i < plan.length; i++) {
    const unit = plan[i];

    if (unit.kind === "no-matches") {
      const empty = fenceBlock({ nonce, attrs: unit.attrs, body: "<no matches>" });
      // A no-matches section is emitted text that reaches the prompt, so it
      // counts against max_total_bytes like any other section.
      totalBytes += sectionCost(empty.text, sections.length);
      sections.push(empty.text);
      continue;
    }

    let buf;
    try {
      buf = readFileSync(unit.abs);
    } catch (e) {
      warnings.push({
        code: "CONTEXT_PACK_READ",
        message: `Context pack '${packName}': could not read '${unit.rel}': ${e.message}`,
      });
      continue;
    }

    // Behavior 22l: per-file cap. Truncation is never an error.
    const cut = truncateToBytes(buf, budgets.maxFileBytes);
    let body = cut.text;
    if (cut.truncated) {
      body += `…[adev: truncated ${cut.kept} of ${cut.total} bytes of ${unit.rel} — per-file cap ${budgets.maxFileBytes}]`;
    }

    const block = fenceBlock({ nonce, attrs: `path="${unit.rel}"`, body });
    const cost = sectionCost(block.text, sections.length);
    if (totalBytes + cost > budgets.maxTotalBytes) {
      // Cumulative cap hit. Stop emitting file sections and name every file
      // still outstanding — including those from includes we have not reached —
      // so a reviewer can Glob/Grep them on demand. Metadata only: the bodies of
      // omitted files are never read.
      for (let j = i; j < plan.length; j++) {
        if (plan[j].kind === "file") omitted.push(plan[j].rel);
      }
      break;
    }

    if (block.collided) {
      warnings.push({
        code: "CONTEXT_PACK_FENCE_COLLISION",
        message: `Context pack '${packName}': file '${unit.rel}' contains a literal pack fence token — neutralized.`,
      });
    }
    totalBytes += cost;
    sections.push(block.text);
    files.push(unit.rel);
  }

  if (omitted.length) {
    // Exactly one aggregate notice, appended last. It is deliberately exempt
    // from max_total_bytes: it is the report ABOUT the overflow, so truncating
    // it because of the overflow would be self-defeating.
    const notice = fenceBlock({
      nonce,
      attrs: 'role="truncation-notice"',
      body: `…[adev: pack truncated — ${omitted.length} of ${matchedTotal} matched files omitted at the ${budgets.maxTotalBytes}-byte cap. Omitted: ${omitted.join(", ")}]`,
    });
    sections.push(notice.text);
  }

  return { rendered: sections.join("\n"), files, nonce, warnings, errors };
}

/**
 * Byte cost of adding `text` as the next section, including the "\n" that
 * `sections.join("\n")` will insert before it. Fence delimiters are counted:
 * the budget bounds what actually enters the reviewer's context window, and the
 * fence lines are part of that payload.
 */
function sectionCost(text, sectionCount) {
  return Buffer.byteLength(text, "utf8") + (sectionCount > 0 ? 1 : 0);
}

/**
 * Rewrite any literal pack-fence prefix found in a body so it can never be
 * mistaken for a real fence line.
 *
 * Per review note SEC-1 the detection is nonce-INDEPENDENT: the literal
 * prefixes `<<<ADEV-PACK-` and `<<<END-ADEV-PACK-` are neutralized regardless
 * of the trailing token, so a body cannot probe for the live nonce either.
 *
 * @param {string} body
 * @returns {{ body: string, collided: boolean }}
 */
export function neutralizeFenceTokens(body) {
  const raw = typeof body === "string" ? body : String(body ?? "");
  FENCE_PREFIX_RE.lastIndex = 0;
  if (!FENCE_PREFIX_RE.test(raw)) return { body: raw, collided: false };
  FENCE_PREFIX_RE.lastIndex = 0;
  return { body: raw.replace(FENCE_PREFIX_RE, NEUTRALIZED_PREFIX), collided: true };
}

/**
 * Wrap a body in a nonce-scoped pack fence. The body always passes through
 * `neutralizeFenceTokens` here, so no call site can forget to sanitize.
 *
 * @param {{ nonce: string, attrs: string, body: string }} params
 * @returns {{ text: string, collided: boolean }}
 */
export function fenceBlock({ nonce, attrs, body }) {
  const { body: neutralized, collided } = neutralizeFenceTokens(body);
  return {
    text: `<<<ADEV-PACK-${nonce} ${attrs}>>>\n${neutralized}\n<<<END-ADEV-PACK-${nonce}>>>`,
    collided,
  };
}

function normalizeInclude(entry) {
  if (typeof entry === "string") return { glob: entry, title: null, exclude: [] };
  if (entry && typeof entry === "object") {
    return {
      glob: entry.glob ?? entry.path ?? "",
      title: entry.title ?? null,
      exclude: entry.exclude ?? [],
    };
  }
  return { glob: "", title: null, exclude: [] };
}

function toPosix(value) {
  return sep === "/" ? value : value.split(sep).join("/");
}

/**
 * Expand target-relative tokens in an include glob or exclude pattern.
 *
 *   `<target-spec>`  → the POSIX-normalized targetSpecPath
 *   `<charter-dir>`  → the POSIX dirname of targetSpecPath (no trailing slash)
 *
 * @param {string} value
 * @param {string|undefined} targetSpecPath
 * @returns {{ value: string, needsTarget: boolean }} `needsTarget` is true when
 *   the input carried a token but no targetSpecPath was supplied; `value` is
 *   then returned unchanged and the caller must skip the include rather than
 *   render a literal token.
 */
export function expandTargetTokens(value, targetSpecPath) {
  const raw = typeof value === "string" ? value : "";
  const hasToken = raw.includes("<target-spec>") || raw.includes("<charter-dir>");
  if (!hasToken) return { value: raw, needsTarget: false };
  if (!targetSpecPath) return { value: raw, needsTarget: true };

  const target = toPosix(targetSpecPath);
  const charterDir = toPosix(dirname(targetSpecPath));
  return {
    value: raw
      .split("<target-spec>")
      .join(target)
      .split("<charter-dir>")
      .join(charterDir),
    needsTarget: false,
  };
}

/**
 * Match a POSIX repo-relative path against a glob pattern (`*`, `**`, `?`).
 */
function matchesPattern(relPath, pattern) {
  const pathSegments = relPath.split("/").filter(Boolean);
  const patternSegments = pattern.split("/").filter(Boolean);
  return matchSegments(pathSegments, 0, patternSegments, 0);
}

function matchSegments(pathSegments, pathIndex, patternSegments, patternIndex) {
  if (patternIndex === patternSegments.length) {
    return pathIndex === pathSegments.length;
  }
  const seg = patternSegments[patternIndex];
  if (seg === "**") {
    for (let i = pathIndex; i <= pathSegments.length; i++) {
      if (matchSegments(pathSegments, i, patternSegments, patternIndex + 1)) {
        return true;
      }
    }
    return false;
  }
  if (pathIndex === pathSegments.length) return false;
  if (!globToRegex(seg).test(pathSegments[pathIndex])) return false;
  return matchSegments(pathSegments, pathIndex + 1, patternSegments, patternIndex + 1);
}

function containsDotDot(glob) {
  return glob.split("/").some((seg) => seg === ".." || seg === "./..");
}

function isDenied(glob) {
  return DENYLIST_PATTERNS.some((re) => re.test(glob));
}

function isDeniedPath(path) {
  return DENYLIST_PATTERNS.some((re) => re.test(path));
}

function isUnderRoot(abs, root) {
  const resolvedRoot = realpathSync(root);
  const rel = relative(resolvedRoot, abs);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !rel.startsWith("..");
}

/**
 * Expand a glob (supporting `*`, `**`, `?`) relative to rootDir.
 * Returns absolute paths of matching files (not directories).
 */
export function expandGlob(glob, rootDir) {
  const segments = glob.split("/").filter(Boolean);
  if (segments.length === 0) return [];
  return walk(rootDir, segments, 0);
}

function walk(currentDir, segments, index) {
  if (index === segments.length) {
    try {
      const st = statSync(currentDir);
      return st.isFile() ? [currentDir] : [];
    } catch {
      return [];
    }
  }
  const seg = segments[index];
  let entries;
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  if (seg === "**") {
    // Match zero+ segments
    out.push(...walk(currentDir, segments, index + 1));
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      const next = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        out.push(...walk(next, segments, index)); // stay on **
      }
    }
    return out;
  }
  const matcher = globToRegex(seg);
  for (const entry of entries) {
    if (!matcher.test(entry.name)) continue;
    const next = join(currentDir, entry.name);
    if (index === segments.length - 1) {
      // final segment
      if (entry.isFile()) out.push(next);
    } else if (entry.isDirectory()) {
      out.push(...walk(next, segments, index + 1));
    }
  }
  return out;
}

function globToRegex(seg) {
  let re = "";
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if ("^$.+(){}[]\\|".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp("^" + re + "$");
}
