#!/usr/bin/env node
// Local HTTP server for the Dandelion prototype.
//
// Serves prototype.html and friends, plus three small JSON endpoints:
//
//   GET  /api/scenarios   list curated scenarios for the router-only demo
//   POST /api/run         run a curated scenario end-to-end (deprecated UI path)
//   POST /api/chat        proxy a single message to the local Ollama model
//   POST /api/classify-route  classify a set of grafted plants into a merge route
//                             using the model-based classifier
//   POST /api/continue    called by the prototype after an additional_context
//                         graft — builds a continuation prompt from the grafted
//                         plants and main conversation
//
// All scenarios live in scripts/harness/scenarios.mjs (single source of truth
// for both this server and the CLI merge harness). Prompt builders live in
// scripts/server/prompts.mjs.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { SCENARIOS } from './harness/scenarios.mjs';
import {
  buildScenarioContinuationPrompt,
  buildDynamicContinuationPrompt,
  renderConflict,
} from './server/prompts.mjs';
import { chat, activeModel, activeProvider, listModels } from './providers.mjs';
import { classifyRouteWithModel } from './classify-route.mjs';

const PORT = Number(process.env.PORT ?? 4321);
const ROOT = process.cwd();
const MODEL = activeModel();
const PROVIDER = activeProvider();

// Curated scenarios for the router-only UI. Filtered subset of the harness
// scenarios that have pre-baked transcripts and a declared route.
const CURATED_IDS = ['curated_additional_context', 'curated_speed_vs_fidelity', 'curated_provider_scope'];
const curatedScenarios = Object.fromEntries(
  CURATED_IDS.map((id) => [id, SCENARIOS[id]]).filter(([, s]) => s),
);

// ────────────────────────────── helpers ──────────────────────────────

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

// ────────────────────────────── route handlers ──────────────────────────────

function pickModel(payload) {
  return {
    provider: payload?.provider,
    model: payload?.model,
  };
}

function reportedModel(payload) {
  return payload?.model || activeModel();
}

function reportedProvider(payload) {
  return payload?.provider || activeProvider();
}

async function runChat(payload) {
  const messages = [
    {
      role: 'system',
      content:
        payload.system ||
        'You are Dandelion, a concise assistant inside a local prototype. Answer directly and naturally.',
    },
    ...(payload.context ? [{ role: 'user', content: `Shared context:\n${payload.context}` }] : []),
    { role: 'user', content: payload.prompt || '' },
  ];
  const answer = await chat(messages, pickModel(payload));
  return jsonResponse({ answer, model: reportedModel(payload), provider: reportedProvider(payload) });
}

async function runScenario(id) {
  const scenario = curatedScenarios[id];
  if (!scenario) return jsonResponse({ error: `Unknown scenario: ${id}` }, 404);

  const route = scenario.route;
  if (route.kind === 'material_conflict') {
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
    { role: 'user', content: buildScenarioContinuationPrompt(scenario) },
  ]);

  return jsonResponse({
    scenario: publicScenario(scenario),
    route,
    result: { kind: 'continuation', text: answer },
    model: MODEL,
  });
}

async function runClassifyRoute(payload) {
  const plants = Array.isArray(payload?.plants) ? payload.plants : [];
  const route = await classifyRouteWithModel(plants, pickModel(payload));
  return jsonResponse({
    route,
    model: reportedModel(payload),
    provider: reportedProvider(payload),
  });
}

async function runContinue(payload) {
  const prompt = buildDynamicContinuationPrompt(payload);
  const answer = await chat([
    {
      role: 'system',
      content: [
        'You are continuing one coherent conversation.',
        'Answer directly as if the relevant context is already part of the conversation.',
        'Do not mention merged context, plants, branches, transcripts, key claims, classification, or routing.',
        'Do not begin with setup language like "Given the discussions".',
      ].join('\n'),
    },
    { role: 'user', content: prompt },
  ], pickModel(payload));
  return jsonResponse({ answer, model: reportedModel(payload), provider: reportedProvider(payload) });
}

// ────────────────────────────── HTTP server ──────────────────────────────

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);

    if (request.method === 'GET' && url.pathname === '/api/models') {
      const models = await listModels();
      const result = jsonResponse({
        default: { provider: activeProvider(), model: activeModel() },
        models,
      });
      response.writeHead(result.status, result.headers);
      response.end(result.body);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/scenarios') {
      const items = Object.entries(curatedScenarios).map(([id, scenario]) => ({
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

    if (request.method === 'POST' && url.pathname === '/api/classify-route') {
      const payload = await readJson(request);
      const result = await runClassifyRoute(payload);
      response.writeHead(result.status, result.headers);
      response.end(result.body);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/continue') {
      const payload = await readJson(request);
      const result = await runContinue(payload);
      response.writeHead(result.status, result.headers);
      response.end(result.body);
      return;
    }

    // Static file fallback. Friendly aliases:
    //   /                  → prototype.html
    //   /router-demo       → prototype/router-demo/index.html
    //   /prototype-router.html (legacy)
    let pathname = url.pathname;
    if (pathname === '/') pathname = '/prototype.html';
    else if (pathname === '/router-demo' || pathname === '/router-demo/') {
      pathname = '/prototype/router-demo/index.html';
    } else if (pathname === '/prototype-router.html') {
      pathname = '/prototype/router-demo/index.html';
    }
    const filePath = join(ROOT, pathname.slice(1));
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentType(pathname),
      // Dev server: never let the browser cache static assets, so CSS / JS
      // edits show up on a plain reload without a hard refresh dance.
      'Cache-Control': 'no-store, must-revalidate',
    });
    response.end(body);
  } catch (error) {
    const result = jsonResponse({ error: error.message }, 500);
    response.writeHead(result.status, result.headers);
    response.end(result.body);
  }
});

server.listen(PORT, () => {
  console.log(`Dandelion router prototype: http://localhost:${PORT}`);
  console.log(`Router-only prototype:     http://localhost:${PORT}/router-demo`);
  console.log(`Provider: ${PROVIDER}    Model: ${MODEL}`);
});
