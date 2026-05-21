# Merge Router

When selected plants are grafted into the main thread, Dandelion routes the result before asking the model to continue.

## Route Types

```text
additional_context
  Compatible information. Continue normally with expanded context.

material_conflict
  Any real tension between plants. Ask the user which stance to follow.
```

Dandelion deliberately uses only two routes. An earlier `soft_disagreement` route — meant for plants that differed in emphasis but could be integrated — was removed because the soft / material boundary was unreliable for both heuristic and small-model classifiers, and a tension the model can't confidently call as compatible should surface to the user as a choice rather than be silently merged.

## Rule

The model may help classify, but the app owns the UI behavior.

For `material_conflict`, do not ask the model to force a synthesis. Render a choice UI.

## Examples

```text
Data model + UI flow + eval plan
=> additional_context

Rough prototype + polished enough to test feel
=> material_conflict   (real direction choice; surface to user)

Multi-provider day one + one provider first
=> material_conflict
```
