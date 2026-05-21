// Network module — every call to the local prototype server lives here.
//
// Endpoints:
//   GET  /api/models     list models available across configured providers
//   POST /api/chat            single-turn chat in the active provider+model
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
 * Send one prompt to the model. Returns { answer, model, provider }.
 * @param {{ prompt: string, context?: string, system?: string, model?: ModelSelection }} args
 */
export function chat({ prompt, context, system, model }) {
  return postJSON("/api/chat", {
    prompt,
    context,
    system,
    provider: model?.provider || undefined,
    model: model?.model || undefined,
  });
}

/**
 * Classify a set of grafted plants into a merge route using the model-based
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
