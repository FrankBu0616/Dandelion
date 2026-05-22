// Tests for seedTurnsToMessages in prototype/plants.mjs — the helper
// that turns a seed's prior turns into chat-shape context messages for
// the next /api/chat request. Owns the "seed remembers its own prior
// turns, not other seeds' turns" invariant.

import { test } from "node:test";
import assert from "node:assert/strict";

import { seedTurnsToMessages } from "../prototype/plants.mjs";

test("seedTurnsToMessages: empty / non-array inputs return []", () => {
  assert.deepEqual(seedTurnsToMessages(undefined), []);
  assert.deepEqual(seedTurnsToMessages(null), []);
  assert.deepEqual(seedTurnsToMessages([]), []);
});

test("seedTurnsToMessages: round-trips completed turns user→assistant", () => {
  const turns = [
    { id: "t1", user: "first q", asst: "first a", status: "complete" },
    { id: "t2", user: "second q", asst: "second a", status: "complete" },
  ];
  assert.deepEqual(seedTurnsToMessages(turns), [
    { role: "user", content: "first q" },
    { role: "assistant", content: "first a" },
    { role: "user", content: "second q" },
    { role: "assistant", content: "second a" },
  ]);
});

test("seedTurnsToMessages: excludes the in-flight turn matched by currentTurnId", () => {
  // This is exactly the shape the streaming send path constructs: a
  // new turn is pushed with status "streaming" before the request fires,
  // and its user text is sent as the request's `prompt` field. It must
  // NOT also appear in contextMessages.
  const turns = [
    { id: "t1", user: "older q", asst: "older a", status: "complete" },
    { id: "t2", user: "current q", asst: "", status: "streaming" },
  ];
  assert.deepEqual(seedTurnsToMessages(turns, "t2"), [
    { role: "user", content: "older q" },
    { role: "assistant", content: "older a" },
  ]);
});

test("seedTurnsToMessages: skips assistant side while it's still streaming", () => {
  // If somehow a non-current streaming turn exists (e.g. concurrency
  // bug), we still omit its half-written assistant text. The user side
  // is admitted because it's already complete from the user's side.
  const turns = [
    { id: "t1", user: "q", asst: "partial...", status: "streaming" },
  ];
  assert.deepEqual(seedTurnsToMessages(turns), [
    { role: "user", content: "q" },
  ]);
});

test("seedTurnsToMessages: trims whitespace and drops empty strings", () => {
  const turns = [
    { id: "t1", user: "   ", asst: "real answer", status: "complete" },
    { id: "t2", user: "real q", asst: "   ", status: "complete" },
    { id: "t3", user: "", asst: "", status: "complete" },
  ];
  assert.deepEqual(seedTurnsToMessages(turns), [
    { role: "assistant", content: "real answer" },
    { role: "user", content: "real q" },
  ]);
});

test("seedTurnsToMessages: tolerates malformed entries", () => {
  const turns = [
    null,
    undefined,
    { id: "good", user: "u", asst: "a", status: "complete" },
    { id: "no-fields" },
  ];
  assert.deepEqual(seedTurnsToMessages(turns), [
    { role: "user", content: "u" },
    { role: "assistant", content: "a" },
  ]);
});
