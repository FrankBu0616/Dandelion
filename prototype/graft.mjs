// Graft flow — collapses one or more plants back into the main thread and
// classifies the merge route (additional_context vs material_conflict).
//
// Two entry points:
//   graftSelected()       — grafts every plant currently checked in the tray
//   graftOne(plantId)     — grafts a single plant (its inline Graft button)
//
// Plus the conflict-choice resolver, which fires when the user picks one of
// the two stances surfaced by a material_conflict route.
//
// Classification is asynchronous: the graft marker renders immediately in a
// pending state, the model-based classifier runs against the server, and the
// marker (plus any conflict-choice card) is patched in place when the route
// resolves. If the network call fails we fall back to the synchronous keyword
// heuristic in scripts/merge-router.mjs so the UI never gets stuck.
//
// The module mutates `state.mainConv`, `state.plants`, `state.postGraftArmed`,
// and the conflict-choice item's `resolved` / `selected` fields. Everything
// else (composer placeholder, focus, re-rendering) goes through the injected
// `composer` and `render` callbacks so this module stays DOM-agnostic.

import { classifyGraftedPlants } from "../scripts/merge-router.mjs";
import * as api from "./api.mjs";

const CHOSEN_PATH_REPLY =
  "Got it. I'll carry that path forward as the main-thread context from here. The other stance remains visible in the graft fold, but I won't use it as the active direction unless you ask to revisit it.";

const PENDING_ROUTE = { kind: null, pending: true, summary: "", choices: [] };

function plantToPayload(st) {
  return {
    title: st.title,
    turns: st.turns.map((t) => ({ user: t.user, asst: t.asst })),
    _graftedKey: st.id,
  };
}

function placeholderFor(route) {
  if (route?.pending) return "Classifying grafted context…";
  return route?.kind === "material_conflict"
    ? "Choose a path above to continue…"
    : "Continue from the grafted context…";
}

export function createGraft({ state, graph, makeId, render, composer, streamInto }) {
  function findMarkerIndex(mergeId) {
    return state.mainConv.findIndex(
      (item) => item.kind === "graft-marker" && item.id === mergeId,
    );
  }

  function applyRoute(mergeId, route) {
    const markerIdx = findMarkerIndex(mergeId);
    if (markerIdx === -1) return; // marker was removed by something else; bail.
    const marker = state.mainConv[markerIdx];
    marker.route = route;
    graph.setRoute(mergeId, route);

    if (route.kind === "material_conflict") {
      state.mainConv.splice(markerIdx + 1, 0, {
        kind: "conflict-choice",
        id: makeId(),
        summary: route.summary,
        choices: route.choices,
        resolved: false,
      });
      state.postGraftArmed = false;
    } else {
      state.postGraftArmed = true;
    }

    composer.setPlaceholder(placeholderFor(route));
    render.main();
  }

  async function classifyAndApply(mergeId, graftedPayload) {
    let route;
    try {
      const result = await api.classifyRoute({
        plants: graftedPayload,
        model: state.currentModel,
      });
      route = result?.route;
      // Defensive: if the server returned something malformed, fall back.
      if (!route || (route.kind !== "additional_context" && route.kind !== "material_conflict")) {
        route = classifyGraftedPlants(graftedPayload);
      }
    } catch {
      route = classifyGraftedPlants(graftedPayload);
    }
    applyRoute(mergeId, route);
  }

  function pushPendingMarker(mergeId, graftedPayload, parents) {
    state.mainConv.push({
      kind: "graft-marker",
      id: mergeId,
      route: PENDING_ROUTE,
      plants: graftedPayload,
    });
    graph.addMerge({ id: mergeId, parents, route: PENDING_ROUTE });
    // Hold post-graft armed off until classification resolves; the route may
    // turn out to require a user choice first.
    state.postGraftArmed = false;
  }

  function afterGraftStart() {
    render.plants();
    render.main();
    composer.setPlaceholder(placeholderFor(PENDING_ROUTE));
    composer.focusLater(350);
  }

  function graftSelected() {
    const grafted = state.plants.filter(
      (s) => s.selected && s.status === "idle" && s.turns.length > 0,
    );
    if (grafted.length === 0) return;
    const graftedPayload = grafted.map(plantToPayload);
    const mergeId = makeId();
    const parents = grafted.map((s) => s.turns[s.turns.length - 1].id);
    pushPendingMarker(mergeId, graftedPayload, parents);
    const graftedIds = new Set(grafted.map((s) => s.id));
    state.plants = state.plants.filter((s) => !graftedIds.has(s.id));
    afterGraftStart();
    classifyAndApply(mergeId, graftedPayload);
  }

  function graftOne(plantId) {
    const st = state.plants.find((s) => s.id === plantId);
    if (!st || st.status === "running" || st.turns.length === 0) return;
    const graftedPayload = [plantToPayload(st)];
    const mergeId = makeId();
    const parents = [st.turns[st.turns.length - 1].id];
    pushPendingMarker(mergeId, graftedPayload, parents);
    state.plants = state.plants.filter((s) => s.id !== plantId);
    afterGraftStart();
    classifyAndApply(mergeId, graftedPayload);
  }

  function resolveConflictChoice(choiceId, choiceIndex) {
    const choiceItem = state.mainConv.find(
      (item) => item.kind === "conflict-choice" && item.id === choiceId,
    );
    if (!choiceItem || choiceItem.resolved) return;
    const choice = choiceItem.choices[choiceIndex];
    choiceItem.resolved = true;
    choiceItem.selected = choiceIndex;

    state.mainConv.push({ kind: "user", text: choice });
    const item = { kind: "assistant", id: makeId(), text: "", status: "streaming" };
    state.mainConv.push(item);
    graph.addChat({
      id: item.id,
      thread: "main",
      prompt: choice,
      parent: state.graph.mainLeafId,
    });
    composer.setPlaceholder("Continue from the chosen path…");
    render.main();
    streamInto(item, CHOSEN_PATH_REPLY, 3600);
  }

  return { graftSelected, graftOne, resolveConflictChoice };
}
