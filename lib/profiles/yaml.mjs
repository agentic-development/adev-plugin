/**
 * Minimal YAML parser for profile + tool-category YAML files.
 *
 * Supports the subset needed by execution profiles:
 *   - nested maps via indent (2 spaces)
 *   - lists: `- <scalar>` or `- <flow-map>` or `- key: value` (block map item)
 *   - flow maps: `{ key: value, key: value }` (string/number/boolean scalars)
 *   - comments starting with `#`
 *   - quoted and unquoted scalars
 *   - booleans (`true`/`false`), integers, `null`
 *
 * Intentionally small. Not a general YAML parser. Zero dependencies.
 *
 * Throws `YamlParseError` with a line-cited message on malformed input.
 */

export class YamlParseError extends Error {
  constructor(message, line) {
    super(line ? `YAML: ${message} (line ${line})` : `YAML: ${message}`);
    this.name = "YamlParseError";
    this.line = line ?? null;
  }
}

/**
 * Parse a YAML string to a JS value (object / array / scalar).
 * @param {string} source
 * @returns {any}
 */
export function parseYaml(source) {
  const lines = preprocess(source);
  const [value] = parseBlock(lines, 0, -1);
  return value ?? {};
}

function preprocess(source) {
  const out = [];
  const raw = source.split(/\r?\n/);
  for (let i = 0; i < raw.length; i++) {
    const rawLine = raw[i];
    // Strip trailing comments that are NOT inside quotes or braces.
    const stripped = stripComment(rawLine);
    if (stripped.trim() === "") continue;
    const indent = stripped.match(/^( *)/)[1].length;
    out.push({ indent, text: stripped.slice(indent), lineNum: i + 1 });
  }
  return out;
}

function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  let inBrace = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble && c === "{") inBrace++;
    else if (!inSingle && !inDouble && c === "}") inBrace--;
    else if (!inSingle && !inDouble && inBrace === 0 && c === "#") {
      return line.slice(0, i).trimEnd();
    }
  }
  return line.trimEnd();
}

/**
 * Parse a block (map or sequence) at indent > parentIndent.
 * Returns [value, nextIndex].
 */
function parseBlock(lines, index, parentIndent) {
  if (index >= lines.length) return [null, index];
  const firstIndent = lines[index].indent;
  if (firstIndent <= parentIndent) return [null, index];

  // Sequence?
  if (lines[index].text.startsWith("- ") || lines[index].text === "-") {
    return parseSequence(lines, index, firstIndent);
  }
  // Otherwise, block map.
  return parseMap(lines, index, firstIndent);
}

function parseMap(lines, index, indent) {
  const obj = {};
  while (index < lines.length) {
    const cur = lines[index];
    if (cur.indent < indent) break;
    if (cur.indent > indent) {
      throw new YamlParseError(
        `unexpected indentation (expected ${indent}, got ${cur.indent})`,
        cur.lineNum
      );
    }
    // sequence item at map level → caller mis-guessed; bail so caller can re-parse as sequence
    if (cur.text.startsWith("- ") || cur.text === "-") break;

    const m = cur.text.match(/^([^:\s][^:]*?):(?:\s+(.+))?\s*$/);
    if (!m) {
      throw new YamlParseError(
        `expected "key: value" — got: ${JSON.stringify(cur.text)}`,
        cur.lineNum
      );
    }
    const key = unquote(m[1].trim());
    const rest = m[2];
    index++;
    if (rest === undefined || rest === "") {
      const [child, next] = parseBlock(lines, index, indent);
      obj[key] = child ?? {};
      index = next;
    } else {
      obj[key] = parseInlineValue(rest, cur.lineNum);
    }
  }
  return [obj, index];
}

function parseSequence(lines, index, indent) {
  const arr = [];
  while (index < lines.length) {
    const cur = lines[index];
    if (cur.indent < indent) break;
    if (cur.indent > indent) {
      throw new YamlParseError(
        `unexpected indentation in sequence (expected ${indent}, got ${cur.indent})`,
        cur.lineNum
      );
    }
    if (!cur.text.startsWith("-")) break;
    const after = cur.text === "-" ? "" : cur.text.slice(2);
    index++;

    if (after === "") {
      const [child, next] = parseBlock(lines, index, indent);
      arr.push(child ?? null);
      index = next;
      continue;
    }

    // "- key: value" → a block map item whose first key is on this line
    const mapStart = after.match(/^([^:{\[\s][^:]*?):(?:\s+(.+))?\s*$/);
    if (mapStart && !after.startsWith("{") && !after.startsWith("[")) {
      const firstKey = unquote(mapStart[1].trim());
      const firstRest = mapStart[2];
      const item = {};
      if (firstRest === undefined || firstRest === "") {
        const [child, next] = parseBlock(lines, index, indent + 2);
        item[firstKey] = child ?? {};
        index = next;
      } else {
        item[firstKey] = parseInlineValue(firstRest, cur.lineNum);
      }
      // Subsequent keys at indent + 2
      while (index < lines.length && lines[index].indent > indent) {
        const next = lines[index];
        if (next.text.startsWith("- ") || next.text === "-") break;
        const innerIndent = next.indent;
        const [childMap, after2] = parseMap(lines, index, innerIndent);
        for (const [k, v] of Object.entries(childMap)) item[k] = v;
        index = after2;
        break; // parseMap consumes the whole contiguous block
      }
      arr.push(item);
      continue;
    }

    arr.push(parseInlineValue(after, cur.lineNum));
  }
  return [arr, index];
}

function parseInlineValue(raw, lineNum) {
  const s = raw.trim();
  if (s === "") return "";
  if (s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith("{") && s.endsWith("}")) return parseFlowMap(s, lineNum);
  if (s.startsWith("[") && s.endsWith("]")) return parseFlowSeq(s, lineNum);
  return unquote(s);
}

function parseFlowMap(s, lineNum) {
  const inner = s.slice(1, -1).trim();
  if (inner === "") return {};
  const pairs = splitFlow(inner, ",");
  const obj = {};
  for (const pair of pairs) {
    const colonAt = findTopLevelColon(pair);
    if (colonAt < 0) {
      throw new YamlParseError(`flow-map entry missing ':': ${pair}`, lineNum);
    }
    const k = unquote(pair.slice(0, colonAt).trim());
    const v = pair.slice(colonAt + 1).trim();
    obj[k] = parseInlineValue(v, lineNum);
  }
  return obj;
}

function parseFlowSeq(s, lineNum) {
  const inner = s.slice(1, -1).trim();
  if (inner === "") return [];
  return splitFlow(inner, ",").map((p) => parseInlineValue(p.trim(), lineNum));
}

function splitFlow(s, delim) {
  const out = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble && (c === "{" || c === "[")) depth++;
    else if (!inSingle && !inDouble && (c === "}" || c === "]")) depth--;
    else if (!inSingle && !inDouble && depth === 0 && c === delim) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim()).filter((x) => x !== "");
}

function findTopLevelColon(s) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble && (c === "{" || c === "[")) depth++;
    else if (!inSingle && !inDouble && (c === "}" || c === "]")) depth--;
    else if (!inSingle && !inDouble && depth === 0 && c === ":") return i;
  }
  return -1;
}

function unquote(s) {
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1);
  }
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") {
    return s.slice(1, -1);
  }
  return s;
}
