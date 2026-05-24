// Public static asset gate for the local prototype server.
//
// The repo root also contains private local state such as `.env` and
// `sessions/`, so static serving must stay narrower than "anything under cwd".

import { relative, resolve, sep } from 'node:path';

const PUBLIC_ROOT_FILES = new Set(['index.html']);
const PUBLIC_FILES = new Set(['scripts/merge-router.mjs']);
const PUBLIC_DIRS = ['brand', 'prototype'];

function decodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

export function publicStaticPath(root, pathname) {
  const decoded = decodePathname(pathname);
  if (!decoded || decoded.includes('\0')) return null;

  const fullPath = resolve(root, `.${decoded}`);
  const relPath = relative(root, fullPath);
  if (!relPath || relPath.startsWith('..') || relPath.includes(`..${sep}`)) {
    return null;
  }

  if (PUBLIC_ROOT_FILES.has(relPath) || PUBLIC_FILES.has(relPath)) return fullPath;
  if (PUBLIC_DIRS.some((dir) => relPath === dir || relPath.startsWith(`${dir}${sep}`))) {
    return fullPath;
  }
  return null;
}
