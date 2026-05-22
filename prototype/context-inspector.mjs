import { escapeHtml } from "./escape.mjs";

function compact(text, max = 92) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return value.slice(0, max - 1).trimEnd() + "...";
}

function lastPlantText(plant) {
  const turns = Array.isArray(plant?.turns) ? plant.turns : [];
  const last = [...turns].reverse().find((turn) => turn.asst || turn.user);
  return last?.asst || last?.user || "";
}

function routeText(route) {
  if (route?.pending) return "classifying";
  if (route?.kind === "material_conflict") return "plants disagree";
  if (route?.kind === "additional_context") return "context updated";
  return "";
}

function readyFiles(state) {
  return (state.sessionFiles || []).filter((f) => f.status === "ready" && f.fileId);
}

// The default main-thread system prompt. Mirrors `runChat` in
// scripts/router-prototype-server.mjs — if that changes, change here too.
const SYSTEM_PROMPT_DEFAULT =
  "You are Dandelion, a concise assistant inside a local prototype. Answer directly and naturally.";

// Returns true when parent-context is set AND not muted.
function parentContextActive(state) {
  return Boolean(state.parentContext) && !state.parentContextMuted;
}

function collectSegments(state) {
  const segments = [];

  // System prompt is always sent — surface it as the first segment so users
  // can see (and later edit) what scaffolds every turn.
  segments.push({
    type: "system",
    label: "System",
    title: "Dandelion assistant prompt",
    preview: parentContextActive(state)
      ? "Default prompt + parent-context guidance folded in as background."
      : compact(SYSTEM_PROMPT_DEFAULT, 112),
  });

  // One segment per session file — gives per-file mute control directly.
  // Muted files stay uploaded but are excluded from the next send.
  for (const file of readyFiles(state)) {
    segments.push({
      type: "attachment",
      label: "Attachment",
      title: file.name,
      preview: `${file.mediaType} · rides every turn until removed`,
      meta: file.muted ? "muted" : "file_id",
      muted: !!file.muted,
      mutable: true,
      muteTarget: { kind: "file", file },
    });
  }

  if (state.parentContext) {
    segments.push({
      type: "root",
      label: "Root",
      title: state.parentContext,
      preview: state.parentContextMuted
        ? "Muted — withheld from post-graft continuation context."
        : "Session premise available to post-graft continuation.",
      meta: state.parentContextMuted ? "muted" : "",
      muted: !!state.parentContextMuted,
      mutable: true,
      muteTarget: { kind: "parentContext" },
    });
  }

  // Merged-in context is mutable too. Mute flips `.muted` on the source
  // state object (the user/assistant pair, the plant, the choice item).
  // Filters live in main-thread.mjs streamContinue / streamChat — muted
  // items don't reach the continuation prompt builder.
  for (let i = 0; i < state.mainConv.length; i++) {
    const item = state.mainConv[i];
    const next = state.mainConv[i + 1];
    if (item.kind === "user" && next?.kind === "assistant") {
      // A "turn" is the user+assistant pair. We tag the assistant item as
      // the source-of-truth for muted, and the filter treats either side
      // muted as muting the whole turn.
      const muted = !!(item.muted || next.muted);
      segments.push({
        type: "trunk",
        label: "Trunk",
        title: compact(item.text, 72) || "Main turn",
        preview: muted
          ? "Muted — withheld from any post-graft continuation."
          : compact(next.text, 112) || (next.status === "streaming" ? "Streaming..." : "Admitted main-thread turn."),
        meta: muted ? "muted" : "",
        muted,
        mutable: true,
        muteTarget: { kind: "turn", user: item, assistant: next },
      });
      i++;
    } else if (item.kind === "graft-marker") {
      const status = routeText(item.route);
      for (const plant of item.plants || []) {
        const isConflict = item.route?.kind === "material_conflict";
        segments.push({
          type: isConflict ? "conflict" : "seed",
          label: isConflict ? "Conflict" : "Grafted seed",
          title: plant.fullPrompt || plant.title || "Untitled seed",
          preview: plant.muted
            ? "Muted — excluded from the next continuation prompt."
            : (compact(lastPlantText(plant), 112) || status || "Admitted plant context."),
          meta: plant.muted ? "muted" : status,
          muted: !!plant.muted,
          mutable: true,
          muteTarget: { kind: "plant", plant },
          plant,
        });
      }
    } else if (item.kind === "conflict-choice" && item.resolved) {
      const choice = item.choices?.[item.selected] || "";
      segments.push({
        type: "choice",
        label: "Choice",
        title: compact(choice, 76) || "Selected path",
        preview: item.muted
          ? "Muted — choice no longer drives the trunk direction."
          : "This stance is now the trunk direction.",
        meta: item.muted ? "muted" : "",
        muted: !!item.muted,
        mutable: true,
        muteTarget: { kind: "choice", item },
      });
    }
  }

  return segments;
}

function glyphFor(type) {
  if (type === "conflict") return "!";
  return "";
}

export function createContextInspector({ dom, state, callbacks = {} }) {
  const { button, drawer, body, count, close, pillCount } = dom;
  const { onReopenGraftedSeed, onContextChange } = callbacks;
  let open = false;
  // Track the segment count between renders so we can pulse the pill when
  // something new lands (graft, file upload, parent context set). Skips the
  // pulse while the drawer is open — the user is already looking.
  let lastSegmentCount = -1;
  let pulseTimer = null;
  function pulsePill() {
    if (!button || open) return;
    button.classList.remove("is-pulsing");
    // Re-flow so a back-to-back pulse retriggers the animation.
    void button.offsetWidth;
    button.classList.add("is-pulsing");
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => button.classList.remove("is-pulsing"), 1200);
  }

  // Toggle the muted flag on the underlying state object. Called from the ×
  // button on mutable segments. Re-renders the inspector and notifies the
  // host (so the chip bar / wire-shape footer / etc. resync).
  function toggleMute(target) {
    if (!target) return;
    if (target.kind === "parentContext") {
      state.parentContextMuted = !state.parentContextMuted;
    } else if (target.kind === "file" && target.file) {
      target.file.muted = !target.file.muted;
    } else if (target.kind === "turn") {
      // Mute the whole user+assistant turn. Flip both so either side is
      // sufficient for downstream filters to skip it.
      const next = !(target.assistant.muted || target.user.muted);
      target.user.muted = next;
      target.assistant.muted = next;
    } else if (target.kind === "plant" && target.plant) {
      target.plant.muted = !target.plant.muted;
    } else if (target.kind === "choice" && target.item) {
      target.item.muted = !target.item.muted;
    }
    render();
    onContextChange?.();
  }

  function setOpen(nextOpen) {
    open = nextOpen;
    drawer.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    button.classList.toggle("active", open);
    button.setAttribute("aria-expanded", String(open));
    render();
  }

  function render() {
    const segments = collectSegments(state);
    // The user-meaningful segments are root/trunk/seed/choice/conflict —
    // system/attachment are scaffold the user didn't author. Show the empty
    // state when nothing real has accrued, regardless of scaffold presence.
    const SCAFFOLD = new Set(["system", "attachment"]);
    const contentSegments = segments.filter((s) => !SCAFFOLD.has(s.type));
    const mutedCount = segments.filter((s) => s.muted).length;
    const base = `${contentSegments.length} admitted segment${contentSegments.length === 1 ? "" : "s"}`;
    count.textContent = mutedCount > 0 ? `${base} · ${mutedCount} muted` : base;

    // Compact label for the top-bar pill. Counts every meaningful segment
    // (files + root + trunk + seeds + choices) so users see that the
    // inspector is actively tracking — and that hiding it would hide real
    // state. Updated BEFORE the empty-state early return so file-only
    // sessions still show "1" / "2" in the pill.
    const allCount = segments.filter((s) => s.type !== "system").length;
    if (pillCount) {
      if (allCount === 0) {
        pillCount.textContent = "";
        pillCount.hidden = true;
      } else {
        pillCount.hidden = false;
        pillCount.textContent = mutedCount > 0 ? `${allCount} · ${mutedCount} muted` : `${allCount}`;
      }
    }
    // Pulse the pill when something new is admitted into context. Skipped
    // on first render (lastSegmentCount === -1) so we don't pulse on page
    // load with a pre-populated session.
    if (lastSegmentCount !== -1 && allCount > lastSegmentCount) pulsePill();
    lastSegmentCount = allCount;

    if (contentSegments.length === 0) {
      body.innerHTML =
        `<div class="context-empty">` +
          `<div class="context-empty-mark"></div>` +
          `<div class="context-empty-title">No trunk context yet</div>` +
          `<div class="context-empty-copy">Start the main thread, then graft useful seeds into the trunk.</div>` +
        `</div>`;
      return;
    }

    const segmentsHtml = segments.map((segment, index) => {
      const canReopen = segment.plant ? ` data-context-plant="${index}"` : "";
      const meta = segment.meta ? `<span class="context-item-meta">${escapeHtml(segment.meta)}</span>` : "";
      const classes = ["context-item", segment.type];
      if (segment.muted) classes.push("is-muted");
      // Mute toggle — eye / eye-off conveys "visible / hidden from model",
      // which is exactly what muting does. Different shape AND different
      // metaphor from the chip × (permanent delete), so the two actions
      // never get confused. `data-mute-index` carries the segment position
      // so the listener can look up `muteTarget`.
      const muteGlyph = segment.muted
        ? // eye with a slash — currently hidden from the model
          `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
            `<path d="M2.5 4.5l11 7"/>` +
            `<path d="M5.2 4.2A8.6 8.6 0 0 0 1.5 8s2.5 4 6.5 4a7 7 0 0 0 2.6-.5"/>` +
            `<path d="M13.4 10.4A8.4 8.4 0 0 0 14.5 8S12 4 8 4a6.8 6.8 0 0 0-1.2.1"/>` +
            `<circle cx="8" cy="8" r="1.8"/>` +
          `</svg>`
        : // open eye — visible to the model
          `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
            `<path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4z"/>` +
            `<circle cx="8" cy="8" r="2.2"/>` +
          `</svg>`;
      const muteTitle = segment.muted
        ? "Click to show to model (currently hidden)"
        : "Click to hide from model (kept in your view)";
      const muteBtn = segment.mutable
        ? `<button class="ctx-mute-btn" data-mute-index="${index}" type="button"` +
            ` title="${muteTitle}"` +
            ` aria-label="${muteTitle}"` +
            ` aria-pressed="${segment.muted ? "true" : "false"}">${muteGlyph}</button>`
        : "";
      return (
        `<article class="${classes.join(" ")}"${canReopen}>` +
          `<div class="context-glyph">${escapeHtml(glyphFor(segment.type))}</div>` +
          `<div class="context-copy">` +
            `<div class="context-item-kicker">${escapeHtml(segment.label)}${meta}</div>` +
            `<div class="context-item-title">${escapeHtml(segment.title)}</div>` +
            `<div class="context-item-preview">${escapeHtml(segment.preview)}</div>` +
          `</div>` +
          muteBtn +
        `</article>`
      );
    }).join("");

    body.innerHTML = segmentsHtml;

    body.querySelectorAll("[data-context-plant]").forEach((el) => {
      el.addEventListener("click", (e) => {
        // Don't reopen the seed when the user clicked × on a (future) mutable
        // seed segment. Today seeds aren't mutable, but keep this defensive.
        if (e.target.closest(".ctx-mute-btn")) return;
        const segment = segments[Number(el.dataset.contextPlant)];
        if (segment?.plant) onReopenGraftedSeed?.(segment.plant);
      });
    });

    body.querySelectorAll(".ctx-mute-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const segment = segments[Number(btn.dataset.muteIndex)];
        toggleMute(segment?.muteTarget);
      });
    });
  }

  button.addEventListener("click", () => setOpen(!open));
  close.addEventListener("click", () => setOpen(false));

  return { render, setOpen };
}
