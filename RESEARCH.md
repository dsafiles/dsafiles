# DSA Files research guide

## Purpose

This public library creates a durable, citation-first factual record. It is not a collection of talking points and it is not an extension of any organization's own account.

Every commit and pull request in this repository is public. Do not use it for private notes, restricted evidence, credentials, personal contact information, or unpublished source artifacts.

## Core standards

1. Every consequential factual claim needs a nearby citation.
2. Primary records, court and government records, institutional archives, and contemporaneous reporting take priority.
3. Organizational self-history is evidence of that organization's account, not neutral adjudication.
4. Preserve conflicting evidence, uncertainty, scope limits, and facts that complicate the narrative.
5. Distinguish documented fact, allegation, reported claim, official attribution, adjudicated finding, inference, analysis, and opinion.
6. Never invent or silently repair evidence.
7. Describe the exact relationship between people, organizations, and events. Do not infer responsibility from proximity.

## Repository structure

- `events/YYYY-MM-DD-Event-Name.md`
- `orgs/YYYY-MM-DD-Org-Name.md`
- `people/YYYY-MM-DD-Lastname-Firstname.md`
- Root-level `YYYY-MM-DD-Topic-Name.md` for cross-cutting research

The leading date records when the research file was first created. Keep the filename stable when improving an existing record.

`publication.json` is the machine-readable publication contract. It assigns the stable public route, exact published sections, evidence types, and public-safe footnote identities. `evaluations/` contains the questions that the deployed search and answer system must handle for the published record.

## Required dossier structure

Each dossier should include:

1. Title, created date, last-reviewed date, status, scope, and explicit exclusions.
2. An executive summary with the most important qualifications.
3. Findings organized by clear headings.
4. A timeline when chronology matters.
5. Exact roles and relationships between relevant people and organizations.
6. Disputed, ambiguous, or easily overstated claims.
7. Research gaps and unresolved questions.
8. Stable claim-level footnotes.

Use Markdown footnotes with descriptive identifiers:

```markdown
The convention met in Detroit in March 1982.[^merger-issue]

[^merger-issue]: Michael Harrington, ed., *Democratic Left*, Vol. X, No. 3, March 1982, [public PDF](https://example.org/source.pdf).
```

Use short quotations only when the exact wording matters. Otherwise paraphrase accurately. Identify pages, sections, timestamps, docket entries, or archival identifiers when available.

## Evidence files

Do not commit downloaded source artifacts. This includes PDFs, HTML captures, images, spreadsheets, archives, audio, and video. A public URL or bibliographic citation is the normal evidence link.

Public datasets require a separate review for provenance, field necessity, privacy, redistribution rights, and documentation. The repository blocks `data/` until that review process exists.

## Review checklist

- Every consequential claim has a citation that supports the exact wording.
- Important links open and point to the specific source.
- Names, dates, quotations, roles, and relationship language are verified.
- Qualifications, disputes, counterevidence, and gaps remain visible.
- No local path, credential, account identifier, personal contact detail, or private evidence appears.
- No downloaded artifact or unreviewed dataset is included.
- `publication.json` describes every merged dossier exactly once.
- Retrieval and answer evaluations cover the new or changed record.
- The change passes the public research validator.

## Publication workflow

Opening a pull request does not publish a record. Merging it into protected `main` does.

After merge, the private website repository automatically pins that exact public commit. Its CI builds the first-party research pages and private search packets from this repository, verifies that the public page is live, evaluates retrieval and generated answers, and promotes the immutable corpus release only after those checks pass. There is no second per-dossier approval list in the private repository.
