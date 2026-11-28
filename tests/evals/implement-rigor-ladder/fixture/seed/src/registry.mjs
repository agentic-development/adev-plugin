function healthHandler() {
  return { status: 200, body: { ok: true } };
}

export const handlers = {
  health: healthHandler,
};

export function dispatch(name, ...args) {
  const handler = Object.hasOwn(handlers, name) ? handlers[name] : null;
  if (!handler) return { status: 404 };
  return handler(...args);
}
