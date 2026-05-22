# Product

Dandelion is a local-first context modulation tool.

It is not a branching chat app. The trunk's context is the product surface; branches are temporary probes; grafting is the explicit act of admitting selected side work into the main thread's future context.

The durable product question:

```text
What should the main thread know now, and what should it deliberately not know?
```

Core loop:

```text
main question -> plants -> graft -> continue or choose a path
```

The product bet is that heavy LLM users often want multiple investigations running at once, but the deeper need is control over what survives into context. Useful side work should be admitted deliberately. Unhelpful, irrelevant, or conflicting side work should stay visible without steering future reasoning.

This should not become a tool only for developers or prompt engineers. The plain-language job is broader: help anyone doing messy thinking with AI decide what the AI should remember next. A user might be writing, planning, learning, researching, comparing options, or making a personal decision. The profession matters less than the moment: the conversation has useful side paths, dead ends, contradictions, and discoveries that should not all carry equal weight.

## Differentiation

Most adjacent tools improve conversation management: branch from a message, navigate a tree, compare alternatives, summarize a branch, or keep a reusable chat archive.

Dandelion's wedge is memory admission:

- Plants are not alternate chats. They are candidate memories.
- Grafting is not branch merge. It is an explicit context transaction.
- The trunk is not merely the main visible thread. It is the working memory the next model call inherits.
- Merge semantics belong to the app, not to a model recap.
- Material conflict is not a writing problem. It is a memory-admission problem that must become a user choice.
- The graph supports the trunk workflow; it should not become the whole product.
- The product should be judged by whether users can see, edit, reverse, and reuse context states, not by the complexity of its tree.

The durable competitive line:

```text
Not more ways to branch.
More control over what survives.
```

See [`north_star.md`](north_star.md) for the doctrine that should guide product tradeoffs.

## V1 Surface

- Main thread
- Plant drawer
- Graft selected plants
- Conflict-choice UI
- Local model/provider support
- Local persistence later

## Non-Goals For Now

- Collaboration
- Cloud sync
- Canvas view
- Mobile
- Plugin ecosystem
- Automatic “perfect synthesis” of conflicting plants
- Git-style graph complexity as the primary experience
