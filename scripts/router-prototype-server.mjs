#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const PORT = Number(process.env.PORT ?? 4321);
const ROOT = process.cwd();
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b';

const scenarios = {
  curated_additional_context: {
    title: 'Additional context',
    description: 'Compatible side threads add data model, UI, and evaluation details.',
    route: { classification: 'additional_context' },
    parent: [
      {
        role: 'user',
        content:
          'I want to build the first real Dandelion prototype. The core flow is root question, several side threads, merge, then continue in the main thread.',
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
        title: 'Data model',
        transcript:
          'User: Explore the minimal data model for the prototype.\n\nAssistant: The prototype only needs sessions, thread records, and a merge record. A session stores the root question and model. Each side thread stores its prompt, response, status, and parent session. A merge record stores the selected side thread ids and the generated merge prompt. This can be in memory or a JSON file for the test; SQLite can wait until the real app. The key is preserving the transcript boundaries so the merge prompt can distinguish parent context from parallel threads.',
        claims:
          '- Prototype needs sessions, thread records, and merge records\n- Side threads should preserve prompt, response, status, and parent session\n- JSON or memory is enough for the harness; SQLite can wait\n- Transcript boundaries are essential for merge prompting',
      },
      {
        id: 'ui-flow',
        title: 'UI flow',
        transcript:
          'User: Explore the minimal UI flow for the prototype.\n\nAssistant: The smallest useful UI is a single page with a root question input, three side-thread prompt boxes, a Run button, and a Merge button. Show each side thread in a column or drawer with status: queued, running, completed, failed. After merge, show either the continued answer or a conflict choice prompt. Do not build account settings, history, file uploads, or a canvas for this test.',
        claims:
          '- Minimal UI needs root input, side-thread prompts, Run, and Merge\n- Side threads should show visible status\n- After merge, show continuation or conflict choice\n- Skip settings, history, uploads, and canvas in the prototype',
      },
      {
        id: 'eval',
        title: 'Evaluation',
        transcript:
          'User: Explore how to evaluate whether the prototype works.\n\nAssistant: Evaluate three scenarios: compatible branches, soft disagreement, and material conflict. Compatible branches should continue without recap. Soft disagreement should integrate differences without stopping the user. Material conflict should ask the user which stance to proceed with. Save the full prompt and output for each run so prompt changes can be compared over time.',
        claims:
          '- Evaluate compatible branches, soft disagreement, and material conflict\n- Compatible branches should continue without recap\n- Soft disagreement should integrate without interruption\n- Material conflict should ask the user to choose\n- Save prompts and outputs for comparison',
      },
    ],
    followUp: 'Okay, given all that, what should I build first tomorrow?',
  },
  curated_soft_disagreement: {
    title: 'Soft disagreement',
    description: 'Side threads differ in emphasis but can be integrated.',
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
        title: 'Speed first',
        transcript:
          'User: Argue for a rough prototype first.\n\nAssistant: Start rough. The highest-risk assumption is not visual polish; it is whether side-thread merge creates a useful continuation. Build the fastest possible harness: text boxes, run side threads, merge, continue. If that fails, beautiful UI is wasted. Keep styling minimal and use the existing HTML prototype only as reference.',
        claims:
          '- Start with a rough prototype\n- The riskiest assumption is merge usefulness, not visual polish\n- Build text boxes, side-thread runs, merge, and continue\n- Use the existing HTML prototype only as reference',
      },
      {
        id: 'fidelity-matters',
        title: 'Fidelity matters',
        transcript:
          'User: Argue for enough UI fidelity to test the feeling.\n\nAssistant: Do not make it ugly. Dandelion is partly a workflow product, and the value depends on whether side threads feel calm, live, and mergeable. You need enough UI fidelity to show side-thread status, selected-for-merge state, and the post-merge moment. But this does not require Electron or brand-perfect styling; a clean local web page is enough.',
        claims:
          '- Some UI fidelity matters because Dandelion is a workflow product\n- Prototype should show side-thread status, selection, and post-merge moment\n- Does not require Electron or brand-perfect styling\n- A clean local web page is enough',
      },
    ],
    followUp: 'So what level of prototype should I build first?',
  },
  curated_provider_scope: {
    title: 'Material conflict',
    description: 'Side threads recommend incompatible v1 provider strategies.',
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
        title: 'Multi-provider',
        transcript:
          'User: Argue for supporting all three providers from day one.\n\nAssistant: If the product is BYO-key and open-source, multi-provider on day one is close to free and protects against a real risk. The OpenAI SDK and Anthropic SDK have nearly identical chat-completion shapes; the Gemini SDK differs but is wrappable. A thin provider-adapter layer is maybe 200 lines of TypeScript per provider. The user-facing benefit is significant: people have strong existing preferences, and a tool that only supports the provider they do not have a key for is a tool they close. The downside is testing surface: you have to verify your prompt and merge logic against three model families with three different quirks. But you have to do this eventually anyway. Doing it day-one is cheaper than retrofitting after you have baked OpenAI-specific assumptions in. Verdict: ship multi-provider from day one.',
        claims:
          '- Multi-provider from day one is close to free for a BYO-key tool\n- SDK shapes are similar; provider-adapter layer is small\n- Strong user benefit: people have provider preferences and will not switch for one app\n- Testing burden exists but is unavoidable\n- Recommendation: ship OpenAI + Anthropic + Gemini together',
      },
      {
        id: 'single-provider',
        title: 'Single provider',
        transcript:
          'User: Argue for picking one provider and adding others later.\n\nAssistant: For a single-developer side project, multi-provider from day one sounds free but is not. Each provider has subtle behavior differences: tokenization, system-prompt handling, max context, rate-limit error shapes, retry semantics, JSON-mode quirks, vision-API formats, tool-calling interfaces. Your code path can paper over all of these but your prompt engineering cannot: a prompt that works perfectly on Claude often degrades on Gemini and vice versa, and your merge template is going to be especially sensitive to this. Shipping with one model lets you tune the prompts against that model behavior and ship something that works well. Adding providers later, after the prompts are locked, is the right order. Verdict: pick one, probably Claude given the merge framing test complexity, and add others in v0.2.',
        claims:
          '- Multi-provider is not actually free for a solo project\n- Hidden cost is prompt engineering, not code\n- Merge template will be sensitive to model-family behavior\n- Better to tune prompts against one model first, then add others\n- Recommendation: ship with Claude only, add OpenAI/Gemini later',
      },
    ],
    followUp: 'Okay, which should I actually do for v1? Just give me your call.',
  },
};

function publicScenario(scenario) {
  return {
    title: scenario.title,
    description: scenario.description,
    parent: scenario.parent,
    branches: scenario.branches.map(({ id, title, transcript, claims }) => ({
      id,
      title,
      transcript,
      claims,
    })),
    followUp: scenario.followUp,
  };
}

async function chat(messages) {
  const response = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ollama' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.35,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

async function runChat(payload) {
  const messages = [
    {
      role: 'system',
      content:
        payload.system ||
        'You are Dandelion, a concise assistant inside a local prototype. Answer directly and naturally.',
    },
    ...(payload.context
      ? [{ role: 'user', content: `Shared context:\n${payload.context}` }]
      : []),
    { role: 'user', content: payload.prompt || '' },
  ];

  const answer = await chat(messages);
  return jsonResponse({ answer, model: MODEL });
}

function transcript(messages) {
  return messages
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n\n');
}

function buildContinuationPrompt(scenario) {
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

function buildDynamicContinuationPrompt({ parentContext, mainConversation, wovenStrands, route, followUp }) {
  const parentTurns = (mainConversation ?? [])
    .filter((item) => item.kind === 'user' || item.kind === 'assistant')
    .map((item) => ({
      role: item.kind === 'user' ? 'user' : 'assistant',
      content: item.text,
    }));

  return [
    'The user has been exploring a question through parallel side threads.',
    'All selected side threads happened; none of them is hypothetical or rejected.',
    'Treat them as shared context for one continuous conversation.',
    route?.classification === 'soft_disagreement'
      ? 'The selected threads differ in emphasis but can be integrated into one practical next action.'
      : 'The selected threads add compatible information. Continue naturally without recapping them.',
    '',
    '<parent_context>',
    parentContext || transcript(parentTurns),
    '</parent_context>',
    '',
    ...wovenStrands.flatMap((strand, index) => [
      `<parallel_thread id="${index + 1}" name="${strand.title || `strand-${index + 1}`}">`,
      strand.turns.map((turn) => [
        turn.user ? `User: ${turn.user}` : '',
        turn.asst ? `Assistant: ${turn.asst}` : '',
      ].filter(Boolean).join('\n\n')).join('\n\n'),
      '</parallel_thread>',
      '',
    ]),
    'Output rules:',
    '- Answer the user directly.',
    '- Do not mention branches, strands, threads, investigations, transcripts, key claims, routing, or merged context.',
    '- Do not summarize the side threads unless the user asks.',
    '- Start with the concrete recommendation or answer.',
    '',
    followUp,
  ].join('\n');
}

function renderConflict(route) {
  return {
    kind: 'conflict',
    text: 'These paths conflict in a way that changes what should happen next.',
    choices: route.choices,
  };
}

async function runScenario(id) {
  const scenario = scenarios[id];
  if (!scenario) {
    return jsonResponse({ error: `Unknown scenario: ${id}` }, 404);
  }

  const route = scenario.route;
  if (route.classification === 'material_conflict') {
    return jsonResponse({
      scenario: publicScenario(scenario),
      route,
      result: renderConflict(route),
      model: MODEL,
    });
  }

  const answer = await chat([
    {
      role: 'system',
      content: [
        'You are continuing one coherent conversation.',
        'Answer directly as if the relevant context is already part of the conversation.',
        'Do not mention merged context, merged threads, branches, transcripts, key claims, classification, or routing.',
        'Do not begin with "Given the discussions", "Given the merged threads", or similar setup language.',
      ].join('\n'),
    },
    { role: 'user', content: buildContinuationPrompt(scenario) },
  ]);

  return jsonResponse({
    scenario: publicScenario(scenario),
    route,
    result: { kind: 'continuation', text: answer },
    model: MODEL,
  });
}

function jsonResponse(body, status = 200) {
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function contentType(pathname) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  return types[extname(pathname)] ?? 'text/plain; charset=utf-8';
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);

    if (request.method === 'GET' && url.pathname === '/api/scenarios') {
      const items = Object.entries(scenarios).map(([id, scenario]) => ({
        id,
        title: scenario.title,
        description: scenario.description,
      }));
      const result = jsonResponse({ model: MODEL, scenarios: items });
      response.writeHead(result.status, result.headers);
      response.end(result.body);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/run') {
      const { scenarioId } = await readJson(request);
      const result = await runScenario(scenarioId);
      response.writeHead(result.status, result.headers);
      response.end(result.body);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/chat') {
      const payload = await readJson(request);
      const result = await runChat(payload);
      response.writeHead(result.status, result.headers);
      response.end(result.body);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/continue') {
      const payload = await readJson(request);
      const prompt = buildDynamicContinuationPrompt(payload);
      const answer = await chat([
        {
          role: 'system',
          content: [
            'You are continuing one coherent conversation.',
            'Answer directly as if the relevant context is already part of the conversation.',
            'Do not mention merged context, side threads, branches, transcripts, key claims, classification, or routing.',
            'Do not begin with setup language like "Given the discussions".',
          ].join('\n'),
        },
        { role: 'user', content: prompt },
      ]);
      const result = jsonResponse({ answer, model: MODEL });
      response.writeHead(result.status, result.headers);
      response.end(result.body);
      return;
    }

    const pathname = url.pathname === '/' ? '/prototype.html' : url.pathname;
    const filePath = join(ROOT, pathname.slice(1));
    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentType(pathname) });
    response.end(body);
  } catch (error) {
    const result = jsonResponse({ error: error.message }, 500);
    response.writeHead(result.status, result.headers);
    response.end(result.body);
  }
});

server.listen(PORT, () => {
  console.log(`Dandelion router prototype: http://localhost:${PORT}`);
  console.log(`Router-only prototype: http://localhost:${PORT}/prototype-router.html`);
  console.log(`Ollama model: ${MODEL}`);
});
