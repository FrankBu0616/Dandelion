# Data Model

Dandelion has two layers of state: an in-memory **app state** that
prototype/bootstrap.mjs constructs at startup, and a **persisted snapshot**
written to disk (localStorage + `./sessions/<id>.json`). The persisted
schema is canonical-graph-plus-derivable-views — the graph is the
structural source of truth; the trunk/plants arrays are stored verbatim
today to avoid the reconstructor lift, and will be rebuildable from the
graph in a later refactor.

JSDoc typedefs for the runtime shapes live in `prototype/types.mjs`.

## Runtime: in-memory shape

```text
state {
  parentContext        : string | null   // session-level scaffold
  parentContextMuted   : boolean         // routed via filterParentContext
  mainConv             : ConvItem[]      // trunk turns + graft markers
  plants               : Plant[]         // active seed tray
  activePlantId        : string | null
  postGraftArmed       : boolean
  sessionFiles         : SessionFile[]   // attachments riding every send
  nextId               : number
  currentModel         : ModelSelection
  availableModels      : ModelSelection[]
  graph                : ShadowGraph     // shadow DAG (see graph.mjs)
  // host-installed helpers (mute-aware payload accessors)
  getAttachments?      : () => Attachment[]
  getParentContext?    : () => string | null
  parentContextMessagesForMainTurn?(item) : Message[]
  parentContextMessagesForPlant?(plant)   : Message[]
}
```

A `ConvItem` is one of: `UserItem`, `AssistantItem`, `GraftMarkerItem`,
`ConflictChoiceItem` (see `prototype/types.mjs`).

## Shadow DAG (graph.mjs)

```text
chat node
  one parent
  prompt + response
  thread: "main" | "plant"
  plantId: string | null   // set when thread === "plant"

plant node
  one parent (forks off the main-thread leaf at creation time)
  title

merge node
  many parents (one per grafted plant tip)
  route classification
  becomes the new main-thread leaf
```

The graph mirrors every mainConv / plants mutation. Edges carry one of
`next` | `fork` | `merged-into`.

## Persisted snapshot (schemaVersion 1)

```text
{
  schemaVersion: 1,
  meta: { id, title, createdAt, updatedAt },
  graph:                  graph.toJSON()       // canonical structure
  mainConv,                                    // verbatim trunk items
  plants,                                      // verbatim seed tray
  activePlantId,
  postGraftArmed,
  sessionFiles,                                // file_id refs only —
                                               // bytes live in the
                                               // Anthropic workspace
  parentContext,
  parentContextMuted,
  currentModelSelection: { provider, model },
  nextId,
}
```

The same snapshot shape goes to both stores:

- `localStorage["dandelion:session:<id>"]`  (per-browser cache)
- `./sessions/<id>.json` via `/api/sessions/:id`  (cross-browser truth)

`localStorage["dandelion:index"]` carries a recent-first array of
`{id, title, updatedAt}` (capped at 30 entries).

## Production direction

Same shape, different transport:

```text
SQLite tables (conceptual)
  sessions(id, title, created_at, updated_at, schema_version, blob)
  nodes(session_id, id, kind, ...)
  edges(session_id, from, to, kind)
  api_keys(provider, key)
```

Context is computed from the graph at request time, not stored as one
big string. Snapshots are the durable artifact for replay / fork-from-
prior-state.
