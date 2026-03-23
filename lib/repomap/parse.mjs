/**
 * AST parser for tree-sitter-based repomap.
 *
 * Provides functions to initialise web-tree-sitter, load grammar WASM files,
 * and extract exported symbols and import statements from source code.
 */

import { Parser, Language, Query } from 'web-tree-sitter';

/**
 * Initialise the web-tree-sitter runtime and return a ready Parser instance.
 *
 * Must be called once before any parsing or grammar loading.
 * @returns {Promise<Parser>}
 */
export async function initParser() {
  await Parser.init();
  return new Parser();
}

/**
 * Load a tree-sitter grammar from a WASM file and configure the parser to use it.
 *
 * @param {Parser} parserInstance — a Parser returned by `initParser()`
 * @param {string} wasmPath — absolute or relative path to the `.wasm` grammar file
 * @returns {Promise<Language>}
 */
export async function loadGrammar(parserInstance, wasmPath) {
  const lang = await Language.load(wasmPath);
  parserInstance.setLanguage(lang);
  return lang;
}

/**
 * Parse source code and extract exported symbols and import statements.
 *
 * @param {string} sourceCode — the source text to parse
 * @param {Language} language — a Language returned by `loadGrammar()`
 * @param {{ exports: string, imports: string }} queries — S-expression query strings
 * @param {Record<string, string>} kindMap — maps tree-sitter node types to canonical kinds
 * @returns {{ symbols: Array<{name: string, kind: string, line: number}>, imports: Array<{source: string, symbols: string[], isTypeOnly: boolean, isDynamic: boolean}> }}
 */
export function parseFile(sourceCode, language, queries, kindMap) {
  const empty = { symbols: [], imports: [] };

  if (typeof sourceCode !== 'string') {
    return empty;
  }

  try {
    // We need a parser instance to parse the code. Create a temporary one
    // with the given language.
    const tmpParser = new Parser();
    tmpParser.setLanguage(language);
    const tree = tmpParser.parse(sourceCode);

    if (!tree) {
      return empty;
    }

    const symbols = extractSymbols(tree, language, queries.exports, kindMap);
    const imports = extractImports(tree, language, queries.imports, sourceCode);

    tree.delete();
    tmpParser.delete();

    return { symbols, imports };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Run the exports query and build the symbols array.
 */
function extractSymbols(tree, language, queryString, kindMap) {
  const query = new Query(language, queryString);
  const matches = query.matches(tree.rootNode);
  const symbols = [];
  const seen = new Set();

  for (const match of matches) {
    const captureMap = Object.create(null);
    for (const cap of match.captures) {
      // Accumulate arrays for multi-capture names (e.g. destructured)
      if (!captureMap[cap.name]) {
        captureMap[cap.name] = [];
      }
      captureMap[cap.name].push(cap.node);
    }

    // Named export with direct identifier
    if (captureMap['export.name']) {
      for (const node of captureMap['export.name']) {
        const name = node.text;
        if (seen.has(name)) continue;
        seen.add(name);

        // Determine kind from the declaration node
        let kind = 'constant';
        if (captureMap['export.node']) {
          const declNode = captureMap['export.node'][0];
          kind = kindMap[declNode.type] || 'constant';

          // Arrow functions: lexical_declaration containing arrow_function
          if (declNode.type === 'lexical_declaration' && kind === 'constant') {
            const varDeclarator = declNode.namedChildren.find(c => c.type === 'variable_declarator');
            if (varDeclarator) {
              const valueNode = varDeclarator.namedChildren.find(c => c.type === 'arrow_function');
              if (valueNode) {
                kind = 'function';
              }
            }
          }
        }

        symbols.push({ name, kind, line: node.startPosition.row + 1 });
      }
    }

    // Destructured exports: export const { parse, stringify } = JSON
    if (captureMap['export.destructured']) {
      for (const node of captureMap['export.destructured']) {
        const name = node.text;
        if (seen.has(name)) continue;
        seen.add(name);
        symbols.push({ name, kind: 'constant', line: node.startPosition.row + 1 });
      }
    }

    // Default export by identifier: export default Foo
    if (captureMap['export.default']) {
      for (const node of captureMap['export.default']) {
        const name = node.text;
        if (seen.has(name)) continue;
        seen.add(name);
        symbols.push({ name, kind: 'constant', line: node.startPosition.row + 1 });
      }
    }
  }

  query.delete();
  return symbols;
}

/**
 * Run the imports query and build the imports array.
 *
 * Also handles re-exports (export { x } from './y') by running the exports
 * query and pulling out re-export captures.
 */
function extractImports(tree, language, importQueryString, sourceCode) {
  const importsBySource = new Map();

  // Helper to get or create an import entry
  function getEntry(source) {
    if (!importsBySource.has(source)) {
      importsBySource.set(source, {
        source,
        symbols: [],
        isTypeOnly: false,
        isDynamic: false,
      });
    }
    return importsBySource.get(source);
  }

  // --- Regular imports ---
  const importQuery = new Query(language, importQueryString);
  const importMatches = importQuery.matches(tree.rootNode);

  for (const match of importMatches) {
    const captureMap = Object.create(null);
    for (const cap of match.captures) {
      if (!captureMap[cap.name]) captureMap[cap.name] = [];
      captureMap[cap.name].push(cap.node);
    }

    const sourceNodes = captureMap['import.source'];
    if (!sourceNodes || sourceNodes.length === 0) continue;
    const source = sourceNodes[0].text;

    const entry = getEntry(source);

    // Check if this is a type-only import by looking at the import_statement node
    const importStmt = match.captures[0].node;
    let stmtNode = importStmt;
    while (stmtNode && stmtNode.type !== 'import_statement') {
      stmtNode = stmtNode.parent;
    }
    if (stmtNode) {
      // Check for the `type` keyword as direct child of import_statement
      for (let i = 0; i < stmtNode.childCount; i++) {
        const child = stmtNode.child(i);
        if (child.type === 'type' && child.text === 'type') {
          entry.isTypeOnly = true;
          break;
        }
      }
    }

    if (captureMap['import.name']) {
      for (const node of captureMap['import.name']) {
        entry.symbols.push(node.text);
      }
    }
    if (captureMap['import.namespace']) {
      for (const node of captureMap['import.namespace']) {
        entry.symbols.push('*');
      }
    }
    if (captureMap['import.default']) {
      for (const node of captureMap['import.default']) {
        entry.symbols.push(node.text);
      }
    }
  }
  importQuery.delete();

  // --- Re-exports (export { x } from './y') treated as imports ---
  // We need a separate query for re-exports since they use export_statement
  const reexportQueryString = `
(export_statement
  (export_clause
    (export_specifier
      name: (identifier) @reexport.name))
  source: (string
    (string_fragment) @reexport.source))
`;
  const reexportQuery = new Query(language, reexportQueryString);
  const reexportMatches = reexportQuery.matches(tree.rootNode);

  for (const match of reexportMatches) {
    const captureMap = Object.create(null);
    for (const cap of match.captures) {
      if (!captureMap[cap.name]) captureMap[cap.name] = [];
      captureMap[cap.name].push(cap.node);
    }

    const sourceNodes = captureMap['reexport.source'];
    if (!sourceNodes || sourceNodes.length === 0) continue;
    const source = sourceNodes[0].text;
    const entry = getEntry(source);

    if (captureMap['reexport.name']) {
      for (const node of captureMap['reexport.name']) {
        entry.symbols.push(node.text);
      }
    }
  }
  reexportQuery.delete();

  return Array.from(importsBySource.values());
}
