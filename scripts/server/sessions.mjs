// Server-side session storage — one JSON file per session.
//
// Stored at ./sessions/<sessionId>.json. The directory is created on demand
// and gitignored (see .gitignore). For a single-user local prototype this
// is the right granularity: cheap to inspect/edit by hand, no DB to manage,
// and the wire format is identical to the localStorage snapshot.
//
// Schema validation is intentionally light — we accept any object with a
// `meta.id` and a `schemaVersion`. The client owns the rich validation in
// applySnapshot(); this layer just keeps the bytes safe and the index sane.
//
// Public API:
//   listSessions()        → [{id, title, updatedAt, createdAt}, ...] newest first
//   readSession(id)       → snapshot | null
//   writeSession(id, snap) → void (atomic via write-tmp-then-rename)
//   deleteSession(id)     → boolean (true if it existed)

import { mkdir, readdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const SESSIONS_DIR = process.env.DANDELION_SESSIONS_DIR
  ?? join(process.cwd(), 'sessions');

async function ensureDir() {
  await mkdir(SESSIONS_DIR, { recursive: true });
}

function pathFor(id) {
  // Defensive: session ids are generated client-side via crypto.randomUUID,
  // but reject anything that could escape the sessions/ dir.
  if (typeof id !== 'string' || !/^[\w.-]{1,128}$/.test(id)) {
    throw new Error(`Invalid session id: ${id}`);
  }
  return join(SESSIONS_DIR, `${id}.json`);
}

export async function listSessions() {
  await ensureDir();
  let names;
  try {
    names = await readdir(SESSIONS_DIR);
  } catch {
    return [];
  }
  const entries = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const id = name.slice(0, -'.json'.length);
    try {
      const raw = await readFile(join(SESSIONS_DIR, name), 'utf8');
      const snap = JSON.parse(raw);
      const meta = snap?.meta;
      if (meta?.id && meta.id === id) {
        entries.push({
          id,
          title: meta.title || 'Untitled session',
          createdAt: meta.createdAt || 0,
          updatedAt: meta.updatedAt || meta.createdAt || 0,
        });
      }
    } catch {
      // Skip malformed files — don't let one bad file hide the rest.
    }
  }
  entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return entries;
}

export async function readSession(id) {
  try {
    const raw = await readFile(pathFor(id), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeSession(id, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('writeSession: snapshot must be an object');
  }
  if (snapshot.meta?.id !== id) {
    throw new Error(`writeSession: meta.id (${snapshot.meta?.id}) must match path id (${id})`);
  }
  await ensureDir();
  const target = pathFor(id);
  // Write to a tmp file in the same directory then rename — same-volume
  // rename is atomic on POSIX, so partial writes can't corrupt a session.
  const tmp = `${target}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, JSON.stringify(snapshot), 'utf8');
  await rename(tmp, target);
}

export async function deleteSession(id) {
  try {
    await unlink(pathFor(id));
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

/** Useful in tests / inspection. Returns the resolved sessions directory. */
export function sessionsDir() {
  return SESSIONS_DIR;
}
