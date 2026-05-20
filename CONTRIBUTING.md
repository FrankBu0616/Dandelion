# Contributing

Dandelion is currently a prototype for mergeable parallel LLM threads.

The best contributions are small, testable improvements to the core loop:

```text
main thread
  -> plants
  -> weave
  -> merge router
  -> continue or ask the user to choose
```

## Run Locally

Install and start Ollama, then pull the default test model:

```sh
ollama pull qwen2.5:3b
```

Run the prototype:

```sh
node scripts/router-prototype-server.mjs
```

Open:

```text
http://localhost:4321
```

## Contribution Lanes

Good first lanes:

- Add merge-router scenarios.
- Improve route classification.
- Improve plant UX.
- Improve prompt contracts.
- Port the prototype into React.
- Implement SQLite graph storage.
- Add provider adapters.

Avoid large rewrites until the merge-router behavior is stable.

## Test Before Opening a PR

Run:

```sh
node scripts/merge-harness.mjs --scenario curated_additional_context --variant router
node scripts/merge-harness.mjs --scenario curated_soft_disagreement --variant router
node scripts/merge-harness.mjs --scenario curated_provider_scope --variant router
```

Expected:

- Additional context continues naturally.
- Soft disagreement integrates into one recommendation.
- Material conflict asks the user which stance to proceed with.

## Design Principles

- The app owns merge routing.
- The model continues only when continuation is appropriate.
- Material conflicts should become explicit user choices.
- Local-first is a product constraint, not just an implementation detail.
- Keep the first shippable surface narrow.
