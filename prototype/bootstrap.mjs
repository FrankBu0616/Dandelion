// Application bootstrap — runs once on page load. Owns the shared `state`
// object, wires every feature module to its DOM nodes, and routes events.
//
// This file is intentionally the "host" of the prototype: feature modules
// (main-thread, plants, plant-tray, graft, context-inspector, etc.) are
// pure factories that take `state + dom + callbacks` and return an API.
// Anything that has to know about the *whole app* — composing them together,
// the session reset, the mute-aware payload helpers, the streaming-state
// gating of plant buttons — lives here.
//
// See prototype/types.mjs for the shape of the shared `state` object.

import { createGraph } from "./graph.mjs";
import { createModelPicker } from "./model-picker.mjs";
import { createPlantTray } from "./plant-tray.mjs";
import { autoSizeTextarea } from "./dom-utils.mjs";
import * as api from "./api.mjs";
import { createMainThread } from "./main-thread.mjs";
import { createPlants } from "./plants.mjs";
import { createGraft } from "./graft.mjs";
import { createContextInspector } from "./context-inspector.mjs";
import {
  filterAttachments,
  filterParentContext,
  filterMainConv,
} from "./mute-filters.mjs";
import {
  createPersistence,
  snapshotFromState,
  applySnapshot,
  newSessionId,
  deriveTitle,
} from "./persistence.mjs";
import { createSessionsSidebar } from "./sessions-sidebar.mjs";
import { createSettingsUI, openSettingsIfUnconfigured } from "./settings-ui.mjs";

/* ============================================================
   STATE
   ============================================================ */
const graph = createGraph();
const state = {
  parentContext: null,
  mainConv: [],       // user/assistant/graft-marker items
  plants: [],         // {id, title, turns, composerDraft, status, selected}
  activePlantId: null,
  nextId: 1,
  postGraftArmed: false,
  currentModel: { id: "", label: "loading…", kind: "local", provider: "", model: "" },
  availableModels: [],
  // Shadow DAG — Phase 1. See prototype/graph.mjs and docs/data_model.md.
  graph: graph.state,
};
function makeId() { return "n" + (state.nextId++); }
// Dev helper: inspect the graph from DevTools.
if (typeof window !== "undefined") {
  window.__dumpGraph = () => {
    const json = graph.toJSON();
    console.log("[Dandelion graph]", json);
    return json;
  };
}

/* ============================================================
   PERSISTENCE (see prototype/persistence.mjs)
   ============================================================ */
// Remote adapter: mirror local saves to the server (./sessions/<id>.json)
// and consult it for the cross-browser session list. Failures are
// non-fatal — localStorage is the offline fallback.
const remoteAdapter = {
  putSession: (snapshot) => api.putSavedSession(snapshot.meta.id, snapshot),
  fetchSession: (id) => api.fetchSavedSession(id),
  listSessions: () => api.listSavedSessions(),
  deleteSession: (id) => api.deleteSavedSession(id),
};
const persistence = createPersistence({
  storage: window.localStorage,
  remote: remoteAdapter,
});
// `sessionMeta` is the saved-snapshot identity for the active session.
// Updated on session creation, load, and rename. Snapshots key off this id.
let sessionMeta = { id: newSessionId(), title: "", createdAt: Date.now() };

// Last-saved signature of the state's *content* (everything except
// `updatedAt`). We compare against this on every persistNow call to
// suppress redundant writes — most importantly the one that fires from
// the render right after `loadSession`, which would otherwise stamp the
// just-opened session as "just now" in the sidebar.
let lastSavedSignature = null;

function contentSignatureOf(snapshot) {
  // updatedAt is the field we *want* to be allowed to differ. Everything
  // else (graph, mainConv, plants, attachments, mute flags, model, title)
  // counts as "the content" for the purpose of deciding "did anything
  // actually change?"
  const { meta, ...rest } = snapshot;
  return JSON.stringify({ ...rest, title: meta.title });
}

function hasMeaningfulContent(state) {
  return (state.mainConv?.length || 0) > 0
    || (state.plants?.length || 0) > 0
    || (state.sessionFiles?.length || 0) > 0
    || Boolean(state.parentContext);
}

function persistNow() {
  // Skip empty sessions — otherwise every "New session" click leaves an
  // "Untitled session" entry in the sidebar before the user has typed.
  if (!hasMeaningfulContent(state)) return;
  const snapshot = snapshotFromState(state, graph, sessionMeta);
  const signature = contentSignatureOf(snapshot);
  if (signature === lastSavedSignature) return;
  lastSavedSignature = signature;
  sessionMeta = { ...sessionMeta, title: snapshot.meta.title, updatedAt: snapshot.meta.updatedAt };
  persistence.save(snapshot);
}

if (typeof window !== "undefined") {
  // Flush any pending save before navigation so a quick reload doesn't lose
  // the last typed turn.
  window.addEventListener("beforeunload", () => persistence.flush());
}

/* ============================================================
   DOM
   ============================================================ */
const $ = (s) => document.querySelector(s);
const mainColumn = $("#main-column");
const mainInner = $("#main-inner");
const plantColumn = $("#plant-column");
const plantColumnBody = $("#plant-column-body");
const plantColumnSubtitle = $("#plant-column-subtitle");
const graftBtn = $("#graft-btn");
const graftHint = $("#graft-hint");
const composerInput = $("#composer-input");
const composerSend = $("#composer-send");
const composerAttach = $("#composer-attach");
const composerFileInput = $("#composer-file-input");
const composerAttachments = $("#composer-attachments");
const plantBtn = $("#plant-btn");
const plantCountEl = $("#plant-count");
const contextOpenBtn = $("#context-open-btn");
const contextOpenBtnCount = $("#context-open-btn-count");
const contextInspectorEl = $("#context-inspector");
const contextLedger = $("#context-ledger");
const contextInspectorCount = $("#context-inspector-count");
const contextCloseBtn = $("#context-close-btn");
const modelChip = $("#model-chip");
const modelMenu = $("#model-menu");
const modelName = $("#model-name");
const modelDot = $("#model-dot");
const metaModel = $("#meta-model");

/* ============================================================
   MAIN THREAD (see prototype/main-thread.mjs)
   ============================================================ */
const mainThread = createMainThread({
  dom: { column: mainColumn, inner: mainInner },
  state,
  graph,
  callbacks: {
    onBranch: (item) => openPlantFromMessage(item),
    onConflictChoice: (itemId, idx) => resolveConflictChoice(itemId, idx),
    onReopenGraftedSeed: (plant) => reopenGraftedSeed(plant),
    // Fires after every mainThread.render — including the internal calls
    // from streamInto's animation ticks. We use it to keep the Plant
    // button's streaming gate in sync; without this hook, the button
    // would never re-enable after a stream ends because nothing outside
    // the module wakes up to flip it.
    onAfterRender: () => updatePlantBtnAvailability(),
  },
});
const renderMain = () => {
  mainThread.render();
  renderContext?.();
  persistNow();
};

// True while any main-thread assistant message is mid-stream. We use this to
// gate plant creation — a chat with an incomplete reply shouldn't fork into
// a seed because the seed would inherit a half-written context. Seeds remain
// independent of each other; only the main thread's streaming gates planting.
function isMainStreaming() {
  for (const it of state.mainConv) {
    if (it.kind === "assistant" && it.status === "streaming") return true;
  }
  return false;
}

// Reflect `isMainStreaming()` on the two surfaces that spawn plants: the
// composer's Plant button and the seed tray's "+" button. Disabled state is
// purely advisory — `onOpenPlant` also does its own runtime guard.
function updatePlantBtnAvailability() {
  const blocked = isMainStreaming();
  const reason = blocked
    ? "Wait for the current reply to finish before planting."
    : "Plant a side seed that shares this context";
  if (plantBtn) {
    plantBtn.disabled = blocked;
    plantBtn.title = reason;
    plantBtn.setAttribute("aria-disabled", String(blocked));
  }
  const trayAddBtn = document.getElementById("tray-add-btn");
  if (trayAddBtn) {
    trayAddBtn.disabled = blocked;
    trayAddBtn.title = blocked ? reason : "New seed";
    trayAddBtn.setAttribute("aria-disabled", String(blocked));
  }
}

// (Plant-button availability is now refreshed by the `onAfterRender`
// callback wired into createMainThread above — fires on every render
// including streamInto's internal ticks, so the gate releases the moment
// status flips from "streaming" to "complete".)
const streamInto = (item, fullText, durationMs, onDone) =>
  mainThread.streamInto(item, fullText, durationMs, onDone);
const streamMainFromOllama = (item, prompt, attachments) => mainThread.streamChat(item, prompt, attachments);
const streamPostGraftFromOllama = (item, followUp, lastFold) =>
  mainThread.streamContinue(item, followUp, lastFold);

/* ============================================================
   CONTEXT INSPECTOR (see prototype/context-inspector.mjs)
   ============================================================ */
const contextInspector = createContextInspector({
  dom: {
    button: contextOpenBtn,
    drawer: contextInspectorEl,
    body: contextLedger,
    count: contextInspectorCount,
    close: contextCloseBtn,
    pillCount: contextOpenBtnCount,
  },
  state,
  callbacks: {
    onReopenGraftedSeed: (plant) => reopenGraftedSeed(plant),
    // Mute toggles inside the inspector flip flags on shared state
    // (sessionFiles[i].muted or state.parentContextMuted). Resync the chip
    // bar so muted files look muted in both surfaces.
    onContextChange: () => renderAttachmentChips(),
  },
});
const renderContext = () => contextInspector.render();

/* ============================================================
   PLANT TRAY (see prototype/plant-tray.mjs)
   ============================================================ */
const plantTray = createPlantTray({
  dom: {
    column: plantColumn,
    body: plantColumnBody,
    subtitle: plantColumnSubtitle,
    countLabel: plantCountEl,
    graftBtn,
    graftHint,
  },
  state,
  callbacks: {
    onOpenPlant: () => onOpenPlant(),
    onGraftOne: (plantId) => onGraftOne(plantId),
    onSendInPlant: (plantId) => sendInPlant(plantId),
  },
});
const renderPlants = () => {
  plantTray.render();
  renderContext();
  persistNow();
};

/* ============================================================
   ACTIONS
   ============================================================ */
// (Reserved for future starter cards / autoflows.)

/* ============================================================
   COMPOSER ATTACHMENTS — session-scoped.
   Files are uploaded to /api/files (→ Anthropic Files API) the moment the
   user picks them. Uploaded files persist on `state.sessionFiles` and are
   replayed on every send — both main-thread turns and seed (plant) turns
   — so any seed branched off the conversation can see them. Remove a file
   from the bar to stop sending it. Cleared on `newSession()`.
   Only visible when the active model is Anthropic (Ollama is text-only).
   ============================================================ */
// state.sessionFiles entries: { localId, name, mediaType, size, status, fileId? }
state.sessionFiles = [];
state.parentContextMuted = false;
let nextAttachmentId = 1;

function renderAttachmentChips() {
  composerAttachments.innerHTML = "";
  if (state.sessionFiles.length === 0) {
    composerAttachments.hidden = true;
    return;
  }
  composerAttachments.hidden = false;
  for (const att of state.sessionFiles) {
    const chip = document.createElement("span");
    chip.className = "attachment-chip"
      + (att.status === "uploading" ? " is-uploading" : "")
      + (att.status === "error" ? " is-error" : "")
      + (att.muted ? " is-muted" : "");
    const label = att.status === "uploading" ? `Uploading ${att.name}…`
      : att.status === "error" ? `Failed: ${att.name}`
      : att.muted ? `${att.name} (muted)`
      : att.name;
    chip.innerHTML = `<span class="name" title="${att.name}">${label}</span>`
      + `<button class="remove" type="button" title="Remove file (permanent — use Context inspector to mute reversibly)" aria-label="Remove file">×</button>`;
    chip.querySelector(".remove").addEventListener("click", () => {
      const i = state.sessionFiles.indexOf(att);
      if (i >= 0) state.sessionFiles.splice(i, 1);
      renderAttachmentChips();
      renderContext?.();
    });
    composerAttachments.appendChild(chip);
  }
}

async function addFilesToComposer(fileList) {
  for (const file of Array.from(fileList || [])) {
    const att = {
      localId: nextAttachmentId++,
      name: file.name,
      mediaType: file.type || "application/octet-stream",
      size: file.size,
      status: "uploading",
    };
    state.sessionFiles.push(att);
    renderAttachmentChips();
    renderContext?.();
    try {
      const meta = await api.uploadFile(file);
      att.fileId = meta.id;
      att.status = "ready";
    } catch (err) {
      att.status = "error";
      console.error("File upload failed:", err);
    }
    renderAttachmentChips();
    // Refresh inspector after the upload completes so the new "ready" file
    // appears as an admitted segment — that count bump is what fires the
    // pill pulse, telling the user "something landed in your context."
    renderContext?.();
  }
}

// Thin shims over the pure filters in prototype/mute-filters.mjs. Keeping
// these named here so other call sites in this file read naturally; the
// shared module is the single source of truth for "what mute means."
function currentReadyAttachments() {
  return filterAttachments(state.sessionFiles);
}
function currentParentContext() {
  return filterParentContext(state);
}
state.getParentContext = currentParentContext;
// Exposed so plants.mjs (loaded separately) can read the same set.
state.getAttachments = currentReadyAttachments;

/* ============================================================
   CONTEXT ROUTER INPUT
   ============================================================ */
function textForContext(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function seedAnswerText(plant) {
  const turns = Array.isArray(plant?.turns) ? plant.turns : [];
  return [...turns].reverse().find((turn) => textForContext(turn.asst))?.asst || "";
}

function mainContextMessages({ stopAssistantId = null, excludeAssistantId = null } = {}) {
  // Walking + mute decisions live in mute-filters.mjs (filterMainConv). This
  // function is now pure serialization: take the items the filter admits and
  // convert each kind to its wire shape.
  const messages = [];
  const items = filterMainConv(state, { stopAssistantId, excludeAssistantId });
  for (const item of items) {
    if (item.kind === "user") {
      const text = textForContext(item.text);
      if (text) messages.push({ role: "user", content: text });
      continue;
    }
    if (item.kind === "assistant") {
      const text = textForContext(item.text);
      if (text && item.status !== "streaming") messages.push({ role: "assistant", content: text });
      continue;
    }
    if (item.kind === "graft-marker") {
      // filterMainConv already pruned muted plants. Just serialize.
      const grafts = (item.plants || []).map((plant) => {
        const prompt = textForContext(plant.fullPrompt || plant.title);
        const answer = textForContext(seedAnswerText(plant));
        if (!prompt && !answer) return "";
        return [`Seed prompt: ${prompt || "Untitled seed"}`, answer ? `Seed answer: ${answer}` : ""]
          .filter(Boolean)
          .join("\n");
      }).filter(Boolean);
      if (grafts.length) {
        messages.push({
          role: "system",
          content: `Admitted grafted seed context:\n${grafts.join("\n\n")}`,
        });
      }
      continue;
    }
    if (item.kind === "conflict-choice") {
      const choice = textForContext(item.choices?.[item.resolved.index]);
      if (choice) {
        messages.push({
          role: "system",
          content: `Context router decision: ${choice}`,
        });
      }
    }
  }
  return messages;
}

state.parentContextMessagesForPlant = (plant) =>
  mainContextMessages({ stopAssistantId: plant?.parentMessageId });

state.parentContextMessagesForMainTurn = (assistantItem) =>
  mainContextMessages({ excludeAssistantId: assistantItem?.id });

function updateAttachButtonVisibility() {
  // Only show the attach button for providers that accept file inputs.
  const provider = state.currentModel?.provider;
  composerAttach.hidden = provider !== "anthropic";
  if (composerAttach.hidden && state.sessionFiles.length > 0) {
    state.sessionFiles.length = 0;
    renderAttachmentChips();
  }
}

composerAttach.addEventListener("click", () => composerFileInput.click());
composerFileInput.addEventListener("change", async (e) => {
  await addFilesToComposer(e.target.files);
  composerFileInput.value = "";
});

// Snapshot of what was muted at the moment of a send. Stamped onto the user
// turn so the thread record stays honest about wire shape — Model 3 from the
// design discussion: thread is linear, but each turn carries its own routing
// decisions inline. Labels are user-visible strings, not state references, so
// they stay readable even if the source segment is later unmuted or removed.
function snapshotMutedSegments() {
  const muted = [];
  if (state.parentContext && state.parentContextMuted) {
    muted.push("parent context");
  }
  for (const f of state.sessionFiles || []) {
    if (f.status === "ready" && f.fileId && f.muted) muted.push(f.name);
  }
  for (let i = 0; i < state.mainConv.length; i++) {
    const it = state.mainConv[i];
    const nx = state.mainConv[i + 1];
    if (it?.kind === "user" && nx?.kind === "assistant" && (it.muted || nx.muted)) {
      const preview = (it.text || "").replace(/\s+/g, " ").trim();
      muted.push(`prior turn — "${preview.length > 32 ? preview.slice(0, 32) + "…" : preview}"`);
      i++;
    } else if (it?.kind === "graft-marker") {
      for (const plant of it.plants || []) {
        if (plant.muted) muted.push(`seed — ${plant.title || "untitled"}`);
      }
    } else if (it?.kind === "conflict-choice" && it.resolved && it.muted) {
      muted.push("a conflict choice");
    }
  }
  return muted;
}

async function onSend() {
  const text = composerInput.value.trim();
  const attachments = currentReadyAttachments();
  if (!text && attachments.length === 0) return;
  composerInput.value = "";
  autoSizeTextarea(composerInput, 160);

  const mutedSnapshot = snapshotMutedSegments();
  state.mainConv.push({ kind: "user", text, mutedSnapshot });
  const id = makeId();
  const item = { kind: "assistant", id, text: "", status: "streaming" };
  state.mainConv.push(item);
  // graph: main-thread chat node attached to current leaf (which may be a merge node)
  graph.addChat({ id, thread: "main", prompt: text, parent: state.graph.mainLeafId });
  renderMain();

  if (state.postGraftArmed) {
    state.postGraftArmed = false;
    const lastFold = [...state.mainConv].reverse().find(x => x.kind === "graft-marker");
    if (!state.parentContext) {
      state.parentContext = text.length > 60 ? text.slice(0, 60) + "…" : text;
    }
    await streamPostGraftFromOllama(item, text, lastFold);
    return;
  } else {
    if (!state.parentContext) {
      state.parentContext = text.length > 60 ? text.slice(0, 60) + "…" : text;
    }

    await streamMainFromOllama(item, text, attachments);
  }
}

/* ============================================================
   PLANTS (see prototype/plants.mjs)
   ============================================================ */
const plants = createPlants({
  state,
  graph,
  makeId,
  onChange: () => renderPlants(),
  patchTurn: (plantId, turnId, text, streaming) =>
    plantTray.patchTurn(plantId, turnId, text, streaming),
  focusComposer: (plantId) => plantTray.focusComposer(plantId),
  clearComposer: (plantId) => plantTray.clearComposer(plantId),
});

function onOpenPlant() {
  // Belt to the visual-disable suspenders: keyboard shortcuts, accessibility
  // tools, or stale event handlers could still fire this — refuse here too.
  if (isMainStreaming()) return;
  const draft = composerInput.value.trim();
  composerInput.value = "";
  autoSizeTextarea(composerInput, 160);
  plants.open(draft);
}

const sendInPlant = (stId) => plants.send(stId);
const closeSeedPanel = () => plants.closeAll();
const openPlantFromMessage = (item) => plants.openFromMessage(item);
const reopenGraftedSeed = (plantData) => plants.reopenGrafted(plantData);

/* ============================================================
   GRAFT (see prototype/graft.mjs)
   ============================================================ */
const graft = createGraft({
  state,
  graph,
  makeId,
  render: {
    main: () => renderMain(),
    plants: () => renderPlants(),
  },
  composer: {
    setPlaceholder: (text) => { composerInput.placeholder = text; },
    focusLater: (ms) => setTimeout(() => composerInput.focus(), ms),
  },
  streamInto: (item, text, durationMs) => streamInto(item, text, durationMs),
});
const onGraft = () => graft.graftSelected();
const resolveConflictChoice = (choiceId, idx) => graft.resolveConflictChoice(choiceId, idx);

function newSession() {
  // Flush whatever is pending for the old session before we mint a new id,
  // so its final state is on disk and shows up in the recent-sessions list.
  persistence.flush();
  sessionMeta = { id: newSessionId(), title: "", createdAt: Date.now() };
  // Reset the save-suppression signature so the first real edit in the
  // new session actually persists (otherwise an empty-vs-empty comparison
  // could spuriously match across sessions).
  lastSavedSignature = null;
  persistence.setCurrent(sessionMeta.id);

  state.mainConv = [];
  state.plants = [];
  state.activePlantId = null;
  state.parentContext = null;
  state.parentContextMuted = false;
  state.postGraftArmed = false;
  state.nextId = 1;
  graph.reset();
  composerInput.value = "";
  composerInput.placeholder = "Ask anything…";
  autoSizeTextarea(composerInput, 160);
  state.sessionFiles.length = 0;
  renderAttachmentChips();
  renderMain();
  renderPlants();
  setTimeout(() => composerInput.focus(), 100);
}

/**
 * Switch to a previously-saved session by id. Flushes the active session
 * first (so we don't lose its tail), then applies the saved snapshot and
 * re-renders. The model picker reattaches the saved provider/model if it's
 * still available; otherwise the current selection sticks.
 */
async function loadSession(id) {
  persistence.flush();
  // Prefer the local cached snapshot (no network round-trip). If it isn't
  // there — e.g. user opened a session created on another browser — fall
  // back to the server, then cache the result locally for next time.
  let snapshot = persistence.loadSession(id);
  if (!snapshot) {
    snapshot = await persistence.fetchRemoteSession(id);
  }
  if (!snapshot) return false;
  try {
    sessionMeta = applySnapshot(snapshot, { state, graph });
  } catch (err) {
    console.warn("Failed to load session", id, err);
    return false;
  }
  // Seed the save-suppression signature with the just-loaded snapshot so
  // the render that follows doesn't re-save with a fresh updatedAt and
  // bump this session to "just now" in the sidebar.
  lastSavedSignature = contentSignatureOf(snapshot);
  persistence.setCurrent(sessionMeta.id);
  // Re-attach model picker selection if we know which model was active.
  const sel = snapshot.currentModelSelection;
  if (sel && state.availableModels?.length) {
    const match = state.availableModels.find((m) => m.provider === sel.provider && m.model === sel.model);
    if (match) state.currentModel = match;
  }
  composerInput.value = "";
  autoSizeTextarea(composerInput, 160);
  renderAttachmentChips();
  renderMain();
  renderPlants();
  sessionsSidebar?.refresh();
  setTimeout(() => composerInput.focus(), 100);
  return true;
}
// Expose for quick manual restore from DevTools — sidebar UI also wired up.
if (typeof window !== "undefined") {
  window.__loadSession = loadSession;
  window.__listSessions = () => persistence.listSessions();
}

/* ============================================================
   SESSIONS SIDEBAR (see prototype/sessions-sidebar.mjs)
   ============================================================ */
const sessionsSidebar = createSessionsSidebar({
  dom: {
    drawer: $("#sessions-sidebar"),
    list: $("#sessions-list"),
    button: $("#sessions-open-btn"),
    closeBtn: $("#sessions-close-btn"),
    newBtn: $("#sessions-new-btn"),
    emptyState: $("#sessions-empty"),
  },
  persistence,
  api,
  callbacks: {
    onLoadSession: (id) => loadSession(id),
    onNewSession: () => { newSession(); sessionsSidebar.refresh(); },
    onDeleteSession: (id) => {
      persistence.deleteSession(id);
      // If the user just deleted the active session, treat it like New Session
      // — the on-disk and in-memory state should not disagree.
      if (id === sessionMeta.id) newSession();
      sessionsSidebar.refresh();
    },
    onRenameSession: (id, title) => {
      // For the active session, mutate the live meta and trigger a save so
      // the new title lands in localStorage AND on the server. For inactive
      // sessions, fetch → mutate → put → refresh.
      if (id === sessionMeta.id) {
        sessionMeta.title = title;
        persistNow();
      } else {
        (async () => {
          const snap = persistence.loadSession(id) || await persistence.fetchRemoteSession(id);
          if (!snap) return;
          snap.meta.title = title;
          snap.meta.updatedAt = Date.now();
          // Write through both layers explicitly — persistence.save() always
          // re-marks the snapshot as the current session, which we don't want
          // for a background rename.
          try { window.localStorage.setItem(`dandelion:session:${id}`, JSON.stringify(snap)); } catch {}
          api.putSavedSession(id, snap).catch((err) => console.warn("Rename remote save failed:", err));
        })();
      }
    },
    getActiveSessionId: () => sessionMeta.id,
  },
});

const onGraftOne = (stId) => graft.graftOne(stId);

/* ============================================================
   MODEL PICKER (see prototype/model-picker.mjs)
   ============================================================ */
const modelPicker = createModelPicker({
  chip: modelChip,
  menu: modelMenu,
  name: modelName,
  dot: modelDot,
  meta: metaModel,
  onChange(model) {
    state.currentModel = model;
    state.availableModels = modelPicker.models;
    updateAttachButtonVisibility();
    renderPlants();
  },
});

/* ============================================================
   WIRING
   ============================================================ */
composerInput.addEventListener("input", () => autoSizeTextarea(composerInput, 160));
composerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSend();
  }
});
composerSend.addEventListener("click", onSend);
plantBtn.addEventListener("click", onOpenPlant);
graftBtn.addEventListener("click", onGraft);
$("#reset-btn").addEventListener("click", () => { newSession(); sessionsSidebar.refresh(); });
$("#tray-add-btn").addEventListener("click", onOpenPlant);
$("#tray-close-btn").addEventListener("click", closeSeedPanel);

modelPicker.load();

/* ============================================================
   SETTINGS UI (see prototype/settings-ui.mjs)
   ============================================================ */
const settingsUI = createSettingsUI({
  openBtn: document.getElementById("settings-open-btn"),
  modal: document.getElementById("settings-modal"),
  overlay: document.getElementById("settings-overlay"),
  closeBtn: document.getElementById("settings-close-btn"),
  cancelBtn: document.getElementById("settings-cancel-btn"),
  saveBtn: document.getElementById("settings-save-btn"),
  anthropicKeyInput: document.getElementById("settings-anthropic-key"),
  ollamaUrlInput: document.getElementById("settings-ollama-url"),
  revealBtn: document.getElementById("settings-reveal-btn"),
  // After saving, re-pull the model list so newly available providers appear.
  onSave: () => { modelPicker.load(); },
});
// First-run: if no key and no Ollama URL configured, open the settings modal
// so the user knows where to start.
openSettingsIfUnconfigured(settingsUI);

// Boot: try to restore the most recent session. If anything goes wrong
// (no saved session, schema mismatch, parse error), fall back to a fresh
// session so the UI is always usable.
(function bootstrapSession() {
  const snapshot = persistence.loadCurrent();
  if (!snapshot) { newSession(); return; }
  try {
    sessionMeta = applySnapshot(snapshot, { state, graph });
    // Seed the signature so the post-restore render is a no-op save —
    // opening the app should not bump `updatedAt` on the active session.
    lastSavedSignature = contentSignatureOf(snapshot);
    composerInput.value = "";
    autoSizeTextarea(composerInput, 160);
    renderAttachmentChips();
    renderMain();
    renderPlants();
    setTimeout(() => composerInput.focus(), 100);
  } catch (err) {
    console.warn("Restoring last session failed; starting fresh.", err);
    newSession();
  }
})();
