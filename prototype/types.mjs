// JSDoc typedefs for the shared `state` object passed between modules.
// Pure documentation: this file ships zero runtime code, just exports a
// no-op so editors recognize the type definitions and surface them on
// import. Add fields here as new modules start reading them.

/**
 * @typedef {Object} ModelSelection
 * @property {string} id           Composite identifier ("anthropic:claude-...").
 * @property {string} label        Human-facing name (shown in the picker).
 * @property {"local"|"cloud"} kind
 * @property {"anthropic"|"ollama"|string} provider
 * @property {string} model        Provider-specific model string.
 */

/**
 * One uploaded file in the session. Lives on `state.sessionFiles`.
 * @typedef {Object} SessionFile
 * @property {number} localId      Stable client-side id (for dedup before upload completes).
 * @property {string} name         Filename shown to the user.
 * @property {string} mediaType    MIME type (drives document vs image block).
 * @property {number} size         Bytes (informational).
 * @property {"uploading"|"ready"|"error"} status
 * @property {string} [fileId]     Anthropic `file_id` once upload succeeds.
 * @property {boolean} [muted]     Toggled from the inspector — kept in view, withheld from wire.
 */

/**
 * A user turn in the main thread. Lives in `state.mainConv`.
 * @typedef {Object} UserItem
 * @property {"user"} kind
 * @property {string} text
 * @property {string[]} [mutedSnapshot] Names of segments muted at send time.
 * @property {boolean} [muted]     Trunk-mute flag (paired with the assistant).
 */

/**
 * An assistant turn. Streaming → status === "streaming" until complete.
 * @typedef {Object} AssistantItem
 * @property {"assistant"} kind
 * @property {string} id
 * @property {string} text
 * @property {"streaming"|"complete"|"error"} [status]
 * @property {string} [modelLabel]
 * @property {boolean} [muted]     Trunk-mute flag (paired with the user).
 */

/**
 * Inserted after a graft. Stores the plants that were folded in.
 * @typedef {Object} GraftMarkerItem
 * @property {"graft-marker"} kind
 * @property {string} id
 * @property {Plant[]} plants
 * @property {{kind: string, pending?: boolean}} [route]
 */

/**
 * Inserted when a graft was classified as a material conflict. The user
 * resolves it by picking a stance.
 * @typedef {Object} ConflictChoiceItem
 * @property {"conflict-choice"} kind
 * @property {string} id
 * @property {string[]} choices
 * @property {string} summary
 * @property {{index: number}} [resolved]
 * @property {boolean} [muted]
 */

/** @typedef {UserItem|AssistantItem|GraftMarkerItem|ConflictChoiceItem} ConvItem */

/**
 * A seed (plant) — independent investigation thread.
 * @typedef {Object} Plant
 * @property {string} id
 * @property {string} title
 * @property {string} [fullPrompt]
 * @property {string} [parentMessageId]  Assistant id this plant was branched off.
 * @property {Array<{id: string, user: string, asst: string, status: string}>} turns
 * @property {string} composerDraft
 * @property {"idle"|"running"|"complete"} status
 * @property {boolean} selected
 * @property {ModelSelection} [model]
 * @property {boolean} [muted]
 * @property {string} [_graftedKey]
 */

/**
 * The single shared mutable state object that all modules read and write.
 * Bootstrap code in prototype.html (will be `prototype/bootstrap.mjs` after
 * task #5) constructs it and hands it to every factory.
 *
 * Helper functions (`getAttachments`, `getParentContext`,
 * `parentContextMessagesForMainTurn`, `parentContextMessagesForPlant`) are
 * installed by the host so feature modules can pull mute-aware payloads
 * without re-implementing the filter logic.
 *
 * @typedef {Object} AppState
 * @property {string|null} parentContext
 * @property {boolean} parentContextMuted
 * @property {ConvItem[]} mainConv
 * @property {Plant[]} plants
 * @property {string|null} activePlantId
 * @property {number} nextId
 * @property {boolean} postGraftArmed
 * @property {ModelSelection} currentModel
 * @property {ModelSelection[]} availableModels
 * @property {SessionFile[]} sessionFiles
 * @property {Object} graph                 Shadow DAG state from graph.mjs.
 * @property {() => import("./mute-filters.mjs").Attachment[]} [getAttachments]
 * @property {() => (string|null)} [getParentContext]
 * @property {(assistantItem: AssistantItem) => Array<{role: string, content: string}>} [parentContextMessagesForMainTurn]
 * @property {(plant: Plant) => Array<{role: string, content: string}>} [parentContextMessagesForPlant]
 */

// No runtime export — this module is types-only. The empty default keeps
// `import "./types.mjs"` legal in case anyone wants the side effect of
// pulling these typedefs into a file's scope for the editor.
export default {};
