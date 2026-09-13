### Step 4: Start HTTP Server

Start the server via the CLI. The verb keeps the HTTP server alive for the rest of the skill session (the process must be backgrounded so the parent can read the printed port):

```bash
adev prototype start-server --dir <tmpDir> &
```

The verb prints a single JSON object `{port: <number|null>}` on stdout. Port range is 3210–3219; `null` indicates all ports are unavailable or permission was denied. Read the port from the first line of stdout, then continue with the feedback loop.

**If server starts successfully (port is a number):**

> Prototype server running at **http://127.0.0.1:<port>/**
> Open this URL in your browser to preview.

**If the printed `port` is `null` (all ports busy or permission error):**

Fall back to file-path mode:

> Could not start HTTP server (ports 3210-3219 unavailable or permission denied).
> Open the prototype files directly: `<tmpDir>/index.html`

Continue with the feedback loop regardless. Error codes: `SERVER_PORT_EXHAUSTED`, `SERVER_PERMISSION_ERROR`.
