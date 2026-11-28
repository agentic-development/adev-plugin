import { after } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JsonAdapter } from "../../../lib/issues/json-adapter.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { contractCases } from "./contract-cases.mjs";

const dirs = [];
after(() => dirs.forEach(cleanupTempDir));

// JsonAdapter refuses a root without .context-index/manifest.yaml, so every case gets a fresh one.
function jsonProject() {
  const tmp = createTempDir();
  dirs.push(tmp);
  mkdirSync(join(tmp, ".context-index"), { recursive: true });
  writeFileSync(join(tmp, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return tmp;
}

contractCases(() => new JsonAdapter(jsonProject()));
