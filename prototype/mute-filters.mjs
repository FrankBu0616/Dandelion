// Pure mute-filter helpers — single source of truth for "what does the model
// actually see on the next send?"
//
// Three filters cover today's mutable surfaces:
//
//   - filterAttachments(sessionFiles)            → file_id list for the wire
//   - filterParentContext(state)                  → string | null
//   - filterMainConv(state, { stopAssistantId, excludeAssistantId, ... })
//                                                → conv items the replay
//                                                  builder should consider
//   - filterGraftPlants(plants)                   → plants for continuation
//
// All four are pure functions over the state object; no DOM, no I/O. Call
// sites (currentReadyAttachments in prototype.html, mainContextMessages,
// streamContinue in main-thread.mjs) route through these so adding a new
// mutable segment type is a one-place change.

/**
 * @typedef {{ file_id: string, kind: 'document'|'image' }} Attachment
 */

/**
 * Map a media type to the Anthropic content-block kind we'll use.
 * Mirrors `attachmentKindFor` in prototype.html.
 */
export function attachmentKindFor(mediaType) {
  return (mediaType || "").startsWith("image/") ? "image" : "document";
}

/**
 * Filter session files to the attachment payload shape: ready, has a file_id,
 * and not muted. Returns the list the next request should include.
 *
 * @param {Array<{status: string, fileId?: string, mediaType?: string, muted?: boolean}>} sessionFiles
 * @returns {Attachment[]}
 */
export function filterAttachments(sessionFiles) {
  if (!Array.isArray(sessionFiles)) return [];
  return sessionFiles
    .filter((a) => a && a.status === "ready" && a.fileId && !a.muted)
    .map((a) => ({ file_id: a.fileId, kind: attachmentKindFor(a.mediaType) }));
}

/**
 * Parent context for the next send. Returns null when the user has muted
 * the Root segment. String otherwise.
 *
 * @param {{parentContext?: string|null, parentContextMuted?: boolean}} state
 * @returns {string|null}
 */
export function filterParentContext(state) {
  if (!state) return null;
  if (state.parentContextMuted) return null;
  return state.parentContext || null;
}

/**
 * Filter grafted plants for the continuation prompt: skip muted plants.
 *
 * @param {Array<{muted?: boolean}>} plants
 * @returns {Array}
 */
export function filterGraftPlants(plants) {
  if (!Array.isArray(plants)) return [];
  return plants.filter((p) => p && !p.muted);
}

/**
 * Walk the main conversation array and decide which items should be replayed
 * into the next request. Honors:
 *   - `.muted` on user / assistant / conflict-choice items
 *   - `.muted` on each plant inside a `graft-marker` item
 *   - `stopAssistantId`  → stop after emitting the named assistant turn
 *   - `excludeAssistantId` → omit that assistant turn AND its preceding user
 *     (so a turn that is being streamed/regenerated doesn't appear in its
 *     own context)
 *
 * Returns the raw conv items (caller decides how to serialize). Items with
 * unhandled `kind` are skipped.
 *
 * @param {{mainConv: any[]}} state
 * @param {{stopAssistantId?: string, excludeAssistantId?: string}} [opts]
 */
export function filterMainConv(state, { stopAssistantId = null, excludeAssistantId = null } = {}) {
  const conv = state?.mainConv;
  if (!Array.isArray(conv)) return [];

  const excludeIdx = excludeAssistantId
    ? conv.findIndex((item) => item?.kind === "assistant" && item.id === excludeAssistantId)
    : -1;
  const hardStopIdx = excludeIdx > 0 && conv[excludeIdx - 1]?.kind === "user"
    ? excludeIdx - 1
    : excludeIdx;
  const limit = hardStopIdx >= 0 ? hardStopIdx : conv.length;

  const out = [];
  for (let i = 0; i < limit; i++) {
    const item = conv[i];
    if (!item) continue;
    if (item.kind === "user") {
      if (item.muted) continue;
      out.push(item);
      continue;
    }
    if (item.kind === "assistant") {
      if (!item.muted) out.push(item);
      if (item.id === stopAssistantId) break;
      continue;
    }
    if (item.kind === "graft-marker") {
      const activePlants = filterGraftPlants(item.plants || []);
      if (activePlants.length > 0) {
        // Emit a shallow copy with the muted plants stripped so callers
        // never see them. Preserves identity-class fields (id, route).
        out.push({ ...item, plants: activePlants });
      }
      continue;
    }
    if (item.kind === "conflict-choice" && item.resolved && !item.muted) {
      out.push(item);
    }
  }
  return out;
}
