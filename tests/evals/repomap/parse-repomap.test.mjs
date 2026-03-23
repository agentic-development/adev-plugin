import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepoMap } from './parse-repomap.mjs';

describe('parseRepoMap', () => {
  it('parses symbols from markdown headings and list items', () => {
    const md = `# Repo Map

### src/types.ts
- interface User (line 1)
- interface Task (line 7)
- type TaskFilter (line 14)
- enum TaskStatus (line 16)

### src/config.ts
- constant APP_NAME (line 1)
- constant MAX_RETRIES (line 3)
`;

    const result = parseRepoMap(md);
    assert.equal(result.symbols.length, 6);
    assert.deepStrictEqual(result.symbols[0], { name: 'User', kind: 'interface', file: 'src/types.ts', line: 1 });
    assert.deepStrictEqual(result.symbols[1], { name: 'Task', kind: 'interface', file: 'src/types.ts', line: 7 });
    assert.deepStrictEqual(result.symbols[2], { name: 'TaskFilter', kind: 'type', file: 'src/types.ts', line: 14 });
    assert.deepStrictEqual(result.symbols[3], { name: 'TaskStatus', kind: 'enum', file: 'src/types.ts', line: 16 });
    assert.deepStrictEqual(result.symbols[4], { name: 'APP_NAME', kind: 'constant', file: 'src/config.ts', line: 1 });
    assert.deepStrictEqual(result.symbols[5], { name: 'MAX_RETRIES', kind: 'constant', file: 'src/config.ts', line: 3 });
  });

  it('handles class and function kinds', () => {
    const md = `### src/db.ts
- class Database (line 4)

### src/utils.ts
- function clamp (line 7)
`;

    const result = parseRepoMap(md);
    assert.equal(result.symbols.length, 2);
    assert.equal(result.symbols[0].kind, 'class');
    assert.equal(result.symbols[1].kind, 'function');
  });

  it('handles empty markdown', () => {
    const result = parseRepoMap('');
    assert.equal(result.symbols.length, 0);
  });

  it('ignores lines that do not match the pattern', () => {
    const md = `### src/types.ts
Some random text here
- interface User (line 1)
- not a valid entry
- interface Task (line 7)
`;

    const result = parseRepoMap(md);
    assert.equal(result.symbols.length, 2);
  });

  it('handles nested directory paths', () => {
    const md = `### src/services/task-service.ts
- function createTask (line 8)
- function listTasks (line 14)
`;

    const result = parseRepoMap(md);
    assert.equal(result.symbols.length, 2);
    assert.equal(result.symbols[0].file, 'src/services/task-service.ts');
    assert.equal(result.symbols[1].file, 'src/services/task-service.ts');
  });
});
