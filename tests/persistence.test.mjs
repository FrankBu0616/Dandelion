// Tests for prototype/persistence.mjs — Phase 1 localStorage-backed save
// and restore. Uses an in-memory Storage mock so we never touch the real DOM.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createGraph } from "../prototype/graph.mjs";
import {
  SCHEMA_VERSION,
  snapshotFromState,
  applySnapshot,
  deriveTitle,
  updateIndex,
  removeFromIndex,
  createPersistence,
  newSessionId,
} from "../prototype/persistence.mjs";

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _dump: () => Object.fromEntries(map),
  };
}

function makeMinimalState() {
  return {
    mainConv: [
      { kind: "user", text: "what is X?" },
      { kind: "assistant", id: "a1", text: "X is...", status: "complete" },
    ],
    plants: [
      { id: "p1", title: "side question", turns: [{ id: "t1", user: "u", asst: "a", status: "complete" }], composerDraft: "", status: "idle", selected: false },
    ],
    activePlantId: "p1",
    postGraftArmed: false,
    sessionFiles: [
      { localId: 1, name: "doc.pdf", mediaType: "application/pdf", size: 100, status: "ready", fileId: "file_abc" },
    ],
    parentContext: "first question…",
    parentContextMuted: false,
    currentModel: { provider: "ollama", model: "qwen2.5:3b", label: "qwen2.5:3b" },
    nextId: 5,
  };
}

/* ── deriveTitle ─────────────────────────────────────────── */

test("deriveTitle uses the first user turn truncated to 60 chars", () => {
  assert.equal(deriveTitle({ mainConv: [{ kind: "user", text: "Hello world" }] }), "Hello world");
  const long = "x".repeat(100);
  assert.equal(deriveTitle({ mainConv: [{ kind: "user", text: long }] }).length, 61); // 60 + "…"
});

test("deriveTitle falls back to placeholder when there's no user turn", () => {
  assert.equal(deriveTitle({ mainConv: [] }), "Untitled session");
  assert.equal(deriveTitle({}), "Untitled session");
});

/* ── snapshot / apply round-trip ─────────────────────────── */

test("snapshot includes schemaVersion and meta", () => {
  const state = makeMinimalState();
  const graph = createGraph();
  graph.addChat({ id: "a1", thread: "main", prompt: "q", parent: null });
  const snap = snapshotFromState(state, graph, { id: "sess_x" });
  assert.equal(snap.schemaVersion, SCHEMA_VERSION);
  assert.equal(snap.meta.id, "sess_x");
  assert.ok(snap.meta.createdAt > 0);
  assert.ok(snap.meta.updatedAt >= snap.meta.createdAt);
});

test("snapshot rejects missing meta.id", () => {
  assert.throws(() => snapshotFromState({}, createGraph(), {}), /meta\.id is required/);
});

test("applySnapshot restores state and graph", () => {
  const stateBefore = makeMinimalState();
  const graphBefore = createGraph();
  graphBefore.addChat({ id: "a1", thread: "main", prompt: "q", parent: null });
  graphBefore.addPlant({ id: "p1", title: "side question", parent: "a1" });
  const snap = snapshotFromState(stateBefore, graphBefore, { id: "sess_round" });

  // Fresh targets.
  const state = { sessionFiles: [], mainConv: [], plants: [] };
  const graph = createGraph();
  const meta = applySnapshot(snap, { state, graph });

  assert.equal(meta.id, "sess_round");
  assert.equal(state.mainConv.length, 2);
  assert.equal(state.plants[0].id, "p1");
  assert.equal(state.activePlantId, "p1");
  assert.equal(state.parentContext, "first question…");
  assert.equal(state.sessionFiles[0].fileId, "file_abc");
  assert.equal(state.nextId, 5);
  // Graph round-tripped.
  assert.equal(graph.state.nodes.size, 2);
  assert.equal(graph.state.mainLeafId, "a1");
  // Clone, not aliased.
  state.mainConv[0].text = "mutated";
  assert.notEqual(snap.mainConv[0].text, "mutated");
});

test("applySnapshot rejects unsupported schema versions", () => {
  assert.throws(() => applySnapshot({ schemaVersion: 99 }, { state: {}, graph: createGraph() }),
    /Unsupported snapshot schemaVersion/);
});

test("applySnapshot sweeps in-flight streaming items to 'interrupted'", () => {
  const snap = {
    schemaVersion: SCHEMA_VERSION,
    meta: { id: "sess_sweep", createdAt: 1, updatedAt: 2, title: "x" },
    graph: { nodes: [], edges: [] },
    mainConv: [
      { kind: "assistant", id: "a1", text: "partial", status: "streaming" },
      { kind: "assistant", id: "a2", text: "done", status: "complete" },
    ],
    plants: [
      { id: "p1", status: "running", turns: [
        { id: "t1", user: "u", asst: "half", status: "streaming" },
        { id: "t2", user: "u", asst: "ok", status: "complete" },
      ]},
    ],
    sessionFiles: [],
    parentContext: null,
    parentContextMuted: false,
    nextId: 1,
  };
  const state = {};
  applySnapshot(snap, { state, graph: createGraph() });
  assert.equal(state.mainConv[0].status, "interrupted");
  assert.equal(state.mainConv[1].status, "complete");
  assert.equal(state.plants[0].status, "idle");
  assert.equal(state.plants[0].turns[0].status, "interrupted");
  assert.equal(state.plants[0].turns[1].status, "complete");
});

/* ── index management ───────────────────────────────────── */

test("updateIndex puts the newest entry first and de-duplicates", () => {
  const out = updateIndex(
    [
      { id: "a", title: "A", updatedAt: 100 },
      { id: "b", title: "B", updatedAt: 200 },
    ],
    { id: "a", title: "A!", updatedAt: 300 },
  );
  assert.deepEqual(out, [
    { id: "a", title: "A!", updatedAt: 300 },
    { id: "b", title: "B", updatedAt: 200 },
  ]);
});

test("removeFromIndex strips by id", () => {
  assert.deepEqual(
    removeFromIndex([{ id: "a" }, { id: "b" }], "a"),
    [{ id: "b" }],
  );
  assert.deepEqual(removeFromIndex(undefined, "a"), []);
});

/* ── createPersistence storage adapter ──────────────────── */

test("createPersistence stores, lists, and reloads sessions", () => {
  const storage = makeStorage();
  const p = createPersistence({ storage, debounceMs: 0 });

  const state = makeMinimalState();
  const graph = createGraph();
  const snap = snapshotFromState(state, graph, { id: "sess_a", title: "Question A" });

  p.save(snap);
  p.flush();

  const loaded = p.loadCurrent();
  assert.equal(loaded.meta.id, "sess_a");
  assert.equal(loaded.meta.title, "Question A");

  const list = p.listSessions();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "sess_a");

  // A second save replaces the entry in the index (no duplicates).
  const snap2 = snapshotFromState(state, graph, { id: "sess_a", title: "Question A v2", createdAt: snap.meta.createdAt });
  p.save(snap2);
  p.flush();
  assert.equal(p.listSessions().length, 1);
  assert.equal(p.listSessions()[0].title, "Question A v2");

  // Adding a different session puts the newer one first.
  const snap3 = snapshotFromState(state, graph, { id: "sess_b", title: "Other" });
  p.save(snap3);
  p.flush();
  assert.deepEqual(p.listSessions().map((e) => e.id), ["sess_b", "sess_a"]);
});

test("createPersistence deleteSession removes blob, index entry, and current pointer", () => {
  const storage = makeStorage();
  const p = createPersistence({ storage, debounceMs: 0 });
  const snap = snapshotFromState(makeMinimalState(), createGraph(), { id: "sess_del" });
  p.save(snap);
  p.flush();
  assert.ok(p.loadCurrent());
  p.deleteSession("sess_del");
  assert.equal(p.loadCurrent(), null);
  assert.equal(p.listSessions().length, 0);
});

test("newSessionId returns a non-empty unique-ish string", () => {
  const a = newSessionId();
  const b = newSessionId();
  assert.ok(a.startsWith("sess_"));
  assert.notEqual(a, b);
});
