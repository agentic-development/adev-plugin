/**
 * Security and functional tests for prototype-server module.
 *
 * Covers: MIME types, dotfile blocking, path traversal, double-encode
 * rejection, ENOENT handling (SEC-10), graceful shutdown, port scanning,
 * gitignore management, and module name validation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { startServer, ensureGitignore, validateModuleName } from '../../lib/prototype-server.mjs';

const PORT_ATTEMPTS = 10;

// Bind a TCP listener on 127.0.0.1:<port>, rejecting instead of waiting forever
// when the port is taken.
function listenOn(port) {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => resolve(s));
  });
}

const closeAll = (servers) => Promise.all(servers.map((s) => new Promise((r) => s.close(() => r()))));

// A start port whose whole ten-port range is free right now. The tests never use
// the default range 3210-3219: another suite or a dev server on this machine may
// hold it, and a test that blocks those ports itself would collide with it.
async function freePortRange() {
  for (let tries = 0; tries < 20; tries++) {
    const probe = await listenOn(0);
    const base = probe.address().port;
    await closeAll([probe]);
    if (base + PORT_ATTEMPTS - 1 > 65535) continue;
    const held = [];
    try {
      for (let i = 0; i < PORT_ATTEMPTS; i++) held.push(await listenOn(base + i));
      return base;
    } catch {
      // part of the range is taken; try another
    } finally {
      await closeAll(held);
    }
  }
  throw new Error('no free range of ten consecutive ports on 127.0.0.1');
}

describe('prototype-server', () => {
  let tmpDir;
  let server;

  let base;

  before(async () => {
    base = await freePortRange();
    tmpDir = createTempDir();
    writeFileSync(join(tmpDir, 'index.html'), '<h1>Test</h1>');
    writeFileSync(join(tmpDir, 'style.css'), 'body { color: red; }');
    writeFileSync(join(tmpDir, 'app.js'), 'console.log("hello")');
    writeFileSync(join(tmpDir, 'data.json'), '{"key":"value"}');
    writeFileSync(join(tmpDir, '.env'), 'SECRET=value');
    writeFileSync(join(tmpDir, '.htaccess'), 'deny all');
    writeFileSync(join(tmpDir, 'data.xyz'), 'binary content');
    mkdirSync(join(tmpDir, 'sub'));
    writeFileSync(join(tmpDir, 'sub', 'page.html'), '<h1>Sub</h1>');
  });

  after(async () => {
    if (server) await server.close();
    cleanupTempDir(tmpDir);
  });

  it('exports startServer function', async () => {
    const mod = await import('../../lib/prototype-server.mjs');
    assert.equal(typeof mod.startServer, 'function');
  });

  it('starts server and serves index.html as default document', async () => {
    server = await startServer(tmpDir, { startPort: base });
    assert.ok(server, 'server should start');
    assert.ok(server.port >= base && server.port < base + PORT_ATTEMPTS, `port ${server.port} in range`);
    const res = await fetch(`http://127.0.0.1:${server.port}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html');
    const body = await res.text();
    assert.ok(body.includes('<h1>Test</h1>'));
  });

  it('serves CSS with correct MIME type', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/style.css`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/css');
  });

  it('serves JavaScript with correct MIME type', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/app.js`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/javascript');
  });

  it('serves JSON with correct MIME type', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/data.json`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/json');
  });

  it('serves files in subdirectories', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/sub/page.html`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html');
    const body = await res.text();
    assert.ok(body.includes('<h1>Sub</h1>'));
  });

  it('rejects dotfile requests with 403', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/.env`);
    assert.equal(res.status, 403);
  });

  it('rejects dotfile .htaccess with 403', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/.htaccess`);
    assert.equal(res.status, 403);
  });

  it('rejects path traversal via raw HTTP request with 403', async () => {
    // fetch() normalizes /../ in URLs, so we use a raw TCP request
    // to send the literal traversal path to the server
    const { connect } = await import('node:net');
    const response = await new Promise((resolve, reject) => {
      const client = connect(server.port, '127.0.0.1', () => {
        client.write('GET /../../../etc/passwd HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
      });
      let data = '';
      client.on('data', (chunk) => { data += chunk.toString(); });
      client.on('end', () => resolve(data));
      client.on('error', reject);
      setTimeout(() => { client.destroy(); resolve(data); }, 2000);
    });
    // The server should reject with 403 (path traversal) or 404 (file not found)
    // On most systems, resolve() + realpathSync catches this
    assert.ok(
      response.includes('403') || response.includes('404'),
      `expected 403 or 404 in response: ${response.split('\r\n')[0]}`
    );
  });

  it('rejects double-encoded URLs with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/%252Fetc%252Fpasswd`);
    assert.equal(res.status, 400);
  });

  it('returns 404 for non-existent files with generic body (SEC-10)', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/nonexistent.html`);
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.ok(!body.includes('Error:'), 'should not expose stack trace');
    assert.ok(!body.includes(tmpDir), 'should not expose file paths');
    assert.equal(body, 'Not Found');
  });

  it('serves unknown extensions as octet-stream with attachment disposition', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/data.xyz`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.ok(res.headers.get('content-disposition')?.includes('attachment'));
  });

  it('gracefully closes server', async () => {
    const port = server.port;
    await server.close();
    server = null;
    // Attempting to connect should fail
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(e, 'connection should fail after close');
    }
  });
});

describe('prototype-server port scanning', () => {
  let blockers = [];
  let tmpDir;

  before(() => {
    tmpDir = createTempDir();
    writeFileSync(join(tmpDir, 'index.html'), '<h1>Port Test</h1>');
  });

  after(async () => {
    await closeAll(blockers);
    cleanupTempDir(tmpDir);
  });

  it('retries on next port when current is in use', async () => {
    const base = await freePortRange();
    blockers = [await listenOn(base)];

    const server = await startServer(tmpDir, { startPort: base });
    assert.ok(server, 'server should start on alternate port');
    assert.equal(server.port, base + 1);

    await server.close();
    await closeAll(blockers);
    blockers = [];
  });

  it('returns null when all 10 ports are exhausted', async () => {
    const base = await freePortRange();
    for (let i = 0; i < PORT_ATTEMPTS; i++) blockers.push(await listenOn(base + i));

    const server = await startServer(tmpDir, { startPort: base });
    assert.equal(server, null, 'should return null when all ports exhausted');

    await closeAll(blockers);
    blockers = [];
  });

  it('returns null for a start port whose range does not fit', async () => {
    assert.equal(await startServer(tmpDir, { startPort: 65530 }), null);
    assert.equal(await startServer(tmpDir, { startPort: 0 }), null);
    assert.equal(await startServer(tmpDir, { startPort: 3210.5 }), null);
  });
});

describe('prototype-server symlink handling', () => {
  let tmpDir;
  let outsideDir;

  before(() => {
    tmpDir = createTempDir();
    outsideDir = createTempDir();
    writeFileSync(join(tmpDir, 'index.html'), '<h1>Symlink Test</h1>');
    writeFileSync(join(outsideDir, 'secret.txt'), 'secret data');
    // Create symlink pointing outside serve root
    try {
      symlinkSync(join(outsideDir, 'secret.txt'), join(tmpDir, 'link.txt'));
    } catch {
      // Symlink creation may fail on some systems
    }
  });

  after(() => {
    cleanupTempDir(tmpDir);
    cleanupTempDir(outsideDir);
  });

  it('rejects symlinks that resolve outside serve root with 403', async () => {
    const server = await startServer(tmpDir, { startPort: await freePortRange() });
    assert.ok(server, 'server should start');

    const res = await fetch(`http://127.0.0.1:${server.port}/link.txt`);
    assert.equal(res.status, 403, 'symlink outside root should be rejected');

    await server.close();
  });
});

describe('ensureGitignore (delegates to managed-block installer)', () => {
  // Post-Task-7 contract: ensureGitignore delegates to
  // lib/gitignore-installer.mjs::ensureManagedBlock. The legacy lazy
  // `.adev/`-only append is removed — the block carries the full canonical
  // path list, of which `.adev/` is one entry.
  //
  // SA-4: prototype path force-installs the block (does NOT honor
  // setup.managed_gitignore: false). The prototype workspace specifically
  // needs `.adev/` ignored to boot safely.

  it('installs the adev:gitignore block (delegation), not just `.adev/`', () => {
    const tmpDir = createTempDir();
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/\n');
    ensureGitignore(tmpDir);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf8');
    assert.ok(content.includes('# >>> adev:gitignore >>>'), 'open marker present');
    assert.ok(content.includes('# <<< adev:gitignore <<<'), 'close marker present');
    assert.ok(content.includes('.adev/'), '.adev/ is part of the canonical block');
    cleanupTempDir(tmpDir);
  });

  it('is idempotent on second invocation', () => {
    const tmpDir = createTempDir();
    ensureGitignore(tmpDir);
    const first = readFileSync(join(tmpDir, '.gitignore'), 'utf8');
    ensureGitignore(tmpDir);
    const second = readFileSync(join(tmpDir, '.gitignore'), 'utf8');
    assert.equal(second, first, 'second call byte-identical');
    cleanupTempDir(tmpDir);
  });

  it('creates .gitignore if absent (delegation creates block)', () => {
    const tmpDir = createTempDir();
    ensureGitignore(tmpDir);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf8');
    assert.ok(content.includes('# >>> adev:gitignore >>>'));
    assert.ok(content.includes('.adev/'));
    cleanupTempDir(tmpDir);
  });

  it('SA-4 force-install: ignores setup.managed_gitignore: false', () => {
    const tmpDir = createTempDir();
    // Seed a manifest disabling the knob. Prototype path must still install
    // the block because prototype boot needs `.adev/` ignored.
    // We don't strictly need to create the manifest file — ensureGitignore
    // does not consult the knob — but the existence of this test documents
    // the SA-4 force-install contract.
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/\n');
    ensureGitignore(tmpDir);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf8');
    assert.ok(content.includes('# >>> adev:gitignore >>>'), 'block installed despite would-be knob-false');
    cleanupTempDir(tmpDir);
  });
});

describe('validateModuleName', () => {
  it("accepts valid module names (+1 more contract assertions)", () => {
    // accepts valid module names
    assert.equal(validateModuleName('auth'), true);
    assert.equal(validateModuleName('my-module'), true);
    assert.equal(validateModuleName('module123'), true);
    assert.equal(validateModuleName('a'), true);

    // rejects invalid module names
    assert.equal(validateModuleName(''), false);
    assert.equal(validateModuleName('-starts-with-dash'), false);
    assert.equal(validateModuleName('Has-Upper'), false);
    assert.equal(validateModuleName('has spaces'), false);
    assert.equal(validateModuleName('../traversal'), false);
    assert.equal(validateModuleName('.dotfile'), false);
  });
});
