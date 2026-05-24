import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { publicStaticPath } from "../scripts/server/static-files.mjs";

const ROOT = "/tmp/dandelion";

test("publicStaticPath admits the prototype shell and public asset roots", () => {
  assert.equal(publicStaticPath(ROOT, "/index.html"), join(ROOT, "index.html"));
  assert.equal(
    publicStaticPath(ROOT, "/prototype/styles/main-thread.css"),
    join(ROOT, "prototype/styles/main-thread.css"),
  );
  assert.equal(
    publicStaticPath(ROOT, "/brand/logos/dandelion.svg"),
    join(ROOT, "brand/logos/dandelion.svg"),
  );
});

test("publicStaticPath blocks repo-root secrets and server state", () => {
  assert.equal(publicStaticPath(ROOT, "/.env"), null);
  assert.equal(publicStaticPath(ROOT, "/README.md"), null);
  assert.equal(publicStaticPath(ROOT, "/sessions/private.json"), null);
  assert.equal(publicStaticPath(ROOT, "/scripts/providers.mjs"), null);
});

test("publicStaticPath blocks traversal out of public asset roots", () => {
  assert.equal(publicStaticPath(ROOT, "/prototype/../.env"), null);
  assert.equal(publicStaticPath(ROOT, "/prototype/%2e%2e/.env"), null);
  assert.equal(publicStaticPath(ROOT, "/brand/%2e%2e/sessions/private.json"), null);
});
