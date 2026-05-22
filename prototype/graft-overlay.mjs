// Floating graft-dandelion overlay — positions per-graft SVG visuals in the
// right gutter and keeps them anchored to their in-flow markers as the user
// scrolls, resizes, or opens/closes the seed tray.
//
// Why a separate overlay (not children of `.graft-marker`):
//   - The marker lives inside the scrollable column with `max-width: 760px`,
//     so a child SVG positioned `right: -210px` would be clipped by the
//     column's natural extent.
//   - Streaming re-renders wipe `#main-inner` every frame; visuals living
//     under `document.body` survive the wipe and we re-attach them
//     transform-positioned via `getBoundingClientRect()`.
//
// Module shape:
//
//   const overlay = createGraftOverlay({ scrollElement });
//   overlay.register(markerEl, visualEl);   // call after both are in the DOM
//   overlay.clear();                         // call before each full re-render
//   overlay.dispose();                       // tear down listeners
//
// The visual element is appended into the overlay's container. Initialize
// the visual with `hidden = true`; `update()` flips it off the first time
// it computes a real position (avoids one-frame top-left flash during
// streaming, where render() runs inside its own rAF and our positioning
// rAF wouldn't fire until the next frame).

const PLANT_TRANSITION_MS = 500;

export function createGraftOverlay({ scrollElement }) {
  const entries = [];
  let container = null;
  let pendingFrame = null;
  let plantTrackUntil = 0;
  let plantTrackFrame = null;

  function ensureContainer() {
    if (container) return container;
    container = document.createElement("div");
    container.className = "graft-overlay";
    document.body.appendChild(container);
    return container;
  }

  function clear() {
    entries.length = 0;
    if (container) container.innerHTML = "";
  }

  function register(markerEl, visualEl) {
    ensureContainer().appendChild(visualEl);
    entries.push({ marker: markerEl, visual: visualEl });
    schedule();
  }

  function schedule() {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null;
      update();
    });
  }

  function update() {
    for (const { marker, visual } of entries) {
      const rect = marker.getBoundingClientRect();
      const offscreen = rect.bottom < 52 || rect.top > window.innerHeight;
      visual.hidden = offscreen;
      if (offscreen) continue;

      const naturalX = rect.right + 24;
      // Clamp only against the viewport — the seed tray slides over the
      // main column, so we don't reserve space for it. Earlier versions
      // tried to split-pane the clamp and the overlay would jump left
      // whenever the tray opened mid-stream.
      const maxX = window.innerWidth - 230;
      const x = Math.max(16, Math.min(naturalX, maxX));
      const y = rect.top + 14 - 92;
      visual.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    }
  }

  function pumpPlantTransition() {
    update();
    if (performance.now() < plantTrackUntil) {
      plantTrackFrame = requestAnimationFrame(pumpPlantTransition);
    } else {
      plantTrackFrame = null;
    }
  }

  function startPlantTransitionPump() {
    plantTrackUntil = performance.now() + PLANT_TRANSITION_MS;
    if (plantTrackFrame == null) plantTrackFrame = requestAnimationFrame(pumpPlantTransition);
  }

  // Plant column slide-in is a 0.4s CSS transition; `has-plants` flips on
  // body instantly, so a single update tick would snap the overlay to its
  // post-animation position while the column is still mid-slide. Run a
  // short rAF pump (capped at 500ms in case `transitionend` never fires)
  // so the overlay tracks the column smoothly. Triggered by observing body
  // class changes.
  const bodyObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === "class") {
        startPlantTransitionPump();
        break;
      }
    }
  });
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // Catch the trailing edge in case the transition runs longer than our cap.
  const plantColumn = document.getElementById("plant-column");
  const onPlantColumnTransitionEnd = (e) => {
    if (e.propertyName === "transform") update();
  };
  plantColumn?.addEventListener("transitionend", onPlantColumnTransitionEnd);

  const onScroll = () => schedule();
  const onResize = () => schedule();
  scrollElement?.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  function dispose() {
    bodyObserver.disconnect();
    plantColumn?.removeEventListener("transitionend", onPlantColumnTransitionEnd);
    scrollElement?.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    if (plantTrackFrame) cancelAnimationFrame(plantTrackFrame);
    clear();
    container?.remove();
    container = null;
  }

  return { register, clear, update, schedule, dispose };
}
