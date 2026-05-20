// Smoke test for the Phase 1 shadow graph helpers.
//
// The graph itself lives inside prototype.html (it depends on `state` which is
// browser-side). Rather than evaluate the HTML, we redefine the same helper
// surface here and confirm the node/edge shapes match what docs/data_model.md
// describes: chat nodes with one parent, merge nodes with many parents, and a
// mainLeafId that tracks the tip of the main thread across forks and merges.
//
// If the helper signatures in prototype.html change, update this file to match
// — it's the canonical contract for what Phase 2's walkContext() will consume.

import test from "node:test";
import assert from "node:assert/strict";

function makeGraph() {
  const state = { graph: { nodes: new Map(), edges: [], rootId: null, mainLeafId: null } };
  return {
    state,
    addChat({ id, thread, plantId = null, prompt, response = "", parent, modelLabel = null }) {
      const node = { id, kind: "chat", thread, plantId, prompt, response, parent, modelLabel };
      state.graph.nodes.set(id, node);
      if (parent) state.graph.edges.push({ from: parent, to: id, kind: "next" });
      if (!state.graph.rootId) state.graph.rootId = id;
      if (thread === "main") state.graph.mainLeafId = id;
      return node;
    },
    addPlant({ id, title, parent }) {
      const node = { id, kind: "plant", title, parent };
      state.graph.nodes.set(id, node);
      if (parent) state.graph.edges.push({ from: parent, to: id, kind: "fork" });
      return node;
    },
    addMerge({ id, parents, route }) {
      const node = { id, kind: "merge", parents: [...parents], route };
      state.graph.nodes.set(id, node);
      for (const p of parents) state.graph.edges.push({ from: p, to: id, kind: "merged-into" });
      state.graph.mainLeafId = id;
      return node;
    },
    setResponse(id, response) {
      const n = state.graph.nodes.get(id);
      if (n && n.kind === "chat") n.response = response;
    },
  };
}

test("first main-thread chat becomes the root and the leaf", () => {
  const g = makeGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "hi", parent: null });
  assert.equal(g.state.graph.rootId, "n1");
  assert.equal(g.state.graph.mainLeafId, "n1");
});

test("subsequent main-thread chats chain via next edges", () => {
  const g = makeGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "a", parent: null });
  g.addChat({ id: "n2", thread: "main", prompt: "b", parent: g.state.graph.mainLeafId });
  assert.equal(g.state.graph.mainLeafId, "n2");
  assert.deepEqual(
    g.state.graph.edges.find(e => e.to === "n2"),
    { from: "n1", to: "n2", kind: "next" },
  );
});

test("plants fork off the main-thread leaf without advancing it", () => {
  const g = makeGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "a", parent: null });
  g.addPlant({ id: "s1", title: "side A", parent: g.state.graph.mainLeafId });
  g.addChat({ id: "n2", thread: "plant", plantId: "s1", prompt: "side q", parent: "s1" });
  // main leaf must still be n1 — plants do not advance the main thread
  assert.equal(g.state.graph.mainLeafId, "n1");
  // plant fork edge exists
  assert.ok(g.state.graph.edges.some(e => e.from === "n1" && e.to === "s1" && e.kind === "fork"));
});

test("merge node has many parents and becomes the new main leaf", () => {
  const g = makeGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "root", parent: null });
  g.addPlant({ id: "sA", title: "A", parent: "n1" });
  g.addPlant({ id: "sB", title: "B", parent: "n1" });
  g.addChat({ id: "a1", thread: "plant", plantId: "sA", prompt: "qa", parent: "sA" });
  g.addChat({ id: "b1", thread: "plant", plantId: "sB", prompt: "qb", parent: "sB" });
  g.addMerge({ id: "m1", parents: ["a1", "b1"], route: { kind: "additional_context" } });
  assert.equal(g.state.graph.mainLeafId, "m1");
  const merge = g.state.graph.nodes.get("m1");
  assert.deepEqual(merge.parents, ["a1", "b1"]);
  // a "merged-into" edge per parent
  const mergedEdges = g.state.graph.edges.filter(e => e.kind === "merged-into" && e.to === "m1");
  assert.equal(mergedEdges.length, 2);
});

test("continuing after a merge attaches to the merge node", () => {
  const g = makeGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "root", parent: null });
  g.addPlant({ id: "sA", title: "A", parent: "n1" });
  g.addChat({ id: "a1", thread: "plant", plantId: "sA", prompt: "qa", parent: "sA" });
  g.addMerge({ id: "m1", parents: ["a1"], route: { kind: "soft_disagreement" } });
  g.addChat({ id: "n2", thread: "main", prompt: "continue", parent: g.state.graph.mainLeafId });
  const cont = g.state.graph.nodes.get("n2");
  assert.equal(cont.parent, "m1");
  assert.equal(g.state.graph.mainLeafId, "n2");
});

test("setResponse updates a chat node's response field", () => {
  const g = makeGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "hi", parent: null });
  g.setResponse("n1", "hello!");
  assert.equal(g.state.graph.nodes.get("n1").response, "hello!");
});
