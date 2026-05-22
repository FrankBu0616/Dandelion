#!/usr/bin/env node
// Merge harness — full merge-flow simulation for a single scenario.
//
// What it does:
//   1. Pick a scenario from scripts/harness/scenarios.mjs.
//   2. For each branch, either run Ollama (if the branch has only a prompt)
//      or use the pre-baked transcript.
//   3. Extract 3-5 key claims per branch (Ollama call, skipped if branch
//      already has claims).
//   4. Classify the context route using the production classifier
//      (scripts/classify-route.mjs), unless the scenario pre-declares a route.
//   5. If material_conflict, render the conflict-choice UI text and stop.
//      Otherwise, build the merge prompt and call Ollama for the continuation.
//
// This is the bigger sibling of scripts/classify-experiment.mjs. Use this for
// tuning the merge-prompt template and seeing the final merged answer. Use
// classify-experiment.mjs to benchmark classifier accuracy across many
// scenarios at once.

import { classifyRouteWithModel } from './classify-route.mjs';
import { SCENARIOS } from './harness/scenarios.mjs';
import { buildMergePrompt } from './harness/merge-prompt.mjs';
import { chat, activeModel, activeProvider } from './providers.mjs';

function parseArgs(argv) {
  const args = { scenario: 'product_risk', list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') args.list = true;
    else if (arg === '--scenario') args.scenario = argv[++i];
    else if (arg === '--model') {
      const m = argv[++i];
      if (activeProvider() === 'anthropic') process.env.ANTHROPIC_MODEL = m;
      else process.env.OLLAMA_MODEL = m;
    } else if (arg === '--provider') process.env.DANDELION_PROVIDER = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/merge-harness.mjs [options]

Options:
  --scenario <name>   Scenario to run. Default: product_risk
  --provider <name>   ollama (default) | anthropic
  --model <name>      Model tag for the active provider
  --list              List scenarios

Environment:
  DANDELION_PROVIDER  ollama (default) | anthropic
  OLLAMA_BASE_URL     Default: http://localhost:11434/v1
  OLLAMA_MODEL        Default: qwen2.5:3b
  ANTHROPIC_API_KEY   Required when provider=anthropic
  ANTHROPIC_MODEL     Default: claude-haiku-4-5
`);
}

function labelForRole(role) {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  return role;
}

function transcript(messages) {
  return messages.map((m) => `${labelForRole(m.role)}: ${m.content}`).join('\n\n');
}

async function runBranch(parent, branch) {
  if (branch.transcript) return branch;
  const messages = [
    {
      role: 'system',
      content:
        'You are a direct product strategy reviewer. Be specific, opinionated, and concise.',
    },
    ...parent,
    { role: 'user', content: branch.prompt },
  ];
  const response = await chat(messages, { temperature: 0.4 });
  return {
    ...branch,
    transcript: transcript([
      { role: 'user', content: branch.prompt },
      { role: 'assistant', content: response },
    ]),
  };
}

async function extractClaims(branch) {
  if (branch.claims) return branch;
  const content = await chat(
    [
      {
        role: 'system',
        content:
          'Extract the 3-5 most important claims from this branch. Return only concise bullet points.',
      },
      { role: 'user', content: branch.transcript },
    ],
    { temperature: 0.2 },
  );
  return { ...branch, claims: content };
}

function printSection(title, body) {
  console.log(`\n## ${title}\n`);
  console.log(body);
}

function renderConflictChoice(route) {
  const choices = (route.choices ?? [])
    .map((choice, index) => `${index + 1}. ${choice}`)
    .join('\n');
  return `These paths conflict in a way that changes what should happen next.\n\nChoose how to continue:\n${choices}`;
}

// Adapt the harness branch shape ({ id, claims, transcript }) into the plant
// shape the classifier expects ({ title, claim }).
function branchesToPlants(branches) {
  return branches.map((b) => ({ title: b.id, claim: b.claims || b.transcript }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    console.log(Object.keys(SCENARIOS).join('\n'));
    return;
  }

  const scenario = SCENARIOS[args.scenario];
  if (!scenario) {
    throw new Error(`Unknown scenario "${args.scenario}". Use --list to see options.`);
  }

  const model = activeModel();
  console.log(`Running "${scenario.title}" with ${activeProvider()}:${model}`);

  // Resolve branches (Ollama-generated or pre-baked) and extract claims.
  const branchResults = await Promise.all(
    scenario.branches.map((branch) => runBranch(scenario.parent, branch)),
  );
  const branches = await Promise.all(branchResults.map((b) => extractClaims(b)));

  for (const branch of branches) {
    printSection(`Branch: ${branch.id}`, branch.transcript);
    printSection(`Claims: ${branch.id}`, branch.claims);
  }

  // Classify the context route. Pre-declared route wins.
  const route =
    scenario.route ?? (await classifyRouteWithModel(branchesToPlants(branches), { model }));
  printSection('Route', route.kind);

  if (route.kind === 'material_conflict') {
    printSection('Follow-up', scenario.followUp);
    printSection('Merged Answer', renderConflictChoice(route));
    return;
  }

  // additional_context: generate the merged continuation.
  const mergedAnswer = await chat([
    {
      role: 'system',
      content: [
        'You are continuing one coherent conversation.',
        'Answer the user directly as if the relevant context is already part of the conversation.',
        'Do not mention merged context, merged threads, branches, transcripts, key claims, classification, or routing.',
        'Do not begin with "Given the discussions", "Given the merged threads", or similar setup language.',
        'Start with the concrete recommendation or answer.',
      ].join('\n'),
    },
    { role: 'user', content: `${buildMergePrompt(scenario, branches)}\n\n${scenario.followUp}` },
  ], { temperature: 0.4 });

  printSection('Follow-up', scenario.followUp);
  printSection('Merged Answer', mergedAnswer);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
