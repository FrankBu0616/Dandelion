// Tests for the merge router classifier.
//
// Run with: node --test tests/

import test from "node:test";
import assert from "node:assert/strict";
import { classifyWovenPlants, routeLabel } from "../scripts/merge-router.mjs";

const plant = (text) => ({ title: "t", turns: [{ user: "", asst: text }] });

test("material_conflict when multi-provider and single-provider stances both appear", () => {
  const route = classifyWovenPlants([
    plant("We should ship multi-provider support from day one across OpenAI, Anthropic, and Gemini."),
    plant("Pick one provider, claude only, add others later once prompts are tuned."),
  ]);
  assert.equal(route.kind, "material_conflict");
  assert.equal(route.choices.length, 2);
});

test("soft_disagreement when rough-prototype and fidelity stances both appear", () => {
  const route = classifyWovenPlants([
    plant("Start rough. Build the fastest possible prototype with just text boxes."),
    plant("Need some fidelity and polish so the post-weave moment can be evaluated."),
  ]);
  assert.equal(route.kind, "soft_disagreement");
  assert.equal(route.choices.length, 0);
});

test("additional_context for compatible plants", () => {
  const route = classifyWovenPlants([
    plant("The data model is sessions, threads, and a merge record."),
    plant("Transcript boundaries matter so the merge prompt can distinguish parent context."),
  ]);
  assert.equal(route.kind, "additional_context");
});

test("handles empty input without throwing", () => {
  const route = classifyWovenPlants([]);
  assert.equal(route.kind, "additional_context");
});

test("handles missing turns/fields defensively", () => {
  const route = classifyWovenPlants([{ title: "no turns" }, { turns: [{}] }]);
  assert.equal(route.kind, "additional_context");
});

test("routeLabel maps each kind to a short human label", () => {
  assert.equal(routeLabel("material_conflict"), "needs choice");
  assert.equal(routeLabel("soft_disagreement"), "integrated");
  assert.equal(routeLabel("additional_context"), "context updated");
});
