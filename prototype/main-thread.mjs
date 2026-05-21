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

  function render() {
    inner.innerHTML = "";
    document.body.classList.toggle("is-empty", state.mainConv.length === 0);
    if (state.mainConv.length === 0) {
      renderEmpty();
      return;
    }
    state.mainConv.forEach((item) => {
      if (item.kind === "user") {
        const el = document.createElement("div");
        el.className = "msg msg-user";
        el.innerHTML = `<div class="bubble"></div>`;
        el.querySelector(".bubble").textContent = item.text;
        inner.appendChild(el);
      } else if (item.kind === "assistant") {
        const el = document.createElement("div");
        el.className = "msg msg-assistant";
        const bodyHtml = escapeHtml(item.text) + (item.status === "streaming" ? '<span class="cursor"></span>' : "");
        const branchBtn = item.status !== "streaming"
          ? `<button class="msg-branch-btn" data-branch-msg="${item.id}">` +
              `<svg width="11" height="11" viewBox="0 0 16 16" fill="none">` +
                `<path d="M8 13 Q8 8 4 3M8 13 Q8 8 12 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
              `</svg> Branch` +
            `</button>`
          : "";
        el.innerHTML =
          `<div class="msg-meta">${escapeHtml(item.modelLabel || state.currentModel.label)}</div>` +
          `<div class="body">${bodyHtml}</div>` +
          branchBtn;
        el.querySelector(`[data-branch-msg="${item.id}"]`)?.addEventListener("click", () => onBranch(item));
        inner.appendChild(el);
      } else if (item.kind === "graft-marker") {
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
        inner.appendChild(el);
      } else if (item.kind === "conflict-choice") {
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
        inner.appendChild(el);
      }
    });
    scrollToBottom();
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
