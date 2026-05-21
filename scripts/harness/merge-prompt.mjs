// Merge prompt builder for the harness.
//
// Generates the system+user prompt that asks the model to continue a
// conversation given parent context plus a set of parallel branches.
//
// Aligned with the app-owned routing decision: the prompt embeds a router
// rubric so the model classifies-then-continues with route-appropriate
// behavior. material_conflict is normally handled by the app (not the model),
// but the rubric stays in the prompt so the model behaves correctly if it
// somehow reaches this code path.

function labelForRole(role) {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  return role;
}

function transcript(messages) {
  return messages.map((m) => `${labelForRole(m.role)}: ${m.content}`).join('\n\n');
}

/**
 * Build the merge prompt sent to the model after a scenario's branches have
 * been resolved (Ollama-generated or pre-baked) and had claims extracted.
 *
 * @param {{ parent: Array, branches: Array }} scenario
 * @param {Array<{ id: string, transcript: string, claims: string }>} branches
 * @returns {string}
 */
export function buildMergePrompt(scenario, branches) {
  return [
    'The user has been exploring a question through several parallel investigations.',
    'All of the following threads happened; none of them is hypothetical or rejected.',
    'Treat them as shared context for one continuous conversation.',
    '',
    '<parent_context>',
    transcript(scenario.parent),
    '</parent_context>',
    '',
    ...branches.flatMap((branch, index) => [
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
    'Before answering, classify the merged threads silently:',
    '- additional_context: the threads add compatible information or discuss unrelated aspects of the same question.',
    '- material_conflict: the threads have any real tension — incompatible claims, conflicting recommendations, or different directions that affect what the user should do next.',
    '',
    'If the classification is additional_context:',
    '- Continue naturally from the updated shared context.',
    '- Do not mention branches, threads, investigations, key claims, or transcripts.',
    '- Do not summarize the merged material unless the user asks.',
    "- Start by directly answering the user's question.",
    '- Prefer one concrete next action over a recap.',
    '',
    'If the classification is material_conflict:',
    '- Do not pick a side for the user.',
    '- Do not make a recommendation, even if the user asks for your call.',
    '- Briefly summarize the conflicting stances in neutral language.',
    '- Ask the user which stance they want to proceed with.',
    '- Keep the choice set small and concrete.',
    '',
    'When in doubt between additional_context and material_conflict, choose material_conflict so the user can decide.',
    'Example: "build it fast" vs "make it polished enough to test the feeling" is material_conflict — these are real direction choices.',
    'Example: "ship one provider" vs "ship three providers" is material_conflict.',
    '',
    'Output rules:',
    '- Never say "both options are valid".',
    '- Never say "both approaches are important to consider".',
    '- Never answer with "it depends" when one integrated next action is possible.',
    '- Never ask "which stance do you want?" unless the classification is material_conflict.',
    '- When the classification is material_conflict, asking the user to choose is the answer.',
    '- Never state the classification label.',
    '- Never say "merged", "shared context", "key points", "summary", or "threads" in the final answer unless material_conflict requires naming the choices.',
    '',
    'For additional_context, the answer shape is:',
    '1. Direct recommendation in the first sentence.',
    '2. Short rationale.',
    '3. Concrete next step.',
  ].join('\n');
}
