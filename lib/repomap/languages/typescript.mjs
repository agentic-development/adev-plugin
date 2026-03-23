/**
 * TypeScript language query module for tree-sitter-based repomap.
 *
 * Exports a descriptor with tree-sitter S-expression queries for
 * extracting exported symbols and import statements from TypeScript
 * (and JavaScript) source files.
 */

const typescript = {
  language: 'typescript',

  extensions: ['.ts', '.tsx', '.js', '.jsx'],

  queries: {
    /**
     * Captures exported symbols.
     *
     * Capture names:
     *   @export.name        — the identifier of the exported symbol
     *   @export.node        — the declaration node (used for kind mapping)
     *   @export.default     — default-export identifier
     *   @export.destructured — destructured binding name (object pattern)
     *   @export.reexport.name — re-exported specifier name
     *   @export.reexport.source — source module string for re-exports
     */
    exports: `
; --- named function export ---
(export_statement
  (function_declaration
    name: (identifier) @export.name) @export.node)

; --- named class export ---
(export_statement
  (class_declaration
    name: (type_identifier) @export.name) @export.node)

; --- interface export ---
(export_statement
  (interface_declaration
    name: (type_identifier) @export.name) @export.node)

; --- type alias export ---
(export_statement
  (type_alias_declaration
    name: (type_identifier) @export.name) @export.node)

; --- enum export ---
(export_statement
  (enum_declaration
    name: (identifier) @export.name) @export.node)

; --- const/let/var with identifier (includes arrow functions) ---
(export_statement
  (lexical_declaration
    (variable_declarator
      name: (identifier) @export.name)) @export.node)

; --- const/let/var with destructured object pattern ---
(export_statement
  (lexical_declaration
    (variable_declarator
      name: (object_pattern
        (shorthand_property_identifier_pattern) @export.destructured))) @export.node)

; --- default export with identifier ---
(export_statement
  "default"
  (identifier) @export.default)

; --- default export class ---
(export_statement
  "default"
  (class_declaration
    name: (type_identifier) @export.name) @export.node)

; --- default export function ---
(export_statement
  "default"
  (function_declaration
    name: (identifier) @export.name) @export.node)

; --- re-exports: export { x } from './y' ---
(export_statement
  (export_clause
    (export_specifier
      name: (identifier) @export.reexport.name))
  source: (string
    (string_fragment) @export.reexport.source))
`,

    /**
     * Captures import statements.
     *
     * Capture names:
     *   @import.name      — named import specifier
     *   @import.source     — the module source string
     *   @import.namespace  — namespace import identifier
     *   @import.default    — default import identifier
     */
    imports: `
; --- named imports: import { x } from './y' ---
(import_statement
  (import_clause
    (named_imports
      (import_specifier
        name: (identifier) @import.name)))
  source: (string
    (string_fragment) @import.source))

; --- namespace imports: import * as ns from './w' ---
(import_statement
  (import_clause
    (namespace_import
      (identifier) @import.namespace))
  source: (string
    (string_fragment) @import.source))

; --- default imports: import Foo from './bar' ---
(import_statement
  (import_clause
    (identifier) @import.default)
  source: (string
    (string_fragment) @import.source))
`,
  },

  /**
   * Maps tree-sitter node types to canonical symbol kinds.
   */
  kindMap: {
    function_declaration: 'function',
    class_declaration: 'class',
    interface_declaration: 'interface',
    type_alias_declaration: 'type',
    enum_declaration: 'enum',
    lexical_declaration: 'constant',
  },
};

export default typescript;
