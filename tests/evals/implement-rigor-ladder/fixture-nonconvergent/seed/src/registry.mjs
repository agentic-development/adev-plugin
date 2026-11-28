/**
 * The health handler.
 *
 * @returns {{ status: number, body: { ok: boolean } }}
 * @throws nothing
 */
function healthHandler() {
  return { status: 200, body: { ok: true } };
}

export const handlers = {
  health: healthHandler,
};

/**
 * Calls the handler registered under `name`.
 *
 * @param {string} name
 * @param {...unknown} args
 * @returns {object}
 * @throws nothing
 */
export function dispatch(name, ...args) {
  const handler = Object.hasOwn(handlers, name) ? handlers[name] : null;
  if (!handler) return { status: 404 };
  return handler(...args);
}
