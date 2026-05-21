// Provider abstraction for Dandelion model calls.
//
// One function — chat(messages, opts) — that talks to either a local Ollama
// instance or the Anthropic Claude API, depending on env vars.
//
// Selection:
//   DANDELION_PROVIDER=ollama     (default)
//   DANDELION_PROVIDER=anthropic  → needs ANTHROPIC_API_KEY
//
// Per-provider config:
//   OLLAMA_BASE_URL    default http://localhost:11434/v1
//   OLLAMA_MODEL       default qwen2.5:3b
//   ANTHROPIC_API_KEY  required when provider=anthropic
//   ANTHROPIC_MODEL    default claude-haiku-4-5
//
// The messages array uses OpenAI chat shape: [{ role: 'system'|'user'|'assistant', content }].
// For Anthropic, system messages are concatenated and lifted into the top-level
// `system` field; non-system messages are passed through.

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

export function activeProvider() {
  return (process.env.DANDELION_PROVIDER ?? 'ollama').toLowerCase();
}

export function activeModel() {
  if (activeProvider() === 'anthropic') {
    return process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  }
  return process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
}

/**
 * Send a chat request. Provider is opts.provider when given, otherwise
 * DANDELION_PROVIDER, otherwise ollama.
 * @param {{role: 'system'|'user'|'assistant', content: string}[]} messages
 * @param {{ temperature?: number, model?: string, maxTokens?: number, provider?: string }} [opts]
 * @returns {Promise<string>} assistant text
 */
export async function chat(messages, opts = {}) {
  const provider = (opts.provider ?? activeProvider()).toLowerCase();
  if (provider === 'anthropic') return chatAnthropic(messages, opts);
  if (provider === 'ollama') return chatOllama(messages, opts);
  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * List the models the server can offer.
 * - Anthropic: a curated list (only included if ANTHROPIC_API_KEY is set).
 * - Ollama: queried live from the local server. Empty list if unreachable.
 * Returns [{ id, label, provider, model, secondary, available }, ...].
 */
export async function listModels() {
  const items = [];
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const curated = [
      { model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { model: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
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
  const baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
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
  const baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
  const model = opts.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ollama' },
    body: JSON.stringify({
      model,
      messages,
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

async function chatAnthropic(messages, opts) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Export it or switch DANDELION_PROVIDER back to ollama.',
    );
  }
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const { system, conversation } = splitSystem(messages);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
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
    if (m.role === 'system') systemParts.push(m.content);
    else conversation.push({ role: m.role, content: m.content });
  }
  return {
    system: systemParts.join('\n\n').trim() || undefined,
    conversation,
  };
}
