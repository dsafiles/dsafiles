import { lstat, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { isIP } from "node:net";
import { extname, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectEmail = "team@dsafiles.com";

const allowedRootFiles = new Set([
  ".gitignore",
  "AGENTS.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "LICENSE-SCOPE.md",
  "README.md",
  "RESEARCH.md",
  "SECURITY.md",
  "publication.json",
  "publication.schema.json"
]);

const allowedExactFiles = new Set([
  ".github/pull_request_template.md",
  ".github/workflows/validate.yml",
  "scripts/validate-public-research.mjs",
  "tests/validator.test.mjs",
  "evaluations/retrieval.jsonl",
  "evaluations/answers.jsonl"
]);

const evidenceTypes = new Set([
  "documented-fact", "allegation", "reported-claim", "opinion", "inference",
  "official-attribution", "adjudicated-finding", "qualification", "dispute", "uncertainty"
]);
const sourceTypes = new Set(["dossier", "timeline", "source-register", "structured-evidence"]);
const footnoteSourceTypes = new Set([
  "primary-record", "institutional-archive", "contemporaneous-reporting", "scholarship",
  "retrospective-reporting", "organizational-retrospective", "commentary"
]);

const blockedPatterns = [
  { label: "macOS home path", pattern: /\/Users\/[A-Za-z0-9._-]+\// },
  { label: "Linux home path", pattern: /\/home\/[A-Za-z0-9._-]+\// },
  { label: "Windows home path", pattern: /[A-Za-z]:\\Users\\[^\\]+\\/i },
  { label: "local file URL", pattern: /file:\/\//i },
  { label: "unencrypted web URL", pattern: /http:\/\//i },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { label: "Cloudflare API token", pattern: /\bcfat_[A-Za-z0-9_-]{20,}\b/ },
  { label: "credential-shaped 32-byte hex value", pattern: /\b[a-f0-9]{64}\b/i },
  { label: "credential-shaped 16-byte hex value", pattern: /\b[a-f0-9]{32}\b/i },
  { label: "AWS-style access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "JWT-shaped value", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { label: "bearer credential", pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}/i },
  { label: "account identifier assignment", pattern: /\baccount[_ -]?id\s*[:=]\s*[A-Za-z0-9_-]{8,}/i },
  { label: "private tooling path", pattern: /(?:^|[\\/])\.(?:ssh|codex)(?:[\\/]|$)/i }
];

function isResearchDossier(path) {
  return /^(?:events|orgs|people)\/\d{4}-\d{2}-\d{2}-[^/]+\.md$/.test(path)
    || /^\d{4}-\d{2}-\d{2}-[^/]+\.md$/.test(path);
}

function isAllowedPath(path) {
  return allowedRootFiles.has(path) || allowedExactFiles.has(path) || isResearchDossier(path);
}

export function scanText(path, text) {
  const errors = [];
  for (const { label, pattern } of blockedPatterns) {
    if (pattern.test(text)) errors.push(`${path}: contains ${label}`);
  }

  const emails = [...text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)].map((match) => match[0].toLowerCase());
  for (const email of new Set(emails)) {
    if (email !== projectEmail) errors.push(`${path}: contains non-project email address`);
  }
  return errors;
}

export function markdownLinkTargets(text) {
  return [...text.matchAll(/!?\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g)].map((match) => match[1]);
}

export function validateLinkTarget(path, target, knownFiles) {
  const errors = [];
  if (target.startsWith("#")) return errors;
  if (target === `mailto:${projectEmail}`) return errors;

  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) {
    if (!target.startsWith("https://")) errors.push(`${path}: unsafe link scheme in ${target}`);
    else {
      try { new URL(target); } catch { errors.push(`${path}: invalid external URL ${target}`); }
    }
    return errors;
  }

  const withoutFragment = target.split("#", 1)[0].split("?", 1)[0];
  let decoded;
  try { decoded = decodeURIComponent(withoutFragment); } catch { return [`${path}: invalid encoded local link ${target}`]; }
  const normalized = posix.normalize(posix.join(posix.dirname(path), decoded));
  if (normalized === ".." || normalized.startsWith("../")) errors.push(`${path}: local link escapes the repository: ${target}`);
  if (normalized.split("/").some((segment) => segment === "artifacts" || segment === "data" || segment === "private")) {
    errors.push(`${path}: local link enters a blocked public path: ${target}`);
  }
  if (!knownFiles.has(normalized)) errors.push(`${path}: local link target does not exist: ${target}`);
  return errors;
}

function dossierErrors(path, text) {
  const errors = [];
  if (!/^#\s+\S+/m.test(text)) errors.push(`${path}: missing title heading`);
  if (!/^- \*\*Created:\*\* \d{4}-\d{2}-\d{2}$/m.test(text)) errors.push(`${path}: missing exact Created metadata`);
  if (!/^- \*\*Last reviewed:\*\* \d{4}-\d{2}-\d{2}$/m.test(text)) errors.push(`${path}: missing exact Last reviewed metadata`);
  if (!/^- \*\*Publication date:\*\* \d{4}-\d{2}-\d{2}$/m.test(text)) errors.push(`${path}: missing exact Publication date metadata`);
  if (!/^- \*\*Status:\*\* (?:initial|developing|substantially researched|publication candidate)$/m.test(text)) errors.push(`${path}: missing allowed Status metadata`);
  if (!/^- \*\*Scope:\*\* \S+/m.test(text)) errors.push(`${path}: missing Scope metadata`);
  if (!/^- \*\*Explicit exclusions:\*\* \S+/m.test(text)) errors.push(`${path}: missing Explicit exclusions metadata`);

  const references = new Set([...text.matchAll(/\[\^([A-Za-z0-9][A-Za-z0-9._:-]*)\](?!:)/g)].map((match) => match[1]));
  const definitions = new Set([...text.matchAll(/^\[\^([A-Za-z0-9][A-Za-z0-9._:-]*)\]:/gm)].map((match) => match[1]));
  for (const id of references) if (!definitions.has(id)) errors.push(`${path}: missing footnote definition [^${id}]`);
  for (const id of definitions) if (!references.has(id)) errors.push(`${path}: unused footnote definition [^${id}]`);
  return errors;
}

function exactKeys(value, allowed, label, errors) {
  for (const key of Object.keys(value || {})) if (!allowed.has(key)) errors.push(`${label}: unsupported property ${key}`);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function safeHttps(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && host.includes(".") && !isIP(host) && host !== "localhost"
      && !host.endsWith(".localhost") && !host.endsWith(".local") && !host.endsWith(".internal");
  } catch { return false; }
}

function metadata(text, label) {
  const value = text.match(new RegExp(`^- \\*\\*${label}:\\*\\* (.+)$`, "m"));
  return value?.[1]?.trim();
}

function dossierHeadingPaths(text) {
  const stack = [];
  const paths = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(#{2,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const level = match[1].length;
    stack.length = level - 2;
    stack[level - 2] = match[2].trim();
    paths.add(stack.filter(Boolean).join("\u001f"));
  }
  return paths;
}

export function validatePublicationContract(manifest, dossiers) {
  const errors = [];
  exactKeys(manifest, new Set(["$schema", "schema_version", "sources"]), "publication.json", errors);
  if (manifest?.schema_version !== 3) errors.push("publication.json: schema_version must be 3");
  if (!Array.isArray(manifest?.sources) || !manifest.sources.length) errors.push("publication.json: sources must be a nonempty array");
  const listedPaths = new Set();
  const sourceIds = new Set();
  const sectionIds = new Map();

  for (const [index, source] of (manifest?.sources || []).entries()) {
    const label = `publication.json sources[${index}]`;
    exactKeys(source, new Set(["source_id", "input_path", "title", "description", "canonical_url", "publication_date", "source_type", "sections", "footnotes"]), label, errors);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source?.source_id || "")) errors.push(`${label}: invalid source_id`);
    if (sourceIds.has(source?.source_id)) errors.push(`${label}: duplicate source_id ${source?.source_id}`);
    sourceIds.add(source?.source_id);
    if (!isResearchDossier(source?.input_path || "") || source.input_path.includes("..") || source.input_path.includes("\\")) errors.push(`${label}: input_path must be a repository dossier path`);
    if (listedPaths.has(source?.input_path)) errors.push(`${label}: duplicate input_path ${source?.input_path}`);
    listedPaths.add(source?.input_path);
    if (source?.canonical_url !== `https://dsafiles.com/research/${source?.source_id}/`) errors.push(`${label}: canonical_url does not match source_id`);
    if (typeof source?.title !== "string" || !source.title.trim() || source.title.length > 200) errors.push(`${label}: invalid title`);
    if (typeof source?.description !== "string" || !source.description.trim() || source.description.length > 500) errors.push(`${label}: invalid description`);
    if (!validDate(source?.publication_date)) errors.push(`${label}: invalid publication_date`);
    if (!sourceTypes.has(source?.source_type)) errors.push(`${label}: invalid source_type`);
    const text = dossiers.get(source?.input_path);
    if (!text) {
      errors.push(`${label}: dossier does not exist`);
      continue;
    }
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (title !== source.title) errors.push(`${label}: title does not match dossier H1`);
    if (metadata(text, "Status") !== "publication candidate") errors.push(`${label}: merged dossier Status must be publication candidate`);
    if (metadata(text, "Publication date") !== source.publication_date) errors.push(`${label}: publication_date does not match dossier metadata`);
    const created = metadata(text, "Created");
    const reviewed = metadata(text, "Last reviewed");
    if (![created, reviewed].every(validDate) || created > source.publication_date || source.publication_date > reviewed) errors.push(`${label}: dates must satisfy created <= publication <= last reviewed`);

    if (!Array.isArray(source?.sections) || !source.sections.length) errors.push(`${label}: at least one section is required`);
    const headings = dossierHeadingPaths(text);
    const ids = new Set();
    for (const [sectionIndex, section] of (source?.sections || []).entries()) {
      const sectionLabel = `${label}.sections[${sectionIndex}]`;
      exactKeys(section, new Set(["section_id", "heading_path", "mode", "evidence_types"]), sectionLabel, errors);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section?.section_id || "")) errors.push(`${sectionLabel}: invalid section_id`);
      if (ids.has(section?.section_id)) errors.push(`${sectionLabel}: duplicate section_id`);
      ids.add(section?.section_id);
      if (!Array.isArray(section?.heading_path) || !section.heading_path.length || !headings.has(section.heading_path.join("\u001f"))) errors.push(`${sectionLabel}: heading_path does not exist in dossier`);
      if (!["content", "heading-only"].includes(section?.mode)) errors.push(`${sectionLabel}: invalid mode`);
      if (!Array.isArray(section?.evidence_types) || !section.evidence_types.length || section.evidence_types.some((type) => !evidenceTypes.has(type)) || new Set(section.evidence_types).size !== section.evidence_types.length) errors.push(`${sectionLabel}: invalid evidence_types`);
    }
    sectionIds.set(source.source_id, ids);

    const references = new Set([...text.matchAll(/\[\^([A-Za-z0-9][A-Za-z0-9._:-]*)\](?!:)/g)].map((match) => match[1]));
    if (!source?.footnotes || Array.isArray(source.footnotes) || typeof source.footnotes !== "object") errors.push(`${label}: footnotes must be an object`);
    for (const [id, footnote] of Object.entries(source?.footnotes || {})) {
      const footnoteLabel = `${label}.footnotes.${id}`;
      exactKeys(footnote, new Set(["source_type", "representation", "primary_url", "citation_text"]), footnoteLabel, errors);
      if (!references.has(id)) errors.push(`${footnoteLabel}: identity is not used by the dossier`);
      if (!footnoteSourceTypes.has(footnote?.source_type)) errors.push(`${footnoteLabel}: invalid source_type`);
      if (footnote?.representation === "external") {
        if (!safeHttps(footnote.primary_url)) errors.push(`${footnoteLabel}: external footnote requires a safe HTTPS URL`);
        if (typeof footnote.primary_url === "string" && !text.includes(footnote.primary_url)) errors.push(`${footnoteLabel}: primary_url must appear verbatim in the dossier footnote`);
        if (footnote.citation_text !== undefined) errors.push(`${footnoteLabel}: external footnote cannot override citation_text`);
      } else if (footnote?.representation === "citation-only") {
        if (typeof footnote.citation_text !== "string" || !footnote.citation_text.trim() || footnote.primary_url !== undefined) errors.push(`${footnoteLabel}: citation-only footnote requires only reviewed citation_text`);
      } else errors.push(`${footnoteLabel}: invalid representation`);
    }
    for (const id of references) if (!Object.hasOwn(source?.footnotes || {}, id)) errors.push(`${label}: dossier footnote ${id} is missing from publication contract`);
  }

  for (const path of dossiers.keys()) if (!listedPaths.has(path)) errors.push(`${path}: every merged dossier must appear exactly once in publication.json`);
  for (const path of listedPaths) if (!dossiers.has(path)) errors.push(`${path}: publication.json lists a missing dossier`);
  return { errors, sourceIds, sectionIds };
}

export function parseJsonLines(text, label) {
  const errors = [];
  const values = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try { values.push(JSON.parse(line)); } catch { errors.push(`${label} line ${index + 1}: invalid JSON`); }
  }
  return { errors, values };
}

export function validateEvaluations(retrievalText, answerText, sourceIds, sectionIds) {
  const retrieval = parseJsonLines(retrievalText, "evaluations/retrieval.jsonl");
  const answers = parseJsonLines(answerText, "evaluations/answers.jsonl");
  const errors = [...retrieval.errors, ...answers.errors];
  const ids = new Set();
  const positiveRetrieval = new Set();
  const positiveAnswers = new Set();
  const coveredSections = new Set();
  for (const [kind, cases] of [["retrieval", retrieval.values], ["answer", answers.values]]) {
    for (const item of cases) {
      if (typeof item?.id !== "string" || !item.id) errors.push(`${kind} evaluation: missing id`);
      else if (ids.has(item.id)) errors.push(`${kind} evaluation: duplicate id ${item.id}`);
      else ids.add(item.id);
      if (kind === "retrieval" && (typeof item?.query !== "string" || !item.query.trim())) errors.push(`${item?.id || kind}: missing query`);
      if (kind === "answer" && (typeof item?.question !== "string" || !item.question.trim())) errors.push(`${item?.id || kind}: missing question`);
      for (const sourceId of [...(item?.expected_source_ids || []), ...(item?.forbidden_source_ids || [])]) if (!sourceIds.has(sourceId)) errors.push(`${item?.id || kind}: unknown source_id ${sourceId}`);
      const expectedSources = item?.expected_source_ids || [];
      const expectedSections = [...new Set([...(item?.expected_section_ids || []), ...(item?.expected_any_citation_section_ids || [])])];
      const forbiddenSources = item?.forbidden_source_ids || [];
      const forbiddenSections = item?.forbidden_section_ids || [];
      if (expectedSections.length && expectedSources.length !== 1) errors.push(`${item?.id || kind}: section expectations require exactly one expected_source_id`);
      if (forbiddenSections.length && forbiddenSources.length !== 1) errors.push(`${item?.id || kind}: forbidden sections require exactly one forbidden_source_id`);
      for (const sourceId of expectedSources) {
        for (const sectionId of expectedSections) {
          if (!sectionIds.get(sourceId)?.has(sectionId)) errors.push(`${item?.id || kind}: unknown section_id ${sectionId} for ${sourceId}`);
          else coveredSections.add(`${sourceId}:${sectionId}`);
        }
        if (kind === "retrieval") positiveRetrieval.add(sourceId);
        if (kind === "answer" && !item.expected_no_answer) positiveAnswers.add(sourceId);
      }
      for (const sourceId of forbiddenSources) for (const sectionId of forbiddenSections) if (!sectionIds.get(sourceId)?.has(sectionId)) errors.push(`${item?.id || kind}: unknown forbidden section_id ${sectionId} for ${sourceId}`);
    }
  }
  for (const sourceId of sourceIds) {
    if (!positiveRetrieval.has(sourceId)) errors.push(`${sourceId}: requires a positive retrieval evaluation`);
    if (!positiveAnswers.has(sourceId)) errors.push(`${sourceId}: requires a positive answer evaluation`);
    for (const sectionId of sectionIds.get(sourceId) || []) if (!coveredSections.has(`${sourceId}:${sectionId}`)) errors.push(`${sourceId}:${sectionId}: requires evaluation coverage`);
  }
  return errors;
}

async function validate() {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repositoryRoot })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
  const knownFiles = new Set(tracked);
  const errors = [];
  const dossiers = new Map();

  for (const path of tracked) {
    if (!isAllowedPath(path)) errors.push(`${path}: path is not on the public allowlist`);
    if (path === ".gitmodules") errors.push(`${path}: nested repositories are not allowed`);

    const absolute = resolve(repositoryRoot, path);
    if (relative(repositoryRoot, absolute).startsWith("..")) errors.push(`${path}: resolves outside repository`);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) errors.push(`${path}: symbolic links are not allowed`);
    if (!stat.isFile()) continue;

    const extension = extname(path).toLowerCase();
    if (!extension && path !== "LICENSE") continue;
    const text = await readFile(absolute, "utf8");
    errors.push(...scanText(path, text));
    if (extension === ".md") {
      for (const target of markdownLinkTargets(text)) errors.push(...validateLinkTarget(path, target, knownFiles));
    }
    if (isResearchDossier(path)) {
      errors.push(...dossierErrors(path, text));
      dossiers.set(path, text);
    }
  }

  const publication = JSON.parse(await readFile(resolve(repositoryRoot, "publication.json"), "utf8"));
  const contract = validatePublicationContract(publication, dossiers);
  errors.push(...contract.errors);
  const [retrievalText, answerText] = await Promise.all([
    readFile(resolve(repositoryRoot, "evaluations/retrieval.jsonl"), "utf8"),
    readFile(resolve(repositoryRoot, "evaluations/answers.jsonl"), "utf8")
  ]);
  errors.push(...validateEvaluations(retrievalText, answerText, contract.sourceIds, contract.sectionIds));

  if (errors.length) throw new Error(`Public research validation failed:\n- ${errors.join("\n- ")}`);
  console.log(`Validated ${tracked.length} public files.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validate().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
