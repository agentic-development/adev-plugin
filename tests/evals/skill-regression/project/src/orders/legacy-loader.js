const { readFileSync } = require("node:fs");

/**
 * Read a JSON order fixture off disk the way the v0.1 loader did.
 *
 * @param {string} path Absolute path to a JSON document.
 * @returns {object} The parsed document.
 */
function loadOrderFixture(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

module.exports = { loadOrderFixture };
