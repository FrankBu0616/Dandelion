// Minimal `.env` loader — no dependencies, no Node-version sensitivity.
//
// Why not the built-in `node --env-file=.env`?
//   - Errors when the file is missing (annoying for first-time clones).
//   - `--env-file-if-exists` only exists on Node 20.12+ and Node 22; we
//     advertise Node >=20 in engines, so we want to support 20.0–20.11 too.
//   - The loader is ~30 LOC and shipping it inline keeps `npm start` as
//     the single command path.
//
// Behavior:
//   - Reads `.env` from the current working directory (or `path` arg).
//   - Missing file is a no-op.
//   - One assignment per line: `KEY=value`. Trailing comments after `#`
//     and lines that start with `#` are ignored.
//   - Surrounding single or double quotes are stripped from values.
//   - `export KEY=value` (shell style) is tolerated.
//   - Existing `process.env` keys are NOT overwritten — env vars passed
//     on the command line always win over the file.
//
// Returns the map of keys it actually applied (caller can log).

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function parseEnv(text) {
  const out = {};
  if (typeof text !== 'string') return out;
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice('export '.length).trim();
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip a trailing inline comment if it's outside quotes. Cheap rule:
    // only strip when the value isn't quoted.
    const firstChar = value[0];
    if (firstChar === '"' || firstChar === "'") {
      const close = value.indexOf(firstChar, 1);
      value = close >= 0 ? value.slice(1, close) : value.slice(1);
    } else {
      const hashAt = value.indexOf(' #');
      if (hashAt >= 0) value = value.slice(0, hashAt).trim();
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    out[key] = value;
  }
  return out;
}

export function loadEnv({ path = '.env', cwd = process.cwd(), env = process.env } = {}) {
  const full = resolve(cwd, path);
  if (!existsSync(full)) return { loaded: false, applied: {} };
  const text = readFileSync(full, 'utf8');
  const parsed = parseEnv(text);
  const applied = {};
  for (const [k, v] of Object.entries(parsed)) {
    // Existing values from the command line / parent shell win — that's
    // the principle-of-least-surprise rule every popular .env loader
    // follows.
    if (env[k] !== undefined && env[k] !== '') continue;
    // An empty value in the file (e.g. `KEY=` straight out of .env.example)
    // means "no value provided" — same as leaving the line out entirely.
    // Assigning '' here would clobber `??` fallbacks downstream, since
    // empty strings are not nullish. Skip them.
    if (v === '') continue;
    env[k] = v;
    applied[k] = v;
  }
  return { loaded: true, path: full, applied };
}

// Run on import. ES module imports are hoisted, so any module that does
// `import './load-env.mjs'` (or imports a module that imports this) gets
// its env populated before the importer's top-level code executes. Tests
// don't import this module, so the test runner stays deterministic.
const _bootstrapResult = loadEnv();
if (_bootstrapResult.loaded) {
  const keys = Object.keys(_bootstrapResult.applied);
  if (keys.length > 0) {
    // Quiet log — visible enough to confirm the file was read, not so
    // loud that it clutters every server startup. Values intentionally
    // omitted (some are secrets).
    console.log(`load-env: applied ${keys.length} key${keys.length === 1 ? "" : "s"} from .env`);
  }
}
