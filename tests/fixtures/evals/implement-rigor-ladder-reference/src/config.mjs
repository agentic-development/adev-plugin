const DEFAULTS = { pageSize: 20, currency: 'USD' };

function invalid(reason) {
  const err = new Error(`CONFIG_INVALID: ${reason}`);
  err.code = 'CONFIG_INVALID';
  return err;
}

export function parseConfig(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw invalid('not valid JSON');
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw invalid('not an object');
  if ('pageSize' in doc && !(Number.isInteger(doc.pageSize) && doc.pageSize > 0)) {
    throw invalid('pageSize must be a positive integer');
  }
  return {
    pageSize: doc.pageSize ?? DEFAULTS.pageSize,
    currency: doc.currency ?? DEFAULTS.currency,
  };
}
