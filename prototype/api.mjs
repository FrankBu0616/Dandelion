// Network module — browser-only edition.
//
// In the original local-server version, every function here was a thin
// `fetch('/api/...')` proxy to scripts/router-prototype-server.mjs. After the
// browser refactor the server is no longer required at runtime; we call the
// Anthropic API directly (with the user's own key, stored in localStorage)
// or the user's local Ollama. The Node server still exists for local dev
// (`npm start`) but the deployed prototype does not depend on it.
//
// Public surface (preserved from the old version so callers keep working):
//   listModels(), chat(), uploadFile(), classifyRoute(), continueThread(),
//   plus the session helpers which are now no-ops (sessions persist locally
//   via persistence.mjs's localStorage adapter).

import {
  chat as providerChat,
  listModels as providerListModels,
  uploadFile as providerUploadFile,
  activeProvider,
  activeModel,
} from './providers.mjs';
import { classifyRouteWithModel } from './classify-route.mjs';
import { buildDynamicContinuationPrompt } from './prompts.mjs';

/**
 * Return { default: {provider, model}, models: [...] } — same shape the
 * old GET /api/models endpoint returned, so the model-picker UI doesn't
 * need to change.
 */
export async function listModels() {
  const models = await providerListModels();
  return {
    default: { provider: activeProvider(), model: activeModel() },
    models,
  };
}

/**
 * @typedef {{ file_id: string, kind: 'document'|'image' }} Attachment
 * @typedef {{ role: 'system'|'user'|'assistant', content: string }} ContextMessage
 * @typedef {{ provider?: string, model?: string }} ModelSelection
 */

const DEFAULT_SYSTEM =
  'You are Dandelion, a concise assistant inside a local prototype. Answer directly and naturally.';

function sanitizeContextMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const allowed = new Set(['system', 'user', 'assistant']);
  return messages
    .map((m) => ({
      role: String(m?.role || ''),
      content: typeof m?.content === 'string' ? m.content.trim() : '',
    }))
    .filter((m) => allowed.has(m.role) && m.content);
}

// Build the user-message content: plain string when there are no attachments,
// otherwise an Anthropic-style content-block array referencing uploaded files.
function buildUserContent(prompt, attachments) {
  const text = prompt || '';
  if (!Array.isArray(attachments) || attachments.length === 0) return text;
  const blocks = attachments.map((att) => ({
    type: att.kind === 'image' ? 'image' : 'document',
    source: { type: 'file', file_id: att.file_id },
  }));
  if (text) blocks.push({ type: 'text', text });
  return blocks;
}

/**
 * Send one prompt to the model. Returns { answer, model, provider }.
 * @param {{ prompt: string, contextMessages?: ContextMessage[], system?: string, model?: ModelSelection, attachments?: Attachment[] }} args
 */
export async function chat({ prompt, contextMessages, system, model, attachments }) {
  const messages = [
    { role: 'system', content: system || DEFAULT_SYSTEM },
    ...sanitizeContextMessages(contextMessages),
    { role: 'user', content: buildUserContent(prompt, attachments) },
  ];
  const answer = await providerChat(messages, {
    model: model?.model,
    provider: model?.provider,
  });
  return {
    answer,
    model: model?.model || activeModel(),
    provider: model?.provider || activeProvider(),
  };
}

/**
 * Upload a file (PDF / image / text) to the Anthropic Files API.
 * Returns { id, filename, mime_type, size_bytes }.
 * @param {File | Blob} file
 */
export async function uploadFile(file) {
  return providerUploadFile(file);
}

/**
 * Classify grafted plants into a context route.
 * Returns { route: { kind, summary, choices }, model, provider }.
 * @param {{ plants: Array<object>, model?: ModelSelection }} args
 */
export async function classifyRoute({ plants, model }) {
  const route = await classifyRouteWithModel(plants, {
    model: model?.model,
    provider: model?.provider,
  });
  return {
    route,
    model: model?.model || activeModel(),
    provider: model?.provider || activeProvider(),
  };
}

/**
 * Continue the main thread given a set of grafted plants.
 * Returns { answer, model, provider }.
 */
export async function continueThread({
  parentContext,
  mainConversation,
  graftedPlants,
  route,
  followUp,
  model,
}) {
  const prompt = buildDynamicContinuationPrompt({
    parentContext,
    mainConversation,
    graftedPlants,
    route,
    followUp,
  });
  const answer = await providerChat(
    [
      {
        role: 'system',
        content: [
          'You are continuing one coherent conversation.',
          'Answer directly as if the relevant context is already part of the conversation.',
          'Do not mention merged context, plants, branches, transcripts, key claims, classification, or routing.',
          'Do not begin with setup language like "Given the discussions".',
        ].join('\n'),
      },
      { role: 'user', content: prompt },
    ],
    { model: model?.model, provider: model?.provider },
  );
  return {
    answer,
    model: model?.model || activeModel(),
    provider: model?.provider || activeProvider(),
  };
}

/* ────────── Sessions — now no-ops ──────────
 *
 * Sessions persist locally via persistence.mjs's localStorage adapter. The
 * old server-side session store has no analogue in the browser deploy. We
 * keep these functions exported (as no-ops) so bootstrap.mjs's optional
 * remote-adapter wiring continues to be safe:
 *   - list returns [], so sessions-sidebar shows local-only sessions.
 *   - fetch returns null, so persistence.fetchRemoteSession falls back to local.
 *   - put / delete resolve successfully without doing anything.
 */

export async function listSavedSessions() {
  return [];
}

export async function fetchSavedSession(_id) {
  return null;
}

export async function putSavedSession(_id, _snapshot) {
  return { ok: true };
}

export async function deleteSavedSession(_id) {
  return false;
}
