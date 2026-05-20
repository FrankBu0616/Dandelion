# Merge Router

When selected side strands are woven into the main thread, Dandelion routes the result before asking the model to continue.

## Route Types

```text
additional_context
  Compatible information. Continue normally with expanded context.

soft_disagreement
  Different emphasis, but one combined next action is possible.

material_conflict
  Incompatible next actions. Ask the user which stance to follow.
```

## Rule

The model may help classify, but the app owns the UI behavior.

For `material_conflict`, do not ask the model to force a synthesis. Render a choice UI.

## Examples

```text
Data model + UI flow + eval plan
=> additional_context

Rough prototype + polished enough to test feel
=> soft_disagreement

Multi-provider day one + one provider first
=> material_conflict
```
