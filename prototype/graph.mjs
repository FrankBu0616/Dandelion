// Dandelion shadow DAG — Phase 1.
//
// The conversation is modeled as a graph of chat nodes (one parent, prompt +
// response), plant container nodes (forks off the main thread), and merge
// nodes (many parents). See docs/data_model.md for the canonical shape.
//
// Phase 1 is write-only: the prototype mirrors every mainConv / plants mutation
// into this graph so Phase 2 can verify a walkContext() against the existing
// parentContext blob before Phase 3 cuts over reads.
//
// `createGraph()` returns an object with both the graph state and the methods
// that mutate it. The state is held on the returned object so callers can
// pass it around or persist it without going through globals.

export function createGraph() {
  const state = {
    nodes: new Map(),  // id -> node
    edges: [],         // {from, to, kind}
    rootId: null,
    mainLeafId: null,  // current main-thread tip; new main turns attach here
  };

  return {
    state,

    reset() {
      state.nodes.clear();
      state.edges = [];
      state.rootId = null;
      state.mainLeafId = null;
    },

    /**
     * Add a chat node (prompt + response, one parent).
     * thread: "main" or "plant". plantId optional, set when thread === "plant".
     */
    addChat({ id, thread, plantId = null, prompt, response = "", parent, modelLabel = null }) {
      const node = { id, kind: "chat", thread, plantId, prompt, response, parent, modelLabel };
      state.nodes.set(id, node);
      if (parent) state.edges.push({ from: parent, to: id, kind: "next" });
      if (!state.rootId) state.rootId = id;
      if (thread === "main") state.mainLeafId = id;
      return node;
    },

    /**
     * Add a plant container node. Forks off main-thread leaf at creation time.
     */
    addPlant({ id, title, parent }) {
      const node = { id, kind: "plant", title, parent };
      state.nodes.set(id, node);
      if (parent) state.edges.push({ from: parent, to: id, kind: "fork" });
      return node;
    },

    /**
     * Add a merge node. parents = last chat node of each grafted plant.
     * Becomes the new main-thread leaf.
     */
    addMerge({ id, parents, route }) {
      const node = { id, kind: "merge", parents: [...parents], route };
      state.nodes.set(id, node);
      for (const p of parents) state.edges.push({ from: p, to: id, kind: "merged-into" });
      state.mainLeafId = id;
      return node;
    },

    /** Update the route classification on an existing merge node. */
    setRoute(id, route) {
      const n = state.nodes.get(id);
      if (n && n.kind === "merge") n.route = route;
    },

    /** Update a streaming response after it finishes. */
    setResponse(id, response) {
      const n = state.nodes.get(id);
      if (n && n.kind === "chat") n.response = response;
    },

    /** Update a plant title once the user's first turn names it. */
    setPlantTitle(id, title) {
      const n = state.nodes.get(id);
      if (n && n.kind === "plant") n.title = title;
    },

    /**
     * Return the id of the most recent chat node attached to a plant.
     * Used to find merge-parents (the tip of each grafted plant).
     */
    plantTip(plantId) {
      let tip = plantId;
      for (const n of state.nodes.values()) {
        if (n.kind === "chat" && n.plantId === plantId && n.parent === tip) {
          tip = n.id;
        }
      }
      // O(n²) worst case but n is tiny for a prototype session.
      return tip;
    },

    toJSON() {
      return {
        rootId: state.rootId,
        mainLeafId: state.mainLeafId,
        nodes: [...state.nodes.values()],
        edges: state.edges,
      };
    },
  };
}
