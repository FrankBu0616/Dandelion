#!/usr/bin/env node
// Tier-1 classifier experiment.
//
// Runs the regex (current) and model (proposed) classifiers against every
// scenario in tests/merge-router/scenarios.json, then prints an agreement
// matrix against the expected route. The 3 "curated" scenarios are the ones
// the regex was tuned for; the 6 "unscripted" scenarios are the real test —
// they use phrasings that do NOT match the regex keywords.
//
// Usage:
//   node scripts/classify-experiment.mjs                 # default model qwen2.5:3b
//   OLLAMA_MODEL=llama3.1:8b node scripts/classify-experiment.mjs
//
// Requires Ollama running on http://localhost:11434.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyGraftedPlants } from "./merge-router.mjs";
import { classifyRouteWithModel } from "./classify-route.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = path.resolve(__dirname, "../tests/merge-router/scenarios.json");

const PASS = "✓"; // ✓
const FAIL = "✗"; // ✗

function plantsForRegex(plants) {
  // Adapt {title, claim} → {title, turns: [{user:"", asst: claim}]}
  return plants.map((s) => ({
    title: s.title || "",
    turns: s.turns ?? [{ user: "", asst: s.claim ?? "" }],
  }));
}

function mark(actual, expected) {
  return actual === expected ? `${PASS} ${actual}` : `${FAIL} ${actual}`;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main() {
  const scenarios = JSON.parse(await fs.readFile(SCENARIO_PATH, "utf8"));
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

  console.log(`\nDandelion merge-router experiment`);
  console.log(`Model: ${model}`);
  console.log(`Scenarios: ${scenarios.length} (${scenarios.filter((s) => s.curated).length} curated, ${scenarios.filter((s) => !s.curated).length} unscripted)\n`);

  const results = [];
  for (const scenario of scenarios) {
    const expected = scenario.expected_route;
    const regexRoute = classifyGraftedPlants(plantsForRegex(scenario.plants));
    let modelRoute;
    try {
      modelRoute = await classifyRouteWithModel(scenario.plants, { model });
    } catch (err) {
      modelRoute = { kind: "ERROR", error: String(err.message || err) };
    }
    results.push({
      id: scenario.id,
      curated: !!scenario.curated,
      expected,
      regex: regexRoute.kind,
      model: modelRoute.kind,
      modelError: modelRoute.error,
      modelSummary: modelRoute.summary,
    });

    process.stdout.write(
      `${pad(scenario.id, 34)}  expected=${pad(expected, 20)}  regex=${pad(mark(regexRoute.kind, expected), 28)}  model=${mark(modelRoute.kind, expected)}\n`,
    );
    if (modelRoute.error) {
      console.log(`    ! ${modelRoute.error}`);
    }
  }

  // Aggregate
  const tally = (subset, key) => subset.filter((r) => r[key] === r.expected).length;
  const curated = results.filter((r) => r.curated);
  const unscripted = results.filter((r) => !r.curated);

  console.log(`\n--- Agreement with expected route ---`);
  console.log(`Curated     (${curated.length}):    regex ${tally(curated, "regex")}/${curated.length}    model ${tally(curated, "model")}/${curated.length}`);
  console.log(`Unscripted  (${unscripted.length}):  regex ${tally(unscripted, "regex")}/${unscripted.length}    model ${tally(unscripted, "model")}/${unscripted.length}`);
  console.log(`Overall     (${results.length}):    regex ${tally(results, "regex")}/${results.length}    model ${tally(results, "model")}/${results.length}\n`);

  // Per-route breakdown for the model
  console.log(`--- Model confusion (unscripted only) ---`);
  const routes = ["additional_context", "material_conflict"];
  for (const expected of routes) {
    const cells = routes.map((actual) => {
      const n = unscripted.filter((r) => r.expected === expected && r.model === actual).length;
      return `${actual}=${n}`;
    });
    console.log(`expected ${pad(expected, 20)}  ${cells.join("  ")}`);
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
