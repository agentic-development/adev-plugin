/**
 * Architectural conformance test — `FileAdapter` vs `JsonAdapter`.
 *
 * Both adapters implement `IssueManagerInterface`. The public method surface
 * (names + arities) must remain identical so the registry can hand back
 * either instance without changing call sites.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { FileAdapter } from "../../../lib/issues/file-adapter.mjs";
import { JsonAdapter } from "../../../lib/issues/json-adapter.mjs";

const PUBLIC_METHODS = [
  "init",
  "create",
  "update",
  "close",
  "list",
  "get",
  "listEpics",
  "createEpic",
  "updateEpic",
  "addDependency",
  "walkTree",
];

describe("adapter conformance — public method surface", () => {
  for (const method of PUBLIC_METHODS) {
    it(`both adapters expose a "${method}" method`, () => {
      assert.equal(typeof FileAdapter.prototype[method], "function", `FileAdapter.${method}`);
      assert.equal(typeof JsonAdapter.prototype[method], "function", `JsonAdapter.${method}`);
    });

    it(`"${method}" has matching arity on both adapters`, () => {
      const fileArity = FileAdapter.prototype[method].length;
      const jsonArity = JsonAdapter.prototype[method].length;
      assert.equal(
        fileArity,
        jsonArity,
        `arity drift on ${method}: FileAdapter=${fileArity}, JsonAdapter=${jsonArity}`
      );
    });
  }
});

describe("adapter conformance — JsonAdapter does not import FileAdapter (SA-3)", () => {
  it("JsonAdapter source contains no FileAdapter import", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../../lib/issues/json-adapter.mjs", import.meta.url)),
      "utf8"
    );
    assert.ok(
      !/from\s+['"]\.\/file-adapter\.mjs['"]/m.test(src),
      "JsonAdapter must not import FileAdapter — the shared parser " +
        "(lib/issues/markdown-parser.mjs) is the only allowed bridge."
    );
  });
});

describe("adapter conformance — JsonAdapter writes only via _write() (architectural)", () => {
  it("JsonAdapter source contains no writeFile/writeFileSync targeting tasks.json outside _write", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../../lib/issues/json-adapter.mjs", import.meta.url)),
      "utf8"
    );
    // Find all writeFile* call sites. The only one allowed is inside _write()
    // and it writes to `tmpName`, not the canonical filePath.
    const writeCalls = src.match(/writeFile(?:Sync)?\([^)]+\)/g) || [];
    assert.ok(writeCalls.length > 0, "expected at least one writeFile call inside _write");
    for (const call of writeCalls) {
      // Allow writes to a tmpName/tmpPath variable; forbid direct writes to filePath/the literal.
      assert.ok(
        !/tasks\.json['"]/.test(call) && !/this\.filePath/.test(call),
        `writeFile call writes directly to tasks.json outside _write(): ${call}`
      );
    }
  });
});
