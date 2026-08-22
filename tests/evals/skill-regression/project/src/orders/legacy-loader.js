/**
 * Planted violation: `esm-violation`.
 *
 * The fixture constitution's principle 1 is "Pure ESM. Every module is `.mjs`
 * with `import` / `export`. A `require(...)` call or a `module.exports`
 * assignment is a defect." This file breaks it three ways at once — a `.js`
 * extension, a `require` call, and a `module.exports` assignment — inside a
 * package that declares `"type": "module"`.
 *
 * Its known-clean twin is `src/orders/create-order.mjs`, which is `.mjs` and
 * uses `import` / `export` throughout.
 */

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
