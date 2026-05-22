# Architecture

Architectural north star: Dandelion is a context editor, not a branching chat app. The data model, router, and UI should preserve the distinction between explored side work and admitted trunk context.

Branches can be many. The trunk's active context should be deliberate.

Current prototype:

```text
prototype.html
  -> /api/chat       ordinary main/plant messages
  -> /api/continue   post-graft continuation

scripts/router-prototype-server.mjs
  -> Ollama qwen2.5:3b
```

The browser owns the interaction state:

- main thread
- plants
- graft action
- context-route decision
- conflict-choice UI

The local server only serves files and proxies Ollama calls.

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
