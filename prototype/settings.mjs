// User settings — persisted to localStorage.
//
// Single source of truth for the API key + Ollama URL + default provider/model.
// Both the runtime (providers.mjs, api.mjs) and the settings UI read/write
// through here.
//
// Keys live under one `dandelion.settings` JSON object so we can extend it
// without polluting the localStorage namespace.

const STORAGE_KEY = 'dandelion.settings';

const DEFAULTS = Object.freeze({
  anthropicApiKey: '',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  ollamaBaseUrl: 'http://localhost:11434/v1',
  defaultProvider: '', // empty = auto (first available)
  defaultModel: '',
});

let cache = null;

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function write(next) {
  cache = { ...DEFAULTS, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Dandelion settings: write failed', err);
  }
}

/** Return the full current settings object (with defaults filled in). */
export function getSettings() {
  return { ...read() };
}

/** Merge a partial update into settings and persist. */
export function updateSettings(patch) {
  write({ ...read(), ...patch });
  return { ...cache };
}

/** Convenience accessors used by the runtime. */
export function getAnthropicKey() {
  return read().anthropicApiKey || '';
}

export function getOpenaiKey() {
  return read().openaiApiKey || '';
}

export function getOpenaiBaseUrl() {
  // OpenAI-compatible base URL — defaults to OpenAI proper but can be pointed
  // at compatible gateways (Azure OpenAI, LiteLLM, OpenRouter, etc.).
  return (read().openaiBaseUrl || DEFAULTS.openaiBaseUrl).replace(/\/+$/, '');
}

/**
 * Normalize an Ollama URL so callers don't need to remember the `/v1` suffix.
 * Accepts any of:
 *   http://localhost:11434
 *   http://localhost:11434/
 *   http://localhost:11434/v1
 *   http://localhost:11434/v1/
 * and returns the canonical `http://localhost:11434/v1`.
 */
function normalizeOllamaUrl(raw) {
  let url = (raw || DEFAULTS.ollamaBaseUrl).trim();
  // Strip trailing slashes.
  url = url.replace(/\/+$/, '');
  // If it doesn't already end in /v1 (or any /vN), append /v1.
  if (!/\/v\d+$/.test(url)) url = `${url}/v1`;
  return url;
}

export function getOllamaBaseUrl() {
  return normalizeOllamaUrl(read().ollamaBaseUrl);
}

export function getDefaultProvider() {
  return read().defaultProvider || '';
}

export function getDefaultModel() {
  return read().defaultModel || '';
}

/** True if at least one provider is configured. */
export function hasAnyProviderConfigured() {
  return (
    Boolean(getAnthropicKey()) ||
    Boolean(getOpenaiKey()) ||
    Boolean(getOllamaBaseUrl())
  );
}
