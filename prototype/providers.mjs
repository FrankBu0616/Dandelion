// Provider abstraction — browser version.
//
// Reads credentials from localStorage (via settings.mjs) and talks directly
// to each provider's API from the browser. Keys never leave the user's
// machine.
//
// One function — chat(messages, opts) — that routes to:
//   - Anthropic Claude (uses anthropic-dangerous-direct-browser-access header)
//   - OpenAI Chat Completions (Bearer auth; o-series models handled specially)
//   - Local Ollama (OpenAI-compatible /v1 endpoint; user must run with
//     OLLAMA_ORIGINS set when called from a deployed origin)
//
// The messages array uses OpenAI chat shape: [{ role: 'system'|'user'|'assistant', content }].
// For Anthropic, system messages are concatenated and lifted into the top-level
// `system` field; non-system messages are passed through.
//
// File input (Anthropic only): see comment block in scripts/providers.mjs for
// the full content-block schema. Browser callers should use uploadFile() first
// to get a file_id, then reference it via { type:'document'|'image', source:{ type:'file', file_id } }.

import {
  getAnthropicKey,
  getOpenaiKey,
  getOpenaiBaseUrl,
  getOllamaBaseUrl,
  getDefaultProvider,
  getDefaultModel,
} from './settings.mjs';

const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_FILES_BETA = 'files-api-2025-04-14';
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b';

/** What provider would chat() pick if not given one explicitly? */
export function activeProvider() {
  const explicit = getDefaultProvider();
  if (explicit) return explicit.toLowerCase();
  // Auto: prefer anthropic, then openai, then ollama based on what's configured.
  if (getAnthropicKey()) return 'anthropic';
  if (getOpenaiKey()) return 'openai';
  return 'ollama';
}

export function activeModel() {
  const explicit = getDefaultModel();
  if (explicit) return explicit;
  const provider = activeProvider();
  if (provider === 'anthropic') return DEFAULT_ANTHROPIC_MODEL;
  if (provider === 'openai') return DEFAULT_OPENAI_MODEL;
  return DEFAULT_OLLAMA_MODEL;
}

/**
 * Send a chat request. Provider is opts.provider when given, otherwise
 * the active default.
 * @param {{role: 'system'|'user'|'assistant', content: string | Array}[]} messages
 * @param {{ temperature?: number, model?: string, maxTokens?: number, provider?: string }} [opts]
 * @returns {Promise<string>} assistant text
 */
export async function chat(messages, opts = {}) {
  const provider = (opts.provider ?? activeProvider()).toLowerCase();
  if (provider === 'anthropic') return chatAnthropic(messages, opts);
  if (provider === 'openai') return chatOpenAI(messages, opts);
  if (provider === 'ollama') return chatOllama(messages, opts);
  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * List the models the browser can offer.
 * - Anthropic: a curated list (only included if a key is set in settings).
 * - Ollama: queried live from the configured base URL. Empty list if unreachable.
 * Returns [{ id, label, provider, model, secondary, available }, ...].
 */
export async function listModels() {
  const items = [];
  const anthropicKey = getAnthropicKey();
  if (anthropicKey) {
    const curated = [
      { model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    ];
    for (const c of curated) {
      items.push({
        id: `anthropic:${c.model}`,
        label: c.label,
        provider: 'anthropic',
        model: c.model,
        secondary: 'Anthropic',
        available: true,
      });
    }
  }
  const openaiKey = getOpenaiKey();
  if (openaiKey) {
    const curated = [
      { model: 'gpt-4o', label: 'GPT-4o' },
      { model: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { model: 'o1', label: 'o1' },
      { model: 'o1-mini', label: 'o1 mini' },
    ];
    for (const c of curated) {
      items.push({
        id: `openai:${c.model}`,
        label: c.label,
        provider: 'openai',
        model: c.model,
        secondary: 'OpenAI',
        available: true,
      });
    }
  }
  const ollamaModels = await listOllamaModels();
  for (const tag of ollamaModels) {
    items.push({
      id: `ollama:${tag}`,
      label: tag,
      provider: 'ollama',
      model: tag,
      secondary: 'Ollama',
      available: true,
    });
  }
  return items;
}

async function listOllamaModels() {
  const baseUrl = getOllamaBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: 'Bearer ollama' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []).map((m) => m.id).filter(Boolean);
  } catch {
    return [];
  }
}

async function chatOllama(messages, opts) {
  const baseUrl = getOllamaBaseUrl();
  const model = opts.model ?? DEFAULT_OLLAMA_MODEL;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ollama' },
    body: JSON.stringify({
      model,
      // Ollama is text-only; flatten any Anthropic-style content blocks.
      messages: messages.map((m) => ({ role: m.role, content: flattenToText(m.content) })),
      temperature: opts.temperature ?? 0.35,
      stream: false,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Ollama request failed: ${response.status} ${response.statusText}\n${await response.text()}`,
    );
  }
  const json = await response.json();
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

async function chatOpenAI(messages, opts) {
  const apiKey = getOpenaiKey();
  if (!apiKey) {
    throw new Error(
      'No OpenAI API key set. Open Settings (gear icon) and paste your key, or switch providers.',
    );
  }
  const baseUrl = getOpenaiBaseUrl();
  const model = opts.model ?? DEFAULT_OPENAI_MODEL;
  // OpenAI's Chat Completions API uses OpenAI message shape: { role, content }
  // where content is a string or an array of typed parts. We don't currently
  // translate Anthropic Files file_id blocks to OpenAI vision blocks — drop to
  // text for now (mirrors the chatOllama path). Add proper vision support if a
  // user asks.
  const flat = messages.map((m) => ({ role: m.role, content: flattenToText(m.content) }));
  // o1 / o-series models reject `temperature`, `max_tokens`, and `system` role
  // messages. Detect by prefix and adjust.
  const isReasoning = /^o\d/i.test(model);
  const body = { model, messages: flat };
  if (isReasoning) {
    // Move any system message into the first user message as a prefix.
    const sysParts = flat.filter((m) => m.role === 'system').map((m) => m.content);
    const rest = flat.filter((m) => m.role !== 'system');
    if (sysParts.length && rest.length) {
      rest[0] = { ...rest[0], content: `${sysParts.join('\n\n')}\n\n${rest[0].content}` };
    }
    body.messages = rest;
    // o-series uses max_completion_tokens, not max_tokens. Default is generous.
    body.max_completion_tokens = opts.maxTokens ?? 16000;
  } else {
    body.temperature = opts.temperature ?? 0.35;
    body.max_tokens = opts.maxTokens ?? 16000;
  }
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `OpenAI request failed: ${response.status} ${response.statusText}\n${await response.text()}`,
    );
  }
  const json = await response.json();
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

async function chatAnthropic(messages, opts) {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    throw new Error(
      'No Anthropic API key set. Open Settings (gear icon) and paste your key, or switch to Ollama.',
    );
  }
  const model = opts.model ?? DEFAULT_ANTHROPIC_MODEL;
  const { system, conversation } = splitSystem(messages);

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    // Required when calling api.anthropic.com directly from a browser.
    // The key still only lives in the user's localStorage; this header just
    // tells Anthropic we accept the risk of direct browser access.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  // Files API references (source.type === 'file') require a beta header.
  if (messagesReferenceFileId(conversation)) {
    headers['anthropic-beta'] = ANTHROPIC_FILES_BETA;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 16000,
      temperature: opts.temperature ?? 0.35,
      ...(system ? { system } : {}),
      messages: conversation,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Anthropic request failed: ${response.status} ${response.statusText}\n${await response.text()}`,
    );
  }
  const json = await response.json();
  const text = (json.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  return text;
}

// Anthropic takes a top-level `system` string instead of system messages
// inside the messages array. Concatenate any system entries, in order.
export function splitSystem(messages) {
  const systemParts = [];
  const conversation = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(flattenToText(m.content));
    } else {
      conversation.push({ role: m.role, content: m.content });
    }
  }
  return {
    system: systemParts.join('\n\n').trim() || undefined,
    conversation,
  };
}

/**
 * Upload a file to the Anthropic Files API directly from the browser.
 * @param {File | Blob} file  Browser File (with .name) or Blob.
 * @returns {Promise<{id: string, filename: string, mime_type: string, size_bytes: number}>}
 */
export async function uploadFile(file) {
  const apiKey = getAnthropicKey();
  if (!apiKey) throw new Error('No Anthropic API key set.');

  const filename = file.name || 'upload.bin';
  const form = new FormData();
  form.append('file', file, filename);

  const response = await fetch('https://api.anthropic.com/v1/files', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': ANTHROPIC_FILES_BETA,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: form,
  });
  if (!response.ok) {
    throw new Error(
      `Anthropic file upload failed: ${response.status} ${response.statusText}\n${await response.text()}`,
    );
  }
  return response.json();
}

function messagesReferenceFileId(messages) {
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (block && block.source && block.source.type === 'file') return true;
    }
  }
  return false;
}

function flattenToText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}
