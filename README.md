<div align="center">

<img src="brand/wordmark_lockup_horizontal.svg" alt="Dandelion" width="420" />

**Sculpt what the model is thinking.**

A local-first context editor for AI conversations. Fork the question, explore in parallel, choose what survives into your context.

[![License: MIT](https://img.shields.io/badge/license-MIT-0F0F12.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-C97B4E.svg)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-pre--alpha-3A7A7A.svg)](#status)
[![Tests](https://img.shields.io/badge/tests-node%20--test-3A7A7A.svg)](./tests)

</div>

---

## What it is

Dandelion is a **context modulation** tool. The context window is the real product surface of any AI conversation, and today the user has no surgical control over it — whatever gets said stays in, forever, in order. Dandelion treats context as an editable object.

The interaction:

1. Start a main thread with a root question.
2. Spin up parallel **plants** — each one explores a different sub-question, alternative framing, or candidate direction.
3. Graft the plants you want back into the main thread. The ones you don't are simply discarded.
4. The app decides *how* the merge happens — it does not ask the model to summarize.

Each plant can be routed to a different model. Use a fast local model for cheap exploration, a frontier model for the branches you want to take seriously, mix providers within the same fork tree.

The context router has two outcomes:

- **Compatible context** → the main thread continues, now informed by the merged plants.
- **Material conflict** → Dandelion shows the tension and asks which stance to follow. No forced synthesis.

The important product decision: **context routing belongs to the app, not to the model's final answer prompt.** The user, not the model, sculpts the context.

## Why It Is Different

Most adjacent tools make AI chat less linear: branches, trees, canvases, side-by-side comparisons, reusable threads, and model pickers. They preserve more possible paths.

Dandelion is trying to solve a different problem:

```text
The model does not need every path.
It needs the right working memory.
```

Dandelion is a **memory-control surface** for AI work. Plants are scratch space until the user admits them. Grafting is a context transaction. The trunk is not just the visible main chat; it is the set of things the next model call is allowed to inherit.

That makes the product different in kind:

| Branching chat tools | Dandelion |
|---|---|
| Preserve alternate paths | Controls what becomes working memory |
| Treat a branch as another conversation | Treats a plant as candidate context |
| Merge by summarizing or linking a branch | Graft by admitting selected context |
| Focus on navigating the tree | Focuses on the trunk's context state |
| Hide contradictions inside model prose | Stops and asks when context conflicts |
| Make dead ends easier to keep | Keeps dead ends visible but non-steering |

The simple test:

```text
Can the user decide what the AI remembers, forgets, questions, and inherits next?
```

If not, the feature belongs to generic branching chat, not Dandelion.

## North Star

Dandelion is not a branching chat app. It is a **context editor** for AI conversations.

Branches are temporary probes. Plants are candidate context segments. Grafting is the explicit act of admitting selected side work into the trunk's future context.

The durable product question:

```text
What should the main thread know now, and what should it deliberately not know?
```

That is the difference between Dandelion and ordinary branching chat. Many tools help users manage conversation paths. Dandelion helps users modulate context.

The positioning becomes real only when the product makes context visible:

- **Context inspector first.** Users must be able to see what the model is reasoning over.
- **Context-state diff second.** Grafting should show what changed in the trunk's working context.
- **Undo / un-graft early.** People will only explore freely if context edits are reversible.
- **Do not lead with branching chat.** Branching, trees, and forks belong in mechanics docs; the front-door pitch should be context control.
- **Keep conflict human-visible.** Surface `material_conflict` as plain language, like "the plants disagree," instead of letting a model smooth it away.

More detail lives in [North Star](docs/north_star.md).

## Status

<img src="brand/logos/dandelion.svg" alt="" width="18" align="left" hspace="6" />

**Pre-alpha.** The design is locked enough to test the core interaction.

Current working prototype:

- `prototype.html` is the main interactive template.
- `scripts/router-prototype-server.mjs` serves the prototype and proxies model calls.
- Two providers are supported out of the box: local Ollama (default, `qwen2.5:3b`) and Anthropic Claude (`claude-haiku-4-5` by default). Switch the default with `DANDELION_PROVIDER`, or pick a model per plant in the UI.
- `scripts/merge-harness.mjs` is a CLI harness for repeatable context-router tests.

## Repository Map

```text
README.md                          project overview and run instructions
CONTRIBUTING.md                    contribution lanes and local workflow
prototype.html                     main runnable prototype (markup + module wiring)
prototype/                         prototype modules — the HTML is now a thin shell
  api.mjs                          /api/* network calls (chat, continue, listModels)
  dandelion-svg.mjs                seed-head SVG renderer
  dom-utils.mjs                    shared DOM helpers (autoSizeTextarea)
  escape.mjs                       shared escapeHtml utility
  graph.mjs                        shadow DAG factory (chat/plant/merge nodes)
  main-thread.mjs                  main-column rendering + streaming controller
  model-picker.mjs                 header model dropdown (loads /api/models)
  plant-tray.mjs                   right-column plant tray UI
  plants.mjs                       plant lifecycle (open/send/close/reopen)
  scripted-content.mjs             demo starters + canned fallback replies
  graft.mjs                        graft flow + conflict-choice resolution
  styles.css                       @imports the per-area files in styles/
  styles/                          base / header / workspace / main-thread /
                                   composer / plant-tray / empty-state
  router-demo/index.html           smaller router-only comparison prototype
scripts/
  providers.mjs                    unified chat() over Ollama + Anthropic
  merge-router.mjs                 deterministic regex baseline classifier
  classify-route.mjs               model-based classifier (canonical)
  classify-experiment.mjs          benchmarks regex vs model across scenarios
  merge-harness.mjs                CLI: full merge-flow simulation
  router-prototype-server.mjs      local HTTP server + provider proxy
  harness/
    scenarios.mjs                  rich scenarios (parent + branches + followUp)
    merge-prompt.mjs               merge-prompt template
  server/
    prompts.mjs                    continuation-prompt builders for /api/run + /api/continue
tests/
  merge-router.test.mjs            classifier unit tests
  graph-shadow.test.mjs            graph helper tests (imports prototype/graph.mjs)
  merge-router/scenarios.json      classifier benchmark fixtures
docs/README.md                     docs index
docs/north_star.md                 product doctrine: context modulation, not branching chat
```

## Run

Requires Node.js 20+. No npm install is needed — Dandelion has no dependencies.

Pick a provider:

**Local (Ollama, default).** Install [Ollama](https://ollama.com/), start the local server, and pull the default model:

```sh
ollama serve          # starts http://localhost:11434
ollama pull qwen2.5:3b
```

In another terminal, start Dandelion:

```sh
npm start              # or: node scripts/router-prototype-server.mjs
```

By default the prototype talks to Ollama through its OpenAI-compatible endpoint at `http://localhost:11434/v1` and uses `qwen2.5:3b`. To use a different local model:

```sh
export OLLAMA_MODEL=llama3.2:3b
npm start
```

If Ollama is running somewhere else:

```sh
export OLLAMA_BASE_URL=http://localhost:11434/v1
npm start
```

**Claude API.** Set two env vars and start:

```sh
export DANDELION_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
# optional: export ANTHROPIC_MODEL=claude-sonnet-4-6   # default: claude-haiku-4-5
npm start
```

Run the context-router test suite (no network needed):

```sh
npm test
```

Open:

```text
http://localhost:4321
```

The older router-only test page remains available at:

```text
http://localhost:4321/router-demo
```

## Current Behavior

The prototype supports:

- Main-thread chat against the configured provider.
- Plant chat with **per-plant model selection** — mix local Ollama and Claude (and additional providers as they land) inside a single fork tree.
- Multiple plants generating in parallel while other plants remain editable.
- Grafting selected plants back into the main conversation — the merge is the context edit.
- App-owned context routing across two routes:

| Route | When it fires | What Dandelion does |
|---|---|---|
| ![additional_context](https://img.shields.io/badge/additional__context-3A7A7A?style=flat-square) | Plants add compatible information | Continues the main thread with expanded context |
| ![material_conflict](https://img.shields.io/badge/material__conflict-8A4F22?style=flat-square) | Plants have any real tension or propose incompatible next steps | Renders a choice prompt — never forces a synthesis |

- Conflict-choice UI rendered by the app, not improvised by the model.

Material conflicts do not call Ollama for a forced synthesis. Dandelion renders a choice prompt and waits for the user to select the path forward.

## System Diagrams

### Product Flow

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

### Runtime Shape

```text
prototype.html
  |
  |-- Main thread prompt
  |      |
  |      v
  |   /api/chat
  |
  |-- Plant prompt
  |      |
  |      v
  |   /api/chat
  |
  |-- Graft selected plants
         |
         v
      Context router
         |
         |-- additional_context
         |      |
         |      v
         |   /api/continue
         |
         |-- material_conflict
                |
                v
             Conflict choice UI

/api/chat and /api/continue
  |
  v
router-prototype-server.mjs
  |
  v
Ollama qwen2.5:3b
```

## Architecture Notes

The important product decision is that context routing belongs to the app, not the model's final answer prompt.

The reliable flow is:

```text
selected plants
  -> classify context route
  -> if compatible: call model with merged context
  -> if material conflict: render a user choice
```

This avoids the failure mode where a model tries to summarize, hedge, or force a synthesis when the user actually needs to choose a direction.

More detail:

- [Product](docs/product.md)
- [Architecture](docs/architecture.md)
- [Context Router](docs/context_router.md)
- [Data Model](docs/data_model.md)
- [Docs Index](docs/README.md)
- [Contributing](CONTRIBUTING.md)

## Test Scenarios

Run the CLI harness:

```sh
node scripts/merge-harness.mjs --scenario curated_additional_context
node scripts/merge-harness.mjs --scenario curated_speed_vs_fidelity
node scripts/merge-harness.mjs --scenario curated_provider_scope
```

Expected behavior:

- Additional context: continue naturally.
- Material conflict: ask the user which stance to proceed with.

To benchmark the context-route classifier (regex baseline vs model) across the
full scenario set:

```sh
node scripts/classify-experiment.mjs
```

## TODO

Features that make the context-modulation thesis load-bearing:

- **Context inspector panel.** Render the main thread's current context as a list of admitted segments, each tagged with origin (root, or merged-from-plant-N). The user should always be able to see what is and isn't in their context.
- **Un-merge / context revision.** Reversible merges — pull a previously-grafted plant back out of the trunk.
- **Diff between context states.** Show what changed in the context before vs. after a merge, so the modulation is legible.
- **Save and replay context shapes.** A sculpted trunk at a given point is a reusable artifact — fork from it later, or use it as a starting context for a new question.
- **Sibling vs. child plant gestures.** "Ask the same root differently" and "go deeper on this branch" are different modulation moves; the UI should distinguish them.
- **More provider adapters** (OpenAI, Google) for per-plant model selection.

## Project Direction

Dandelion is targeting one niche and doing it well: **a context editor for AI conversations**, for users who care enough about what their model is reasoning over to shape it deliberately. Not a chat app. Not a multi-agent orchestrator. Not a model aggregator.

The intended production stack remains:

- Electron + React for the desktop shell
- SQLite for local persistence of fork trees and context states
- BYO model providers: Anthropic, OpenAI, Google, and Ollama — selectable per plant
- Local-first, no hosted backend

The current prototype deliberately avoids Electron and persistence so the core interaction — fork, modulate, merge — can be validated first.

## Brand

The mark is a DAG — three fork sources converging to a diamond merge node, rotated 35° so it reads as a windborne seed-head rather than an upright trident. The diamond visually distinguishes the *merge primitive* from the fork sources. See [`brand/brand_kit.md`](./brand/brand_kit.md) for the full kit, palette, and lockups.

<p align="center">
  <img src="brand/logos/dandelion.svg" alt="" width="56" />
  &nbsp;&nbsp;&nbsp;
  <img src="brand/logos/dandelion_outlined.svg" alt="" width="56" />
  &nbsp;&nbsp;&nbsp;
  <img src="brand/logos/dandelion_app_icon.svg" alt="" width="56" />
</p>

## License

MIT. See [LICENSE](./LICENSE).

<div align="center">
<sub>Built local-first. No hosted backend, no telemetry, no account.</sub>
</div>
