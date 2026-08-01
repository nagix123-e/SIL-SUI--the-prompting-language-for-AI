import {
  codebookSchema,
  SIL_NAMESPACES,
  type Codebook,
  type CodebookEntry,
  type StatementKind,
} from "../../semantic-ir/src/index";
import {
  CODEBOOK_VERSION,
  CODEBOOK_COLOR_CATEGORY_BY_NAMESPACE,
  CODE_PREFIXES,
  expandCodebookEntries,
} from "./catalog";
import { TECHNICAL_TERMS } from "./technical-terms";

const semanticReferencePattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;
const japaneseScriptPattern = /[\u3000-\u30ff\u3400-\u9fff\uff01-\uff60]/u;

const legacySeedEntries: CodebookEntry[] = [
  ["goal.feature.add", "goal", "feature.add", "G12", "Add a product feature", ["add_feature"]],
  ["goal.content.summarize", "goal", "content.summarize", "G01", "Summarize content", ["summarize"]],
  ["goal.content.classify", "goal", "content.classify", "G02", "Classify content", ["classify"]],
  ["goal.bug.fix", "goal", "bug.fix", "G13", "Fix a defect", ["fix_bug"]],
  ["action.implement", "action", "implement", "A01", "Implement the requested change", ["build", "create"]],
  ["action.modify", "action", "modify", "A02", "Modify an existing artifact", ["update", "edit"]],
  ["action.delete", "action", "delete", "A03", "Delete an artifact", ["remove"]],
  ["target.screen.login", "target", "screen.login", "T044", "Login screen", ["login_screen"]],
  ["target.user.authentication", "target", "user.authentication", "T045", "User authentication", ["auth"]],
  ["target.product.search", "target", "product.search", "T204", "Product search", ["search"]],
  ["target.api.endpoint", "target", "api.endpoint", "T120", "API endpoint", ["api"]],
  ["target.project.documentation", "target", "project.documentation", "T310", "Project documentation", ["docs"]],
  ["input.user.query", "input", "user.query", "I18", "User search query", ["query"]],
  ["input.user.email", "input", "user.email", "I19", "User email address", ["email"]],
  ["input.user.password", "input", "user.password", "I20", "User password", ["password"]],
  ["output.product.list", "output", "product.list", "O31", "List of products", ["results"]],
  ["output.auth.session", "output", "auth.session", "O32", "Authenticated session", ["session"]],
  ["require.response.fast", "require", "response.fast", "R07", "Keep response latency low", ["fast_response"]],
  ["require.existing.behavior.preserve", "require", "existing.behavior.preserve", "R08", "Preserve existing behavior", ["preserve_behavior"]],
  ["require.password.hash", "require", "password.hash", "R09", "Hash passwords securely", ["hash_password"]],
  ["require.input.validate", "require", "input.validate", "R10", "Validate all input", ["validate_input"]],
  ["require.error.safe", "require", "error.safe", "R11", "Return safe errors", ["safe_error"]],
  ["require.ui.responsive", "require", "ui.responsive", "R12", "Support responsive layouts", ["responsive_ui"]],
  ["prefer.code.simple", "prefer", "code.simple", "P01", "Prefer a simple implementation", ["simple"]],
  ["forbid.secret.expose", "forbid", "secret.expose", "X01", "Do not expose secrets", ["no_secret_exposure"]],
  ["forbid.change.breaking", "forbid", "change.breaking", "X02", "Do not introduce breaking changes", ["no_breaking_change"]],
  ["forbid.secret.hardcode", "forbid", "secret.hardcode", "X03", "Do not hardcode secrets", ["no_hardcoded_secret"]],
  ["forbid.password.plaintext_store", "forbid", "password.plaintext_store", "X04", "Do not store plaintext passwords", ["no_plaintext_password"]],
  ["verify.login.success", "verify", "login.success", "V01", "Verify successful login", ["login_works"]],
  ["verify.invalid_credentials.reject", "verify", "invalid_credentials.reject", "V02", "Reject invalid credentials", ["reject_invalid_credentials"]],
  ["verify.tests.pass", "verify", "tests.pass", "V03", "Verify the test suite passes", ["test"]],
  ["on_failure.transaction.rollback", "on_failure", "transaction.rollback", "F01", "Roll back the transaction", ["rollback"]],
].map(([id, namespace, key, code, description, aliases]) => ({
  id: id as string,
  namespace: namespace as StatementKind,
  key: key as string,
  code: code as string,
  description: description as string,
  aliases: aliases as string[],
  colorCategory: CODEBOOK_COLOR_CATEGORY_BY_NAMESPACE[namespace as StatementKind],
  version: CODEBOOK_VERSION,
  status: "active" as const,
}));

const technicalTargetSeedEntries: CodebookEntry[] = TECHNICAL_TERMS.map((term, index) => ({
  id: `target.technology.${term.id}`,
  namespace: "target",
  key: `technology.${term.id}`,
  code: `T9${String(index).padStart(4, "0")}`,
  description: `${term.label}: ${term.description}`,
  aliases: [`tech_${term.id}`],
  colorCategory: CODEBOOK_COLOR_CATEGORY_BY_NAMESPACE.target,
  version: CODEBOOK_VERSION,
  status: "active",
}));

const technicalInputSeedEntries: CodebookEntry[] = TECHNICAL_TERMS.map((term, index) => ({
  id: `input.${term.contextReference}`,
  namespace: "input",
  key: term.contextReference,
  code: `I9${String(index).padStart(4, "0")}`,
  description: `${term.label} technical context: ${term.description}`,
  aliases: [`context_${term.id}`],
  colorCategory: CODEBOOK_COLOR_CATEGORY_BY_NAMESPACE.input,
  version: CODEBOOK_VERSION,
  status: "active",
}));

export const coreSeedEntries: CodebookEntry[] = [
  ...legacySeedEntries,
  ...technicalTargetSeedEntries,
  ...technicalInputSeedEntries,
];

interface CodebookIndex {
  byCode: Map<string, CodebookEntry>;
  byReference: Map<string, CodebookEntry>;
}

export interface CodebookSearchOptions {
  namespace?: StatementKind;
  limit?: number;
  offset?: number;
}

export interface CodebookStats {
  version: string;
  total: number;
  active: number;
  deprecated: number;
  colored: number;
  unclassified: number;
  namespaces: Record<StatementKind, number>;
}

const indexCache = new WeakMap<Codebook, CodebookIndex>();

function referenceKey(namespace: string, reference: string): string {
  return `${namespace}\0${reference}`;
}

function buildIndex(codebook: Codebook): CodebookIndex {
  const cached = indexCache.get(codebook);
  if (cached) return cached;

  const ids = new Set<string>();
  const byCode = new Map<string, CodebookEntry>();
  const byReference = new Map<string, CodebookEntry>();

  for (const entry of codebook.entries) {
    const namespace = entry.namespace as StatementKind;
    if (entry.version !== codebook.version) {
      throw new Error(`Entry ${entry.id} uses version ${entry.version}; expected ${codebook.version}.`);
    }
    if (entry.id !== `${entry.namespace}.${entry.key}`) {
      throw new Error(`Codebook id ${entry.id} must equal ${entry.namespace}.${entry.key}.`);
    }
    if (ids.has(entry.id)) throw new Error(`Duplicate codebook id: ${entry.id}`);
    ids.add(entry.id);
    if (!semanticReferencePattern.test(entry.key)) {
      throw new Error(`Invalid codebook key: ${entry.key}`);
    }
    if (japaneseScriptPattern.test(entry.key) || japaneseScriptPattern.test(entry.description)) {
      throw new Error(`Codebook entry ${entry.id} must contain English-only metadata.`);
    }
    if (!entry.code.startsWith(CODE_PREFIXES[namespace])) {
      throw new Error(`Code ${entry.code} does not match the ${entry.namespace} namespace prefix.`);
    }
    if (byCode.has(entry.code)) throw new Error(`Duplicate codebook code: ${entry.code}`);
    byCode.set(entry.code, entry);

    for (const reference of [entry.key, ...entry.aliases]) {
      if (!semanticReferencePattern.test(reference)) {
        throw new Error(`Invalid codebook alias: ${reference}`);
      }
      if (japaneseScriptPattern.test(reference)) {
        throw new Error(`Codebook alias ${reference} must be English-only.`);
      }
      const key = referenceKey(entry.namespace, reference);
      const existing = byReference.get(key);
      if (existing && existing !== entry) {
        throw new Error(`Duplicate ${entry.namespace} reference: ${reference}`);
      }
      byReference.set(key, entry);
    }
  }

  const index = { byCode, byReference };
  indexCache.set(codebook, index);
  return index;
}

export function loadCodebook(input: unknown): Codebook {
  const result = codebookSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid codebook: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  buildIndex(result.data);
  for (const entry of result.data.entries) {
    Object.freeze(entry.aliases);
    Object.freeze(entry);
  }
  Object.freeze(result.data.entries);
  return Object.freeze(result.data);
}

export const coreCodebook: Codebook = loadCodebook({
  version: CODEBOOK_VERSION,
  entries: expandCodebookEntries(coreSeedEntries),
});

export function findEntry(
  codebook: Codebook,
  namespace: string,
  reference: string,
): CodebookEntry | undefined {
  const entry = buildIndex(codebook).byReference.get(referenceKey(namespace, reference));
  return entry?.status === "active" ? entry : undefined;
}

export function findEntryByCode(codebook: Codebook, code: string): CodebookEntry | undefined {
  const entry = buildIndex(codebook).byCode.get(code);
  return entry?.status === "active" ? entry : undefined;
}

export function searchCodebook(
  codebook: Codebook,
  query: string,
  options: CodebookSearchOptions = {},
): CodebookEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(/\s+/u).filter(Boolean);
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 20)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));

  return codebook.entries
    .filter((entry) => entry.status === "active" && (!options.namespace || entry.namespace === options.namespace))
    .map((entry, position) => {
      const key = entry.key.toLowerCase();
      const id = entry.id.toLowerCase();
      const code = entry.code.toLowerCase();
      const aliases = entry.aliases.map((alias) => alias.toLowerCase());
      const description = entry.description.toLowerCase();
      const searchable = `${key} ${aliases.join(" ")} ${description}`;
      let score = 0;
      if (code === normalizedQuery) score += 1_200;
      if (key === normalizedQuery || id === normalizedQuery) score += 1_000;
      if (aliases.includes(normalizedQuery)) score += 900;
      if (key.startsWith(normalizedQuery)) score += 500;
      if (description.includes(normalizedQuery)) score += 300;
      for (const term of terms) {
        if (key.split(".").includes(term)) score += 120;
        else if (searchable.includes(term)) score += 40;
      }
      return { entry, position, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.position - right.position)
    .slice(offset, offset + limit)
    .map((candidate) => candidate.entry);
}

export function getCodebookStats(codebook: Codebook): CodebookStats {
  const namespaces = Object.fromEntries(SIL_NAMESPACES.map((namespace) => [namespace, 0])) as Record<StatementKind, number>;
  let active = 0;
  let deprecated = 0;
  let colored = 0;
  let unclassified = 0;
  for (const entry of codebook.entries) {
    namespaces[entry.namespace] += 1;
    if (entry.status === "active") active += 1;
    else deprecated += 1;
    if (entry.colorCategory === 0) unclassified += 1;
    else colored += 1;
  }
  return {
    version: codebook.version,
    total: codebook.entries.length,
    active,
    deprecated,
    colored,
    unclassified,
    namespaces,
  };
}

export {
  CODEBOOK_COLOR_CATEGORY_BY_NAMESPACE,
  CODEBOOK_VERSION,
  CODE_PREFIXES,
  ENTRIES_PER_NAMESPACE,
} from "./catalog";
export { TECHNICAL_TERMS } from "./technical-terms";
export type { TechnicalTerm, TechnicalTermFamily } from "./technical-terms";
