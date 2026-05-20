# Data Model

Future storage is a DAG.

```text
chat node
  one parent
  prompt + response

merge node
  many parents
  no prompt
  no response
  structural context pooling
```

Minimal tables:

- `sessions`
- `nodes`
- `edges`
- `api_keys`

Context is computed from the graph, not stored as one big string.
