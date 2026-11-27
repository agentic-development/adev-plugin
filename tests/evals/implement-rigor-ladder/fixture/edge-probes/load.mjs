// A probe file imports the module under test dynamically, so a missing module
// or a missing export fails only the probes that need it, not every probe in
// the file (a static named import of an absent export fails at link time).
const LOAD_ERROR = Symbol('load-error');

export async function load(relativePath) {
  try {
    return await import(new URL(relativePath, import.meta.url));
  } catch (err) {
    return { [LOAD_ERROR]: err };
  }
}

export function fn(mod, name) {
  if (mod[LOAD_ERROR]) throw mod[LOAD_ERROR];
  if (typeof mod[name] !== 'function') throw new Error(`${name} is not an exported function`);
  return mod[name];
}

export function value(mod, name) {
  if (mod[LOAD_ERROR]) throw mod[LOAD_ERROR];
  if (!(name in mod)) throw new Error(`${name} is not exported`);
  return mod[name];
}
