# Architecture

Architectural north star: Dandelion is a context editor, not a branching chat app. The data model, router, and UI should preserve the distinction between explored side work and admitted trunk context.

Branches can be many. The trunk's active context should be deliberate.

Current prototype (as of v0.1.0):

```text
prototype.html                     (thin HTML shell; loads bootstrap.mjs)
  -> prototype/bootstrap.mjs       (application host: state + wiring)
       -> main-thread, plants, plant-tray, graft, context-inspector,
          sessions-sidebar, model-picker  (feature modules)
       -> mute-filters              (single source of truth for "what
                                     does the model see on the next send?")
       -> persistence               (localStorage + server snapshot)
       -> graph                     (shadow DAG: chat/plant/merge nodes)
       -> markdown                  (marked + KaTeX + DOMPurify)

  HTTP endpoints served by scripts/router-prototype-server.mjs:
    /api/chat          single-turn chat in the active provider+model
    /api/files         proxy multipart upload to Anthropic Files API
    /api/continue      post-graft continuation prompt
    /api/classify-route classify grafted plants → kind + summary
    /api/sessions[/:id] list / read / write / delete saved sessions
    /api/models        provider × model catalog

scripts/server/sessions.mjs        atomic JSON-file storage (./sessions/*.json)
scripts/providers.mjs              unified chat() + uploadFile() over
                                   Ollama + Anthropic
```

The browser owns the interaction state:

- main thread (`state.mainConv`)
- plants (`state.plants`)
- session-scoped attachments (`state.sessionFiles`)
- mute flags on segments + the parent-context envelope
- graft action and shadow DAG
- context-route decision and conflict-choice UI
- session identity + auto-save snapshots

The local server proxies provider calls (Ollama and Anthropic), persists
session snapshots to disk, and is otherwise stateless across requests.

## Persistence

Two-tier, single-source schema (`schemaVersion: 1`):

```text
state on the client
  -> snapshotFromState()
       (graph.toJSON() + mainConv + plants + sessionFiles + meta)
  -> persistence layer
       -> localStorage (offline cache; debounced writes)
       -> /api/sessions/<id>  (server-side ./sessions/<id>.json)
  -> applySnapshot() on the way back, with sweepInterruptedStreaming()
     to neutralize any status: "streaming" items orphaned by a reload.
```

Conflict resolution is "server is authoritative on load, localStorage is
the offline fallback." Saves go to both. Schema bumps land in
`prototype/persistence.mjs` (`SCHEMA_VERSION`).

## Mute Filters

Every "what does the model see?" decision routes through
`prototype/mute-filters.mjs`:

```text
filterAttachments(sessionFiles)       → file_id list for the wire
filterParentContext(state)            → string | null
filterMainConv(state, opts)           → conv items to replay
filterGraftPlants(plants)             → plants for continuation
```

There is no second site that decides mute semantics. Adding a new
mutable segment type is a one-place change.

## Context Semantics

The app must own context-routing semantics.

```text
selected plants
  -> classify graft
  -> compatible context: continue trunk with admitted context
  -> material conflict: stop and ask which stance the trunk inherits
```

Do not reduce grafting to "summarize branch and append." A graft changes what future trunk turns are allowed to know. A rejected plant remains recoverable but should not affect trunk continuation.

The model may generate prose, but it should not silently decide whether conflicting plants can be reconciled. That decision belongs to the context router and then to the user.

## Production Direction

```text
Renderer UI
  -> session graph state
  -> context router
  -> provider adapters
  -> SQLite storage
```

Provider adapters should support Ollama first, then Anthropic, OpenAI, and Gemini through BYO keys.

The production graph should support provenance and recovery without making graph management the primary product. The main thread remains the spine.
