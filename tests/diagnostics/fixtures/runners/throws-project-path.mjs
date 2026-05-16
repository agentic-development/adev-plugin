// Runner that throws an error whose message embeds an absolute path under
// the project root. Used by the redaction tests to verify "project:" prefix
// rewrite (Behavior 3).
export function run(ctx) {
  const err = new Error(`failed at ${ctx.projectRoot}/some/leaked/path.mjs`);
  throw err;
}
