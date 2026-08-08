import assert from "node:assert/strict";
import test from "node:test";
import {
  markdownLinkTargets,
  scanText,
  validateEvaluations,
  validateLinkTarget,
  validatePublicationContract
} from "../scripts/validate-public-research.mjs";

const dossier = `# Example record

- **Created:** 2026-08-01
- **Last reviewed:** 2026-08-02
- **Publication date:** 2026-08-02
- **Status:** publication candidate
- **Scope:** A bounded example.
- **Explicit exclusions:** Everything outside the example.

## Finding

The record establishes the example.[^record]

[^record]: [Original record](https://example.org/record)
`;

const source = {
  source_id: "example-record",
  input_path: "events/2026-08-01-Example.md",
  title: "Example record",
  description: "A bounded example record used by the validator test.",
  canonical_url: "https://dsafiles.com/research/example-record/",
  publication_date: "2026-08-02",
  source_type: "dossier",
  sections: [{ section_id: "finding", heading_path: ["Finding"], mode: "content", evidence_types: ["documented-fact"] }],
  footnotes: { record: { source_type: "primary-record", representation: "external", primary_url: "https://example.org/record" } }
};

test("accepts ordinary public research text", () => {
  assert.deepEqual(scanText("events/example.md", "A supported claim.[^source]\n\n[^source]: [Record](https://example.org/record)"), []);
});

test("rejects local paths, credentials, and non-project email", () => {
  assert.equal(scanText("events/example.md", `file:${"//"}/tmp/source.pdf`).length, 1);
  assert.equal(scanText("events/example.md", `/${"Users"}/example/source.pdf`).length, 1);
  assert.equal(scanText("events/example.md", `-----BEGIN ${"PRIVATE KEY"}-----`).length, 1);
  assert.equal(scanText("events/example.md", `person${"@"}example.org`).length, 1);
  assert.equal(scanText("events/example.md", `eyJ${"abcdefgh"}.${"abcdefgh"}.${"abcdefgh"}`).length, 1);
  assert.equal(scanText("events/example.md", `cfat_${"a".repeat(32)}`).length, 1);
  assert.equal(scanText("events/example.md", "a".repeat(64)).length, 1);
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

test("accepts a complete publication contract and evaluation coverage", () => {
  const contract = validatePublicationContract({ schema_version: 3, sources: [source] }, new Map([[source.input_path, dossier]]));
  assert.deepEqual(contract.errors, []);
  assert.deepEqual(validateEvaluations(
    `${JSON.stringify({ id: "example-retrieval", query: "What does the example establish?", expected_source_ids: [source.source_id], expected_section_ids: ["finding"] })}\n`,
    `${JSON.stringify({ id: "example-answer", question: "What does the example establish?", expected_source_ids: [source.source_id], expected_section_ids: ["finding"] })}\n`,
    contract.sourceIds,
    contract.sectionIds
  ), []);
});

test("rejects a merged dossier omitted from publication and missing eval coverage", () => {
  const omitted = "people/2026-08-01-Omitted.md";
  const contract = validatePublicationContract({ schema_version: 3, sources: [source] }, new Map([[source.input_path, dossier], [omitted, dossier]]));
  assert.match(contract.errors.join("\n"), /every merged dossier must appear exactly once/);
  assert.match(validateEvaluations("", "", contract.sourceIds, contract.sectionIds).join("\n"), /positive retrieval evaluation/);
});

test("rejects private-style publication metadata and unknown evaluation identities", () => {
  const invalid = { ...source, input_path: "../private/example.md", canonical_url: "https://example.org/wrong/" };
  const contract = validatePublicationContract({ schema_version: 3, sources: [invalid] }, new Map([[source.input_path, dossier]]));
  assert.match(contract.errors.join("\n"), /input_path must be a repository dossier path/);
  assert.match(contract.errors.join("\n"), /canonical_url does not match source_id/);
  assert.match(validateEvaluations(
    `${JSON.stringify({ id: "unknown", query: "Question", expected_source_ids: ["missing"] })}\n`,
    "",
    new Set([source.source_id]),
    new Map([[source.source_id, new Set(["finding"])]])
  ).join("\n"), /unknown source_id missing/);
});

test("rejects private-network evidence URLs and unscoped section expectations", () => {
  const privateUrl = {
    ...source,
    footnotes: { record: { source_type: "primary-record", representation: "external", primary_url: "https://127.0.0.1/record" } }
  };
  assert.match(validatePublicationContract({ schema_version: 3, sources: [privateUrl] }, new Map([[source.input_path, dossier]])).errors.join("\n"), /safe HTTPS URL/);
  const contract = validatePublicationContract({ schema_version: 3, sources: [source] }, new Map([[source.input_path, dossier]]));
  assert.match(validateEvaluations(
    `${JSON.stringify({ id: "unscoped", query: "Question", expected_section_ids: ["finding"] })}\n`,
    `${JSON.stringify({ id: "answer", question: "Question", expected_source_ids: [source.source_id], expected_section_ids: ["finding"] })}\n`,
    contract.sourceIds,
    contract.sectionIds
  ).join("\n"), /section expectations require exactly one expected_source_id/);
  assert.match(validateEvaluations(
    `${JSON.stringify({ id: "retrieval", query: "Question", expected_source_ids: [source.source_id], expected_section_ids: ["finding"] })}\n`,
    `${JSON.stringify({ id: "answer", question: "Question", expected_source_ids: [source.source_id], forbidden_section_ids: ["missing"] })}\n`,
    contract.sourceIds,
    contract.sectionIds
  ).join("\n"), /forbidden sections require exactly one forbidden_source_id/);
});
