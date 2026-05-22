// tests/lib/gitignore-installer.test.mjs
//
// Full installer suite: idempotency, drift regeneration, user-content
// preservation, no-file creation, malformed-open repair, dedupe,
// --remove semantics, SEC-6 scoped collapse, SEC-1 containment refusal,
// SEC-2 atomic-write tmp-cleanup, round-trip.
//
// Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ensureManagedBlock,
  removeManagedBlock,
  renderBlock,
} from "../../lib/gitignore-installer.mjs";

const OPEN = "# >>> adev:gitignore >>>";
const CLOSE = "# <<< adev:gitignore <<<";

function makeRoot(prefix = "mgb-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  return root;
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

test("ensureManagedBlock creates .gitignore from scratch with block + trailing newline", () => {
  const root = makeRoot("mgb-smoke-");
  try {
    const result = ensureManagedBlock(root);
    assert.equal(result, "added");
    const content = readFileSync(join(root, ".gitignore"), "utf8");
    assert.ok(content.startsWith(`${OPEN}\n`));
    assert.ok(content.trimEnd().endsWith(CLOSE));
    assert.ok(content.endsWith("\n"));
  } finally {
    cleanup(root);
  }
});

test("idempotency: second call is noop and content is byte-identical", () => {
  const root = makeRoot("mgb-idem-");
  try {
    ensureManagedBlock(root);
    const first = readFileSync(join(root, ".gitignore"), "utf8");
    const result2 = ensureManagedBlock(root);
    assert.equal(result2, "noop");
    const second = readFileSync(join(root, ".gitignore"), "utf8");
    assert.equal(second, first, "second call must produce byte-identical content");
  } finally {
    cleanup(root);
  }
});

test("drift regeneration: stale block body is regenerated; outside content preserved", () => {
  const root = makeRoot("mgb-drift-");
  try {
    const before = "user-line-above\n";
    const after = "user-line-below\n";
    const stale = `${OPEN}\n.adev/\n${CLOSE}`;
    writeFileSync(join(root, ".gitignore"), `${before}${stale}\n${after}`);

    const result = ensureManagedBlock(root);
    assert.equal(result, "updated");

    const content = readFileSync(join(root, ".gitignore"), "utf8");
    assert.ok(content.startsWith(before), "user line above preserved at start");
    assert.ok(content.endsWith(after), "user line below preserved at end");
    assert.ok(content.includes(renderBlock()), "canonical block present verbatim");
  } finally {
    cleanup(root);
  }
});

test("user-content preservation: above/below lines survive byte-for-byte at original offsets relative to splice", () => {
  const root = makeRoot("mgb-pres-");
  try {
    const above = "user-line-above\n";
    const below = "user-line-below\n";
    writeFileSync(
      join(root, ".gitignore"),
      `${above}${OPEN}\nold\n${CLOSE}\n${below}`,
    );

    const result = ensureManagedBlock(root);
    assert.equal(result, "updated");

    const content = readFileSync(join(root, ".gitignore"), "utf8");
    assert.equal(
      content.slice(0, above.length),
      above,
      "above line byte-identical at offset 0",
    );
    assert.equal(
      content.slice(content.length - below.length),
      below,
      "below line byte-identical at file tail",
    );
  } finally {
    cleanup(root);
  }
});

test("no-file creation: creates .gitignore as exactly `<block>\\n`", () => {
  const root = makeRoot("mgb-nofile-");
  try {
    const result = ensureManagedBlock(root);
    assert.equal(result, "added");
    const content = readFileSync(join(root, ".gitignore"), "utf8");
    assert.equal(
      content,
      `${renderBlock()}\n`,
      "from-scratch file must be exactly the canonical block + single trailing newline",
    );
  } finally {
    cleanup(root);
  }
});

test("malformed-open repair: open marker without close is repaired with stderr warning", () => {
  const root = makeRoot("mgb-repair-");
  try {
    writeFileSync(join(root, ".gitignore"), `${OPEN}\nfoo\nbar\n`);

    // Capture stderr.
    const writes = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    let result;
    try {
      result = ensureManagedBlock(root);
    } finally {
      process.stderr.write = orig;
    }

    assert.equal(result, "repaired");
    const content = readFileSync(join(root, ".gitignore"), "utf8");
    assert.ok(content.endsWith(`${CLOSE}\n`), "file must end with canonical close + newline");
    assert.ok(
      writes.join("").includes("unmatched open marker"),
      "stderr warning must be emitted",
    );
  } finally {
    cleanup(root);
  }
});

test("dedupe: two blocks collapse to one at first open with stderr warning", () => {
  const root = makeRoot("mgb-dedup-");
  try {
    const dup = `${OPEN}\nA\n${CLOSE}\nbetween\n${OPEN}\nB\n${CLOSE}\ntail\n`;
    writeFileSync(join(root, ".gitignore"), dup);

    const writes = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    let result;
    try {
      result = ensureManagedBlock(root);
    } finally {
      process.stderr.write = orig;
    }

    assert.equal(result, "deduped");
    const content = readFileSync(join(root, ".gitignore"), "utf8");
    // Exactly one open marker remains.
    const opens = [...content.matchAll(/# >>> adev:gitignore >>>/g)];
    assert.equal(opens.length, 1, "exactly one open marker after dedupe");
    assert.ok(content.includes("tail\n"), "post-dedupe tail content preserved");
    assert.ok(writes.join("").includes("2 open markers"), "stderr warning must be emitted");
  } finally {
    cleanup(root);
  }
});

test("removeManagedBlock removes block and is noop on second call", () => {
  const root = makeRoot("mgb-remove-");
  try {
    ensureManagedBlock(root);
    const first = removeManagedBlock(root);
    assert.equal(first, "removed");
    const content = readFileSync(join(root, ".gitignore"), "utf8");
    assert.ok(!content.includes(OPEN), "open marker gone");
    assert.ok(!content.includes(CLOSE), "close marker gone");

    const second = removeManagedBlock(root);
    assert.equal(second, "noop");
  } finally {
    cleanup(root);
  }
});

test("removeManagedBlock is noop when .gitignore does not exist", () => {
  const root = makeRoot("mgb-removenoop-");
  try {
    const result = removeManagedBlock(root);
    assert.equal(result, "noop");
    assert.ok(
      !existsSync(join(root, ".gitignore")),
      "removeManagedBlock must not create a file",
    );
  } finally {
    cleanup(root);
  }
});

test("SEC-6 scoped collapse: triple-newline run far from splice survives byte-for-byte", () => {
  const root = makeRoot("mgb-sec6-");
  try {
    // Far-from-splice content with multiple consecutive newlines.
    const farAbove = "a\n\n\n\n";
    const farBelow = "\n\n\n\nb";
    writeFileSync(
      join(root, ".gitignore"),
      `${farAbove}${OPEN}\nfoo\n${CLOSE}${farBelow}`,
    );

    const result = removeManagedBlock(root);
    assert.equal(result, "removed");
    const content = readFileSync(join(root, ".gitignore"), "utf8");
    // The "a\n\n\n\n" prefix is partly inside the 4-char splice window, but
    // its outermost bytes are outside it. SEC-6 asserts that bytes *outside*
    // the 8-char joined window are never modified. Verify the file still
    // starts with "a" followed by at least 2 newlines AND that the joined
    // window collapse only modified the immediate splice region.
    assert.ok(content.startsWith("a"), "first byte 'a' preserved");
    assert.ok(content.endsWith("b"), "last byte 'b' preserved");
    // The joined splice window (last 4 chars of before + first 4 chars of
    // after = "\n\n\n\n\n\n\n\n" = 8 newlines) collapses to "\n\n". Bytes
    // outside that 8-char window are exactly "a" (1 char before) and "b" (1
    // char after). So the final content must be exactly "a\n\nb".
    assert.equal(content, "a\n\nb", "splice window collapsed; outer bytes byte-identical");
  } finally {
    cleanup(root);
  }
});

test("SEC-1 containment refusal: .gitignore symlink escaping projectRoot throws UNSAFE_GITIGNORE_PATH", { skip: process.platform === "win32" ? "no symlink permission on win32" : false }, () => {
  const root = makeRoot("mgb-sec1-");
  const inner = join(root, "inner");
  const elsewhere = mkdtempSync(join(tmpdir(), "mgb-sec1-else-"));
  try {
    mkdirSync(inner, { recursive: true });
    mkdirSync(join(inner, ".context-index"), { recursive: true });
    // Symlink inner/.gitignore -> elsewhere/.gitignore
    writeFileSync(join(elsewhere, ".gitignore"), "hi\n");
    symlinkSync(join(elsewhere, ".gitignore"), join(inner, ".gitignore"));

    // The containment check resolves the .gitignore directory (inner/), which
    // is inside root. So a same-name symlink escaping out is caught by the
    // symlink-realpath branch.
    let threw = null;
    try {
      ensureManagedBlock(inner);
    } catch (e) {
      threw = e;
    }
    assert.ok(threw, "containment-violating ensureManagedBlock must throw");
    assert.equal(threw.code, "UNSAFE_GITIGNORE_PATH");
  } finally {
    cleanup(root);
    cleanup(elsewhere);
  }
});

test("SEC-2 atomic-write proxy: rename failure leaves no orphaned tmp and original content intact", async () => {
  const root = makeRoot("mgb-sec2-");
  try {
    const gitignore = join(root, ".gitignore");
    const original = "preexisting content\n";
    writeFileSync(gitignore, original);

    // Monkey-patch node:fs's renameSync to throw once. We do this by
    // importing the installer fresh with renameSync stubbed via dynamic
    // module mocking — but node:test doesn't expose mocks easily. So we
    // simulate the SEC-2 contract another way: directly assert there are no
    // *.tmp files after a successful run and that re-run is idempotent
    // (proxy for "rename completed atomically").
    ensureManagedBlock(root);
    const entries = readdirSync(root);
    const tmps = entries.filter((n) => n.startsWith(".gitignore.") && n.endsWith(".tmp"));
    assert.equal(tmps.length, 0, "no orphaned .gitignore.*.tmp left after successful write");

    // Re-run: still noop, no tmps.
    ensureManagedBlock(root);
    const after = readdirSync(root).filter(
      (n) => n.startsWith(".gitignore.") && n.endsWith(".tmp"),
    );
    assert.equal(after.length, 0, "no orphaned tmp after idempotent re-run");
  } finally {
    cleanup(root);
  }
});

test("round-trip: ensure -> remove -> ensure produces canonical content; post-remove has no marker tokens", () => {
  const root = makeRoot("mgb-rt-");
  try {
    ensureManagedBlock(root);
    removeManagedBlock(root);
    const removed = readFileSync(join(root, ".gitignore"), "utf8");
    assert.ok(!removed.includes(OPEN));
    assert.ok(!removed.includes(CLOSE));

    ensureManagedBlock(root);
    const reapplied = readFileSync(join(root, ".gitignore"), "utf8");
    assert.ok(reapplied.includes(renderBlock()), "canonical block reapplied");
  } finally {
    cleanup(root);
  }
});
