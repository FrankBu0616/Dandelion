<div align="center">

<img src="brand/wordmark_lockup_horizontal.svg?v=orange-root" alt="Dandelion" width="420" />

**Sculpt what the model is thinking.**

A local-first context editor for AI conversations. Fork the question,
explore in parallel, **mute what shouldn't reach the model**, graft
what should.

<br />
<img src="dandelion_demo.gif" alt="Dandelion in action: parallel plants, graft, mute" width="720" />

[![Live demo](https://img.shields.io/badge/live%20demo-dandelion--three.vercel.app-C97B4E.svg)](https://dandelion-three.vercel.app/)
[![License: MIT](https://img.shields.io/badge/license-MIT-0F0F12.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-C97B4E.svg)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-pre--alpha-3A7A7A.svg)](#status)
[![Tests](https://img.shields.io/badge/tests-61%20passing-3A7A7A.svg)](./tests)
[![CI](https://github.com/FrankBu0616/Dandelion/actions/workflows/test.yml/badge.svg)](https://github.com/FrankBu0616/Dandelion/actions/workflows/test.yml)

</div>

---

## Table of Contents

- [What it is](#what-it-is)
- [Why it is different](#why-it-is-different)
- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Concepts](#concepts) — *trunk · plants · graft · mute · context inspector*
- [System diagrams](#system-diagrams)
- [Repository map](#repository-map)
- [Architecture notes](#architecture-notes)
- [Status](#status)
- [Roadmap](#roadmap)
- [Testing](#testing)
- [Contributing](#contributing)
- [Security and privacy](#security-and-privacy)
- [Project direction](#project-direction)
- [Brand](#brand)
- [License](#license)

---

## What it is

Dandelion is a **context editor** for AI conversations. The context window
is the real product surface of any AI conversation, and today the user
has no surgical control over it — whatever gets said stays in, forever,
in order. Dandelion treats context as an editable object.

The interaction in one breath:

1. Start a main thread with a root question.
2. Spin up parallel **plants** — each one explores a different sub-question,
   alternative framing, or candidate direction.
3. **Mute** anything in the current context you don't want the model to see
   next — files, prior turns, grafted seeds, even the parent context itself.
   Reversible.
4. **Graft** the plants you want back into the main thread. The ones you
   don't are discarded.
5. The app decides *how* the merge happens — it does not ask the model
   to summarize.

Each plant can be routed to a different model. Use a fast local model
for cheap exploration, a frontier model for the branches you want to
take seriously, mix providers within the same fork tree.

The important product decision: **context routing belongs to the app,
not to the model's final answer prompt.** The user, not the model,
sculpts the context.

## Why it is different

Most adjacent tools make AI chat less linear: branches, trees, canvases,
side-by-side comparisons, reusable threads, and model pickers. They
preserve more possible paths.

Dandelion is solving a different problem:

```text
The model does not need every path.
It needs the right working memory.
```

Dandelion is a **memory-control surface** for AI work. Plants are scratch
space until the user admits them. Grafting is a context transaction.
Muting is a context retraction. The trunk is not just the visible main
chat; it is the set of things the next model call is allowed to inherit.

| Branching chat tools | Dandelion |
|---|---|
| Preserve alternate paths | Controls what becomes working memory |
| Treat a branch as another conversation | Treats a plant as candidate context |
| Merge by summarizing or linking a branch | Graft by admitting selected context |
| Context only ever grows | Mute lets you *remove* context without losing the visible record |
| Focus on navigating the tree | Focuses on the trunk's context state |
| Hide contradictions inside model prose | Stops and asks when context conflicts |
| Make dead ends easier to keep | Keeps dead ends visible but non-steering |

The simple test:

```text
Can the user decide what the AI remembers, forgets, questions, and inherits next?
```

If not, the feature belongs to generic branching chat, not Dandelion.

## Features

**Conversation shape**

- 🌱 **Plants** — spawn parallel side-investigations off the main thread,
  each runnable against a different model.
- 🔀 **Graft** — merge selected plants back into the trunk as a single
  context-edit transaction. Unselected plants are discarded.
- 🚦 **Context router** — every graft is classified as either
  `additional_context` (continue with the merged context) or
  `material_conflict` (surface the disagreement, let the user choose).
- 🪴 **Per-plant model** — mix Ollama and Anthropic Claude inside a
  single fork tree.
- 🧬 **Shadow DAG** — every turn, plant, and merge is modeled as a
  graph node; the visible thread is a projection.

**Context control**

- 🔍 **Context inspector** (right-edge drawer) — every segment the model
  will see on the next send is listed: system prompt, parent context,
  attachments, trunk turns, grafted seeds, conflict choices.
- 🙈 **Drop / mute any segment** — toggle individual segments off without
  removing them from the visible thread. Click the eye icon to mute,
  click again to restore. Fully reversible. Mutes are applied to the
  next request and persist across reloads.
- 📎 **Files** — upload PDFs, images, or text via Anthropic's Files
  API. Uploaded once, referenced by `file_id`, ride every send across
  the main thread and seeds.
- 📝 **Per-turn record of routing decisions** — when you send with one
  or more muted segments, the user bubble is stamped *"↓ asked with N
  muted: parent context, report.pdf"* so the thread stays honest about
  what the model saw.

**Persistence**

- 💾 **Auto-saved sessions** — every keystroke debounces into
  localStorage; every save is mirrored to `./sessions/<id>.json` on the
  server so sessions follow you across browsers and survive reloads.
- 📚 **Sessions sidebar** (left-edge drawer) — list every saved session
  newest-first, click to switch, inline rename, delete.

**Rendering**

- ✨ **Markdown + LaTeX** in assistant bubbles (marked + KaTeX), with
  DOMPurify sanitization. Code blocks, tables, block math, the works.

**Operational**

- 🔌 **BYO keys**, local-first — Dandelion never phones home. Your
  Anthropic key talks to Anthropic; your Ollama runs locally. No
  telemetry, no account, no hosted backend.
- 🧪 **61 tests** covering the classifier, mute filters, persistence,
  server session store, and `.env` loader.

## Quick start

### Try it in your browser (no clone, no install)

**Live demo → https://dandelion-three.vercel.app/**

The prototype is fully client-side: open the link, paste your own Anthropic API
key (or point it at your local Ollama), and everything runs against
api.anthropic.com directly from the browser. Keys live only in your
`localStorage` — Dandelion has no backend and never sees your key.

> Want your own deploy? [Clone to Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FFrankBu0616%2FDandelion).
> No build step required; Vercel serves the static prototype as-is.

### Run locally (recommended for development)

```sh
git clone https://github.com/FrankBu0616/Dandelion.git
cd Dandelion
cp .env.example .env       # then edit .env — fill in keys or leave blank for Ollama-only
npm start                  # serves http://localhost:4321
npm test                   # 61 unit tests, no network needed
```

Requires Node.js 20+. **No `npm install`** — Dandelion has no npm
dependencies. The prototype pulls its three frontend libraries (marked,
KaTeX, DOMPurify) directly from CDN on page load.

The local Node server is optional in the browser-direct deploy — it stays
useful for the merge harness, scripted scenarios, and faster iteration.

The server auto-loads `.env` from the repo root on startup
(`scripts/load-env.mjs`). Values already in your shell win over the
file — no override magic.

The server logs setup warnings on startup for the two failure modes
that confuse first-time users:

- No Anthropic key **and** no reachable Ollama → the model picker is empty.
- Host bound to a non-loopback interface → unauthenticated network exposure.

## Configuration

All configuration is via environment variables. Copy `.env.example` to
`.env` and edit. The full set:

| Variable | Default | Purpose |
|---|---|---|
| `DANDELION_PROVIDER` | `ollama` | Default provider when no per-call override. `ollama` or `anthropic`. |
| `ANTHROPIC_API_KEY` | *(unset)* | Required for Claude models, file uploads, and vision/PDF inputs. |
| `ANTHROPIC_MODEL` | *(uses curated list)* | Override the default Claude model. |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible endpoint of your Ollama server. |
| `OLLAMA_MODEL` | `qwen2.5:3b` | Default local model. |
| `PORT` | `4321` | Server port. |
| `HOST` | `127.0.0.1` | Bind address. **Do not change** unless on a trusted network — there is no auth. |
| `DANDELION_SESSIONS_DIR` | `./sessions` | Where the server writes per-session JSON snapshots. |

### Local-only (Ollama)

Install [Ollama](https://ollama.com/), start the local server, pull a model,
and run Dandelion. Default model:

```sh
ollama serve                  # starts http://localhost:11434
ollama pull qwen2.5:3b
npm start
```

### Claude API

Set the key in `.env` or your shell:

```sh
DANDELION_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# optional: ANTHROPIC_MODEL=claude-sonnet-4-6
```

You can also leave `DANDELION_PROVIDER=ollama` and switch to Claude per
plant via the in-UI model picker.

Open:

```text
http://localhost:4321
```

## Concepts

The four atoms that show up everywhere in the code and the docs:

- **Trunk** — the linear main thread. Whatever lives here is what the
  model receives as conversation history. The trunk is the durable
  context state; everything else is candidate context.
- **Plant** — a parallel investigation forked off the trunk. Plants are
  scratch space; they do not affect the trunk unless grafted.
- **Graft** — the explicit act of admitting selected plants back into
  the trunk. A graft is a *context transaction*: the trunk's future
  context now inherits the grafted plants.
- **Mute** — the reverse of admit. Hide any segment (file, trunk turn,
  grafted seed, parent context) from the model on the next send,
  without removing it from your visible thread. Reversible.
- **Context inspector** — the live view of what the model will see on
  the next request. Every admitted segment is listed; mute toggles
  hang off each row.

See [docs/north_star.md](docs/north_star.md) for the longer doctrine
and [docs/context_router.md](docs/context_router.md) for the routing
mechanics.

## System diagrams

### Product flow

```text
Root question
     |
     v
Main thread
     |
     +--------------------+
     |                    |
     v                    v
Plant A        Plant B        ... Plant N
     |                    |                      |
     +--------------------+----------------------+
                          |
                          v
                 Graft selected plants
                          |
                          v
                    Context router
                          |
              +---------------+---------------+
              |                               |
              v                               v
       Additional context              Material conflict
              |                               |
              v                               v
       Continue with                    Ask user which
       expanded context                 stance to follow
              |                               |
              +---------------+---------------+
                              |
                              v
                       Main thread continues
```

### Runtime shape

```text
prototype.html  (thin HTML shell)
  |
  v
prototype/bootstrap.mjs  (application host)
  |
  |-- /api/chat         current prompt + admitted structured history
  |-- /api/files        upload-to-Anthropic file proxy
  |-- /api/continue     post-graft synthesis prompt
  |-- /api/classify-route   plant disagreement classifier
  |-- /api/sessions[/:id]   list / read / write / delete sessions
  |-- /api/models       provider × model catalog

scripts/router-prototype-server.mjs
  |
  v
Ollama (local) or Anthropic (cloud)
```

## Repository map

```text
README.md                          you are here
CONTRIBUTING.md                    contribution lanes and local workflow
CHANGELOG.md                       version history
.env.example                       copy to .env to configure providers + server
prototype.html                     thin HTML shell that loads prototype/bootstrap.mjs
prototype/                         prototype modules — HTML is a thin shell
  bootstrap.mjs                    application host: state + DOM wiring + events
  api.mjs                          /api/* network calls (chat, files, sessions, …)
  graph.mjs                        shadow DAG factory (chat/plant/merge nodes)
  graft-overlay.mjs                right-gutter floating dandelion overlay
  main-thread.mjs                  main-column rendering + streaming controller
  plant-tray.mjs                   seed-tray UI for parallel plants
  plants.mjs                       plant lifecycle (open/send/close/reopen)
  graft.mjs                        graft flow + conflict-choice resolution
  context-inspector.mjs            right-edge drawer: admitted segments + mute
  sessions-sidebar.mjs             left-edge drawer: saved sessions + load/rename
  persistence.mjs                  localStorage + server snapshot save/load
  mute-filters.mjs                 single source of truth for mute filtering
  markdown.mjs                     marked + KaTeX + DOMPurify renderer
  model-picker.mjs                 header model dropdown (loads /api/models)
  scripted-content.mjs             demo starters + canned fallback replies
  dandelion-svg.mjs                seed-head SVG renderer
  dom-utils.mjs / escape.mjs       shared utilities
  types.mjs                        JSDoc typedefs for the shared AppState
  styles.css                       @imports the per-area files in styles/
  styles/                          per-area CSS (base / header / workspace / …)
  router-demo/index.html           smaller router-only comparison prototype
scripts/
  load-env.mjs                     zero-dep `.env` loader (auto-runs on import)
  providers.mjs                    unified chat() + uploadFile() over Ollama + Anthropic
  merge-router.mjs                 deterministic regex baseline classifier
  classify-route.mjs               model-based classifier (canonical)
  classify-experiment.mjs          benchmarks regex vs model across scenarios
  merge-harness.mjs                CLI: full merge-flow simulation
  router-prototype-server.mjs      local HTTP server + provider proxy
  harness/
    scenarios.mjs                  rich scenarios (parent + branches + followUp)
    merge-prompt.mjs               merge-prompt template
  server/
    prompts.mjs                    continuation-prompt builders
    sessions.mjs                   file-backed session storage (./sessions/*.json)
sessions/                          server-side session snapshots (gitignored)
tests/                             node:test suites (61 tests)
docs/
  README.md                        docs index
  north_star.md                    product doctrine
  architecture.md                  current implementation map
  data_model.md                    runtime + persisted schemas
  product.md                       product principles
  context_router.md                routing mechanics
```

## Architecture notes

The important product decision is that context routing belongs to the
app, not the model's final answer prompt.

The reliable flow is:

```text
selected plants
  -> classify context route
  -> if compatible:        call model with merged context
  -> if material conflict: render a user choice
```

This avoids the failure mode where a model tries to summarize, hedge,
or force a synthesis when the user actually needs to choose a direction.

The mute filter is the symmetric move: a single function in
`prototype/mute-filters.mjs` decides which segments reach the model on
every request. Adding a new mutable segment type is a one-place change.

More detail:

- [Architecture](docs/architecture.md)
- [Data Model](docs/data_model.md)
- [Context Router](docs/context_router.md)
- [North Star](docs/north_star.md)
- [Product](docs/product.md)
- [Docs Index](docs/README.md)

## Status

<img src="brand/logos/dandelion.svg" alt="" width="18" align="left" hspace="6" />

**Pre-alpha.** The design is locked enough to test the core
interaction. APIs and on-disk schemas may change without notice until
v1.0. The persisted snapshot is `schemaVersion: 1`; bumps will land in
[CHANGELOG.md](CHANGELOG.md).

The current prototype deliberately avoids Electron and SQLite so the
core interaction — fork, mute, graft — can be validated first.

## Roadmap

**Recently landed:** context inspector, per-segment mute (reversible
context revision), localStorage + server-side session persistence with
a sidebar, file uploads via the Anthropic Files API, markdown + LaTeX
rendering.

**Next:**

- **Auto-seed generation.** When the user asks an open question,
  propose 3–4 distinct angles and spawn them as parallel seeds
  automatically. Turns the "parallel exploration" affordance from
  manual into default.
- **Diff between context states.** Show what changed in the context
  before vs. after a merge — make modulation legible per-edit, not
  just per-segment.
- **Replay / fork from any prior context shape.** A sculpted trunk at
  a given point is a reusable artifact: start a new question from it,
  or fork from a saved session at a chosen turn.
- **Sibling vs. child plant gestures.** "Ask the same root differently"
  and "go deeper on this branch" are different modulation moves; the
  UI should distinguish them.
- **More provider adapters** (OpenAI, Google) for per-plant model
  selection.
- **Streaming on the wire.** Today responses are fetched fully then
  animated locally; real SSE would make `/api/chat` feel as live as
  competitors.

## Testing

```sh
npm test            # all suites, no network
```

The harness covers:

- The deterministic regex classifier and the shadow DAG (the
  pre-existing tests).
- The mute filter (round-trips, edge cases, what survives `excludeAssistantId`).
- The persistence layer (snapshot round-trip, in-flight streaming
  sweep on load, index management, remote-mirror coalescing).
- The server-side session store (atomic writes, path-traversal guard,
  tolerance of corrupt files).
- The `.env` loader (parsing, quoting, comment stripping, shell
  precedence).

End-to-end scenarios are available via the CLI harness:

```sh
node scripts/merge-harness.mjs --scenario curated_additional_context
node scripts/merge-harness.mjs --scenario curated_speed_vs_fidelity
node scripts/merge-harness.mjs --scenario curated_provider_scope
```

Expected behavior:

- `additional_context` → continue naturally with merged context.
- `material_conflict` → ask the user which stance to proceed with.

Benchmark the classifier (regex baseline vs model) across the full
scenario set:

```sh
node scripts/classify-experiment.mjs
```

## Contributing

Issues and pull requests welcome. The contribution lanes, module map,
and design principles live in [CONTRIBUTING.md](CONTRIBUTING.md).

Good first lanes:

- Add merge-router scenarios.
- Improve route classification or the regex baseline.
- Extend the context inspector (new mutable segment types, segment
  reordering, diff between context states).
- Add provider adapters (OpenAI, Google) in `scripts/providers.mjs`.
- Persistence improvements (schema migrations, fork-from-saved-session,
  full-text search).

CI runs `npm test` on Ubuntu and macOS, Node 20 and 22, on every push
and PR. PRs that touch context filtering should include a test in
`tests/mute-filters.test.mjs` — see the "Mute Semantics" rule in
[CONTRIBUTING.md](CONTRIBUTING.md#mute-semantics-when-touching-context-paths).

## Security and privacy

- **No telemetry, no account, no hosted backend.** Dandelion runs
  entirely on your machine and talks only to the providers you
  configure.
- The server binds to **`127.0.0.1` by default** — loopback only.
  Setting `HOST` to anything else exposes the server to your network,
  including the proxied Anthropic key on `/api/files` and `/api/chat`.
  There is no authentication; do this only on a trusted network.
- **Sessions are stored as plain JSON** on disk at `./sessions/<id>.json`
  and in `localStorage`. They contain anything pasted into the
  conversation. The `sessions/` directory is gitignored so a stray
  session doesn't end up in a public commit, but you should still
  treat the directory as you would any local notes.
- **File uploads** go to Anthropic's Files API and persist in your
  Anthropic workspace until you delete them via their API or console.
- To report a vulnerability, please open a private GitHub security
  advisory rather than a public issue.

## Project direction

Dandelion is targeting one niche and doing it well: **a context editor
for AI conversations**, for users who care enough about what their
model is reasoning over to shape it deliberately. Not a chat app. Not
a multi-agent orchestrator. Not a model aggregator.

The intended production stack remains:

- Electron + React for the desktop shell.
- SQLite for local persistence of fork trees and context states.
- BYO model providers: Anthropic, OpenAI, Google, and Ollama —
  selectable per plant.
- Local-first, no hosted backend.

## Brand

The mark is a DAG — three fork sources converging to a diamond merge
node, rotated 35° so it reads as a windborne seed-head rather than an
upright trident. The diamond visually distinguishes the *merge
primitive* from the fork sources. See
[`brand/brand_kit.md`](./brand/brand_kit.md) for the full kit, palette,
and lockups.

<p align="center">
  <img src="brand/logos/dandelion.svg" alt="" width="56" />
  &nbsp;&nbsp;&nbsp;
  <img src="brand/logos/dandelion_app_icon.svg" alt="" width="56" />
</p>

## License

Code is **MIT** — see [LICENSE](./LICENSE).

Brand assets (the **Dandelion** name, wordmark, logo marks, social
preview) are © Frank Bu, all rights reserved, with permitted uses for
referencing this project. See [brand/LICENSE.md](./brand/LICENSE.md).
Forks must rename.

<div align="center">
<sub>Built local-first. No hosted backend, no telemetry, no account.</sub>
</div>
