// Runner that throws an error whose message embeds an absolute path
// entirely outside projectRoot, pluginRoot, and $HOME. Used to verify
// `<external-path-redacted>` substitution.
export function run(_ctx) {
  throw new Error('failed at /opt/some-external/system.mjs');
}
