import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..');
const FIXTURES = resolve(PLUGIN_ROOT, 'tests', 'fixtures', 'sample-project', 'src');

// Dynamic imports — modules under test
let typescript;
let initParser, loadGrammar, parseFile;

describe('Language Query Module: TypeScript', () => {
  before(async () => {
    typescript = (await import('../../lib/repomap/languages/typescript.mjs')).default;
  });

  it('exports correct shape', () => {
    assert.equal(typeof typescript.language, 'string');
    assert.equal(typescript.language, 'typescript');

    assert.ok(Array.isArray(typescript.extensions));
    assert.ok(typescript.extensions.includes('.ts'));
    assert.ok(typescript.extensions.includes('.tsx'));
    assert.ok(typescript.extensions.includes('.js'));
    assert.ok(typescript.extensions.includes('.jsx'));

    assert.equal(typeof typescript.queries, 'object');
    assert.equal(typeof typescript.queries.exports, 'string');
    assert.equal(typeof typescript.queries.imports, 'string');

    assert.equal(typeof typescript.kindMap, 'object');
    assert.ok('function_declaration' in typescript.kindMap);
    assert.ok('class_declaration' in typescript.kindMap);
    assert.ok('interface_declaration' in typescript.kindMap);
    assert.ok('type_alias_declaration' in typescript.kindMap);
    assert.ok('enum_declaration' in typescript.kindMap);
  });

  it('kindMap maps to canonical kinds', () => {
    assert.equal(typescript.kindMap.function_declaration, 'function');
    assert.equal(typescript.kindMap.class_declaration, 'class');
    assert.equal(typescript.kindMap.interface_declaration, 'interface');
    assert.equal(typescript.kindMap.type_alias_declaration, 'type');
    assert.equal(typescript.kindMap.enum_declaration, 'enum');
  });
});

describe('AST Parser', () => {
  let parser;
  let lang;

  before(async () => {
    ({ initParser, loadGrammar, parseFile } = await import('../../lib/repomap/parse.mjs'));
    typescript = (await import('../../lib/repomap/languages/typescript.mjs')).default;

    parser = await initParser();
    const wasmPath = resolve(PLUGIN_ROOT, 'node_modules', 'tree-sitter-typescript', 'tree-sitter-typescript.wasm');
    lang = await loadGrammar(parser, wasmPath);
  });

  it('initParser returns a parser instance', () => {
    assert.ok(parser);
    assert.equal(typeof parser.parse, 'function');
  });

  it('loadGrammar returns a language instance', () => {
    assert.ok(lang);
  });

  it('parses a simple TypeScript file with known exports', () => {
    const code = `
export function hello(): void {}
export class Greeter {}
export const VALUE = 42;
`;
    const { symbols, imports } = parseFile(code, lang, typescript.queries, typescript.kindMap);
    const names = symbols.map(s => s.name);

    assert.ok(names.includes('hello'), 'should find function hello');
    assert.ok(names.includes('Greeter'), 'should find class Greeter');
    assert.ok(names.includes('VALUE'), 'should find const VALUE');

    const helloSym = symbols.find(s => s.name === 'hello');
    assert.equal(helloSym.kind, 'function');

    const greeterSym = symbols.find(s => s.name === 'Greeter');
    assert.equal(greeterSym.kind, 'class');

    const valueSym = symbols.find(s => s.name === 'VALUE');
    assert.equal(valueSym.kind, 'constant');
  });

  it('parses types.ts — interfaces, types, enum', () => {
    const code = readFileSync(resolve(FIXTURES, 'types.ts'), 'utf-8');
    const { symbols } = parseFile(code, lang, typescript.queries, typescript.kindMap);
    const names = symbols.map(s => s.name);

    assert.ok(names.includes('User'), 'should find interface User');
    assert.ok(names.includes('Task'), 'should find interface Task');
    assert.ok(names.includes('TaskFilter'), 'should find type TaskFilter');
    assert.ok(names.includes('TaskStatus'), 'should find enum TaskStatus');

    const userSym = symbols.find(s => s.name === 'User');
    assert.equal(userSym.kind, 'interface');

    const filterSym = symbols.find(s => s.name === 'TaskFilter');
    assert.equal(filterSym.kind, 'type');

    const statusSym = symbols.find(s => s.name === 'TaskStatus');
    assert.equal(statusSym.kind, 'enum');
  });

  it('parses utils.ts — arrow function exports', () => {
    const code = readFileSync(resolve(FIXTURES, 'utils.ts'), 'utf-8');
    const { symbols } = parseFile(code, lang, typescript.queries, typescript.kindMap);
    const names = symbols.map(s => s.name);

    assert.ok(names.includes('format'), 'should find arrow fn format');
    assert.ok(names.includes('toUpperCase'), 'should find arrow fn toUpperCase');
    assert.ok(names.includes('clamp'), 'should find function clamp');

    // Arrow functions assigned to const are 'function' kind
    const formatSym = symbols.find(s => s.name === 'format');
    assert.equal(formatSym.kind, 'function');

    const clampSym = symbols.find(s => s.name === 'clamp');
    assert.equal(clampSym.kind, 'function');
  });

  it('parses utils.ts — destructured exports', () => {
    const code = readFileSync(resolve(FIXTURES, 'utils.ts'), 'utf-8');
    const { symbols } = parseFile(code, lang, typescript.queries, typescript.kindMap);
    const names = symbols.map(s => s.name);

    assert.ok(names.includes('parse'), 'should find destructured export parse');
    assert.ok(names.includes('stringify'), 'should find destructured export stringify');
  });

  it('parses services/index.ts — re-exports captured as imports', () => {
    const code = readFileSync(resolve(FIXTURES, 'services', 'index.ts'), 'utf-8');
    const { imports } = parseFile(code, lang, typescript.queries, typescript.kindMap);

    assert.ok(imports.length >= 2, 'should have at least 2 re-export import entries');

    const taskServiceImport = imports.find(i => i.source === './task-service');
    assert.ok(taskServiceImport, 'should find import from ./task-service');
    assert.ok(taskServiceImport.symbols.includes('createTask'));
    assert.ok(taskServiceImport.symbols.includes('listTasks'));

    const userServiceImport = imports.find(i => i.source === './user-service');
    assert.ok(userServiceImport, 'should find import from ./user-service');
    assert.ok(userServiceImport.symbols.includes('getUser'));
  });

  it('parses db.ts — external import from fs captured', () => {
    const code = readFileSync(resolve(FIXTURES, 'db.ts'), 'utf-8');
    const { imports } = parseFile(code, lang, typescript.queries, typescript.kindMap);

    const fsImport = imports.find(i => i.source === 'fs');
    assert.ok(fsImport, 'should find import from fs');
    assert.ok(fsImport.symbols.includes('readFileSync'));
    assert.equal(fsImport.isTypeOnly, false);
  });

  it('parses db.ts — default export captured', () => {
    const code = readFileSync(resolve(FIXTURES, 'db.ts'), 'utf-8');
    const { symbols } = parseFile(code, lang, typescript.queries, typescript.kindMap);
    const names = symbols.map(s => s.name);

    assert.ok(names.includes('Database'), 'should find exported class Database');
  });

  it('handles import type statements', () => {
    const code = `import type { Foo } from './bar';`;
    const { imports } = parseFile(code, lang, typescript.queries, typescript.kindMap);

    const barImport = imports.find(i => i.source === './bar');
    assert.ok(barImport, 'should find type import');
    assert.equal(barImport.isTypeOnly, true);
  });

  it('handles namespace imports', () => {
    const code = `import * as ns from './w';`;
    const { imports } = parseFile(code, lang, typescript.queries, typescript.kindMap);

    const wImport = imports.find(i => i.source === './w');
    assert.ok(wImport, 'should find namespace import');
    assert.ok(wImport.symbols.includes('*'));
  });

  it('returns empty results on invalid code gracefully', () => {
    const code = null;
    const { symbols, imports } = parseFile(code, lang, typescript.queries, typescript.kindMap);
    assert.ok(Array.isArray(symbols));
    assert.ok(Array.isArray(imports));
    assert.equal(symbols.length, 0);
    assert.equal(imports.length, 0);
  });
});
