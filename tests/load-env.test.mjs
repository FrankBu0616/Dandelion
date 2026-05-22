// Tests for scripts/load-env.mjs — parser + loader. We never let this
// touch `process.env` directly; the loader accepts an `env` parameter so
// tests can pass a plain object and stay deterministic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseEnv, loadEnv } from "../scripts/load-env.mjs";

/* ── parseEnv ─────────────────────────────────────────────── */

test("parseEnv handles a basic KEY=value block", () => {
  assert.deepEqual(parseEnv("A=1\nB=two\n"), { A: "1", B: "two" });
});

test("parseEnv ignores blank lines and # comments", () => {
  const text = `
    # a comment
    A=1

    # another
    B=2
  `;
  assert.deepEqual(parseEnv(text), { A: "1", B: "2" });
});

test("parseEnv strips surrounding single/double quotes", () => {
  assert.deepEqual(
    parseEnv(`A="quoted value"\nB='with spaces'\nC=bare\n`),
    { A: "quoted value", B: "with spaces", C: "bare" },
  );
});

test("parseEnv strips trailing inline comments for unquoted values only", () => {
  assert.deepEqual(parseEnv(`A=val # trailing\nB="kept # inside"\n`), {
    A: "val",
    B: "kept # inside",
  });
});

test("parseEnv tolerates `export KEY=value` shell-style", () => {
  assert.deepEqual(parseEnv("export PORT=4321\n"), { PORT: "4321" });
});

test("parseEnv rejects invalid identifiers", () => {
  // Leading digits, dashes, spaces in the key — all skipped.
  assert.deepEqual(parseEnv("1BAD=x\nALSO-BAD=y\nGOOD=z\n"), { GOOD: "z" });
});

/* ── loadEnv ──────────────────────────────────────────────── */

function withTmpEnv(contents, fn) {
  const dir = mkdtempSync(join(tmpdir(), "dandelion-env-"));
  writeFileSync(join(dir, ".env"), contents, "utf8");
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("loadEnv is a no-op when the file is missing", () => {
  const env = {};
  const dir = mkdtempSync(join(tmpdir(), "dandelion-env-"));
  try {
    const result = loadEnv({ cwd: dir, env });
    assert.equal(result.loaded, false);
    assert.deepEqual(env, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadEnv populates an empty env from .env", () => {
  withTmpEnv("A=1\nB=two\n", (dir) => {
    const env = {};
    const result = loadEnv({ cwd: dir, env });
    assert.equal(result.loaded, true);
    assert.deepEqual(env, { A: "1", B: "two" });
    assert.deepEqual(result.applied, { A: "1", B: "two" });
  });
});

test("loadEnv does NOT overwrite existing env values", () => {
  withTmpEnv("A=fromfile\nB=fromfile\n", (dir) => {
    const env = { A: "fromshell" };
    const result = loadEnv({ cwd: dir, env });
    assert.equal(env.A, "fromshell"); // shell wins
    assert.equal(env.B, "fromfile");
    assert.deepEqual(Object.keys(result.applied), ["B"]);
  });
});

test("loadEnv treats empty-string env values as overwritable", () => {
  // npm scripts and some shells inject `KEY=` (empty) for unset vars.
  // A real value in .env should take effect in that case.
  withTmpEnv("A=fromfile\n", (dir) => {
    const env = { A: "" };
    loadEnv({ cwd: dir, env });
    assert.equal(env.A, "fromfile");
  });
});

test("loadEnv skips empty values in the file (KEY= means 'not set')", () => {
  // .env.example ships keys like `ANTHROPIC_API_KEY=` to flag "fill this
  // in"; copying it verbatim must not clobber `??` fallbacks downstream
  // by assigning ''. We treat empty in the file the same as omitted.
  withTmpEnv("A=\nB=value\nC=\n", (dir) => {
    const env = {};
    const result = loadEnv({ cwd: dir, env });
    assert.equal(env.A, undefined);
    assert.equal(env.B, "value");
    assert.equal(env.C, undefined);
    assert.deepEqual(Object.keys(result.applied), ["B"]);
  });
});
