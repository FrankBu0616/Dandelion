# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog][kc], and this project
adheres to [Semantic Versioning][semver] for the snapshot schema (see
`SCHEMA_VERSION` in `prototype/persistence.mjs`).

[kc]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/

## [0.1.2] - 2026-05-22

Release-polish pass after the first public tag.

### Fixed

- Seed-panel layering now covers old floating graft visuals when the
  tray is open.
- Empty keys in `.env` are treated as unset, so copying
  `.env.example` no longer hides provider setup warnings or model
  discovery.
- Node 20 CI now uses default `node --test` discovery instead of a
  shell glob that was not portable across runners.

### Changed

- Seed history replay and retired legacy context fallback paths are now
  explicit in the prototype.
- README hero now includes the demo GIF and muted-context captions can
  expand for longer routing records.

### Tests

- 54 → 61 tests, including `.env` empty-key behavior and seed-history
  replay coverage.

## [0.1.0] - 2026-05-22

First open-source release. Pre-alpha; the design is locked enough to
test the core context-modulation loop but features will change.

### Added

#### Files
- File uploads via the Anthropic Files API (`POST /api/files`). Upload
  once, reference by `file_id` on every subsequent send.
- Session-scoped attachments — uploaded files persist for the life of
  the session and ride every send across the main thread and seeds.
- Attachment chips in the composer with per-file remove (×).
- Attach button is hidden when the active provider is local (Ollama
  cannot accept file content blocks).
- PDF, image (PNG/JPEG/GIF/WebP), and plain text uploads supported.

#### Context inspector
- Right-edge drawer tab that's always visible. Click to expand a panel
  showing every admitted segment of context: system, root, attachments,
  trunk turns, grafted seeds, conflict choices.
- Live segment count in the tab; subtle pulse when new context lands.
- Per-segment **mute** via an eye / eye-off toggle. Muted segments stay
  visible in the thread but are withheld from the model on the next
  send. Reversible.
- Per-user-turn caption stamps the muted segments at send time
  ("↓ asked with 2 muted: parent context, report.pdf"), so the thread
  record stays honest about routing decisions.

#### Sessions persistence
- Auto-save the active session to `localStorage` (debounced).
- Mirror every save to `./sessions/<id>.json` via four new REST routes
  (`GET /api/sessions`, `GET|POST|DELETE /api/sessions/:id`).
- Atomic on-disk writes (tmp + rename) and a path-traversal guard.
- Left-edge **Sessions** sidebar: lists every saved session newest
  first, click to switch, inline rename, delete with confirm.
- Restore on page load — including the shadow DAG — with an in-flight
  streaming sweep so reloaded sessions never show orphaned cursors.
- `schemaVersion: 1` stamped on every snapshot.

#### Markdown + math rendering
- Assistant bubbles render Markdown (marked) with KaTeX for LaTeX math
  (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`). Output sanitized via
  DOMPurify.

#### Other UI
- Manual collapse on any completed trunk turn (paired with the existing
  auto-collapse for older turns).
- Plant button (composer) and seed-tray `+` button are disabled while
  the main thread's reply is streaming.
- Graft dandelion is now a body-level overlay that tracks its marker
  through scroll, resize, and the seed-tray slide animation — no more
  clipping in the right gutter.

### Changed

#### Architecture
- Extracted the inline `<script>` in `prototype.html` (706 LOC) into
  `prototype/bootstrap.mjs`. HTML is now a thin shell.
- New module `prototype/mute-filters.mjs` — single source of truth for
  "what does the model see on the next send?" Routed through by the
  three filter call sites (attachments, parent context, main conv).
- New module `prototype/graft-overlay.mjs` — gutter positioning,
  scroll/resize tracking, plant-column transition pump, anti-flash
  hidden-until-positioned. Trimmed ~75 LOC off `main-thread.mjs`.
- New module `prototype/types.mjs` — JSDoc typedefs for the shared
  `AppState` shape.
- Main-thread and plant sends now replay admitted parent turns as
  structured chat history. The legacy parent-context string fallback is
  background guidance in the system prompt, not a leading user turn.

#### Defaults
- `max_tokens` default bumped 1024 → 16000 (the previous default was
  truncating multi-paragraph replies mid-thought).

#### UI
- Per-turn **Plant** and **Collapse** actions now live with the
  assistant turn controls instead of competing with the message body.
- Replaced the top-bar **Context** pill with a right-edge drawer tab so
  the inspector reads as a permanent surface, not a discoverable
  action.

### Fixed

- Static asset serving is now gated to the public prototype shell plus
  `prototype/` and `brand/`, so repo-root secrets like `.env` and
  server-side `sessions/` snapshots are not fetchable as web assets.
- Graft dandelion no longer flickers to the top-left during streaming
  re-renders.
- Main thread's `/api/chat` history replay path now honors mute flags
  on every segment type (was previously serializing muted seeds inside
  graft markers).
- Removed the `overflow-x: hidden` clip on `#main-inner` that was
  cutting off the graft dandelion in the right gutter. Wide KaTeX math
  scrolls inside its own container instead.

### Tests

- 13 → 61 (`mute-filters`, `persistence`, `sessions-server`, `.env`
  loader, and static-file gate coverage added on top of the existing
  classifier and graph tests).
