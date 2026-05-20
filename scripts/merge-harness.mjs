#!/usr/bin/env node

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b';

const SCENARIOS = {
  product_risk: {
    title: 'Dandelion product risk',
    parent: [
      {
        role: 'user',
        content:
          'I am building Dandelion: a local-first desktop app for spawning parallel LLM plants and merging them back into a main conversation as pooled context. What is the strongest product risk?',
      },
    ],
    branches: [
      {
        id: 'market',
        prompt:
          'Analyze the market and positioning risk. Focus on whether this is differentiated enough from Claude Side Chats, ChatGPT branching, and coding-agent parallel threads.',
      },
      {
        id: 'workflow',
        prompt:
          'Analyze the user-workflow risk. Focus on whether heavy LLM users will actually want root question -> plants -> merge -> continue often enough.',
      },
      {
        id: 'technical',
        prompt:
          'Analyze the technical risk. Focus on whether merge-as-context-pooling can work reliably without turning into a confusing transcript dump.',
      },
    ],
    followUp:
      'Given all of that, make the call: what should I validate before building the Electron app?',
  },
  disagreeing_providers: {
    title: 'Disagreeing branches: provider scope',
    parent: [
      {
        role: 'user',
        content:
          'For Dandelion v1, should I support OpenAI, Anthropic, Google, and Ollama from day one, or pick one provider and add others later?',
      },
      {
        role: 'assistant',
        content: 'This is a genuine tradeoff. I will explore both sides.',
      },
    ],
    branches: [
      {
        id: 'multi-provider',
        prompt:
          'Argue strongly for multi-provider support from day one. Account for BYO keys, local-first positioning, and user preference.',
      },
      {
        id: 'single-provider',
        prompt:
          'Argue strongly for one provider first. Account for prompt portability, testing burden, and a solo developer building v1.',
      },
    ],
    followUp: 'Okay, which should I actually do for v1? Just give me your call.',
  },
  curated_provider_scope: {
    title: 'Curated disagreement: provider scope',
    route: {
      classification: 'material_conflict',
      choices: [
        'Support OpenAI, Anthropic, and Gemini from day one.',
        'Start with one provider, tune the core experience, and add others later.',
      ],
    },
    parent: [
      {
        role: 'user',
        content:
          'For a single-user desktop app where each user brings their own LLM API key, should I support OpenAI, Anthropic, and Google all from day one, or pick one and add others later?',
      },
      {
        role: 'assistant',
        content: 'Genuinely two-sided question. Let me explore both framings.',
      },
    ],
    branches: [
      {
        id: 'multi-provider',
        transcript:
          'User: Argue for supporting all three providers from day one.\n\nAssistant: If the product is BYO-key and open-source, multi-provider on day one is close to free and protects against a real risk. The OpenAI SDK and Anthropic SDK have nearly identical chat-completion shapes; the Gemini SDK differs but is wrappable. A thin provider-adapter layer is maybe 200 lines of TypeScript per provider. The user-facing benefit is significant: people have strong existing preferences, and a tool that only supports the provider they do not have a key for is a tool they close. The downside is testing surface: you have to verify your prompt and merge logic against three model families with three different quirks. But you have to do this eventually anyway. Doing it day-one is cheaper than retrofitting after you have baked OpenAI-specific assumptions in. Verdict: ship multi-provider from day one.',
        claims:
          '- Multi-provider from day one is close to free for a BYO-key tool\n- SDK shapes are similar; provider-adapter layer is small\n- Strong user benefit: people have provider preferences and will not switch for one app\n- Testing burden exists but is unavoidable\n- Recommendation: ship OpenAI + Anthropic + Gemini together',
      },
      {
        id: 'single-provider',
        transcript:
          'User: Argue for picking one provider and adding others later.\n\nAssistant: For a single-developer side project, multi-provider from day one sounds free but is not. Each provider has subtle behavior differences: tokenization, system-prompt handling, max context, rate-limit error shapes, retry semantics, JSON-mode quirks, vision-API formats, tool-calling interfaces. Your code path can paper over all of these but your prompt engineering cannot: a prompt that works perfectly on Claude often degrades on Gemini and vice versa, and your merge template is going to be especially sensitive to this. Shipping with one model lets you tune the prompts against that model behavior and ship something that works well. Adding providers later, after the prompts are locked, is the right order. Verdict: pick one, probably Claude given the merge framing test complexity, and add others in v0.2.',
        claims:
          '- Multi-provider is not actually free for a solo project\n- Hidden cost is prompt engineering, not code\n- Merge template will be sensitive to model-family behavior\n- Better to tune prompts against one model first, then add others\n- Recommendation: ship with Claude only, add OpenAI/Gemini later',
      },
    ],
    followUp: 'Okay, which should I actually do for v1? Just give me your call.',
  },
  curated_additional_context: {
    title: 'Curated compatible branches: additional context',
    route: { classification: 'additional_context' },
    parent: [
      {
        role: 'user',
        content:
          'I want to build the first real Dandelion prototype. The core flow is root question, several plants, merge, then continue in the main thread.',
      },
      {
        role: 'assistant',
        content:
          'The right prototype should validate the merge loop before investing in a full Electron app.',
      },
    ],
    branches: [
      {
        id: 'data-model',
        transcript:
          'User: Explore the minimal data model for the prototype.\n\nAssistant: The prototype only needs sessions, thread records, and a merge record. A session stores the root question and model. Each plant stores its prompt, response, status, and parent session. A merge record stores the selected plant ids and the generated merge prompt. This can be in memory or a JSON file for the test; SQLite can wait until the real app. The key is preserving the transcript boundaries so the merge prompt can distinguish parent context from parallel threads.',
        claims:
          '- Prototype needs sessions, thread records, and merge records\n- Plants should preserve prompt, response, status, and parent session\n- JSON or memory is enough for the harness; SQLite can wait\n- Transcript boundaries are essential for merge prompting',
      },
      {
        id: 'ui-flow',
        transcript:
          'User: Explore the minimal UI flow for the prototype.\n\nAssistant: The smallest useful UI is a single page with a root question input, three plant prompt boxes, a Run button, and a Merge button. Show each plant in a column or drawer with status: queued, running, completed, failed. After merge, show either the continued answer or a conflict choice prompt. Do not build account settings, history, file uploads, or a canvas for this test.',
        claims:
          '- Minimal UI needs root input, plant prompts, Run, and Merge\n- Plants should show visible status\n- After merge, show continuation or conflict choice\n- Skip settings, history, uploads, and canvas in the prototype',
      },
      {
        id: 'eval',
        transcript:
          'User: Explore how to evaluate whether the prototype works.\n\nAssistant: Evaluate three scenarios: compatible branches, soft disagreement, and material conflict. Compatible branches should continue without recap. Soft disagreement should integrate differences without stopping the user. Material conflict should ask the user which stance to proceed with. Save the full prompt and output for each run so prompt changes can be compared over time.',
        claims:
          '- Evaluate compatible branches, soft disagreement, and material conflict\n- Compatible branches should continue without recap\n- Soft disagreement should integrate without interruption\n- Material conflict should ask the user to choose\n- Save prompts and outputs for comparison',
      },
    ],
    followUp: 'Okay, given all that, what should I build first tomorrow?',
  },
  curated_soft_disagreement: {
    title: 'Curated soft disagreement: emphasis, not conflict',
    route: { classification: 'soft_disagreement' },
    parent: [
      {
        role: 'user',
        content:
          'I am deciding how polished the first Dandelion prototype should be. It needs to test the merge workflow, but I also care about whether the interaction feels good.',
      },
      {
        role: 'assistant',
        content:
          'There is a tradeoff between speed and fidelity, but the prototype should stay focused on the merge workflow.',
      },
    ],
    branches: [
      {
        id: 'speed-first',
        transcript:
          'User: Argue for a rough prototype first.\n\nAssistant: Start rough. The highest-risk assumption is not visual polish; it is whether plant merge creates a useful continuation. Build the fastest possible harness: text boxes, run plants, merge, continue. If that fails, beautiful UI is wasted. Keep styling minimal and use the existing HTML prototype only as reference.',
        claims:
          '- Start with a rough prototype\n- The riskiest assumption is merge usefulness, not visual polish\n- Build text boxes, plant runs, merge, and continue\n- Use the existing HTML prototype only as reference',
      },
      {
        id: 'fidelity-matters',
        transcript:
          'User: Argue for enough UI fidelity to test the feeling.\n\nAssistant: Do not make it ugly. Dandelion is partly a workflow product, and the value depends on whether plants feel calm, live, and mergeable. You need enough UI fidelity to show plant status, selected-for-merge state, and the post-merge moment. But this does not require Electron or brand-perfect styling; a clean local web page is enough.',
        claims:
          '- Some UI fidelity matters because Dandelion is a workflow product\n- Prototype should show plant status, selection, and post-merge moment\n- Does not require Electron or brand-perfect styling\n- A clean local web page is enough',
      },
    ],
    followUp: 'So what level of prototype should I build first?',
  },
};

function parseArgs(argv) {
  const args = {
    scenario: 'product_risk',
    variant: 'saliency',
    list: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') args.list = true;
    else if (arg === '--scenario') args.scenario = argv[++i];
    else if (arg === '--variant') args.variant = argv[++i];
    else if (arg === '--model') process.env.OLLAMA_MODEL = argv[++i];
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
  --variant <name>    merge template: baseline | saliency | strict | router. Default: saliency
  --model <name>      Ollama model tag. Default: qwen2.5:3b
  --list              List scenarios

Environment:
  OLLAMA_BASE_URL     Default: http://localhost:11434/v1
  OLLAMA_MODEL        Default: qwen2.5:3b
`);
}

async function chat(messages, { temperature = 0.4 } = {}) {
  const response = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ollama' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? MODEL,
      messages,
      temperature,
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}\n${body}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

function transcript(messages) {
  return messages
    .map((message) => `${labelForRole(message.role)}: ${message.content}`)
    .join('\n\n');
}

function labelForRole(role) {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  return role;
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

  const response = await chat(messages);
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
    { temperature: 0.1 },
  );

  return { ...branch, claims: content };
}

function buildMergePrompt(scenario, branches, variant) {
  if (variant === 'baseline') {
    return [
      'The user has been exploring a question through several parallel investigations.',
      'All of the following threads happened; none of them is hypothetical or rejected.',
      'Treat all of them as part of your shared knowledge with the user from this point on.',
      '',
      '<parent_context>',
      transcript(scenario.parent),
      '</parent_context>',
      '',
      ...branches.flatMap((branch, index) => [
        `<parallel_thread id="${index + 1}" name="${branch.id}">`,
        branch.transcript,
        '</parallel_thread>',
        '',
      ]),
      'The user will now continue the conversation. Draw on any of the parallel threads as needed.',
      'Do not summarize or recap them unless asked.',
    ].join('\n');
  }

  if (variant === 'saliency') {
    return [
      'The user has been exploring a question through several parallel investigations.',
      'All of the following threads happened; none of them is hypothetical or rejected.',
      'Treat all of them as part of your shared knowledge with the user from this point on.',
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
      'Anchor your reasoning on the key claims of each thread. Use transcripts as evidence when needed.',
      'Do not equate "claim was made in a thread" with "claim is correct"; if threads disagree, integrate or take a position based on the evidence.',
      'The user will now continue the conversation. Draw on any of the threads as needed.',
      'Do not summarize or recap them unless asked.',
    ].join('\n');
  }

  if (variant === 'strict') {
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
      'Continue from this merged context with one coherent voice.',
      'If the threads disagree and the user asks for a call, make the call.',
      'Do not hedge by saying both options are valid.',
      'Do not produce a pros/cons list unless the user asks for one.',
      'Do not mention branches, threads, investigations, key claims, or transcripts.',
      'Do not recap the merged context.',
      'Start with the direct answer, then give the shortest useful reasoning.',
    ].join('\n');
  }

  if (variant === 'router') {
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
      '- material_conflict: the threads make incompatible claims or recommendations that affect what the user should do next.',
      '- soft_disagreement: the threads differ in emphasis, priority, or framing, but can be combined into one next action.',
      '',
      'If the classification is additional_context:',
      '- Continue naturally from the updated shared context.',
      '- Do not mention branches, threads, investigations, key claims, or transcripts.',
      '- Do not summarize the merged material unless the user asks.',
      '- Start by directly answering the user\'s question.',
      '- Prefer one concrete next action over a recap.',
      '',
      'If the classification is soft_disagreement:',
      '- Treat it like additional_context.',
      '- Integrate the difference into one practical recommendation.',
      '- Do not ask the user to choose.',
      '',
      'If the classification is material_conflict:',
      '- Do not pick a side for the user.',
      '- Do not make a recommendation, even if the user asks for your call.',
      '- Briefly summarize the conflicting stances in neutral language.',
      '- Ask the user which stance they want to proceed with.',
      '- Keep the choice set small and concrete.',
      '',
      'Only treat a disagreement as material_conflict if the options cannot both be followed.',
      'Do not treat differences in emphasis, priority, scope, or polish level as material_conflict when they can be combined.',
      'Example: "build it fast" vs "make it polished enough to test the feeling" is soft_disagreement; recommend a small but clean prototype.',
      'Example: "ship one provider" vs "ship three providers" is material_conflict; ask the user which path to proceed with.',
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
      'For additional_context or soft_disagreement, the answer shape is:',
      '1. Direct recommendation in the first sentence.',
      '2. Short rationale.',
      '3. Concrete next step.',
    ].join('\n');
  }

  throw new Error(`Unknown variant: ${variant}`);
}

function printSection(title, body) {
  console.log(`\n## ${title}\n`);
  console.log(body);
}

async function classifyMerge(scenario, branches) {
  if (scenario.route) return scenario.route;

  const response = await chat(
    [
      {
        role: 'system',
        content: [
          'Classify how these parallel threads should merge.',
          'Return only JSON with this shape:',
          '{"classification":"additional_context|soft_disagreement|material_conflict","choices":["..."]}',
          'Use material_conflict only when the options cannot both be followed and the user must choose.',
          'Use soft_disagreement when differences can be integrated into one next action.',
          'Use additional_context when the threads are compatible or cover unrelated aspects.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: branches
          .map((branch, index) => [
            `<parallel_thread id="${index + 1}" name="${branch.id}">`,
            '<key_claims>',
            branch.claims,
            '</key_claims>',
            '</parallel_thread>',
          ].join('\n'))
          .join('\n\n'),
      },
    ],
    { temperature: 0 },
  );

  try {
    return JSON.parse(response);
  } catch {
    return { classification: 'additional_context' };
  }
}

function renderConflictChoice(route) {
  const choices = route.choices?.length
    ? route.choices
    : ['Proceed with the first stance.', 'Proceed with the second stance.'];

  return [
    'These paths conflict in a way that changes what should happen next.',
    '',
    ...choices.map((choice, index) => `${index + 1}. ${choice}`),
    '',
    'Which one do you want to proceed with?',
  ].join('\n');
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

  console.log(`Running "${scenario.title}" with ${process.env.OLLAMA_MODEL ?? MODEL} (${args.variant})`);

  const branchResults = await Promise.all(
    scenario.branches.map((branch) => runBranch(scenario.parent, branch)),
  );

  const branches =
    args.variant === 'saliency' || args.variant === 'strict'
      ? await Promise.all(branchResults.map((branch) => extractClaims(branch)))
      : branchResults;

  for (const branch of branches) {
    printSection(`Branch: ${branch.id}`, branch.transcript);
    if (branch.claims) printSection(`Claims: ${branch.id}`, branch.claims);
  }

  const route = args.variant === 'router' ? await classifyMerge(scenario, branches) : null;
  if (route) printSection('Route', route.classification);

  if (route?.classification === 'material_conflict') {
    printSection('Follow-up', scenario.followUp);
    printSection('Merged Answer', renderConflictChoice(route));
    return;
  }

  const mergePrompt = buildMergePrompt(scenario, branches, args.variant);
  const systemContent =
    args.variant === 'router'
      ? [
          'You are continuing one coherent conversation.',
          'Answer the user directly as if the relevant context is already part of the conversation.',
          'Do not mention merged context, merged threads, branches, transcripts, key claims, classification, or routing.',
          'Do not begin with "Given the discussions", "Given the merged threads", or similar setup language.',
          'Start with the concrete recommendation or answer.',
        ].join('\n')
      : 'You are continuing one coherent conversation. Answer directly. Do not mention implementation details of the merge unless asked.';

  const mergedAnswer = await chat([
    {
      role: 'system',
      content: systemContent,
    },
    { role: 'user', content: `${mergePrompt}\n\n${scenario.followUp}` },
  ]);

  printSection('Follow-up', scenario.followUp);
  printSection('Merged Answer', mergedAnswer);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
