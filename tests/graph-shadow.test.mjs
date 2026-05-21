// Smoke test for the Phase 1 shadow graph helpers.
//
// Imports the real implementation from prototype/graph.mjs so the test fails
// when the graph contract drifts. The shapes asserted here match what
// docs/data_model.md describes: chat nodes with one parent, merge nodes with
// many parents, and a mainLeafId that tracks the tip of the main thread
// across forks and merges.

import test from "node:test";
import assert from "node:assert/strict";

import { createGraph } from "../prototype/graph.mjs";

test("first main-thread chat becomes the root and the leaf", () => {
  const g = createGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "hi", parent: null });
  assert.equal(g.state.rootId, "n1");
  assert.equal(g.state.mainLeafId, "n1");
});

test("subsequent main-thread chats chain via next edges", () => {
  const g = createGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "a", parent: null });
  g.addChat({ id: "n2", thread: "main", prompt: "b", parent: g.state.mainLeafId });
  assert.equal(g.state.mainLeafId, "n2");
  assert.deepEqual(
    g.state.edges.find((e) => e.to === "n2"),
    { from: "n1", to: "n2", kind: "next" },
  );
});

test("plants fork off the main-thread leaf without advancing it", () => {
  const g = createGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "a", parent: null });
  g.addPlant({ id: "s1", title: "side A", parent: g.state.mainLeafId });
  g.addChat({ id: "n2", thread: "plant", plantId: "s1", prompt: "side q", parent: "s1" });
  // main leaf must still be n1 — plants do not advance the main thread
  assert.equal(g.state.mainLeafId, "n1");
  // plant fork edge exists
  assert.ok(g.state.edges.some((e) => e.from === "n1" && e.to === "s1" && e.kind === "fork"));
});

test("merge node has many parents and becomes the new main leaf", () => {
  const g = createGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "root", parent: null });
  g.addPlant({ id: "sA", title: "A", parent: "n1" });
  g.addPlant({ id: "sB", title: "B", parent: "n1" });
  g.addChat({ id: "a1", thread: "plant", plantId: "sA", prompt: "qa", parent: "sA" });
  g.addChat({ id: "b1", thread: "plant", plantId: "sB", prompt: "qb", parent: "sB" });
  g.addMerge({ id: "m1", parents: ["a1", "b1"], route: { kind: "additional_context" } });
  assert.equal(g.state.mainLeafId, "m1");
  const merge = g.state.nodes.get("m1");
  assert.deepEqual(merge.parents, ["a1", "b1"]);
  const mergedEdges = g.state.edges.filter((e) => e.kind === "merged-into" && e.to === "m1");
  assert.equal(mergedEdges.length, 2);
});

test("continuing after a merge attaches to the merge node", () => {
  const g = createGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "root", parent: null });
  g.addPlant({ id: "sA", title: "A", parent: "n1" });
  g.addChat({ id: "a1", thread: "plant", plantId: "sA", prompt: "qa", parent: "sA" });
  g.addMerge({ id: "m1", parents: ["a1"], route: { kind: "material_conflict" } });
  g.addChat({ id: "n2", thread: "main", prompt: "continue", parent: g.state.mainLeafId });
  const cont = g.state.nodes.get("n2");
  assert.equal(cont.parent, "m1");
  assert.equal(g.state.mainLeafId, "n2");
});

test("setResponse updates a chat node's response field", () => {
  const g = createGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "hi", parent: null });
  g.setResponse("n1", "hello!");
  assert.equal(g.state.nodes.get("n1").response, "hello!");
});

test("plantTip returns the latest chat node attached to a plant", () => {
  const g = createGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "root", parent: null });
  g.addPlant({ id: "sA", title: "A", parent: "n1" });
  g.addChat({ id: "a1", thread: "plant", plantId: "sA", prompt: "q1", parent: "sA" });
  g.addChat({ id: "a2", thread: "plant", plantId: "sA", prompt: "q2", parent: "a1" });
  assert.equal(g.plantTip("sA"), "a2");
});

test("reset clears all graph state", () => {
  const g = createGraph();
  g.addChat({ id: "n1", thread: "main", prompt: "root", parent: null });
  g.reset();
  assert.equal(g.state.rootId, null);
  assert.equal(g.state.mainLeafId, null);
  assert.equal(g.state.nodes.size, 0);
  assert.equal(g.state.edges.length, 0);
});
