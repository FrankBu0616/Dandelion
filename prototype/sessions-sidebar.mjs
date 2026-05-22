// Sessions sidebar — slide-out drawer listing saved sessions. Click a row
// to load that session into the active workspace. Hover for rename/delete.
//
// The factory takes:
//   - dom:      { drawer, list, button, closeBtn, newBtn, emptyState }
//   - persistence: a createPersistence() instance (for the local cache list)
//   - api:      module with listSavedSessions / deleteSavedSession (server)
//   - callbacks: {
//       onLoadSession(id),     // user clicked a row
//       onNewSession(),        // user clicked "+ New session"
//       onDeleteSession(id),   // user confirmed delete (caller deletes)
//       onRenameSession(id, title), // user committed an inline rename
//       getActiveSessionId(),  // for highlighting the active row
//     }
//
// Loads merge two sources: local snapshots in `persistence.listSessions()`
// and remote snapshots from `api.listSavedSessions()`. The remote is
// authoritative when reachable — sessions persist across browsers/devices.

import { escapeHtml } from "./escape.mjs";

const RELATIVE_TIME_THRESHOLDS = [
  [60 * 1000, "just now"],
  [60 * 60 * 1000, (ms) => `${Math.round(ms / 60000)}m ago`],
  [24 * 60 * 60 * 1000, (ms) => `${Math.round(ms / 3600000)}h ago`],
  [30 * 24 * 60 * 60 * 1000, (ms) => `${Math.round(ms / (24 * 3600000))}d ago`],
  [365 * 24 * 60 * 60 * 1000, (ms) => `${Math.round(ms / (30 * 24 * 3600000))}mo ago`],
];

function relativeTime(updatedAt) {
  if (!updatedAt) return "—";
  const diff = Math.max(0, Date.now() - updatedAt);
  for (const [bound, label] of RELATIVE_TIME_THRESHOLDS) {
    if (diff < bound) return typeof label === "function" ? label(diff) : label;
  }
  return new Date(updatedAt).toLocaleDateString();
}

/** Merge local + remote entries by id, preferring the one with the newer
 *  updatedAt timestamp. Used so cross-browser sessions on the server show
 *  up even if this browser's localStorage has never seen them. */
function mergeEntries(local, remote) {
  const byId = new Map();
  for (const e of local || []) {
    if (e?.id) byId.set(e.id, { ...e });
  }
  for (const e of remote || []) {
    if (!e?.id) continue;
    const existing = byId.get(e.id);
    if (!existing || (e.updatedAt || 0) > (existing.updatedAt || 0)) {
      byId.set(e.id, { ...e });
    }
  }
  return [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function createSessionsSidebar({ dom, persistence, api, callbacks = {} }) {
  const { drawer, list, button, closeBtn, newBtn, emptyState } = dom;
  const {
    onLoadSession,
    onNewSession,
    onDeleteSession,
    onRenameSession,
    getActiveSessionId,
  } = callbacks;
  let open = false;
  let entries = [];
  let renamingId = null;

  function setOpen(next) {
    open = next;
    drawer.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    button?.classList.toggle("active", open);
    button?.setAttribute("aria-expanded", String(open));
    if (open) refresh();
  }

  async function refresh() {
    const local = persistence.listSessions();
    let remote = null;
    if (typeof persistence.listRemoteSessions === "function") {
      remote = await persistence.listRemoteSessions();
    } else if (api?.listSavedSessions) {
      try { remote = await api.listSavedSessions(); }
      catch { remote = null; }
    }
    entries = mergeEntries(local, remote);
    render();
  }

  function render() {
    if (!list) return;
    list.innerHTML = "";
    if (entries.length === 0) {
      if (emptyState) emptyState.hidden = false;
      return;
    }
    if (emptyState) emptyState.hidden = true;

    const activeId = getActiveSessionId?.() || null;
    for (const entry of entries) {
      const isActive = entry.id === activeId;
      const isRenaming = entry.id === renamingId;
      const row = document.createElement("div");
      row.className = "sessions-row" + (isActive ? " is-active" : "");
      row.dataset.sessionId = entry.id;

      const titleEl = isRenaming
        ? `<input class="sessions-row-rename" type="text" value="${escapeHtml(entry.title || "")}" />`
        : `<div class="sessions-row-title" title="${escapeHtml(entry.title || "")}">${escapeHtml(entry.title || "Untitled")}</div>`;

      row.innerHTML =
        `<button class="sessions-row-open" type="button" aria-label="Open session">` +
          titleEl +
          `<div class="sessions-row-meta">${escapeHtml(relativeTime(entry.updatedAt))}</div>` +
        `</button>` +
        `<div class="sessions-row-actions">` +
          `<button class="sessions-row-rename-btn" type="button" title="Rename" aria-label="Rename">✎</button>` +
          `<button class="sessions-row-delete-btn" type="button" title="Delete (cannot be undone)" aria-label="Delete">🗑</button>` +
        `</div>`;

      const openBtn = row.querySelector(".sessions-row-open");
      openBtn.addEventListener("click", () => {
        if (renamingId === entry.id) return; // ignore click while renaming
        onLoadSession?.(entry.id);
      });

      row.querySelector(".sessions-row-rename-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        renamingId = entry.id;
        render();
        // Focus the input after render.
        requestAnimationFrame(() => {
          const input = list.querySelector(`.sessions-row[data-session-id="${entry.id}"] .sessions-row-rename`);
          input?.focus();
          input?.select();
        });
      });

      row.querySelector(".sessions-row-delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        const ok = confirm(`Delete "${entry.title || "Untitled"}"? This cannot be undone.`);
        if (!ok) return;
        onDeleteSession?.(entry.id);
        // Optimistic local update — refresh will re-sync from server next.
        entries = entries.filter((x) => x.id !== entry.id);
        render();
      });

      const renameInput = row.querySelector(".sessions-row-rename");
      if (renameInput) {
        const commit = (cancel) => {
          const newTitle = renameInput.value.trim();
          renamingId = null;
          if (!cancel && newTitle && newTitle !== entry.title) {
            entry.title = newTitle; // optimistic
            onRenameSession?.(entry.id, newTitle);
          }
          render();
        };
        renameInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(false); }
          else if (e.key === "Escape") { e.preventDefault(); commit(true); }
        });
        renameInput.addEventListener("blur", () => commit(false));
      }

      list.appendChild(row);
    }
  }

  button?.addEventListener("click", () => setOpen(!open));
  closeBtn?.addEventListener("click", () => setOpen(false));
  newBtn?.addEventListener("click", () => {
    onNewSession?.();
    setOpen(false);
  });

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    refresh,
  };
}
