# Contributing

Dandelion is a pre-alpha prototype for **user-arbitrated parallel
exploration with merge** — chat-native context modulation, not branching
chat. The best contributions are small, testable improvements to the
core loop:

```text
main thread
  -> plants (parallel seeds)
  -> graft (admit selected plants into the trunk)
  -> context router (additional context | material conflict)
  -> continue or ask the user to choose
```

## Run Locally

Requires Node.js 20+. No `npm install` — the prototype pulls its three
frontend deps (marked, KaTeX, DOMPurify) directly from CDN at page load.

```sh
cp .env.example .env       # fill in ANTHROPIC_API_KEY or leave blank for Ollama-only
npm start                  # http://localhost:4321
npm test                   # 40 unit tests, no network
```

The server logs setup warnings on startup — read them before assuming
something is broken.

## Repo Map (quick orient)

```text
prototype.html                  thin HTML shell
prototype/bootstrap.mjs         app host: state + DOM wiring + events
prototype/                      feature modules
  main-thread.mjs               trunk rendering + streaming
  plants.mjs / plant-tray.mjs   seed lifecycle + tray UI
  graft.mjs                     graft flow + conflict-choice resolution
  context-inspector.mjs         right-edge drawer: admitted segments + mute
  sessions-sidebar.mjs          left-edge drawer: saved sessions
  persistence.mjs               localStorage + server snapshot
  mute-filters.mjs              single source of truth for mute filtering
  graph.mjs                     shadow DAG
  markdown.mjs                  marked + KaTeX + DOMPurify
  graft-overlay.mjs             right-gutter dandelion overlay
  api.mjs                       /api/* network calls
  types.mjs                     JSDoc typedefs for AppState
scripts/router-prototype-server.mjs    HTTP server + provider proxy
scripts/providers.mjs                  unified chat() + uploadFile()
scripts/server/sessions.mjs            ./sessions/<id>.json store
scripts/merge-router.mjs               deterministic regex baseline classifier
scripts/classify-route.mjs             model-based classifier (canonical)
tests/                                  node:test suites
```

See `docs/architecture.md` and `docs/data_model.md` for the runtime
shape and the persisted-snapshot schema.

## Contribution Lanes

Good first lanes:

- Add merge-router scenarios (`scripts/harness/scenarios.mjs`).
- Improve route classification (`scripts/classify-route.mjs` or the
  regex baseline in `scripts/merge-router.mjs`).
- Improve plant UX (`prototype/plants.mjs` + `plant-tray.mjs`).
- Improve prompt contracts (`scripts/server/prompts.mjs`).
- Add provider adapters in `scripts/providers.mjs` (OpenAI, Google).
- Extend the context inspector (new mutable segment types, segment
  reordering, diff between context states).
- Persistence improvements (schema migrations, fork-from-saved-session,
  full-text search across sessions).
- Port the prototype into Electron + React.

Avoid large rewrites until the merge-router behavior is stable.

## Mute Semantics (when touching context paths)

Anything that decides "does this segment reach the model on the next
send?" routes through `prototype/mute-filters.mjs`. There is no second
site for mute logic. If you add a new mutable segment type:

1. Add a case in `collectSegments` (`prototype/context-inspector.mjs`)
   with `mutable: true` and a `muteTarget`.
2. Add a case in `toggleMute()` (same file) that flips the right flag.
3. Add a case in `filterMainConv` (`prototype/mute-filters.mjs`).
4. Add a test in `tests/mute-filters.test.mjs`.

If you only do 1+2, the inspector will *look* right but mute will
silently no-op on the wire. That's the bug class this single-source
rule prevents.

## Test Before Opening a PR

```sh
npm test
```

Plus, if your change touches the router or the prompt contracts:

```sh
node scripts/merge-harness.mjs --scenario curated_additional_context
node scripts/merge-harness.mjs --scenario curated_speed_vs_fidelity
node scripts/merge-harness.mjs --scenario curated_provider_scope
```

Expected:

- Additional context → continues naturally.
- Material conflict → asks the user which stance to proceed with.

## Design Principles

- The app owns merge routing, not the model.
- The model continues only when continuation is appropriate.
- Material conflicts become explicit user choices, never silent
  syntheses.
- Context is editable. Mute is reversible; graft is reversible (via
  un-graft, planned); only delete is destructive.
- Local-first is a product constraint, not just an implementation
  detail. No telemetry. No account. No hosted backend.
- Keep the first shippable surface narrow.
