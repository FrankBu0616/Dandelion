// Plant lifecycle — owns the state mutations and side effects for opening,
// sending in, closing, and reopening plants. The tray (prototype/plant-tray.mjs)
// is its UI counterpart; this module is the data side.
//
// `state.plants` and `state.activePlantId` live on the caller's state object.
// Every public method mutates that state and then calls `onChange()` so the
// tray can re-render. Plant streaming dispatches each tick through the
// injected `patchTurn(plantId, turnId, text, streaming)` callback — the tray
// owns the DOM, this module just produces text frames.
//
// Usage:
//
//   import { createPlants } from "./prototype/plants.mjs";
//   const plants = createPlants({
//     state, graph,
//     makeId,
//     onChange: () => plantTray.render(),
//   });
//   plants.open(composerInput.value);

import { generateReply } from "./scripted-content.mjs";
import * as api from "./api.mjs";

const PLANT_SYSTEM_PROMPT =
  "You are Dandelion running a plant investigation. Be specific, concise, and useful. Answer the plant's current prompt directly. Parent context is background only; if the plant prompt asks about a different subject, answer the plant prompt rather than recapping the parent.";

const PROVIDER_LABELS = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  ollama: "local Ollama",
};

function providerLabel(model) {
  return PROVIDER_LABELS[model?.provider] || "the selected provider";
}

function fallbackSuffix(model) {
  return `\n\n(${providerLabel(model)} was unavailable, so this used the scripted fallback.)`;
}

function durationFor(text) {
  return Math.max(2200, Math.min(6800, (text || "").length * 22));
}

/**
 * Serialize a seed's prior turns into chat-shape messages for the next
 * `/api/chat` request. Exported so it can be unit-tested without booting
 * the full createPlants factory.
 *
 * Rules:
 *   - The in-flight turn (matched by `currentTurnId`) is skipped — its
 *     user side is sent as the request's `prompt`, its assistant side
 *     is the streaming target.
 *   - Turns are emitted in order: user, then assistant (if non-streaming).
 *   - Empty strings are skipped (trimmed) so blank placeholders don't
 *     reach the wire.
 *
 * @param {Array<{id?: string, user?: string, asst?: string, status?: string}>} turns
 * @param {string} [currentTurnId]
 * @returns {Array<{role: "user"|"assistant", content: string}>}
 */
export function seedTurnsToMessages(turns, currentTurnId) {
  if (!Array.isArray(turns)) return [];
  const out = [];
  for (const t of turns) {
    if (!t || t.id === currentTurnId) continue;
    const user = String(t.user || "").trim();
    const asst = String(t.asst || "").trim();
    if (user) out.push({ role: "user", content: user });
    if (asst && t.status !== "streaming") out.push({ role: "assistant", content: asst });
  }
  return out;
}

export function createPlants({
  state,
  graph,
  makeId,
  onChange,
  patchTurn,
  focusComposer,
  clearComposer,
}) {
  function notify() {
    onChange?.();
  }
  function patch(plantId, turnId, text, streaming) {
    patchTurn?.(plantId, turnId, text, streaming);
  }
  function focusComposerLater(plantId) {
    focusComposer?.(plantId);
  }

  function open(draft = "") {
    const id = makeId();
    const st = {
      id,
      title: "",
      turns: [],
      composerDraft: draft,
      status: "idle",
      selected: false,
      model: state.currentModel,
    };
    state.plants.push(st);
    state.activePlantId = id;
    graph.addPlant({ id, title: "", parent: state.graph.mainLeafId });
    notify();
    focusComposerLater(id);
    return st;
  }

  function openFromMessage(message) {
    const id = makeId();
    const st = {
      id,
      title: "",
      parentMessageId: message.id,
      contextHint:
        message.text.slice(0, 60) + (message.text.length > 60 ? "…" : ""),
      turns: [],
      composerDraft: "",
      status: "idle",
      selected: true,
      model: state.currentModel,
    };
    state.plants.push(st);
    state.activePlantId = id;
    graph.addPlant({ id, title: "", parent: state.graph.mainLeafId });
    notify();
    focusComposerLater(id);
    return st;
  }

  async function send(plantId) {
    const st = state.plants.find((s) => s.id === plantId);
    if (!st || !st.composerDraft || !st.composerDraft.trim()) return;
    if (st.status === "running") return;

    const userText = st.composerDraft.trim();
    st.composerDraft = "";
    clearComposer?.(plantId);
    if (!st.title) {
      st.fullPrompt = userText;
      st.title = userText.length > 40 ? userText.slice(0, 40) + "…" : userText;
      graph.setPlantTitle(st.id, st.title);
    }
    const turn = { id: makeId(), user: userText, asst: "", status: "streaming" };
    const turnParent = st.turns.length > 0 ? st.turns[st.turns.length - 1].id : st.id;
    st.turns.push(turn);
    graph.addChat({
      id: turn.id,
      thread: "plant",
      plantId: st.id,
      prompt: userText,
      parent: turnParent,
    });
    st.status = "running";
    st.selected = true;
    notify();

    await streamFromModel(st, turn, userText);
  }

  async function streamFromModel(st, turn, prompt) {
    const model = st.model || state.currentModel;
    try {
      turn.asst = `Thinking with ${providerLabel(model)}…`;
      notify();
      // Build the context the model sees on this seed send. Two parts:
      //   1. Trunk history up to the seed's branch point — same context the
      //      user had visible when they spawned the seed, mute-filtered by
      //      the existing helper.
      //   2. The seed's OWN prior turns within this conversation, so the
      //      model has memory of what was said earlier in this seed.
      // Other seeds are intentionally NOT included — seeds are isolated.
      // The current in-flight turn is excluded (it gets sent as `prompt`).
      const trunkContext = state.parentContextMessagesForPlant?.(st) ?? [];
      const seedHistory = seedTurnsToMessages(st.turns, turn.id);
      const contextMessages = [...trunkContext, ...seedHistory];
      const data = await api.chat({
        prompt,
        contextMessages,
        system: PLANT_SYSTEM_PROMPT,
        model,
        // Session-scoped files (set in prototype.html). Seeds inherit any
        // file the user has uploaded so they can see the same attachments
        // the main thread does — minus any the user has muted.
        attachments: state.getAttachments?.() ?? [],
      });
      streamIn(st, turn, data.answer || "", durationFor(data.answer));
    } catch (err) {
      console.warn("Dandelion plant: model request failed, using scripted fallback", err);
      const reply = generateReply(prompt);
      streamIn(st, turn, reply.text + fallbackSuffix(model), reply.duration);
    }
  }


  // Character-by-character streaming. Each tick mutates turn.asst and asks the
  // renderer (the plant tray) to patch the in-place DOM. No full re-render per
  // frame; final completion triggers a normal notify() so graft eligibility
  // etc. refreshes properly.
  function streamIn(st, turn, fullText, durationMs) {
    const start = performance.now();
    const len = fullText.length;
    function tick(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const chars = Math.floor(t * len);
      turn.asst = fullText.slice(0, chars);
      patch(st.id, turn.id, turn.asst, t < 1);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        turn.status = "complete";
        st.status = "idle";
        graph.setResponse(turn.id, fullText);
        notify();
      }
    }
    requestAnimationFrame(tick);
  }

  function close(plantId) {
    state.plants = state.plants.filter((s) => s.id !== plantId);
    if (state.activePlantId === plantId) {
      state.activePlantId = state.plants[0] ? state.plants[0].id : null;
    }
    notify();
  }

  function closeAll() {
    state.plants = [];
    state.activePlantId = null;
    notify();
  }

  function reopenGrafted(plantData) {
    const existing = state.plants.find((s) => s._graftedKey === plantData._graftedKey);
    if (existing) {
      state.activePlantId = existing.id;
      notify();
      return existing;
    }
    const id = makeId();
    const reopenedTurns = plantData.turns.map((t) => ({
      id: makeId(),
      user: t.user,
      asst: t.asst,
      status: "complete",
    }));
    const st = {
      id,
      title: plantData.title || "Grafted seed",
      turns: reopenedTurns,
      composerDraft: "",
      status: "idle",
      selected: false,
      model: plantData.model || state.currentModel,
      _graftedKey: plantData._graftedKey,
      fullPrompt: plantData.fullPrompt,
    };
    state.plants.push(st);
    state.activePlantId = id;
    graph.addPlant({ id, title: st.title, parent: state.graph.mainLeafId });
    let prev = id;
    for (const t of reopenedTurns) {
      graph.addChat({
        id: t.id,
        thread: "plant",
        plantId: id,
        prompt: t.user,
        response: t.asst,
        parent: prev,
      });
      prev = t.id;
    }
    notify();
    return st;
  }

  return { open, openFromMessage, send, close, closeAll, reopenGrafted };
}
