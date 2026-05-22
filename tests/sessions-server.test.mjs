// Tests for scripts/server/sessions.mjs — file-backed session store and
// for the remote-mirror plumbing in prototype/persistence.mjs.
//
// We isolate writes to a per-test temp directory via the
// DANDELION_SESSIONS_DIR env var (the module reads it at import time, so we
// set it before importing).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "dandelion-sessions-"));
process.env.DANDELION_SESSIONS_DIR = tmpDir;

const sessionsServer = await import("../scripts/server/sessions.mjs");
const { listSessions, readSession, writeSession, deleteSession, sessionsDir } = sessionsServer;
const { SCHEMA_VERSION, createPersistence, snapshotFromState } = await import("../prototype/persistence.mjs");
const { createGraph } = await import("../prototype/graph.mjs");

function cleanup() {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

function snap(id, title = "t", updatedAt = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { id, title, createdAt: updatedAt, updatedAt },
    graph: { nodes: [], edges: [] },
    mainConv: [],
    plants: [],
    sessionFiles: [],
    parentContext: null,
    parentContextMuted: false,
    nextId: 1,
  };
}

/* ── server-side IO ───────────────────────────────────────── */

test("sessionsDir reflects DANDELION_SESSIONS_DIR", () => {
  assert.equal(sessionsDir(), tmpDir);
});

test("writeSession persists a JSON file and listSessions surfaces metadata", async () => {
  await writeSession("sess_a", snap("sess_a", "Alpha", 1000));
  await writeSession("sess_b", snap("sess_b", "Bravo", 2000));
  const list = await listSessions();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, "sess_b"); // newest first
  assert.equal(list[1].id, "sess_a");
  assert.equal(list[0].title, "Bravo");
});

test("readSession round-trips the snapshot, missing returns null", async () => {
  await writeSession("sess_round", snap("sess_round", "Round"));
  const back = await readSession("sess_round");
  assert.equal(back.meta.id, "sess_round");
  assert.equal(back.schemaVersion, SCHEMA_VERSION);
  assert.equal(await readSession("sess_missing"), null);
});

test("writeSession rejects id/meta.id mismatch", async () => {
  await assert.rejects(
    () => writeSession("sess_x", snap("sess_y")),
    /meta\.id.+must match path id/,
  );
});

test("invalid ids are rejected (path traversal guard)", async () => {
  await assert.rejects(() => writeSession("../escape", snap("../escape")), /Invalid session id/);
  await assert.rejects(() => readSession("../escape"), /Invalid session id/);
  await assert.rejects(() => deleteSession("foo/bar"), /Invalid session id/);
});

test("deleteSession removes the file (true) or signals missing (false)", async () => {
  await writeSession("sess_del", snap("sess_del"));
  assert.equal(await deleteSession("sess_del"), true);
  assert.equal(await deleteSession("sess_del"), false);
  assert.equal(await readSession("sess_del"), null);
});

test("listSessions tolerates a corrupt file in the directory", async () => {
  await writeSession("sess_good", snap("sess_good", "Good"));
  // Drop a malformed JSON next to it — list should still return the good one.
  const fs = await import("node:fs/promises");
  await fs.writeFile(join(tmpDir, "sess_bad.json"), "{not-json", "utf8");
  const list = await listSessions();
  assert.ok(list.some((e) => e.id === "sess_good"));
  assert.ok(!list.some((e) => e.id === "sess_bad"));
});

/* ── persistence remote mirror ────────────────────────────── */

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test("createPersistence mirrors saves to the remote adapter", async () => {
  const seen = [];
  const remote = {
    putSession: async (s) => { seen.push(s.meta.id); },
    fetchSession: async () => null,
    listSessions: async () => [],
    deleteSession: async () => true,
  };
  const p = createPersistence({ storage: makeStorage(), remote, debounceMs: 0 });
  p.save(snap("sess_mirror", "Mirror"));
  p.flush();
  // Mirror is async; let microtasks drain.
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen, ["sess_mirror"]);
});

test("createPersistence coalesces concurrent remote saves to the newest", async () => {
  let resolveFirst;
  const seen = [];
  const remote = {
    putSession: (s) => {
      seen.push(s.meta.title);
      // First call hangs until we release it; intervening saves should
      // coalesce so only the *latest* lands once the first settles.
      if (seen.length === 1) {
        return new Promise((res) => { resolveFirst = res; });
      }
      return Promise.resolve();
    },
    fetchSession: async () => null,
    listSessions: async () => [],
    deleteSession: async () => true,
  };
  const p = createPersistence({ storage: makeStorage(), remote, debounceMs: 0 });
  p.save(snap("sess_c", "A")); p.flush();
  p.save(snap("sess_c", "B")); p.flush();
  p.save(snap("sess_c", "C")); p.flush();
  resolveFirst?.();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  // First call seen with "A"; intermediate "B" coalesced; final "C" follows.
  assert.deepEqual(seen, ["A", "C"]);
});

test("createPersistence forwards deleteSession to the remote adapter", async () => {
  const removed = [];
  const remote = {
    putSession: async () => {},
    fetchSession: async () => null,
    listSessions: async () => [],
    deleteSession: async (id) => { removed.push(id); return true; },
  };
  const p = createPersistence({ storage: makeStorage(), remote, debounceMs: 0 });
  p.deleteSession("sess_kill");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(removed, ["sess_kill"]);
});

test("remote failure does not throw or stop local persistence", async () => {
  const p = createPersistence({
    storage: makeStorage(),
    remote: {
      putSession: async () => { throw new Error("network down"); },
      fetchSession: async () => null,
      listSessions: async () => [],
      deleteSession: async () => true,
    },
    debounceMs: 0,
  });
  // Should not throw.
  p.save(snap("sess_offline"));
  p.flush();
  await new Promise((r) => setTimeout(r, 0));
  // Local copy survived.
  assert.equal(p.loadCurrent().meta.id, "sess_offline");
});

// Final cleanup — Node test runner doesn't have global hooks, so we use a
// terminal test instead.
test("teardown removes the tmp sessions directory", () => {
  cleanup();
  assert.equal(existsSync(tmpDir), false);
});
