import test from "node:test";
import assert from "node:assert/strict";

import {
  filterAttachments,
  filterGraftPlants,
  filterMainConv,
  filterParentContext,
} from "../prototype/mute-filters.mjs";

test("mute filters omit muted files and root context", () => {
  assert.deepEqual(
    filterAttachments([
      { status: "ready", fileId: "file_keep", mediaType: "image/png" },
      { status: "ready", fileId: "file_mute", mediaType: "text/plain", muted: true },
      { status: "uploading", fileId: "file_wait", mediaType: "application/pdf" },
    ]),
    [{ file_id: "file_keep", kind: "image" }],
  );

  assert.equal(filterParentContext({ parentContext: "root" }), "root");
  assert.equal(filterParentContext({ parentContext: "root", parentContextMuted: true }), null);
});

test("filterMainConv excludes the pending turn and muted context", () => {
  const keepPlant = { id: "keep" };
  const mutedPlant = { id: "mute", muted: true };
  const state = {
    mainConv: [
      { kind: "user", text: "kept question" },
      { kind: "assistant", id: "a1", text: "kept answer" },
      { kind: "user", text: "muted question", muted: true },
      { kind: "assistant", id: "a2", text: "muted answer", muted: true },
      { kind: "graft-marker", id: "g1", plants: [keepPlant, mutedPlant] },
      { kind: "conflict-choice", id: "c1", resolved: { index: 0 }, choices: ["keep"] },
      { kind: "user", text: "active prompt" },
      { kind: "assistant", id: "active", text: "streaming" },
    ],
  };

  const filtered = filterMainConv(state, { excludeAssistantId: "active" });
  assert.deepEqual(filtered.map((item) => item.id || item.text), [
    "kept question",
    "a1",
    "g1",
    "c1",
  ]);
  assert.deepEqual(filtered.find((item) => item.id === "g1").plants, [keepPlant]);
});

test("filterMainConv stops after a branched assistant and filters graft plants", () => {
  const state = {
    mainConv: [
      { kind: "user", text: "root" },
      { kind: "assistant", id: "root-answer", text: "root answer" },
      { kind: "user", text: "later" },
      { kind: "assistant", id: "later-answer", text: "later answer" },
    ],
  };

  assert.deepEqual(
    filterMainConv(state, { stopAssistantId: "root-answer" }).map((item) => item.id || item.text),
    ["root", "root-answer"],
  );
  assert.deepEqual(filterGraftPlants([{ id: "live" }, { id: "muted", muted: true }]), [{ id: "live" }]);
});
