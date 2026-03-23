import ts from 'typescript';
import { writeFileSync, existsSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

/**
 * Map TypeScript SymbolFlags to a human-readable kind string.
 */
function symbolKind(flags) {
  if (flags & ts.SymbolFlags.Enum) return 'enum';
  if (flags & ts.SymbolFlags.Class) return 'class';
  if (flags & ts.SymbolFlags.Interface) return 'interface';
  if (flags & ts.SymbolFlags.TypeAlias) return 'type';
  if (flags & ts.SymbolFlags.Function) return 'function';
  if (flags & ts.SymbolFlags.Variable) return 'constant';
  if (flags & ts.SymbolFlags.Alias) return 'alias';
  return 'unknown';
}

/**
 * Find all .ts files in a directory recursively.
 */
function findTsFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      results.push(...findTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Extract import edges from a source file.
 */
function extractImportEdges(sourceFile, fromFile, repoRoot, program, edges) {
  ts.forEachChild(sourceFile, function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) return;

      const specifierText = moduleSpecifier.text;

      // Skip external packages (non-relative imports)
      if (!specifierText.startsWith('.') && !specifierText.startsWith('/')) return;

      // Resolve the import target
      const resolvedModule = ts.resolveModuleName(
        specifierText,
        sourceFile.fileName,
        program.getCompilerOptions(),
        ts.sys,
      );

      let resolvedFile;
      if (resolvedModule.resolvedModule) {
        resolvedFile = relative(repoRoot, resolvedModule.resolvedModule.resolvedFileName);
      } else {
        // Fallback: try common extensions
        const fromDir = dirname(sourceFile.fileName);
        for (const ext of ['.ts', '.tsx', '/index.ts']) {
          const candidate = resolve(fromDir, specifierText + ext);
          if (existsSync(candidate)) {
            resolvedFile = relative(repoRoot, candidate);
            break;
          }
        }
      }

      if (!resolvedFile || resolvedFile.includes('node_modules')) return;

      // Extract imported symbol names
      const importedSymbols = [];

      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (clause) {
          if (clause.name) {
            importedSymbols.push(clause.name.text);
          }
          if (clause.namedBindings) {
            if (ts.isNamedImports(clause.namedBindings)) {
              for (const el of clause.namedBindings.elements) {
                importedSymbols.push(el.name.text);
              }
            } else if (ts.isNamespaceImport(clause.namedBindings)) {
              importedSymbols.push(clause.namedBindings.name.text);
            }
          }
        }
      } else if (ts.isExportDeclaration(node)) {
        // Re-export: export { x, y } from './module'
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            importedSymbols.push(el.name.text);
          }
        }
      }

      if (importedSymbols.length > 0) {
        edges.push({
          from: fromFile,
          to: resolvedFile,
          symbols: importedSymbols,
        });
      }
    }

    ts.forEachChild(node, visit);
  });
}

/**
 * Generate ground truth symbols and edges for a TypeScript project.
 * @param {string} repoPath - Path to the project root
 * @param {string} outputDir - Directory to write output files
 * @returns {{ symbolCount: number, edgeCount: number }}
 */
export function generateGroundTruth(repoPath, outputDir) {
  const resolvedRepo = resolve(repoPath);
  const resolvedOutput = resolve(outputDir);

  // Find or create tsconfig
  let compilerOptions;
  const tsconfigPath = join(resolvedRepo, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    const configFile = ts.readConfigFile(tsconfigPath, p => readFileSync(p, 'utf-8'));
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, resolvedRepo);
    compilerOptions = parsed.options;
  } else {
    compilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      esModuleInterop: true,
      rootDir: resolvedRepo,
    };
  }

  // Find all .ts files
  const sourceFilePaths = findTsFiles(resolvedRepo);
  const program = ts.createProgram(sourceFilePaths, compilerOptions);
  const checker = program.getTypeChecker();

  const symbols = [];
  const edges = [];

  for (const sourceFile of program.getSourceFiles()) {
    const filePath = relative(resolvedRepo, sourceFile.fileName);

    // Skip node_modules and declaration files
    if (filePath.includes('node_modules') || sourceFile.isDeclarationFile) continue;
    // Skip files outside the repo
    if (filePath.startsWith('..')) continue;

    // Extract exported symbols
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol) {
      const exports = checker.getExportsOfModule(moduleSymbol);
      for (const exp of exports) {
        // Resolve alias to get the real symbol for kind detection
        let realSymbol = exp;
        if (exp.flags & ts.SymbolFlags.Alias) {
          realSymbol = checker.getAliasedSymbol(exp);
        }

        const kind = symbolKind(realSymbol.flags);

        // Get line number from the declaration
        let line = 1;
        const declarations = exp.getDeclarations?.() ?? realSymbol.getDeclarations?.() ?? [];
        if (declarations.length > 0) {
          const decl = declarations[0];
          const declFile = decl.getSourceFile();
          const pos = declFile.getLineAndCharacterOfPosition(decl.getStart());
          line = pos.line + 1; // 0-indexed to 1-indexed
        }

        // Skip default export duplicates
        if (exp.escapedName === 'default') continue;

        symbols.push({
          name: exp.getName(),
          kind,
          file: filePath,
          line,
        });
      }
    }

    // Extract import edges
    extractImportEdges(sourceFile, filePath, resolvedRepo, program, edges);
  }

  // Deduplicate edges by (from, to) — merge symbols
  const edgeMap = new Map();
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}`;
    if (edgeMap.has(key)) {
      const existing = edgeMap.get(key);
      for (const sym of edge.symbols) {
        if (!existing.symbols.includes(sym)) {
          existing.symbols.push(sym);
        }
      }
    } else {
      edgeMap.set(key, { ...edge });
    }
  }
  const dedupedEdges = Array.from(edgeMap.values());

  // Write output
  mkdirSync(resolvedOutput, { recursive: true });

  const symbolsOutput = {
    generated: new Date().toISOString(),
    symbols,
  };
  writeFileSync(join(resolvedOutput, 'ground-truth-symbols.json'), JSON.stringify(symbolsOutput, null, 2));

  const edgesOutput = {
    generated: new Date().toISOString(),
    edges: dedupedEdges,
  };
  writeFileSync(join(resolvedOutput, 'ground-truth-edges.json'), JSON.stringify(edgesOutput, null, 2));

  return { symbolCount: symbols.length, edgeCount: dedupedEdges.length };
}
