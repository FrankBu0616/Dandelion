// Dandelion merge router.
//
// Classifies a set of grafted plants into one of three routes:
//   - additional_context : compatible, continue naturally
//   - soft_disagreement  : different emphasis, integrate into one recommendation
//   - material_conflict  : incompatible next steps, ask the user to choose
//
// This is intentionally a small, deterministic, keyword-based heuristic.
// The product decision is that merge routing belongs to the app, not to the
// model's final answer prompt — so this file is the canonical source of truth
// for that classification, used by both the browser prototype and the CLI
// harness.
//
// Pure function. No DOM, no network, no globals.

/**
 * @typedef {{ user?: string, asst?: string }} Turn
 * @typedef {{ title?: string, turns: Turn[] }} Plant
 * @typedef {"additional_context" | "material_conflict"} RouteKind
 * @typedef {{ kind: RouteKind, summary: string, choices: string[] }} Route
 */

/**
 * Classify a set of grafted plants into a merge route.
 *
 * Dandelion uses a two-route model:
 *   - additional_context : plants are compatible; continue naturally.
 *   - material_conflict  : plants have any real tension; ask the user to pick.
 *
 * An earlier "soft_disagreement" route was removed: the soft/material boundary
 * was unreliable for both heuristic and small-model classifiers, and a tension
 * the model can't confidently call as compatible should surface to the user.
 *
 * @param {Plant[]} graftedPlants
 * @returns {Route}
 */
export function classifyGraftedPlants(graftedPlants) {
  const text = (graftedPlants || [])
    .flatMap((s) => (s.turns || []).flatMap((t) => [t.user || "", t.asst || ""]))
    .join("\n")
    .toLowerCase();

  const hasMultiProvider =
    /multi-provider|all three providers|openai.*anthropic.*gemini|support.*providers.*day one/.test(
      text,
    );
  const hasSingleProvider =
    /single provider|one provider|claude only|add others later|pick one provider/.test(
      text,
    );
  if (hasMultiProvider && hasSingleProvider) {
    return {
      kind: "material_conflict",
      summary:
        "One path says to ship multi-provider support from day one; the other says to start with one provider so the prompts and merge behavior can be tuned before expanding.",
      choices: [
        "Proceed with multi-provider support from day one.",
        "Proceed with one provider first, then add others later.",
      ],
    };
  }

  return {
    kind: "additional_context",
    summary:
      "The selected plants add compatible context. The next main-thread message will inherit the new information without needing a recap.",
    choices: [],
  };
}

/**
 * Short human-readable label for a route kind. Used by the UI badge.
 * @param {RouteKind} kind
 */
export function routeLabel(kind) {
  if (kind === "material_conflict") return "needs choice";
  if (kind === "additional_context") return "context updated";
  return "classifying…";
}
