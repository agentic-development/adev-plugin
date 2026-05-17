// Child process script used by json-adapter-cas-concurrency.test.mjs.
// Reads projectRoot + idx from argv, performs one mutation against the
// shared tasks.json, and writes a JSON result to stdout. Always exits 0;
// the orchestrating test inspects the stdout payload.

import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";

const projectRoot = process.argv[2];
const idx = process.argv[3];

const adapter = new JsonAdapter(projectRoot);

try {
  const issue = await adapter.create({ title: `child-${idx}`, type: "task" });
  process.stdout.write(JSON.stringify({ status: "committed", id: issue.id, title: issue.title }));
  process.exit(0);
} catch (err) {
  process.stdout.write(
    JSON.stringify({ status: "stale", code: err.code, message: err.message }),
  );
  process.exit(0);
}
