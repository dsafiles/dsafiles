import { lstat, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
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
  "SECURITY.md"
]);

const allowedExactFiles = new Set([
  ".github/pull_request_template.md",
  ".github/workflows/validate.yml",
  "scripts/validate-public-research.mjs",
  "tests/validator.test.mjs"
]);

const blockedPatterns = [
  { label: "macOS home path", pattern: /\/Users\/[A-Za-z0-9._-]+\// },
  { label: "Linux home path", pattern: /\/home\/[A-Za-z0-9._-]+\// },
  { label: "Windows home path", pattern: /[A-Za-z]:\\Users\\[^\\]+\\/i },
  { label: "local file URL", pattern: /file:\/\//i },
  { label: "unencrypted web URL", pattern: /http:\/\//i },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
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
  if (!/^- \*\*Status:\*\* (?:initial|developing|substantially researched|publication candidate)$/m.test(text)) errors.push(`${path}: missing allowed Status metadata`);

  const references = new Set([...text.matchAll(/\[\^([A-Za-z0-9][A-Za-z0-9._:-]*)\](?!:)/g)].map((match) => match[1]));
  const definitions = new Set([...text.matchAll(/^\[\^([A-Za-z0-9][A-Za-z0-9._:-]*)\]:/gm)].map((match) => match[1]));
  for (const id of references) if (!definitions.has(id)) errors.push(`${path}: missing footnote definition [^${id}]`);
  for (const id of definitions) if (!references.has(id)) errors.push(`${path}: unused footnote definition [^${id}]`);
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
    if (isResearchDossier(path)) errors.push(...dossierErrors(path, text));
  }

  if (errors.length) throw new Error(`Public research validation failed:\n- ${errors.join("\n- ")}`);
  console.log(`Validated ${tracked.length} public files.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validate().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
