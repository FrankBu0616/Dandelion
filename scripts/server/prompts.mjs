// Continuation-prompt builders used by router-prototype-server.mjs.
//
// Two builders for two flows:
//   - buildScenarioContinuationPrompt: for the curated /api/run scenario flow,
//     where parent context + branches + claims are all pre-baked.
//   - buildDynamicContinuationPrompt: for the live /api/continue flow, where
//     the prototype's actual main conversation and woven plants are passed in.
//
// Plus a tiny renderConflict() helper that produces the JSON shape the UI
// renders when the route is material_conflict.

function labelForRole(role) {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  return role;
}

function transcript(messages) {
  return messages.map((m) => `${labelForRole(m.role)}: ${m.content}`).join('\n\n');
}

/**
 * Build the continuation prompt for a curated scenario (additional_context).
 * material_conflict scenarios are handled by renderConflict() instead.
 */
export function buildScenarioContinuationPrompt(scenario) {
  return [
    'The user has been exploring a question through several parallel investigations.',
    'All of the following threads happened; none of them is hypothetical or rejected.',
    'Treat them as shared context for one continuous conversation.',
    '',
    '<parent_context>',
    transcript(scenario.parent),
    '</parent_context>',
    '',
    ...scenario.branches.flatMap((branch, index) => [
      `<parallel_thread id="${index + 1}" name="${branch.id}">`,
      '<key_claims>',
      branch.claims,
      '</key_claims>',
      '<transcript>',
      branch.transcript,
      '</transcript>',
      '</parallel_thread>',
      '',
    ]),
    'Continue naturally from the updated shared context.',
    'Do not mention branches, threads, investigations, key claims, transcripts, routing, or merged context.',
    'Do not summarize the context unless the user asks.',
    'Start with the concrete recommendation or answer.',
    '',
    scenario.followUp,
  ].join('\n');
}

/**
 * Build the continuation prompt for the live /api/continue flow.
 * Called after a weave classified as additional_context — the prototype sends
 * the current main conversation and the just-woven plants.
 */
export function buildDynamicContinuationPrompt({ parentContext, mainConversation, wovenPlants, followUp }) {
  const parentTurns = (mainConversation ?? [])
    .filter((item) => item.kind === 'user' || item.kind === 'assistant')
    .map((item) => ({
      role: item.kind === 'user' ? 'user' : 'assistant',
      content: item.text,
    }));

  return [
    'The user has been exploring a question through parallel plants.',
    'All selected plants happened; none of them is hypothetical or rejected.',
    'Treat them as shared context for one continuous conversation.',
    'The selected threads add compatible information. Continue naturally without recapping them.',
    '',
    '<parent_context>',
    parentContext || transcript(parentTurns),
    '</parent_context>',
    '',
    ...wovenPlants.flatMap((plant, index) => [
      `<parallel_thread id="${index + 1}" name="${plant.title || `plant-${index + 1}`}">`,
      plant.turns
        .map((turn) =>
          [turn.user ? `User: ${turn.user}` : '', turn.asst ? `Assistant: ${turn.asst}` : '']
            .filter(Boolean)
            .join('\n\n'),
        )
        .join('\n\n'),
      '</parallel_thread>',
      '',
    ]),
    'Output rules:',
    '- Answer the user directly.',
    '- Do not mention branches, plants, threads, investigations, transcripts, key claims, routing, or merged context.',
    '- Do not summarize the plants unless the user asks.',
    '- Start with the concrete recommendation or answer.',
    '',
    followUp,
  ].join('\n');
}

/**
 * Render a material_conflict route as the JSON the UI expects.
 * Material conflicts deliberately do NOT call the model — the UI surfaces
 * the choices and waits for the user.
 */
export function renderConflict(route) {
  return {
    kind: 'conflict',
    text: 'These paths conflict in a way that changes what should happen next.',
    choices: route.choices,
  };
}
