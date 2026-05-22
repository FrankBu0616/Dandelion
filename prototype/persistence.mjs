// Phase 1 persistence — single-browser, localStorage-backed.
//
// Schema (versioned from day one — see SCHEMA_VERSION):
//
//   {
//     schemaVersion: 1,
//     meta: { id, title, createdAt, updatedAt },
//     graph:                graph.toJSON()   // canonical structural source
//     mainConv,             // ordered trunk items (rebuildable from graph
//                           // long-term; stored verbatim now to avoid the
//                           // reconstructor lift)
//     plants,               // active seed tray
//     sessionFiles,         // {name, mediaType, fileId, muted} — bytes live
//                           // in Anthropic's workspace, we store refs only
//     parentContext,
//     parentContextMuted,
//     currentModelSelection // {provider, model} — re-attached on load via
//                           // the picker
//     nextId                // so restored ids don't collide with new ones
//   }
//
// Storage layout in localStorage:
//
//   dandelion:current               → session id of the active session
//   dandelion:session:<id>          → JSON snapshot
//   dandelion:index                 → [{id, title, updatedAt}, ...] recent-first
//
// The persistence layer is pure: snapshotFromState / applySnapshot don't
// touch the DOM or storage. The optional Storage adapter wraps localStorage
// so tests can pass an in-memory fake.

export const SCHEMA_VERSION = 1;
const KEY_CURRENT = "dandelion:current";
const KEY_SESSION = (id) => `dandelion:session:${id}`;
const KEY_INDEX = "dandelion:index";
const MAX_INDEX_ENTRIES = 30;

/* ────────── Snapshot construction ────────── */

/**
 * Build a JSON-safe snapshot of the current `state` + `graph`. Pure: doesn't
 * mutate either. `meta` is stamped/refreshed (createdAt preserved if present).
 *
 * @param {object} state
 * @param {{toJSON: () => any}} graph
 * @param {{id: string, title?: string, createdAt?: number}} [meta]
 */
export function snapshotFromState(state, graph, meta = { id: "" }) {
  if (!meta || typeof meta.id !== "string" || !meta.id) {
    throw new Error("snapshotFromState: meta.id is required");
  }
  const now = Date.now();
  // Treat the "Untitled session" placeholder as still-no-title-yet so it
  // gets re-derived once a real user turn lands. This is the path a
  // file-first session takes: upload kicks the first save before any user
  // message exists, so the snapshot's title is the placeholder; on the
  // *next* save (after the user sends), we want to re-derive instead of
  // staying frozen as "Untitled session".
  const isPlaceholder = !meta.title || meta.title === "Untitled session";
  const title = isPlaceholder ? deriveTitle(state) : meta.title;
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      id: meta.id,
      title,
      createdAt: meta.createdAt || now,
      updatedAt: now,
    },
    graph: graph.toJSON(),
    mainConv: deepClone(state.mainConv || []),
    plants: deepClone(state.plants || []),
    activePlantId: state.activePlantId || null,
    postGraftArmed: !!state.postGraftArmed,
    sessionFiles: deepClone(state.sessionFiles || []),
    parentContext: state.parentContext || null,
    parentContextMuted: !!state.parentContextMuted,
    currentModelSelection: state.currentModel
      ? { provider: state.currentModel.provider, model: state.currentModel.model }
      : null,
    nextId: state.nextId || 1,
  };
}

/**
 * Restore a snapshot into the live `state` + `graph` objects. Mutates both.
 * Returns the restored `meta` so callers can update their session pointer.
 * Sweeps in-flight streaming items to "interrupted" so the UI doesn't show
 * a perpetual cursor with no animator behind it.
 */
export function applySnapshot(snapshot, { state, graph }) {
  if (!isSupportedSnapshot(snapshot)) {
    throw new Error(`Unsupported snapshot schemaVersion: ${snapshot?.schemaVersion}`);
  }
  graph.fromJSON(snapshot.graph || {});
  state.graph = graph.state;
  state.mainConv = deepClone(snapshot.mainConv || []);
  state.plants = deepClone(snapshot.plants || []);
  state.activePlantId = snapshot.activePlantId || null;
  state.postGraftArmed = !!snapshot.postGraftArmed;
  state.sessionFiles = deepClone(snapshot.sessionFiles || []);
  state.parentContext = snapshot.parentContext || null;
  state.parentContextMuted = !!snapshot.parentContextMuted;
  state.nextId = Math.max(1, snapshot.nextId || 1);

  sweepInterruptedStreaming(state);

  return { ...snapshot.meta };
}

/**
 * Best-effort title from the first user turn. Bootstrap can pass in a custom
 * one via `meta.title` to override.
 */
export function deriveTitle(state) {
  const firstUser = (state.mainConv || []).find((it) => it && it.kind === "user");
  const text = (firstUser?.text || "").replace(/\s+/g, " ").trim();
  if (!text) return "Untitled session";
  return text.length > 60 ? text.slice(0, 60) + "…" : text;
}

/* ────────── Schema + sweeps ────────── */

export function isSupportedSnapshot(snapshot) {
  return Boolean(snapshot) && snapshot.schemaVersion === SCHEMA_VERSION;
}

/**
 * Any assistant turn marked `status: "streaming"` at save time is orphaned
 * after a reload — no rAF tick is driving its text. Move them to a terminal
 * status so the renderer stops showing a blinking cursor. We use
 * "interrupted" so the UI can choose to surface it differently from a
 * clean "complete".
 */
function sweepInterruptedStreaming(state) {
  for (const it of state.mainConv || []) {
    if (it && it.kind === "assistant" && it.status === "streaming") {
      it.status = "interrupted";
    }
  }
  for (const plant of state.plants || []) {
    if (plant?.status === "running") plant.status = "idle";
    for (const turn of plant?.turns || []) {
      if (turn && turn.status === "streaming") turn.status = "interrupted";
    }
  }
}

/* ────────── Index ────────── */

/**
 * Update the recent-sessions index: bump the entry for `meta.id` to the top
 * (newest first). Caps the index at MAX_INDEX_ENTRIES; older entries' session
 * snapshots stay on disk until explicitly deleted, but they fall out of the
 * sidebar.
 */
export function updateIndex(prevIndex, meta) {
  const list = Array.isArray(prevIndex) ? prevIndex.filter((e) => e?.id !== meta.id) : [];
  list.unshift({ id: meta.id, title: meta.title, updatedAt: meta.updatedAt });
  return list.slice(0, MAX_INDEX_ENTRIES);
}

export function removeFromIndex(prevIndex, id) {
  if (!Array.isArray(prevIndex)) return [];
  return prevIndex.filter((e) => e?.id !== id);
}

/* ────────── Storage adapter ────────── */

/**
 * Wrap a `Storage`-like object (localStorage in the browser, an in-memory
 * mock in tests). Returns a thin API with debounced save and direct
 * load/list/delete operations.
 */
/**
 * Optional remote adapter — mirrors saves to a server and is consulted on
 * load. The shape is intentionally minimal so tests can substitute a mock
 * or pass `null` to skip server mirroring entirely. See
 * `prototype/api.mjs` for the production wiring.
 *
 * @typedef {Object} RemoteAdapter
 * @property {(snapshot: any) => Promise<void>} putSession
 * @property {(id: string) => Promise<any|null>} fetchSession
 * @property {() => Promise<Array<{id: string, title: string, updatedAt: number}>>} listSessions
 * @property {(id: string) => Promise<boolean>} deleteSession
 */

export function createPersistence({ storage, remote = null, debounceMs = 250 } = {}) {
  if (!storage) throw new Error("createPersistence: storage is required");
  let timer = null;
  let pendingSnapshot = null;
  // Tracks the last remote-mirror attempt for the active session. When a
  // save races ahead of the in-flight mirror we coalesce to the newest
  // snapshot (drop intermediates — only the latest matters).
  let remoteInflight = null;
  let remoteQueued = null;

  function readJSON(key) {
    try {
      const raw = storage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      // Likely QuotaExceededError — log and move on. Persistence is best-
      // effort for a local prototype; we don't want save failures to break
      // the live UI.
      console.warn("Dandelion persistence: write failed for", key, err);
      return false;
    }
  }

  function flush() {
    if (!pendingSnapshot) return;
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;
    if (timer) { clearTimeout(timer); timer = null; }
    writeJSON(KEY_SESSION(snapshot.meta.id), snapshot);
    writeJSON(KEY_CURRENT, snapshot.meta.id);
    const index = readJSON(KEY_INDEX) || [];
    writeJSON(KEY_INDEX, updateIndex(index, snapshot.meta));
    mirrorToRemote(snapshot);
  }

  function mirrorToRemote(snapshot) {
    if (!remote || typeof remote.putSession !== "function") return;
    // Coalesce concurrent saves: if a request is already flying, queue the
    // newest snapshot and fire it once the current settles. Older queued
    // entries are dropped — they're already stale.
    if (remoteInflight) { remoteQueued = snapshot; return; }
    remoteInflight = Promise.resolve(remote.putSession(snapshot))
      .catch((err) => console.warn("Dandelion remote save failed:", err))
      .finally(() => {
        remoteInflight = null;
        const next = remoteQueued;
        remoteQueued = null;
        if (next) mirrorToRemote(next);
      });
  }

  function scheduleSave(snapshot) {
    pendingSnapshot = snapshot;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  }

  return {
    /** Persist `snapshot` (debounced). Repeated calls coalesce. */
    save: scheduleSave,
    /** Flush any pending save synchronously. */
    flush,
    /** Load the snapshot for the current session, if any. */
    loadCurrent() {
      // KEY_CURRENT is written as JSON (writeJSON), so read it the same way
      // — getItem returns a quoted string otherwise.
      const id = readJSON(KEY_CURRENT);
      return id ? readJSON(KEY_SESSION(id)) : null;
    },
    /** Load any session by id. */
    loadSession(id) {
      return id ? readJSON(KEY_SESSION(id)) : null;
    },
    /** Return the recent-sessions index, newest first. */
    listSessions() {
      return readJSON(KEY_INDEX) || [];
    },
    /** Mark a different session as current (used when switching). */
    setCurrent(id) {
      if (id) writeJSON(KEY_CURRENT, id);
      else storage.removeItem(KEY_CURRENT);
    },
    /** Clear the "current" pointer without deleting the snapshot. */
    clearCurrent() {
      storage.removeItem(KEY_CURRENT);
    },
    /** Delete a session and remove it from the index. Mirrors to remote. */
    deleteSession(id) {
      if (!id) return;
      storage.removeItem(KEY_SESSION(id));
      const index = readJSON(KEY_INDEX) || [];
      writeJSON(KEY_INDEX, removeFromIndex(index, id));
      if (readJSON(KEY_CURRENT) === id) storage.removeItem(KEY_CURRENT);
      if (remote && typeof remote.deleteSession === "function") {
        Promise.resolve(remote.deleteSession(id))
          .catch((err) => console.warn("Dandelion remote delete failed:", err));
      }
    },

    /**
     * Reach to the server (if a remote adapter is configured) for the
     * authoritative session list and per-session snapshots. Returns null
     * when no remote is configured. Used by the sidebar UI to show
     * cross-browser sessions, not just localStorage entries.
     */
    async listRemoteSessions() {
      if (!remote || typeof remote.listSessions !== "function") return null;
      try { return await remote.listSessions(); }
      catch (err) { console.warn("Dandelion remote list failed:", err); return null; }
    },
    async fetchRemoteSession(id) {
      if (!remote || typeof remote.fetchSession !== "function") return null;
      try { return await remote.fetchSession(id); }
      catch (err) { console.warn("Dandelion remote fetch failed:", err); return null; }
    },
  };
}

/* ────────── Small helpers ────────── */

function deepClone(value) {
  // structuredClone handles dates, Maps, etc. — but our snapshot is plain
  // JSON-able state, so JSON parse/stringify is fast and dependency-free.
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** Generate a short session id. Crypto-random in the browser; weak fallback
 *  is only for non-browser test environments. */
export function newSessionId() {
  const cryptoRef = (typeof globalThis !== "undefined" && globalThis.crypto) || null;
  if (cryptoRef?.randomUUID) return "sess_" + cryptoRef.randomUUID().slice(0, 8);
  return "sess_" + Math.random().toString(36).slice(2, 10);
}
