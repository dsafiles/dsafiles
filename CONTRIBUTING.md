# Contributing

Thank you for helping improve the DSA Files public record.

## Before you submit

1. Read `RESEARCH.md`.
2. Search existing issues and research files.
3. Keep the change narrow and explain what the evidence establishes.
4. Add citations next to every consequential factual change.
5. Preserve qualifications, conflicting evidence, and uncertainty.
6. Add or update the record in `publication.json` and add meaningful retrieval and answer cases under `evaluations/`.
7. Run `node scripts/validate-public-research.mjs` and `node --test tests/*.test.mjs`.

## What happens after review

A pull request is a proposal. A merge into protected `main` is the project's editorial publication decision.

The website automatically consumes the exact merged research commit, builds the readable research page and private search packets from the same record, runs the evaluation gates, and promotes the new corpus only if every gate passes. Contributors do not need access to the private website repository, Cloudflare, or deployment credentials.

CI will reject a research pull request unless:

- every dossier appears exactly once in `publication.json`;
- its approved sections and stable citation identities match the Markdown;
- its public evidence links are safe;
- it includes positive retrieval and answer evaluations; and
- the complete public-boundary validator passes.

## Public and licensed submission

Issues, branches, commits, and pull requests are public. Remove private information before submitting.

By contributing original text, code, tests, documentation, or other project material, you agree to release that contribution under CC0 1.0 Universal. Do not submit material you do not have permission to redistribute.

Do not upload source PDFs, screenshots, web captures, spreadsheets, archives, images, audio, or video. Link to a safe public source instead.

## Pull request description

Explain:

- what changed;
- which claims or gaps it addresses;
- the strongest supporting sources;
- material uncertainty or conflicting evidence; and
- whether any existing conclusion became weaker or changed.

Also explain which questions the new retrieval and answer evaluations cover.

Review may request narrower language, stronger evidence, or additional context. That is normal for a citation-first record.
