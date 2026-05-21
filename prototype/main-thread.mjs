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
  const { onBranch, onConflictChoice, onReopenGraftedSeed } = callbacks;
  const expandedHistoryTurns = new Set();

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
      column.scrollTo({ top: column.scrollHeight, behavior: "smooth" });
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
    parent.appendChild(el);
  }

  function renderAssistantMessage(item, parent = inner) {
    const el = document.createElement("div");
    el.className = "msg msg-assistant";
    const bodyHtml = escapeHtml(item.text) + (item.status === "streaming" ? '<span class="cursor"></span>' : "");
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
      branchBtn;
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
      `</div>` +
      renderDandelionSVG(item.plants);
    el.querySelectorAll(".dan-seed").forEach((seedEl, i) => {
      seedEl.addEventListener("click", () => onReopenGraftedSeed(item.plants[i]));
    });
    parent.appendChild(el);
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
      expandedHistoryTurns.add(assistantItem.id);
      render({ scrollToTurn: assistantItem.id });
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
      collapseBtn.textContent = "Collapse node";
      collapseBtn.addEventListener("click", () => {
        expandedHistoryTurns.delete(assistantItem.id);
        render({ scrollToTurn: assistantItem.id });
      });
      wrap.appendChild(collapseBtn);
    }
    inner.appendChild(wrap);
  }

  function render(options = {}) {
    inner.innerHTML = "";
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
        const shouldCollapse = isOld && isComplete && !expandedHistoryTurns.has(next.id);
        if (shouldCollapse) renderCollapsedTurn(item, next, turnIndex + 1);
        else renderExpandedTurn(item, next, isOld && isComplete);
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

  async function streamChat(item, prompt) {
    try {
      item.modelLabel = currentModelLabel();
      item.text = `Thinking with ${currentModelLabel()}…`;
      render();
      const data = await api.chat({
        prompt,
        context: state.parentContext,
        system: SYSTEM_PROMPT,
        model: state.currentModel,
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
      const data = await api.continueThread({
        parentContext: state.parentContext,
        mainConversation: state.mainConv.filter((x) => x.id !== item.id),
        graftedPlants: lastFold ? lastFold.plants : [],
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
