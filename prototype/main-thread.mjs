// Main-thread renderer + streaming controller.
//
// Owns the left column: user/assistant message bubbles, graft markers, and
// conflict-choice cards. Also owns the streaming animation that ticks each
// assistant response character-by-character.
//
// The module does not own conversation state — `state.mainConv` lives on the
// caller's state object. It just re-renders from that state, mutates the
// in-progress item.text during streaming, and calls back for branch /
// conflict-choice / reopen-grafted-seed interactions.
//
// Usage:
//
//   import { createMainThread } from "./prototype/main-thread.mjs";
//   const main = createMainThread({
//     dom: { column, inner },
//     state, graph,
//     callbacks: { onBranch, onConflictChoice, onReopenGraftedSeed },
//   });
//   main.render();
//   main.streamChat(item, prompt, system);

import { escapeHtml } from "./escape.mjs";
import { renderDandelionSVG } from "./dandelion-svg.mjs";
import { generateReply, generatePostGraftReply } from "./scripted-content.mjs";
import { renderIdleDandelion } from "./empty-state.mjs";
import { routeLabel } from "../scripts/merge-router.mjs";
import { renderMarkdown } from "./markdown.mjs";
import { filterGraftPlants, filterParentContext } from "./mute-filters.mjs";
import { createGraftOverlay } from "./graft-overlay.mjs";
import * as api from "./api.mjs";

const FALLBACK_SUFFIX = "\n\n(The selected model was unavailable, so this used the scripted fallback.)";
const SYSTEM_PROMPT = "You are Dandelion, a concise assistant inside a local prototype. Answer directly and naturally.";
const RECENT_EXPANDED_TURNS = 2;

function durationFor(text) {
  return Math.max(2200, Math.min(6800, (text || "").length * 22));
}

// Trim the "Proceed with " / "Proceed by " prefixes the classifier and its
// fallback both like to emit. The section header already says "Proceed with" —
// the prefix burns horizontal space and pushes the actual stance off-screen.
function shortenChoice(raw) {
  let s = String(raw || "").trim().replace(/^Proceed (with|by) /i, "");
  // Strip trailing ellipsis the small model sometimes uses to "shorten" the
  // string (e.g. "...stay a focus..."). Then drop any trailing period.
  s = s.replace(/[\.…]+\s*$/u, "");
  if (s.length > 0) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

export function createMainThread({ dom, state, graph, callbacks }) {
  const { column, inner } = dom;
  const { onBranch, onConflictChoice, onReopenGraftedSeed, onAfterRender } = callbacks;
  // Auto-collapse hides turns older than RECENT_EXPANDED_TURNS by default.
  // Both sets let the user override that:
  //   expandedHistoryTurns  — old turns the user manually re-opened
  //   collapsedHistoryTurns — recent turns the user manually collapsed
  const expandedHistoryTurns = new Set();
  const collapsedHistoryTurns = new Set();
  // All graft-overlay concerns (right-gutter positioning, scroll/resize
  // tracking, the plant-column-transition pump, the "hidden until first
  // positioned" anti-flash) live in graft-overlay.mjs.
  const graftOverlay = createGraftOverlay({ scrollElement: inner });

  function currentModelLabel() {
    const m = state.currentModel;
    if (!m || !m.label) return "Model";
    if (m.provider === "anthropic") return `Anthropic ${m.label}`;
    if (m.provider === "ollama") return `Ollama ${m.model}`;
    return m.label;
  }

  function modelLabelFromResponse(data) {
    if (data.provider === "anthropic") return `Anthropic ${data.model}`;
    if (data.model) return `Ollama ${data.model}`;
    return currentModelLabel();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      inner.scrollTo({ top: inner.scrollHeight, behavior: "smooth" });
    });
  }

  function renderEmpty() {
    const el = document.createElement("div");
    el.className = "empty-state";
    el.innerHTML = renderIdleDandelion();
    inner.appendChild(el);
  }

  function renderUserMessage(item, parent = inner) {
    const el = document.createElement("div");
    el.className = "msg msg-user";
    el.innerHTML = `<div class="bubble"></div>`;
    el.querySelector(".bubble").textContent = item.text;
    // Wire-shape caption: per-turn record of what was muted at send time.
    // Keeps the thread linear (Model 3) while making each send's routing
    // decisions legible after the fact. See `snapshotMutedSegments()` in
    // prototype.html — labels are baked at send so later unmute/remove
    // doesn't rewrite history.
    const muted = item.mutedSnapshot;
    if (Array.isArray(muted) && muted.length > 0) {
      // Expandable per-turn record of what was muted at send time.
      // Collapsed: pill shows "↓ N muted ▾" — no truncation, no tooltip
      // dependency. Click toggles a wrapping list of every muted label.
      // The summary text on its own is enough for scanning; the list is
      // for users who actually want to audit what the model didn't see.
      const count = muted.length;
      const caption = document.createElement("button");
      caption.type = "button";
      caption.className = "msg-user-muted-caption";
      caption.setAttribute("aria-expanded", "false");
      caption.innerHTML =
        `<span class="muted-caption-summary">` +
          `↓ asked with ${count} muted` +
          `<span class="muted-caption-chevron" aria-hidden="true">▾</span>` +
        `</span>` +
        `<ul class="muted-caption-list">` +
          muted.map((m) => `<li>${escapeHtml(m)}</li>`).join("") +
        `</ul>`;
      caption.addEventListener("click", () => {
        const expanded = caption.getAttribute("aria-expanded") === "true";
        caption.setAttribute("aria-expanded", String(!expanded));
      });
      el.appendChild(caption);
    }
    parent.appendChild(el);
  }

  function renderAssistantMessage(item, parent = inner) {
    const el = document.createElement("div");
    el.className = "msg msg-assistant";
    // During streaming, render plain escaped text with a cursor (partial
    // markdown reparsed on every tick would jitter); on completion, parse as
    // markdown so headings, lists, code, links, etc. render properly.
    const bodyHtml = item.status === "streaming"
      ? `<div class="body-streaming">${escapeHtml(item.text)}<span class="cursor"></span></div>`
      : renderMarkdown(item.text);
    const branchBtn = item.status !== "streaming"
      ? `<button class="msg-branch-btn" data-branch-msg="${item.id}">` +
          `<svg width="14" height="14" viewBox="0 0 120 120" fill="none">` +
            `<g transform="rotate(35 60 60)">` +
              `<g stroke="currentColor" stroke-width="10" stroke-linecap="round">` +
                `<line x1="32" y1="30" x2="60" y2="90"/>` +
                `<line x1="60" y1="30" x2="60" y2="90"/>` +
                `<line x1="88" y1="30" x2="60" y2="90"/>` +
              `</g>` +
              `<g fill="currentColor">` +
                `<circle cx="32" cy="30" r="12"/>` +
                `<circle cx="60" cy="30" r="12"/>` +
                `<circle cx="88" cy="30" r="12"/>` +
                `<rect x="48" y="78" width="24" height="24" transform="rotate(45 60 90)"/>` +
              `</g>` +
            `</g>` +
          `</svg> Plant` +
        `</button>`
      : "";
    el.innerHTML =
      `<div class="msg-meta">${escapeHtml(item.modelLabel || state.currentModel.label)}</div>` +
      `<div class="body">${bodyHtml}</div>` +
      (branchBtn ? `<div class="msg-actions">${branchBtn}</div>` : "");
    el.querySelector(`[data-branch-msg="${item.id}"]`)?.addEventListener("click", () => onBranch(item));
    parent.appendChild(el);
  }

  function renderGraftMarker(item, parent = inner) {
    const el = document.createElement("div");
    el.className = "graft-marker";
    const n = item.plants.length;
    const badgeClass = item.route?.pending
      ? "graft-route-badge graft-route-badge-pending"
      : "graft-route-badge";
    const badge = item.route ? routeLabel(item.route.kind) : "";
    el.innerHTML =
      `<div class="graft-marker-label">` +
        `<span>grafted${n > 1 ? ` · ${n} seeds` : ""}</span>` +
        (badge ? `<span class="${badgeClass}">${escapeHtml(badge)}</span>` : "") +
      `</div>`;
    parent.appendChild(el);

    const visual = document.createElement("div");
    visual.className = "graft-visual";
    // Created `hidden` so the user never sees the un-positioned default
    // (translate3d(0,0,0) = top-left of the body) for the one frame between
    // append and the first overlay tick. Especially important during
    // streaming, where render() runs inside its own rAF and the overlay's
    // positioning rAF wouldn't fire until the next frame.
    // graft-overlay.update() unhides it once it has a real transform.
    visual.hidden = true;
    visual.innerHTML = renderDandelionSVG(item.plants);
    visual.querySelectorAll(".dan-seed").forEach((seedEl, i) => {
      seedEl.addEventListener("click", () => onReopenGraftedSeed(item.plants[i]));
    });
    graftOverlay.register(el, visual);
  }

  function renderConflictChoice(item, parent = inner) {
    const el = document.createElement("div");
    el.className = "conflict-choice";
    el.innerHTML =
      `<div class="conflict-choice-title">These plants conflict in a way that changes what should happen next.</div>` +
      `<div class="conflict-choice-body">${escapeHtml(item.summary)}</div>` +
      `<div class="conflict-choice-options">` +
        item.choices.map((choice, i) =>
          `<button data-conflict-choice="${item.id}" data-choice-index="${i}" ${item.resolved ? "disabled" : ""}>${i + 1}. ${escapeHtml(shortenChoice(choice))}</button>`
        ).join("") +
      `</div>`;
    el.querySelectorAll("button[data-conflict-choice]").forEach((btn) => {
      btn.addEventListener("click", () => onConflictChoice(item.id, parseInt(btn.dataset.choiceIndex, 10)));
    });
    parent.appendChild(el);
  }

  function textPreview(text, max = 150) {
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    if (compact.length <= max) return compact;
    return compact.slice(0, max - 1).trimEnd() + "...";
  }

  function toggleTurnCollapsed(assistantId, wantCollapsed) {
    if (wantCollapsed) {
      collapsedHistoryTurns.add(assistantId);
      expandedHistoryTurns.delete(assistantId);
    } else {
      expandedHistoryTurns.add(assistantId);
      collapsedHistoryTurns.delete(assistantId);
    }
    render({ scrollToTurn: assistantId });
  }

  function renderCollapsedTurn(userItem, assistantItem, turnNumber) {
    const el = document.createElement("section");
    el.className = "main-history-node";
    el.dataset.mainTurn = assistantItem.id;
    el.innerHTML =
      `<button class="main-history-open" data-open-main-turn="${assistantItem.id}" aria-label="Open main thread node">` +
        `<span class="main-history-seed" aria-hidden="true">` +
          `<svg viewBox="0 0 32 42" fill="none">` +
            `<path class="main-history-stem" d="M16 39 C16 28 16 18 16 9" />` +
            `<path class="main-history-puff" d="M16 9 L9 3 M16 9 L16 1 M16 9 L23 3" />` +
            `<circle class="main-history-core" cx="16" cy="11" r="4" />` +
          `</svg>` +
        `</span>` +
        `<span class="main-history-copy">` +
          `<span class="main-history-title">${escapeHtml(textPreview(userItem.text, 76) || `Main node ${turnNumber}`)}</span>` +
          `<span class="main-history-preview">${escapeHtml(textPreview(assistantItem.text, 170) || "No response yet")}</span>` +
        `</span>` +
      `</button>` +
      `<button class="main-history-branch" data-branch-main-turn="${assistantItem.id}">Plant</button>`;
    el.querySelector(`[data-open-main-turn="${assistantItem.id}"]`)?.addEventListener("click", () => {
      toggleTurnCollapsed(assistantItem.id, false);
    });
    el.querySelector(`[data-branch-main-turn="${assistantItem.id}"]`)?.addEventListener("click", () => onBranch(assistantItem));
    inner.appendChild(el);
  }

  function renderExpandedTurn(userItem, assistantItem, isCollapsible) {
    const wrap = document.createElement("section");
    wrap.className = "main-turn";
    wrap.dataset.mainTurn = assistantItem.id;
    renderUserMessage(userItem, wrap);
    renderAssistantMessage(assistantItem, wrap);
    if (isCollapsible) {
      const collapseBtn = document.createElement("button");
      collapseBtn.className = "main-turn-collapse";
      collapseBtn.type = "button";
      collapseBtn.title = "Collapse node";
      collapseBtn.setAttribute("aria-label", "Collapse node");
      collapseBtn.textContent = "Collapse";
      collapseBtn.addEventListener("click", () => {
        toggleTurnCollapsed(assistantItem.id, true);
      });
      // Keep thread actions together below the assistant message.
      const assistantEl = wrap.querySelector(".msg-assistant");
      (assistantEl?.querySelector(".msg-actions") ?? assistantEl ?? wrap).appendChild(collapseBtn);
    }
    inner.appendChild(wrap);
  }

  function render(options = {}) {
    inner.innerHTML = "";
    graftOverlay.clear();
    document.body.classList.toggle("is-empty", state.mainConv.length === 0);
    if (state.mainConv.length === 0) {
      renderEmpty();
      return;
    }
    const chatTurns = [];
    for (let i = 0; i < state.mainConv.length - 1; i++) {
      if (state.mainConv[i].kind === "user" && state.mainConv[i + 1].kind === "assistant") {
        chatTurns.push(state.mainConv[i + 1].id);
      }
    }
    const firstRecentTurn = Math.max(0, chatTurns.length - RECENT_EXPANDED_TURNS);
    const turnIndexByAssistantId = new Map(chatTurns.map((id, i) => [id, i]));

    for (let i = 0; i < state.mainConv.length; i++) {
      const item = state.mainConv[i];
      const next = state.mainConv[i + 1];
      if (item.kind === "user" && next?.kind === "assistant") {
        const turnIndex = turnIndexByAssistantId.get(next.id) ?? chatTurns.length;
        const isOld = turnIndex < firstRecentTurn;
        const isComplete = next.status !== "streaming";
        // Collapse decision: by default old turns collapse and recent turns
        // stay expanded; either set can override the default for one turn.
        const defaultCollapsed = isOld;
        const userExpanded = expandedHistoryTurns.has(next.id);
        const userCollapsed = collapsedHistoryTurns.has(next.id);
        const shouldCollapse = isComplete
          && ((defaultCollapsed && !userExpanded) || (!defaultCollapsed && userCollapsed));
        if (shouldCollapse) renderCollapsedTurn(item, next, turnIndex + 1);
        else renderExpandedTurn(item, next, isComplete);
        i++;
      } else if (item.kind === "user") {
        renderUserMessage(item);
      } else if (item.kind === "assistant") {
        renderAssistantMessage(item);
      } else if (item.kind === "graft-marker") {
        renderGraftMarker(item);
      } else if (item.kind === "conflict-choice") {
        renderConflictChoice(item);
      }
    }

    if (options.scrollToTurn) {
      requestAnimationFrame(() => {
        inner.querySelector(`[data-main-turn="${CSS.escape(options.scrollToTurn)}"]`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    } else if (options.scrollToBottom !== false) {
      scrollToBottom();
    }
    // Fire after every render so the host can resync derived UI state
    // (e.g. the composer Plant button's streaming gate). Called from
    // streamInto ticks too — the host is responsible for keeping it cheap.
    onAfterRender?.();
  }

  // Scripted streaming: tick each character into item.text, then mark done.
  function streamInto(item, fullText, durationMs, onDone) {
    const start = performance.now();
    const len = fullText.length;
    function tick(now) {
      const t = Math.min(1, (now - start) / durationMs);
      item.text = fullText.slice(0, chars(t, len));
      render();
      if (t < 1) requestAnimationFrame(tick);
      else {
        item.status = "complete";
        graph.setResponse(item.id, fullText);
        render();
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(tick);
  }
  function chars(t, len) {
    return Math.floor(t * len);
  }

  async function streamChat(item, prompt, attachments) {
    try {
      item.modelLabel = currentModelLabel();
      item.text = `Thinking with ${currentModelLabel()}…`;
      render();
      // Send admitted prior turns as structured messages, matching the native
      // shape expected by chat models. Root mute only withholds the standalone
      // parent-context label used by continuation prompts; individual trunk
      // turns and grafts carry their own mute state in this path.
      const contextMessages = state.parentContextMessagesForMainTurn?.(item);
      const data = await api.chat({
        prompt,
        contextMessages,
        system: SYSTEM_PROMPT,
        model: state.currentModel,
        attachments,
      });
      item.modelLabel = modelLabelFromResponse(data);
      streamInto(item, data.answer || "", durationFor(data.answer));
    } catch {
      item.modelLabel = "Scripted fallback";
      const reply = generateReply(prompt);
      streamInto(item, reply.text + FALLBACK_SUFFIX, reply.duration);
    }
  }

  async function streamContinue(item, followUp, lastFold) {
    try {
      item.modelLabel = currentModelLabel();
      item.text = `Thinking with ${currentModelLabel()}…`;
      render();
      // Mute filters: any conv item flagged `.muted` (set from the context
      // inspector) is excluded from the continuation prompt builder. Same
      // for muted plants in the just-grafted fold. Root mute drops the
      // parent-context string entirely (same as streamChat). All three
      // routed through prototype/mute-filters.mjs.
      const filteredConv = state.mainConv
        .filter((x) => x.id !== item.id && !x.muted);
      const filteredPlants = filterGraftPlants(lastFold ? lastFold.plants : []);
      const data = await api.continueThread({
        parentContext: filterParentContext(state),
        mainConversation: filteredConv,
        graftedPlants: filteredPlants,
        route: lastFold ? { classification: lastFold.route.kind } : { classification: "additional_context" },
        followUp,
        model: state.currentModel,
      });
      item.modelLabel = modelLabelFromResponse(data);
      streamInto(item, data.answer || "", durationFor(data.answer));
    } catch {
      item.modelLabel = "Scripted fallback";
      const grafted = lastFold ? Object.assign([...lastFold.plants], { route: lastFold.route }) : [];
      const reply = generatePostGraftReply(followUp, grafted);
      streamInto(item, reply.text + FALLBACK_SUFFIX, reply.duration);
    }
  }

  return { render, streamInto, streamChat, streamContinue, currentModelLabel };
}
