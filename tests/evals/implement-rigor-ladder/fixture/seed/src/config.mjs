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
  if (typeof doc !== 'object') throw invalid('not an object');
  return {
    pageSize: doc.pageSize ?? DEFAULTS.pageSize,
    currency: doc.currency ?? DEFAULTS.currency,
  };
}
