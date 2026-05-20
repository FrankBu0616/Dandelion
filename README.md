# Dandelion

A local-first desktop app concept where you take one question, spin up parallel side threads, then weave selected threads back into the main conversation. If the side threads add compatible context, the main thread continues with that context. If they materially conflict, Dandelion asks which stance should become the path forward.

## Status

Pre-alpha. The design is locked enough to test the core interaction.

Current working prototype:

- `prototype.html` is the main interactive template.
- `scripts/router-prototype-server.mjs` serves the prototype and proxies local Ollama calls.
- `qwen2.5:3b` via Ollama is the default local model.
- `scripts/merge-harness.mjs` is a CLI harness for repeatable merge-router tests.

## Repository Map

```text
README.md                         project overview and run instructions
CONTRIBUTING.md                   contribution lanes and local workflow
prototype.html                    main runnable prototype
prototype-router.html             smaller router-only comparison prototype
scripts/merge-router.mjs          canonical merge-router classifier (browser + node)
scripts/router-prototype-server.mjs
                                  local server + Ollama proxy
scripts/merge-harness.mjs         repeatable CLI merge-router harness
docs/README.md                    docs index
tests/merge-router.test.mjs       unit tests for the merge-router classifier
tests/merge-router/scenarios.json route fixtures and expected classifications
```

## Run

Requires Node.js 20+ and a running Ollama instance. No npm install is needed —
Dandelion has no dependencies. Start Ollama separately, then run:

```sh
npm start              # or: node scripts/router-prototype-server.mjs
```

Run the merge-router test suite:

```sh
npm test
```

Open:

```text
http://localhost:4321
```

The older router-only test page remains available at:

```text
http://localhost:4321/prototype-router.html
```

## Current Behavior

The prototype supports:

- Main-thread chat via local Ollama.
- Side-thread chat via local Ollama.
- Multiple side threads generating while other strands remain editable.
- Weaving selected strands back into the main conversation.
- App-owned merge routing:
  - `additional_context`: compatible information; continue naturally.
  - `soft_disagreement`: different emphasis; integrate into one recommendation.
  - `material_conflict`: incompatible next steps; ask the user to choose.
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
Side strand A        Side strand B        ... Side strand N
     |                    |                      |
     +--------------------+----------------------+
                          |
                          v
                 Weave selected strands
                          |
                          v
                    Merge router
                          |
        +-----------------+-----------------+
        |                 |                 |
        v                 v                 v
Additional context   Soft disagreement   Material conflict
        |                 |                 |
        v                 v                 v
Continue with        Continue with        Ask user which
expanded context     integrated take      stance to follow
        |                 |                 |
        +-----------------+-----------------+
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
  |-- Side strand prompt
  |      |
  |      v
  |   /api/chat
  |
  |-- Weave selected strands
         |
         v
      Merge router
         |
         |-- additional_context
         |      |
         |      v
         |   /api/continue
         |
         |-- soft_disagreement
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

The important product decision is that merge routing belongs to the app, not the model's final answer prompt.

The reliable flow is:

```text
selected side threads
  -> classify merge route
  -> if compatible: call model with merged context
  -> if material conflict: render a user choice
```

This avoids the failure mode where a model tries to summarize, hedge, or force a synthesis when the user actually needs to choose a direction.

More detail:

- [Product](docs/product.md)
- [Architecture](docs/architecture.md)
- [Merge Router](docs/merge_router.md)
- [Data Model](docs/data_model.md)
- [Docs Index](docs/README.md)
- [Contributing](CONTRIBUTING.md)

## Test Scenarios

Run the CLI harness:

```sh
node scripts/merge-harness.mjs --scenario curated_additional_context --variant router
node scripts/merge-harness.mjs --scenario curated_soft_disagreement --variant router
node scripts/merge-harness.mjs --scenario curated_provider_scope --variant router
```

Expected behavior:

- Additional context: continue naturally.
- Soft disagreement: combine into one practical recommendation.
- Material conflict: ask the user which stance to proceed with.

## Project Direction

The intended production stack remains:

- Electron + React for the desktop shell
- SQLite for local persistence
- BYO model providers: Anthropic, OpenAI, Google, and Ollama
- Local-first, no hosted backend

The current prototype deliberately avoids Electron and persistence so the interaction can be validated first.

## License

MIT. See [LICENSE](./LICENSE).
