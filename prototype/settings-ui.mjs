// Settings modal — Anthropic API key + Ollama base URL.
//
// Reads/writes through settings.mjs (localStorage-backed). The runtime
// (providers.mjs) consults settings.mjs on every call, so saving here
// takes effect immediately without a reload.
//
// Factory pattern matches the other prototype modules: pass DOM refs and
// optional callbacks, get back a `{ open, close }` API.

import { getSettings, updateSettings } from './settings.mjs';

/**
 * @param {{
 *   openBtn: HTMLElement,
 *   modal: HTMLElement,
 *   overlay: HTMLElement,
 *   closeBtn: HTMLElement,
 *   cancelBtn: HTMLElement,
 *   saveBtn: HTMLElement,
 *   anthropicKeyInput: HTMLInputElement,
 *   openaiKeyInput: HTMLInputElement,
 *   ollamaUrlInput: HTMLInputElement,
 *   revealBtn: HTMLElement,
 *   openaiRevealBtn: HTMLElement,
 *   onSave?: (settings: object) => void,
 * }} refs
 */
export function createSettingsUI(refs) {
  const {
    openBtn,
    modal,
    overlay,
    closeBtn,
    cancelBtn,
    saveBtn,
    anthropicKeyInput,
    openaiKeyInput,
    ollamaUrlInput,
    revealBtn,
    openaiRevealBtn,
    onSave,
  } = refs;

  function loadIntoForm() {
    const s = getSettings();
    anthropicKeyInput.value = s.anthropicApiKey || '';
    openaiKeyInput.value = s.openaiApiKey || '';
    ollamaUrlInput.value = s.ollamaBaseUrl || '';
    anthropicKeyInput.type = 'password';
    openaiKeyInput.type = 'password';
  }

  function open() {
    loadIntoForm();
    modal.hidden = false;
    overlay.hidden = false;
    // Focus the key field next tick so the transition doesn't steal focus.
    setTimeout(() => anthropicKeyInput.focus(), 0);
  }

  function close() {
    modal.hidden = true;
    overlay.hidden = true;
    anthropicKeyInput.type = 'password';
    openaiKeyInput.type = 'password';
  }

  function save() {
    const next = updateSettings({
      anthropicApiKey: anthropicKeyInput.value.trim(),
      openaiApiKey: openaiKeyInput.value.trim(),
      ollamaBaseUrl: ollamaUrlInput.value.trim() || 'http://localhost:11434/v1',
    });
    close();
    if (typeof onSave === 'function') {
      try { onSave(next); } catch (err) { console.warn('settings onSave failed', err); }
    }
  }

  // Toggle helper for password-style fields with an adjacent reveal button.
  function bindReveal(btn, input) {
    btn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  }

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  saveBtn.addEventListener('click', save);

  bindReveal(revealBtn, anthropicKeyInput);
  bindReveal(openaiRevealBtn, openaiKeyInput);

  // Esc closes when open.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  // Submit-on-Enter from any of the input fields.
  for (const input of [anthropicKeyInput, openaiKeyInput, ollamaUrlInput]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    });
  }

  return { open, close };
}

/**
 * Auto-open the settings modal on first run if no provider is configured.
 * Call once after createSettingsUI() is wired up.
 */
export function openSettingsIfUnconfigured(api) {
  const s = getSettings();
  if (!s.anthropicApiKey && !s.ollamaBaseUrl) {
    api.open();
    return true;
  }
  return false;
}
