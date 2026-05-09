/**
 * Zero-dependency HTTP server helper for prototype serving.
 *
 * Serves files from a directory with an explicit MIME allowlist,
 * port scanning, path traversal protection, dotfile blocking,
 * and graceful shutdown.
 *
 * @module lib/prototype-server
 */

import { createServer } from 'node:http';
import { readFileSync, realpathSync, existsSync, readFileSync as readGitignore, writeFileSync, appendFileSync } from 'node:fs';
import { join, extname, basename, resolve } from 'node:path';

/**
 * Allowed MIME types by file extension.
 * Extensions not in this map are served as application/octet-stream
 * with Content-Disposition: attachment.
 */
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const START_PORT = 3210;
const MAX_PORT_ATTEMPTS = 10;

/**
 * Handle an incoming HTTP request with the security validation pipeline.
 *
 * Pipeline order (per SEC-12):
 *   1. URL-decode the request path
 *   2. Reject if decoded path contains % (double-encode guard) → HTTP 400
 *   3. Resolve the file path against the serve root
 *   4. fs.realpathSync the resolved path (ENOENT → HTTP 404, per SEC-10)
 *   5. startsWith comparison against realpathSync-normalized root → HTTP 403
 *   6. Check if filename starts with . (dotfile) → HTTP 403
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} normalizedRoot - realpathSync-normalized serve root
 */
function handleRequest(req, res, normalizedRoot) {
  // Step 1: URL-decode the request path
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  // Step 2: Reject if decoded path contains % (double-encode guard)
  if (decodedPath.includes('%')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  // Default document: serve index.html for root path
  if (decodedPath === '/') {
    decodedPath = '/index.html';
  }

  // Step 3: Resolve the file path against the serve root
  const filePath = resolve(normalizedRoot, '.' + decodedPath);

  // Step 4: fs.realpathSync — handle ENOENT gracefully (SEC-10)
  let realFilePath;
  try {
    realFilePath = realpathSync(filePath);
  } catch {
    // ENOENT or other fs error: return generic 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  // Step 5: Path traversal check — resolved path must start with normalized root
  if (!realFilePath.startsWith(normalizedRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Step 6: Dotfile blocking — reject files whose name starts with .
  if (basename(realFilePath).startsWith('.')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Serve the file with correct MIME type
  let content;
  try {
    content = readFileSync(realFilePath);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
    return;
  }

  const ext = extname(realFilePath).toLowerCase();
  const mimeType = MIME_TYPES[ext];

  if (mimeType) {
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  } else {
    // Unknown extension: serve as octet-stream with attachment disposition
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${basename(realFilePath)}"`,
    });
    res.end(content);
  }
}

/**
 * Start an HTTP server serving files from the given root directory.
 *
 * Binds to 127.0.0.1 starting at port 3210, incrementing up to 3219
 * on EADDRINUSE. Returns { port, close } on success, or null after
 * all attempts fail.
 *
 * @param {string} rootDir - Directory to serve files from
 * @param {object} [options] - Reserved for future options
 * @returns {Promise<{ port: number, close: () => Promise<void> } | null>}
 */
export async function startServer(rootDir, options = {}) {
  // Normalize rootDir via realpathSync for consistent path comparisons
  let normalizedRoot;
  try {
    normalizedRoot = realpathSync(resolve(rootDir));
  } catch {
    return null;
  }

  // Ensure normalizedRoot ends without trailing slash for consistent startsWith
  if (normalizedRoot.endsWith('/')) {
    normalizedRoot = normalizedRoot.slice(0, -1);
  }

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const port = START_PORT + attempt;
    try {
      const server = await tryListen(normalizedRoot, port);
      return {
        port,
        close: () => new Promise((resolve) => {
          server.close(() => resolve());
        }),
      };
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        continue;
      }
      // Non-port error (EACCES, etc.): return null without throwing
      return null;
    }
  }

  // All port attempts exhausted
  return null;
}

/**
 * Try to start an HTTP server on a specific port.
 *
 * @param {string} normalizedRoot - realpathSync-normalized serve root
 * @param {number} port - Port to bind to
 * @returns {Promise<import('node:http').Server>}
 */
function tryListen(normalizedRoot, port) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      handleRequest(req, res, normalizedRoot);
    });

    server.on('error', (err) => {
      reject(err);
    });

    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

/**
 * Ensure `.adev/` is in the project's `.gitignore` file.
 *
 * Pattern-aware: checks for `.adev/`, `.adev`, or parent glob patterns
 * that would cover `.adev/` before appending. Creates `.gitignore` if absent.
 *
 * @param {string} projectRoot - Absolute path to the project root
 */
export function ensureGitignore(projectRoot) {
  const gitignorePath = join(projectRoot, '.gitignore');
  let content = '';

  if (existsSync(gitignorePath)) {
    content = readGitignore(gitignorePath, 'utf8');
  }

  // Check if .adev/ is already covered by existing patterns
  const lines = content.split('\n').map(l => l.trim());
  for (const line of lines) {
    // Skip comments and empty lines
    if (!line || line.startsWith('#')) continue;

    // Exact matches
    if (line === '.adev/' || line === '.adev' || line === '.adev/**') {
      return; // Already covered
    }

    // Wildcard patterns that cover .adev/
    if (line === '*' || line === '.*' || line === '.*/' ) {
      return; // Already covered by parent pattern
    }
  }

  // Append .adev/ to gitignore
  const suffix = content.endsWith('\n') || content === '' ? '' : '\n';
  const entry = `${suffix}\n# Prototype artifacts (adev)\n.adev/\n`;
  appendFileSync(gitignorePath, entry);
}

/**
 * Validate a module name for use in file paths.
 *
 * Module names must match ^[a-z0-9][a-z0-9-]*$ (lowercase alphanumeric
 * with hyphens, must start with alphanumeric).
 *
 * @param {string} name - Module name to validate
 * @returns {boolean} True if valid
 */
export function validateModuleName(name) {
  return /^[a-z0-9][a-z0-9-]*$/.test(name);
}
