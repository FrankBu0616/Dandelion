// Model picker — fetches /api/models, renders the dropdown, and notifies a
// callback when the user picks a model. Owns no app state; the caller passes
// in the DOM nodes and an onChange handler.
//
// Usage from prototype.html:
//
//   import { createModelPicker } from "./prototype/model-picker.mjs";
//   const picker = createModelPicker({
//     chip:    document.querySelector("#model-chip"),
//     menu:    document.querySelector("#model-menu"),
//     name:    document.querySelector("#model-name"),
//     dot:     document.querySelector("#model-dot"),
//     meta:    document.querySelector("#meta-model"), // optional
//     onChange(model) { state.currentModel = model; },
//   });
//   await picker.load();
//
// model shape: { id, label, kind: "cloud"|"local", provider, model }

import { escapeHtml } from "./escape.mjs";
import { listModels } from "./api.mjs";

export function createModelPicker({ chip, menu, name, dot, meta, onChange }) {
  let current = null;
  let available = [];

  function setCurrent(entry) {
    const kind = entry.provider === "ollama" ? "local" : "cloud";
    current = {
      id: entry.id,
      label: entry.label,
      kind,
      provider: entry.provider,
      model: entry.model,
    };
    name.textContent = entry.label;
    dot.className = "dot" + (kind === "local" ? " local" : "");
    if (meta) meta.textContent = entry.label;
    menu.querySelectorAll(".model-option").forEach((opt) => {
      opt.classList.toggle("selected", opt.dataset.model === entry.id);
    });
    onChange?.(current);
  }

  function renderMenu(models) {
    // Group by provider, then emit one section per non-empty group.
    // Cloud providers share the green dot; local providers (Ollama) get amber.
    // New providers (OpenAI here, future ones) appear automatically.
    const groups = {};
    for (const m of models) {
      (groups[m.provider] || (groups[m.provider] = [])).push(m);
    }

    const PROVIDER_META = {
      anthropic: { label: "Anthropic", color: "#16a34a" },
      openai:    { label: "OpenAI",    color: "#16a34a" },
      ollama:    { label: "Local",     color: "#f59e0b" },
    };
    // Stable section order: cloud providers first, local last.
    const ORDER = ["anthropic", "openai", "ollama"];
    const sections = [];
    for (const key of ORDER) {
      if (groups[key]?.length) {
        const meta = PROVIDER_META[key];
        sections.push({ label: meta.label, color: meta.color, items: groups[key] });
      }
    }
    // Anything not in ORDER (future providers) falls through to a generic group.
    for (const key of Object.keys(groups)) {
      if (ORDER.includes(key)) continue;
      sections.push({ label: key, color: "#6b7280", items: groups[key] });
    }

    menu.innerHTML = "";
    if (sections.length === 0) {
      const empty = document.createElement("div");
      empty.className = "model-group";
      empty.textContent = "No models available — open Settings to add a key, or start Ollama.";
      menu.appendChild(empty);
      return;
    }

    for (const section of sections) {
      const header = document.createElement("div");
      header.className = "model-group";
      header.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${section.color};display:inline-block"></span> ${escapeHtml(section.label)}`;
      menu.appendChild(header);

      for (const entry of section.items) {
        const opt = document.createElement("div");
        opt.className = "model-option";
        opt.dataset.model = entry.id;
        opt.innerHTML =
          `<span class="dot"></span>` +
          `<span>${escapeHtml(entry.label)}</span>` +
          `<span class="secondary">${escapeHtml(entry.secondary || "")}</span>`;
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          setCurrent(entry);
          openMenu(false);
        });
        menu.appendChild(opt);
      }
    }
  }

  function openMenu(open) {
    menu.classList.toggle("open", open);
  }

  async function load() {
    try {
      const data = await listModels();
      available = data.models || [];
      renderMenu(available);

      const def = data.default || {};
      const match =
        available.find((m) => m.provider === def.provider && m.model === def.model) ||
        available[0];
      if (match) setCurrent(match);
      else {
        name.textContent = "No model";
        dot.className = "dot";
      }
    } catch {
      name.textContent = "No model";
      dot.className = "dot";
    }
  }

  // Wire chip + outside-click to toggle the menu.
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    openMenu(!menu.classList.contains("open"));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".model-picker")) openMenu(false);
  });

  return {
    load,
    get current() {
      return current;
    },
    get models() {
      return available;
    },
  };
}
