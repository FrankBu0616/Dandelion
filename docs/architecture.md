# Architecture

Current prototype:

```text
prototype.html
  -> /api/chat       ordinary main/plant messages
  -> /api/continue   post-weave continuation

scripts/router-prototype-server.mjs
  -> Ollama qwen2.5:3b
```

The browser owns the interaction state:

- main thread
- plants
- weave action
- merge-route decision
- conflict-choice UI

The local server only serves files and proxies Ollama calls.

## Production Direction

```text
Renderer UI
  -> session graph state
  -> merge router
  -> provider adapters
  -> SQLite storage
```

Provider adapters should support Ollama first, then Anthropic, OpenAI, and Gemini through BYO keys.
