// Model-based merge-route classifier.
//
// Replacement candidate for the keyword regex in scripts/merge-router.mjs.
// Takes the same woven-plant input shape used by the prototype and the
// existing classifyWovenPlants. Returns the same { kind, summary, choices }
// shape so the live app can swap in without other changes.
//
// Calls Ollama by default (model: qwen2.5:3b). Falls back to additional_context
// if the model output cannot be parsed — never throws into the UI.

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

const SYSTEM_PROMPT = `You are Dandelion's merge-route classifier.

The user is weaving several plants back into a main conversation. You must decide which of two routes applies:

1. "additional_context" — the plants add compatible information. They cover different facets of the same topic, or expand the picture without disagreeing on direction. The main thread can continue naturally with all of them in context.

2. "material_conflict" — the plants have a real tension: different stances, recommendations, or directions. The user must pick one to proceed. When in doubt, classify as material_conflict so the user can decide.

Output strictly a single JSON object with this shape and nothing else:
{
  "kind": "additional_context" | "material_conflict",
  "summary": "one or two sentences describing how the plants relate",
  "choices": ["short imperative option A", "short imperative option B"]
}

The "choices" array MUST be present for material_conflict (exactly two options) and MUST be an empty array [] for additional_context.

Do not include any prose outside the JSON. Do not wrap in markdown code fences.`;

/**
 * @typedef {{ user?: string, asst?: string }} Turn
 * @typedef {{ title?: string, turns?: Turn[], claim?: string }} Plant
 */

/**
 * Render a plant into the prompt body. Accepts either the {turns: [{user,asst}]}
 * shape (live app) or a flat {claim} shape (scenario fixtures).
 */
function plantToPromptBlock(plant, i) {
  const title = plant.title || `Plant ${i + 1}`;
  let body;
  if (plant.turns?.length) {
    body = plant.turns
      .map((t) => [t.user && `Q: ${t.user}`, t.asst && `A: ${t.asst}`].filter(Boolean).join("\n"))
      .join("\n");
  } else {
    body = plant.claim || "";
  }
  return `### ${title}\n${body}`;
}

function buildUserPrompt(wovenPlants) {
  const blocks = wovenPlants.map(plantToPromptBlock).join("\n\n");
  return `Classify the following ${wovenPlants.length} plant${wovenPlants.length === 1 ? "" : "s"}:\n\n${blocks}\n\nReturn only the JSON object.`;
}

// Synthesize "follow plant N" choices when the model returned a valid kind
// but failed to produce two clean choice strings. Better than dropping the
// classification — the user still gets a choice prompt, just with generic
// labels they can interpret from the plant content.
function synthesizeChoices(wovenPlants) {
  return (wovenPlants || []).slice(0, 2).map((p, i) => `Proceed with ${p.title || `plant ${i + 1}`}.`);
}

function safeParseRoute(raw, wovenPlants) {
  if (!raw || typeof raw !== "string") return null;
  // Strip code fences and surrounding prose if any
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  // Find first {...} block
  const braceStart = candidate.indexOf("{");
  const braceEnd = candidate.lastIndexOf("}");
  if (braceStart === -1 || braceEnd === -1) return null;
  const jsonText = candidate.slice(braceStart, braceEnd + 1);
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const validKinds = ["additional_context", "material_conflict"];
  // Coerce any legacy "soft_disagreement" output from older prompts to material_conflict.
  let kind = parsed.kind === "soft_disagreement" ? "material_conflict" : parsed.kind;
  if (!validKinds.includes(kind)) return null;
  let choices = Array.isArray(parsed.choices)
    ? parsed.choices.map(String).filter((s) => s.trim().length > 0)
    : [];
  if (kind === "material_conflict") {
    // Trust the kind even if choices are malformed — synthesize from plant titles.
    if (choices.length < 2) choices = synthesizeChoices(wovenPlants);
    choices = choices.slice(0, 2);
  } else {
    choices = [];
  }
  return {
    kind,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    choices,
  };
}

function fallbackRoute() {
  return {
    kind: "additional_context",
    summary:
      "Classifier output could not be parsed; defaulting to additional_context so the conversation can continue.",
    choices: [],
  };
}

/**
 * Call the model with the structured classifier prompt.
 */
async function callModel({ model, baseUrl, temperature, system, user }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      stream: false,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}\n${body}`);
  }
  const json = await response.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

/**
 * Classify woven plants using the model.
 * Returns { kind, summary, choices } — same shape as classifyWovenPlants.
 *
 * @param {Plant[]} wovenPlants
 * @param {{ model?: string, baseUrl?: string, temperature?: number }} opts
 */
export async function classifyRouteWithModel(wovenPlants, opts = {}) {
  const model = opts.model ?? DEFAULT_MODEL;
  const baseUrl = opts.baseUrl ?? OLLAMA_BASE_URL;
  const temperature = opts.temperature ?? 0.1;
  const userPrompt = buildUserPrompt(wovenPlants || []);
  let raw;
  try {
    raw = await callModel({ model, baseUrl, temperature, system: SYSTEM_PROMPT, user: userPrompt });
  } catch (err) {
    return { ...fallbackRoute(), error: String(err.message || err) };
  }
  const parsed = safeParseRoute(raw, wovenPlants);
  if (!parsed) return { ...fallbackRoute(), error: "unparseable_model_output", raw };
  return parsed;
}
