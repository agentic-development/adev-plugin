export function enqueueJob(name, payload) {
  return { name, payload, queued: true };
}
