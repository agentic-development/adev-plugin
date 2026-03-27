export function publishEvent(topic, payload) {
  return { topic, payload, publishedAt: new Date().toISOString() };
}
