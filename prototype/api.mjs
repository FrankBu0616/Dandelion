// Network module — every call to the local prototype server lives here.
//
// Endpoints:
//   GET  /api/models     list models available across configured providers
//   POST /api/chat            current prompt + admitted context in the active provider+model
//   POST /api/files           upload a file to Anthropic; returns { id, ... }
//   POST /api/classify-route  classify grafted plants → { kind, summary, choices }
//   POST /api/continue        post-graft continuation, given grafted plants + route
//
// All functions throw on non-2xx so callers can fall back to scripted replies.

export async function listModels() {
  const response = await fetch("/api/models");
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

/**
 * @typedef {{ provider?: string, model?: string }} ModelSelection
 */

async function postJSON(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

/**
 * @typedef {{ file_id: string, kind: 'document'|'image' }} Attachment
 */

/**
 * @typedef {{ role: 'system'|'user'|'assistant', content: string }} ContextMessage
 */

/**
 * Send one prompt to the model. Returns { answer, model, provider }.
 * Pass `attachments` (file_ids from uploadFile) to include files in the turn.
 * @param {{ prompt: string, contextMessages?: ContextMessage[], system?: string, model?: ModelSelection, attachments?: Attachment[] }} args
 */
export function chat({ prompt, contextMessages, system, model, attachments }) {
  return postJSON("/api/chat", {
    prompt,
    contextMessages: contextMessages?.length ? contextMessages : undefined,
    system,
    attachments: attachments?.length ? attachments : undefined,
    provider: model?.provider || undefined,
    model: model?.model || undefined,
  });
}

/* ────────── Sessions ────────── */

/**
 * List saved sessions (metadata only — no body). Returns
 * `[{id, title, createdAt, updatedAt}, ...]` newest-first. Throws on non-2xx.
 */
export async function listSavedSessions() {
  const response = await fetch("/api/sessions");
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return Array.isArray(data?.sessions) ? data.sessions : [];
}

/** Fetch a single session snapshot by id, or null if 404. */
export async function fetchSavedSession(id) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

/** Persist a snapshot to the server. Body is the snapshot. */
export async function putSavedSession(id, snapshot) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

/** Delete a saved session by id. Returns `true` if it existed. */
export async function deleteSavedSession(id) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return Boolean(data?.deleted);
}

/**
 * Upload a file (PDF / image / text) to the Anthropic Files API via the
 * local prototype server. Returns { id, filename, mime_type, size_bytes }.
 * The returned `id` is what you pass as `attachments[].file_id` to chat().
 * @param {File | Blob} file  Browser File or Blob with a `.name` (Files have one).
 * @returns {Promise<{ id: string, filename: string, mime_type: string, size_bytes: number }>}
 */
export async function uploadFile(file) {
  const filename = file.name || "upload.bin";
  const mediaType = file.type || "application/octet-stream";
  const response = await fetch("/api/files", {
    method: "POST",
    headers: {
      "Content-Type": mediaType,
      "X-Filename": filename,
    },
    body: file,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

/**
 * Classify a set of grafted plants into a context route using the model-based
 * classifier. Returns { route: { kind, summary, choices }, model, provider }.
 * @param {{ plants: Array<object>, model?: ModelSelection }} args
 */
export function classifyRoute({ plants, model }) {
  return postJSON("/api/classify-route", {
    plants,
    provider: model?.provider || undefined,
    model: model?.model || undefined,
  });
}

/**
 * Ask the model to continue the main thread given a set of grafted plants.
 * Returns { answer, model, provider }.
 */
export function continueThread({
  parentContext,
  mainConversation,
  graftedPlants,
  route,
  followUp,
  model,
}) {
  return postJSON("/api/continue", {
    parentContext,
    mainConversation,
    graftedPlants,
    route,
    followUp,
    provider: model?.provider || undefined,
    model: model?.model || undefined,
  });
}
