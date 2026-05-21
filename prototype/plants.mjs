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
  "You are Dandelion running a plant investigation. Be specific, concise, and useful.";

const FALLBACK_SUFFIX =
  "\n\n(Local Ollama was unavailable, so this used the scripted fallback.)";

function durationFor(text) {
  return Math.max(2200, Math.min(6800, (text || "").length * 22));
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
      contextHint:
        message.text.slice(0, 60) + (message.text.length > 60 ? "…" : ""),
      turns: [],
      composerDraft: "",
      status: "idle",
      selected: true,
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
    try {
      turn.asst = "Thinking with local Ollama…";
      notify();
      const data = await api.chat({
        prompt,
        context: state.parentContext,
        system: PLANT_SYSTEM_PROMPT,
        model: state.currentModel,
      });
      streamIn(st, turn, data.answer || "", durationFor(data.answer));
    } catch {
      const reply = generateReply(prompt);
      streamIn(st, turn, reply.text + FALLBACK_SUFFIX, reply.duration);
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
      _graftedKey: plantData._graftedKey,
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
