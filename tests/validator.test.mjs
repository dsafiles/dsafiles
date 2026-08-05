import assert from "node:assert/strict";
import test from "node:test";
import { markdownLinkTargets, scanText, validateLinkTarget } from "../scripts/validate-public-research.mjs";

test("accepts ordinary public research text", () => {
  assert.deepEqual(scanText("events/example.md", "A supported claim.[^source]\n\n[^source]: [Record](https://example.org/record)"), []);
});

test("rejects local paths, credentials, and non-project email", () => {
  assert.equal(scanText("events/example.md", `file:${"//"}/tmp/source.pdf`).length, 1);
  assert.equal(scanText("events/example.md", `/${"Users"}/example/source.pdf`).length, 1);
  assert.equal(scanText("events/example.md", `-----BEGIN ${"PRIVATE KEY"}-----`).length, 1);
  assert.equal(scanText("events/example.md", `person${"@"}example.org`).length, 1);
  assert.equal(scanText("events/example.md", `eyJ${"abcdefgh"}.${"abcdefgh"}.${"abcdefgh"}`).length, 1);
});

test("extracts and validates Markdown links", () => {
  const targets = markdownLinkTargets("[Public](https://example.org/record) and [local](../README.md)");
  assert.deepEqual(targets, ["https://example.org/record", "../README.md"]);
  assert.deepEqual(validateLinkTarget("events/example.md", targets[0], new Set()), []);
  assert.deepEqual(validateLinkTarget("events/example.md", targets[1], new Set(["README.md"])), []);
});

test("rejects missing, private, and unsafe Markdown links", () => {
  const known = new Set(["README.md"]);
  assert.equal(validateLinkTarget("events/example.md", `../${"artifacts"}/record.pdf`, known).length, 2);
  assert.equal(validateLinkTarget("events/example.md", "../private/source.txt", known).length, 2);
  assert.equal(validateLinkTarget("events/example.md", "../missing.md", known).length, 1);
  assert.equal(validateLinkTarget("events/example.md", `file:${"//"}/tmp/source.pdf`, known).length, 1);
});
