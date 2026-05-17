import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// Production code search dirs. Tests are excluded — they legitimately
// exercise adapter internals via monkey-patching for white-box testing
// (e.g., CAS retry tests stub _readWithSeq to inject conflicts).
const SEARCH_DIRS = ["lib", "cli", "hooks", "viz", "providers"];
const ADAPTER_REL_PATH = join("lib", "issues", "json-adapter.mjs");

// A consumer file is flagged only when both conditions are met:
//   (1) it imports from `json-adapter.mjs` (i.e., it's a JsonAdapter consumer)
//   (2) it calls `._read(` or `._write(` on something
// This avoids false positives from FileAdapter / markdown-parser, which
// happen to have methods with the same names but are not JsonAdapter.
const IMPORT_PATTERN = /from\s+["'][^"']*json-adapter\.mjs["']/;
const CALL_PATTERN = /\._read\(|\._write\(/;

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git") continue;
    const p = join(dir, entry);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(p, acc);
    else if (/\.(mjs|js|cjs)$/.test(p)) acc.push(p);
  }
  return acc;
}

test("JsonAdapter consumers do not invoke ._read() or ._write() directly", () => {
  const violations = [];
  for (const dirName of SEARCH_DIRS) {
    const dir = join(REPO_ROOT, dirName);
    for (const file of walk(dir)) {
      const rel = relative(REPO_ROOT, file);
      // The adapter file itself defines these methods.
      if (rel === ADAPTER_REL_PATH) continue;
      const content = readFileSync(file, "utf8");
      // Only flag consumers that import from json-adapter.mjs.
      if (!IMPORT_PATTERN.test(content)) continue;
      if (CALL_PATTERN.test(content)) {
        violations.push(rel);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `External JsonAdapter consumers calling ._read/_write found:\n  ${violations.join("\n  ")}\n` +
      `These methods are internal-only. Mutators should call the public API; ` +
      `if read access is needed, call _readWithSeq() (also internal — production ` +
      `consumers should use list/get/listEpics/walkTree instead).`,
  );
});
