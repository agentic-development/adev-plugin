// Runner that throws an error whose message embeds an absolute path under
// $HOME (but outside projectRoot and pluginRoot). Used by redaction tests
// to verify "~/" rewrite.
import { homedir } from 'node:os';
export function run(_ctx) {
  throw new Error(`failed at ${homedir()}/some/home/path.mjs`);
}
