# North Star

Dandelion is not a branching chat app. It is a local-first context modulation tool.

The trunk's context is the product surface. Branches are temporary probes. Grafting is an explicit edit to what the main thread is allowed to know next.

The durable question:

```text
What should the main thread know now, and what should it deliberately not know?
```

## The Thesis

Most AI chat tools treat conversation history as an append-only transcript. Branching tools improve that by letting users fork a path, compare alternatives, or keep tangents out of the main chat. That is useful, but it is still mostly conversation management.

Dandelion treats context as an editable object.

Plants are candidate context segments. They can explore tangents, test assumptions, compare models, or investigate sub-questions. They do not automatically become part of the trunk. The user grafts only the plants that should survive into the main thread's working context.

Discarded plants are not failed chats. They are explored-but-not-admitted context.

## What Makes Dandelion Different

### 1. Grafting Is Selective Admission

Merge is not "summarize this branch back into the chat." Merge is a decision about admission.

When a plant is grafted, Dandelion is saying: this side work now belongs to the trunk's context. When a plant is not grafted, Dandelion is saying: this work remains visible, but it should not steer future reasoning.

### 2. Merge Semantics Belong To The App

Dandelion does not ask the model to smooth everything into a recap.

The app classifies the graft:

- **Compatible context**: the selected plants add information that can safely extend the trunk.
- **Material conflict**: the selected plants disagree in a way that changes what should happen next.

Compatible context can flow forward. Material conflict must become a user choice. The model should not hide that tension by forcing a synthetic compromise.

### 3. The Main Thread Is The Spine

The graph matters, but it is not the hero.

The user should be able to keep working in the trunk, plant side investigations when needed, graft the useful ones, and continue. Tree views, collapsed nodes, provenance, and comparison tools support that flow; they should not turn Dandelion into a graph-management app.

### 4. Plants Are Parallel Work Surfaces

A plant is not just an alternate universe. It is a scoped investigation sharing a parent context.

Plants can run in parallel, use different models, and return as candidates for the same trunk. This makes Dandelion feel less like "multiverse chat" and more like a research bench feeding one coherent line of work.

### 5. Conflict Is First-Class

Context pollution is not only tangents. It is also incompatible assumptions silently entering future reasoning.

Dandelion should make conflict visible at graft time. If two plants imply different next steps, the UI should stop and ask which stance the trunk should inherit.

## Positioning

Avoid positioning Dandelion as "Git for chat." Many products are already building that.

Do not lead external copy with "branching chat." Branching is a mechanism, and it is a crowded mechanism. Use branch, tree, fork, and path language in mechanics docs when it helps explain the interface, but make the front-door pitch about context control.

Use this instead:

```text
Dandelion gives users surgical control over what enters the model's working context.
```

Or:

```text
Dandelion is a context editor for AI conversations: branch to explore, graft to admit, choose when context conflicts.
```

Two sharper front-door lines to test:

- "See and edit what the model is reasoning over."
- "Stop the model from confidently merging contradictions."

## Distinction From Adjacent Tools

The nearby category is crowded with branching chat apps, visual chat trees, infinite canvases, model playgrounds, and Git-style conversation histories. Dandelion should not try to win by having a prettier tree, more branches, or a more impressive canvas.

The hard distinction:

```text
Other tools manage conversation paths.
Dandelion manages context admission.
```

In branching chat, the branch is the product object.
In Dandelion, the admitted context state is the product object.

This is closer to editing the model's working memory than organizing a conversation archive. A plant can be useful, visible, and recoverable without being admitted. A graft is not "bring this chat back"; it is "let this specific work influence future reasoning." A conflict is not something to smooth over; it is a sign that memory admission needs a human decision.

That distinction should shape product decisions:

- Branching is valuable only when it creates candidate context the user can accept or reject.
- A merge is valuable only when it changes the trunk's admitted context state.
- A canvas is valuable only when it clarifies provenance, exclusion, conflict, or admission.
- Model choice is valuable only when different models become scoped probes feeding one controlled trunk.
- Saved trees are valuable only when they preserve reusable context states, not just archives.
- Undo is valuable because context edits should feel reversible, not because history is decorative.

This also keeps Dandelion from becoming an engineer-only product. The universal job is not version control. It is helping people keep useful thinking, leave dead ends behind, and decide what their AI should remember next.

## Priority Sequence

The risk is shipping a slightly better branching-chat tool dressed in editor language. The next product moves should make "context editor" load-bearing instead of decorative.

### 1. Ship The Context Inspector First

Without it, "context as object" is invisible. With it, Dandelion becomes a product where users can see what the model is reasoning over and which admitted segments make up the trunk.

The inspector should show the main thread's current context as admitted segments, with origin tags such as root, main turn, and grafted plant.

### 2. Then Ship Context-State Diff

A diff between context states before and after a graft makes "edit" a concrete verb instead of a metaphor.

The user should be able to see exactly what changed in the trunk's working context. This is the modulation gesture made legible.

### 3. Keep Brand Vocabulary, But Watch The Trap

Plants and grafting are brand assets. Keep them unless the cost becomes obvious.

Be more careful with generic branch/fork language. Those words pull Dandelion back toward the crowded branching-chat category. Use them when explaining mechanics; avoid making them the headline.

The internal string `material_conflict` should not ship to users. Surface it as plain language, such as "the plants disagree" or "these paths conflict."

## Product Guardrails

- Do not make branching the whole product. Branching is a means to context modulation.
- Do not treat every side thread as future context. Admission must be explicit.
- Do not let the model decide away material conflict. The app routes; the user chooses.
- Do not optimize for maximal graph complexity. Optimize for a calm trunk workflow.
- Do not hide excluded work. It should remain recoverable without polluting the trunk.
- Do not call a branch "merged" unless the trunk's future context actually changes.

## Competitive Frame

Other tools cluster around branching chat, visual trees, side-by-side comparison, model comparison, or Git-style versioning. Dandelion can borrow good interface ideas from them, but its north star is different:

```text
They help users manage conversation paths.
Dandelion helps users modulate context.
```
