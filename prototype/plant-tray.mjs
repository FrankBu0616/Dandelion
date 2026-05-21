// Plant tray — renders the right-hand "Seeds" column: the list of plants, the
// focused-plant bloom (messages + composer), and the graft button state.
//
// The tray does not own plant state — that lives on the caller's state object.
// It just reads `state.plants` and `state.activePlantId`, mutates `selected` /
// `composerDraft` / `activePlantId` in response to user actions, and calls back
// for cross-cutting concerns (opening a new plant, sending a turn, grafting).
//
// Usage from prototype.html:
//
//   import { createPlantTray } from "./prototype/plant-tray.mjs";
//   const tray = createPlantTray({
//     dom: { column, body, subtitle, countLabel, graftBtn, graftHint },
//     state,
//     callbacks: { onOpenPlant, onGraftOne, onSendInPlant },
//   });
//   // re-render any time state.plants mutates:
//   tray.render();

import { escapeHtml } from "./escape.mjs";
import { autoSizeTextarea } from "./dom-utils.mjs";

export function createPlantTray({ dom, state, callbacks }) {
  const { column, body, subtitle, countLabel, graftBtn, graftHint } = dom;
  const { onOpenPlant, onGraftOne, onSendInPlant } = callbacks;

  function seedPreview(st) {
    if (st.status === "running") return "growing...";
    const last = [...st.turns].reverse().find((t) => t.asst || t.user);
    if (!last) return "empty seed";
    return (last.asst || last.user || "").replace(/\s+/g, " ").slice(0, 96);
  }

  function renderPlantMessages(st) {
    if (st.turns.length === 0) {
      return `<div class="plant-empty">Ask a question that shares the session's context…</div>`;
    }
    return st.turns
      .map((turn) => {
        let html = "";
        if (turn.user) {
          html += `<div class="plant-message user"><div class="bubble">${escapeHtml(turn.user)}</div></div>`;
        }
        if (turn.asst !== undefined) {
          const cursor = turn.status === "streaming" ? '<span class="cursor"></span>' : "";
          html += `<div class="plant-message assistant"><div class="body" data-plant-turn="${turn.id || ""}">${escapeHtml(turn.asst)}${cursor}</div></div>`;
        }
        return html;
      })
      .join("");
  }

  function wireFocusedSeedComposer(container, st) {
    const ta = container.querySelector(`textarea[data-plant-draft="${st.id}"]`);
    ta.addEventListener("input", (e) => {
      st.composerDraft = e.target.value;
      autoSizeTextarea(e.target, 100);
      const sb = container.querySelector(`button[data-plant-send="${st.id}"]`);
      sb.disabled = !st.composerDraft.trim() || st.status === "running";
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSendInPlant(st.id);
      }
    });
    autoSizeTextarea(ta, 100);

    const sb = container.querySelector(`button[data-plant-send="${st.id}"]`);
    sb.addEventListener("click", (e) => {
      e.stopPropagation();
      onSendInPlant(st.id);
    });
  }

  function updateGraftButton() {
    const eligible = state.plants.filter((s) => s.selected && s.status === "idle" && s.turns.length > 0);
    const running = state.plants.filter((s) => s.status === "running").length;
    if (state.plants.length === 0) {
      graftBtn.disabled = true;
      graftBtn.textContent = "Graft selected";
      graftHint.textContent = "Plant a seed to start.";
    } else if (running > 0) {
      graftBtn.disabled = true;
      graftBtn.textContent = "Graft selected";
      graftHint.textContent = "Let growing seeds finish first.";
    } else if (eligible.length === 0) {
      graftBtn.disabled = true;
      graftBtn.textContent = "Graft selected";
      graftHint.textContent = "Pick a grown seed to graft.";
    } else {
      graftBtn.disabled = false;
      graftBtn.textContent = `Graft ${eligible.length} seed${eligible.length === 1 ? "" : "s"}`;
      graftHint.textContent = "Selected seeds join the main thread.";
    }
  }

  function render() {
    // Preserve focus + selection across re-renders for the composer textarea.
    const activeEl = document.activeElement;
    const activeDraftId = activeEl && activeEl.dataset ? activeEl.dataset.plantDraft : null;
    const activeSelection = activeDraftId
      ? { start: activeEl.selectionStart, end: activeEl.selectionEnd, value: activeEl.value }
      : null;
    if (activeDraftId && activeSelection) {
      const activePlant = state.plants.find((s) => s.id === activeDraftId);
      if (activePlant) activePlant.composerDraft = activeSelection.value;
    }

    if (state.plants.length > 0) {
      document.body.classList.add("has-plants");
      column.setAttribute("aria-hidden", "false");
    } else {
      document.body.classList.remove("has-plants");
      column.setAttribute("aria-hidden", "true");
    }

    body.innerHTML = "";

    if (state.plants.length === 0) {
      const emptySeed = document.createElement("button");
      emptySeed.className = "plant-empty-action";
      emptySeed.type = "button";
      emptySeed.innerHTML = `<span class="seed-add-icon">+</span><span>New seed</span>`;
      emptySeed.addEventListener("click", onOpenPlant);
      body.appendChild(emptySeed);
    } else {
      if (!state.activePlantId || !state.plants.some((s) => s.id === state.activePlantId)) {
        state.activePlantId = state.plants[0].id;
      }
      const tray = document.createElement("div");
      tray.className = "seed-tray";
      state.plants.forEach((st, i) => {
        const seed = document.createElement("div");
        seed.className = "seed " + st.status;
        if (st.turns.length === 0) seed.classList.add("empty");
        if (st.selected) seed.classList.add("selected");
        if (st.id === state.activePlantId) seed.classList.add("focused");
        const title = st.title || "Seed " + (i + 1);
        const preview = seedPreview(st);
        const disableMergeChk = st.status === "running" || st.turns.length === 0;
        const canGraft = st.status === "idle" && st.turns.length > 0;
        seed.innerHTML =
          `<span class="seed-status-dot"></span>` +
          `<div class="seed-main">` +
          `<div class="seed-title">${escapeHtml(title)}</div>` +
          `<div class="seed-preview">${escapeHtml(preview)}</div>` +
          `</div>` +
          `<button class="seed-graft-btn" data-seed-graft="${st.id}" ${canGraft ? "" : "hidden"}>Graft</button>` +
          `<label class="seed-check" title="Include in graft">` +
          `<input type="checkbox" data-plant-merge="${st.id}" ${st.selected ? "checked" : ""} ${disableMergeChk ? "disabled" : ""}>` +
          `<span class="seed-check-mark">✓</span>` +
          `</label>`;
        seed.addEventListener("click", (e) => {
          // The checkbox sits inside this seed but has pointer-events:none on
          // the input itself (styled via the wrapping label). If we re-render
          // here on a label click, the input gets destroyed before its change
          // event can fire and st.selected never updates. So skip when the
          // click originates from the checkbox area.
          if (e.target.closest(".seed-check")) return;
          state.activePlantId = st.id;
          render();
        });
        const chk = seed.querySelector(`input[data-plant-merge="${st.id}"]`);
        chk.addEventListener("change", (e) => {
          st.selected = e.target.checked;
          render();
          updateGraftButton();
        });
        seed.querySelector(`[data-seed-graft="${st.id}"]`)?.addEventListener("click", (e) => {
          e.stopPropagation();
          onGraftOne(st.id);
        });
        tray.appendChild(seed);
      });
      const addRow = document.createElement("button");
      addRow.className = "seed-add-row";
      addRow.type = "button";
      addRow.innerHTML = `<span class="seed-add-icon">+</span><span>Plant another seed</span>`;
      addRow.addEventListener("click", onOpenPlant);
      tray.appendChild(addRow);
      body.appendChild(tray);

      const focused = state.plants.find((s) => s.id === state.activePlantId);
      if (focused) {
        const bloom = document.createElement("div");
        bloom.className = "focus-bloom";
        const title = focused.title || "Untitled seed";
        const messagesHtml = renderPlantMessages(focused);
        const headerHtml =
          focused.turns.length > 0
            ? `<div class="focus-bloom-header">` +
              `<div class="focus-bloom-title">${escapeHtml(title)}</div>` +
              `<div class="focus-bloom-subtitle">${focused.status === "running" ? "growing" : "ready to graft"}</div>` +
              `</div>`
            : "";
        const disableSend =
          !focused.composerDraft || !focused.composerDraft.trim() || focused.status === "running";
        bloom.innerHTML =
          headerHtml +
          `<div class="plant-messages" data-plant-msgs="${focused.id}">${messagesHtml}</div>` +
          `<div class="plant-composer">` +
          `<textarea data-plant-draft="${focused.id}" placeholder="Ask in this seed…" rows="1">${escapeHtml(focused.composerDraft || "")}</textarea>` +
          `<button data-plant-send="${focused.id}" ${disableSend ? "disabled" : ""}>` +
          `<svg width="12" height="12" viewBox="0 0 16 16" fill="none">` +
          `<path d="M2 8 L14 8 M9 3 L14 8 L9 13" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
          `</svg>` +
          `</button>` +
          `</div>`;
        body.appendChild(bloom);
        wireFocusedSeedComposer(bloom, focused);
        const msgs = bloom.querySelector(`[data-plant-msgs="${focused.id}"]`);
        if (msgs)
          requestAnimationFrame(() => {
            msgs.scrollTop = msgs.scrollHeight;
          });
      }
    }

    if (activeDraftId && activeSelection) {
      requestAnimationFrame(() => {
        const restored = document.querySelector(`textarea[data-plant-draft="${activeDraftId}"]`);
        if (!restored) return;
        restored.focus();
        const pos = Math.min(activeSelection.start ?? restored.value.length, restored.value.length);
        const end = Math.min(activeSelection.end ?? pos, restored.value.length);
        restored.setSelectionRange(pos, end);
      });
    }

    const running = state.plants.filter((s) => s.status === "running").length;
    const total = state.plants.length;
    if (total === 0) subtitle.textContent = "plant a side thought";
    else if (running > 0) subtitle.textContent = `${running} growing`;
    else subtitle.textContent = `${total} planted`;
    if (countLabel) countLabel.textContent = total > 0 ? `${total} plant${total === 1 ? "" : "s"}` : "";
    updateGraftButton();
  }

  // ── DOM hooks the plants module calls into ────────────────────────────
  // Patch a single turn's response body in place during streaming.
  function patchTurn(plantId, turnId, text, streaming) {
    const turnBody = document.querySelector(`[data-plant-turn="${turnId}"]`);
    if (!turnBody) return;
    turnBody.innerHTML = escapeHtml(text) + (streaming ? '<span class="cursor"></span>' : "");
    const msgs = document.querySelector(`[data-plant-msgs="${plantId}"]`);
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  // Focus the composer textarea for a given plant.
  function focusComposer(plantId) {
    setTimeout(() => {
      const ta = document.querySelector(`textarea[data-plant-draft="${plantId}"]`);
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }, 80);
  }

  // Clear the composer textarea after a send.
  function clearComposer(plantId) {
    const ta = document.querySelector(`textarea[data-plant-draft="${plantId}"]`);
    if (ta) ta.value = "";
  }

  return { render, updateGraftButton, patchTurn, focusComposer, clearComposer };
}
