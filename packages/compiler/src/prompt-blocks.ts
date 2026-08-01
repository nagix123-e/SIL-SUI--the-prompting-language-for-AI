import { TECHNICAL_TERMS, coreCodebook } from "../../codebook/src/index";
import {
  PROMPT_COLOR_CATEGORY,
  type PromptColorCategory,
  type StatementKind,
} from "../../semantic-ir/src/index";
import { inspectPromptForm, parsePromptSections } from "./prompt-structure";

export type PromptBlockKind =
  | "structure"
  | "grammar"
  | "verb"
  | "noun"
  | "data"
  | "constraint"
  | "logic"
  | "verification"
  | "recovery";

export interface PromptBlockBinding {
  field: StatementKind;
  reference?: string;
  lossless?: boolean;
}

export interface PromptBlock {
  id: string;
  label: string;
  insertText: string;
  kind: PromptBlockKind;
  roles: StatementKind[];
  bindings: PromptBlockBinding[];
  weight: number;
}

export interface SuggestedPromptBlock {
  block: PromptBlock;
  reason: string;
  score: number;
}

export interface PromptHighlightToken {
  text: string;
  kind: PromptBlockKind | null;
  colorCategory: PromptColorCategory;
  blockId?: string;
  codebookId?: string;
}

export type SourceHighlightLanguage = "sil" | "sui";
export type SourceHighlightToken = Pick<PromptHighlightToken, "text" | "kind" | "colorCategory">;

export const PROMPT_BLOCK_KIND_ORDER: readonly PromptBlockKind[] = [
  "structure",
  "grammar",
  "verb",
  "noun",
  "data",
  "constraint",
  "logic",
  "verification",
  "recovery",
] as const;

export const PROMPT_BLOCK_KIND_LABELS: Record<PromptBlockKind, string> = {
  structure: "Structure",
  grammar: "Grammar & function words",
  verb: "Action verbs",
  noun: "Targets & nouns",
  data: "Inputs & outputs",
  constraint: "Constraints",
  logic: "Logic & sequence",
  verification: "Verification",
  recovery: "Failure & recovery",
};

function defineBlock(
  id: string,
  label: string,
  kind: PromptBlockKind,
  roles: StatementKind[],
  options: {
    insertText?: string;
    bindings?: PromptBlockBinding[];
    weight?: number;
  } = {},
): PromptBlock {
  return {
    id,
    label,
    insertText: options.insertText ?? label,
    kind,
    roles,
    bindings: options.bindings ?? roles.map((field) => ({ field, lossless: true })),
    weight: options.weight ?? 30,
  };
}

const structureBlocks: PromptBlock[] = [
  defineBlock("field-goal", "Goal:", "structure", ["goal"], { insertText: "Goal: ", weight: 100 }),
  defineBlock("field-target", "Target:", "structure", ["target"], { insertText: "Target: ", weight: 98 }),
  defineBlock("field-action", "Action:", "structure", ["action"], { insertText: "Action: ", weight: 96 }),
  defineBlock("field-inputs", "Inputs:", "structure", ["input"], { insertText: "Inputs:\n- ", weight: 94 }),
  defineBlock("field-outputs", "Outputs:", "structure", ["output"], { insertText: "Outputs:\n- ", weight: 92 }),
  defineBlock("field-requirements", "Requirements:", "structure", ["require"], { insertText: "Requirements:\n- ", weight: 90 }),
  defineBlock("field-preferences", "Preferences:", "structure", ["prefer"], { insertText: "Preferences:\n- ", weight: 60 }),
  defineBlock("field-forbidden", "Forbidden:", "structure", ["forbid"], { insertText: "Forbidden:\n- ", weight: 88 }),
  defineBlock("field-verification", "Verification:", "structure", ["verify"], { insertText: "Verification:\n- ", weight: 86 }),
  defineBlock("field-failure", "On failure:", "structure", ["on_failure"], { insertText: "On failure:\n- ", weight: 84 }),
];

const grammarBlocks: PromptBlock[] = [
  defineBlock("grammar-to", "to", "grammar", [], { weight: 48 }),
  defineBlock("grammar-the", "the", "grammar", [], { weight: 42 }),
  defineBlock("grammar-a", "a", "grammar", [], { weight: 40 }),
  defineBlock("grammar-an", "an", "grammar", [], { weight: 38 }),
  defineBlock("grammar-this", "this", "grammar", [], { weight: 36 }),
  defineBlock("grammar-that", "that", "grammar", [], { weight: 36 }),
  defineBlock("grammar-these", "these", "grammar", [], { weight: 32 }),
  defineBlock("grammar-i", "I", "grammar", [], { weight: 34 }),
  defineBlock("grammar-it", "it", "grammar", [], { weight: 34 }),
  defineBlock("grammar-they", "they", "grammar", [], { weight: 32 }),
  defineBlock("grammar-we", "we", "grammar", [], { weight: 32 }),
  defineBlock("grammar-you", "you", "grammar", [], { weight: 32 }),
  defineBlock("grammar-from", "from", "grammar", [], { weight: 42 }),
  defineBlock("grammar-for", "for", "grammar", [], { weight: 44 }),
  defineBlock("grammar-with", "with", "grammar", [], { weight: 44 }),
  defineBlock("grammar-without", "without", "grammar", [], { weight: 42 }),
  defineBlock("grammar-in", "in", "grammar", [], { weight: 40 }),
  defineBlock("grammar-on", "on", "grammar", [], { weight: 38 }),
  defineBlock("grammar-into", "into", "grammar", [], { weight: 38 }),
  defineBlock("grammar-as", "as", "grammar", [], { weight: 38 }),
  defineBlock("grammar-by", "by", "grammar", [], { weight: 36 }),
  defineBlock("grammar-of", "of", "grammar", [], { weight: 40 }),
  defineBlock("grammar-via", "via", "grammar", [], { weight: 34 }),
  defineBlock("grammar-is", "is", "grammar", [], { weight: 36 }),
  defineBlock("grammar-are", "are", "grammar", [], { weight: 34 }),
  defineBlock("grammar-be", "be", "grammar", [], { weight: 38 }),
  defineBlock("grammar-can", "can", "grammar", [], { weight: 38 }),
  defineBlock("grammar-should", "should", "grammar", [], { weight: 42 }),
  defineBlock("grammar-will", "will", "grammar", [], { weight: 34 }),
  defineBlock("grammar-not", "not", "grammar", [], { weight: 44 }),
  defineBlock("grammar-only", "only", "grammar", [], { weight: 38 }),
  defineBlock("grammar-each", "each", "grammar", [], { weight: 36 }),
];

const verbBlocks: PromptBlock[] = [
  defineBlock("verb-implement", "implement", "verb", ["goal", "action"], {
    bindings: [{ field: "goal", reference: "feature.add" }, { field: "action", reference: "implement" }], weight: 80,
  }),
  defineBlock("verb-create", "create", "verb", ["goal", "action"], { weight: 76 }),
  defineBlock("verb-update", "update", "verb", ["goal", "action"], { bindings: [{ field: "action", reference: "modify" }], weight: 74 }),
  defineBlock("verb-fix", "fix", "verb", ["goal", "action"], { bindings: [{ field: "goal", reference: "bug.fix" }, { field: "action", reference: "modify" }], weight: 78 }),
  defineBlock("verb-migrate", "migrate", "verb", ["goal", "action"], { weight: 72 }),
  defineBlock("verb-analyze", "analyze", "verb", ["goal", "action"], { weight: 68 }),
  defineBlock("verb-validate", "validate", "verb", ["action", "require"], { weight: 66 }),
  defineBlock("verb-transform", "transform", "verb", ["action"], { weight: 64 }),
  defineBlock("verb-publish", "publish", "verb", ["action"], { weight: 62 }),
  defineBlock("verb-synchronize", "synchronize", "verb", ["action"], { weight: 60 }),
  defineBlock("verb-optimize", "optimize", "verb", ["goal", "action"], { weight: 58 }),
  defineBlock("verb-remove", "remove", "verb", ["goal", "action"], { bindings: [{ field: "action", reference: "delete" }], weight: 56 }),
  defineBlock("verb-refactor", "refactor", "verb", ["goal", "action"], { weight: 66 }),
  defineBlock("verb-generate", "generate", "verb", ["goal", "action", "output"], { weight: 64 }),
  defineBlock("verb-configure", "configure", "verb", ["goal", "action"], { weight: 62 }),
  defineBlock("verb-integrate", "integrate", "verb", ["goal", "action"], { weight: 62 }),
  defineBlock("verb-deploy", "deploy", "verb", ["goal", "action"], { weight: 60 }),
  defineBlock("verb-document", "document", "verb", ["goal", "action", "output"], { weight: 58 }),
  defineBlock("verb-compare", "compare", "verb", ["action", "verify"], { weight: 56 }),
  defineBlock("verb-extract", "extract", "verb", ["action", "output"], { weight: 56 }),
  defineBlock("verb-parse", "parse", "verb", ["action", "input"], { weight: 58 }),
  defineBlock("verb-serialize", "serialize", "verb", ["action", "output"], { weight: 54 }),
  defineBlock("verb-cache", "cache", "verb", ["action", "require"], { weight: 52 }),
  defineBlock("verb-monitor", "monitor", "verb", ["action", "verify"], { weight: 54 }),
];

const nounBlocks: PromptBlock[] = [
  defineBlock("noun-service", "service", "noun", ["target"], { weight: 68 }),
  defineBlock("noun-endpoint", "API endpoint", "noun", ["target"], { bindings: [{ field: "target", reference: "api.endpoint" }], weight: 82 }),
  defineBlock("noun-component", "component", "noun", ["target"], { weight: 70 }),
  defineBlock("noun-interface", "interface", "noun", ["target"], { weight: 64 }),
  defineBlock("noun-workflow", "workflow", "noun", ["target"], { weight: 62 }),
  defineBlock("noun-pipeline", "pipeline", "noun", ["target"], { weight: 60 }),
  defineBlock("noun-screen", "screen", "noun", ["target"], { weight: 58 }),
  defineBlock("noun-database", "database", "noun", ["target"], { weight: 58 }),
  defineBlock("noun-schema", "schema", "noun", ["target", "require"], { weight: 56 }),
  defineBlock("noun-file-set", "repository files", "noun", ["target", "input"], { weight: 66 }),
  defineBlock("noun-auth", "user authentication", "noun", ["target"], { bindings: [{ field: "target", reference: "user.authentication" }], weight: 72 }),
  defineBlock("noun-search", "product search", "noun", ["target"], { bindings: [{ field: "target", reference: "product.search" }], weight: 74 }),
  defineBlock("noun-docs", "project documentation", "noun", ["target"], { bindings: [{ field: "target", reference: "project.documentation" }], weight: 60 }),
  defineBlock("noun-existing-behavior", "existing behavior", "noun", ["target", "require"], { weight: 54 }),
  defineBlock("noun-application", "application", "noun", ["target"], { weight: 66 }),
  defineBlock("noun-module", "module", "noun", ["target"], { weight: 64 }),
  defineBlock("noun-function", "function", "noun", ["target"], { weight: 62 }),
  defineBlock("noun-class", "class", "noun", ["target"], { weight: 58 }),
  defineBlock("noun-api", "API", "noun", ["target"], { weight: 66 }),
  defineBlock("noun-route", "route", "noun", ["target"], { weight: 60 }),
  defineBlock("noun-cli-command", "CLI command", "noun", ["target"], { weight: 58 }),
  defineBlock("noun-model", "model", "noun", ["target"], { weight: 60 }),
  defineBlock("noun-configuration", "configuration", "noun", ["target", "input"], { weight: 58 }),
  defineBlock("noun-dependency", "dependency", "noun", ["target", "input"], { weight: 56 }),
  defineBlock("noun-test-suite", "test suite", "noun", ["target", "verify"], { weight: 60 }),
  defineBlock("noun-user-interface", "user interface", "noun", ["target"], { weight: 62 }),
];

const dataBlocks: PromptBlock[] = [
  defineBlock("data-request", "request payload", "data", ["input"], { weight: 78 }),
  defineBlock("data-query", "text query", "data", ["input"], { bindings: [{ field: "input", reference: "user.query" }], weight: 82 }),
  defineBlock("data-filter", "category filter", "data", ["input"], { bindings: [{ field: "input", reference: "category.filter", lossless: true }], weight: 74 }),
  defineBlock("data-options", "options", "data", ["input"], { weight: 66 }),
  defineBlock("data-metadata", "metadata", "data", ["input"], { weight: 62 }),
  defineBlock("data-file", "input file", "data", ["input"], { weight: 64 }),
  defineBlock("data-page-size", "page size", "data", ["input"], { bindings: [{ field: "input", reference: "pagination.page_size", lossless: true }], weight: 70 }),
  defineBlock("data-cursor", "cursor", "data", ["input"], { bindings: [{ field: "input", reference: "pagination.cursor", lossless: true }], weight: 68 }),
  defineBlock("data-response", "API response", "data", ["output"], { weight: 76 }),
  defineBlock("data-result", "result", "data", ["output"], { weight: 68 }),
  defineBlock("data-list", "product list", "data", ["output"], { bindings: [{ field: "output", reference: "product.list" }], weight: 74 }),
  defineBlock("data-report", "report", "data", ["output"], { weight: 66 }),
  defineBlock("data-patch", "code patch", "data", ["output"], { bindings: [{ field: "output", reference: "code.patch", lossless: true }], weight: 72 }),
  defineBlock("data-artifact", "artifact", "data", ["output"], { weight: 64 }),
  defineBlock("data-next-cursor", "next cursor", "data", ["output"], { bindings: [{ field: "output", reference: "pagination.next_cursor", lossless: true }], weight: 70 }),
  defineBlock("data-error", "error details", "data", ["output", "on_failure"], { weight: 58 }),
  defineBlock("data-json", "JSON object", "data", ["input", "output"], { weight: 68 }),
  defineBlock("data-form", "form data", "data", ["input"], { weight: 62 }),
  defineBlock("data-environment", "environment variables", "data", ["input"], { weight: 64 }),
  defineBlock("data-cli-args", "command-line arguments", "data", ["input"], { weight: 60 }),
  defineBlock("data-record", "database record", "data", ["input", "output"], { weight: 62 }),
  defineBlock("data-event-stream", "event stream", "data", ["input", "output"], { weight: 58 }),
  defineBlock("data-log-output", "log output", "data", ["output"], { weight: 58 }),
  defineBlock("data-generated-file", "generated file", "data", ["output"], { weight: 60 }),
  defineBlock("data-structured-response", "structured response", "data", ["output"], { weight: 66 }),
  defineBlock("data-status-code", "status code", "data", ["output", "verify"], { weight: 60 }),
  defineBlock("data-identifier", "identifier", "data", ["input", "output"], { weight: 56 }),
  defineBlock("data-timestamp", "timestamp", "data", ["input", "output"], { weight: 54 }),
];

const constraintBlocks: PromptBlock[] = [
  defineBlock("constraint-must", "must", "constraint", ["require"], { weight: 70 }),
  defineBlock("constraint-require", "require", "constraint", ["require"], { weight: 74 }),
  defineBlock("constraint-ensure", "ensure", "constraint", ["require", "verify"], { weight: 68 }),
  defineBlock("constraint-preserve", "preserve", "constraint", ["require"], { weight: 70 }),
  defineBlock("constraint-validate-input", "validate all inputs", "constraint", ["require"], { bindings: [{ field: "require", reference: "input.validate" }], weight: 84 }),
  defineBlock("constraint-backward", "preserve backward compatibility", "constraint", ["require"], { bindings: [{ field: "require", reference: "existing.behavior.preserve" }], weight: 82 }),
  defineBlock("constraint-fast", "under 200 ms", "constraint", ["require", "verify"], { bindings: [{ field: "require", reference: "latency.max_200_ms", lossless: true }], weight: 78 }),
  defineBlock("constraint-at-least", "at least", "constraint", ["require", "verify"], { weight: 62 }),
  defineBlock("constraint-at-most", "at most", "constraint", ["require"], { weight: 62 }),
  defineBlock("constraint-prefer", "prefer", "constraint", ["prefer"], { weight: 60 }),
  defineBlock("constraint-minimal", "minimal change", "constraint", ["prefer"], { bindings: [{ field: "prefer", reference: "change.minimal", lossless: true }], weight: 66 }),
  defineBlock("constraint-modular", "modular design", "constraint", ["prefer"], { weight: 60 }),
  defineBlock("constraint-do-not", "do not", "constraint", ["forbid"], { weight: 82 }),
  defineBlock("constraint-never", "never", "constraint", ["forbid"], { weight: 68 }),
  defineBlock("constraint-avoid", "avoid", "constraint", ["forbid"], { weight: 66 }),
  defineBlock("constraint-no-secrets", "expose secrets", "constraint", ["forbid"], { bindings: [{ field: "forbid", reference: "secret.expose" }], weight: 78 }),
  defineBlock("constraint-no-breaking", "introduce breaking changes", "constraint", ["forbid"], { bindings: [{ field: "forbid", reference: "change.breaking" }], weight: 76 }),
  defineBlock("constraint-no-unrelated", "modify unrelated files", "constraint", ["forbid"], { weight: 70 }),
  defineBlock("constraint-securely", "securely", "constraint", ["require"], { weight: 68 }),
  defineBlock("constraint-atomically", "atomically", "constraint", ["require"], { weight: 62 }),
  defineBlock("constraint-idempotent", "idempotent", "constraint", ["require", "prefer"], { weight: 64 }),
  defineBlock("constraint-deterministic", "deterministic", "constraint", ["require", "prefer"], { weight: 62 }),
  defineBlock("constraint-compatible", "backward-compatible", "constraint", ["require"], { weight: 68 }),
  defineBlock("constraint-thread-safe", "thread-safe", "constraint", ["require"], { weight: 58 }),
  defineBlock("constraint-read-only", "read-only", "constraint", ["require", "forbid"], { weight: 60 }),
  defineBlock("constraint-no-data-loss", "without data loss", "constraint", ["require", "forbid"], { weight: 70 }),
  defineBlock("constraint-no-side-effects", "with no side effects", "constraint", ["require", "forbid"], { weight: 66 }),
  defineBlock("constraint-specified-limit", "within the specified limit", "constraint", ["require", "verify"], { weight: 64 }),
];

const logicBlocks: PromptBlock[] = [
  defineBlock("logic-using", "using", "logic", ["input"], { weight: 54 }),
  defineBlock("logic-accept", "accept", "logic", ["input"], { weight: 62 }),
  defineBlock("logic-return", "return", "logic", ["output"], { weight: 66 }),
  defineBlock("logic-and", "and", "logic", [], { weight: 46 }),
  defineBlock("logic-then", "then", "logic", ["action", "on_failure"], { weight: 52 }),
  defineBlock("logic-before", "before", "logic", ["require", "verify"], { weight: 48 }),
  defineBlock("logic-after", "after", "logic", ["require", "on_failure"], { weight: 48 }),
  defineBlock("logic-if", "if", "logic", ["on_failure"], { weight: 50 }),
  defineBlock("logic-when", "when", "logic", ["on_failure"], { weight: 48 }),
  defineBlock("logic-bounded-loop", "bounded loop", "logic", ["require", "verify"], { insertText: "bounded loop with a maximum of ", weight: 58 }),
  defineBlock("logic-unless", "unless", "logic", ["forbid", "on_failure"], { weight: 44 }),
  defineBlock("logic-for-each", "for each", "logic", ["action", "verify"], { insertText: "for each item, up to ", weight: 52 }),
  defineBlock("logic-or", "or", "logic", [], { weight: 46 }),
  defineBlock("logic-but", "but", "logic", ["require", "prefer"], { weight: 44 }),
  defineBlock("logic-because", "because", "logic", ["require"], { weight: 42 }),
  defineBlock("logic-therefore", "therefore", "logic", ["action", "output"], { weight: 40 }),
  defineBlock("logic-otherwise", "otherwise", "logic", ["on_failure"], { weight: 48 }),
  defineBlock("logic-until", "until condition", "logic", ["require", "verify"], { insertText: "until the condition is met, up to ", weight: 52 }),
  defineBlock("logic-parallel", "in parallel", "logic", ["action", "require"], { weight: 50 }),
  defineBlock("logic-in-order", "in order", "logic", ["action", "require"], { weight: 48 }),
];

const verificationBlocks: PromptBlock[] = [
  defineBlock("verify-verb", "verify", "verification", ["verify"], { weight: 86 }),
  defineBlock("verify-test", "test", "verification", ["verify"], { weight: 72 }),
  defineBlock("verify-check", "check", "verification", ["verify"], { weight: 70 }),
  defineBlock("verify-confirm", "confirm", "verification", ["verify"], { weight: 68 }),
  defineBlock("verify-tests-pass", "tests pass", "verification", ["verify"], { bindings: [{ field: "verify", reference: "tests.pass" }], weight: 84 }),
  defineBlock("verify-unit", "unit tests pass", "verification", ["verify"], { bindings: [{ field: "verify", reference: "unit_tests.pass", lossless: true }], weight: 82 }),
  defineBlock("verify-integration", "integration tests pass", "verification", ["verify"], { bindings: [{ field: "verify", reference: "integration_tests.pass", lossless: true }], weight: 80 }),
  defineBlock("verify-build", "build passes", "verification", ["verify"], { bindings: [{ field: "verify", reference: "build.pass", lossless: true }], weight: 78 }),
  defineBlock("verify-typecheck", "typecheck passes", "verification", ["verify"], { bindings: [{ field: "verify", reference: "typecheck.pass", lossless: true }], weight: 76 }),
  defineBlock("verify-lint", "lint passes", "verification", ["verify"], { bindings: [{ field: "verify", reference: "lint.pass", lossless: true }], weight: 74 }),
  defineBlock("verify-acceptance", "acceptance criteria pass", "verification", ["verify"], { weight: 72 }),
  defineBlock("verify-observable", "observable behavior matches", "verification", ["verify"], { weight: 68 }),
  defineBlock("verify-schema", "response matches the schema", "verification", ["verify"], { weight: 74 }),
  defineBlock("verify-no-regressions", "no regressions", "verification", ["verify"], { weight: 72 }),
  defineBlock("verify-edge-cases", "edge cases pass", "verification", ["verify"], { weight: 70 }),
  defineBlock("verify-error-paths", "error paths pass", "verification", ["verify"], { weight: 68 }),
  defineBlock("verify-performance", "performance budget passes", "verification", ["verify"], { weight: 70 }),
];

const recoveryBlocks: PromptBlock[] = [
  defineBlock("recovery-if-fails", "if verification fails", "recovery", ["on_failure"], { weight: 84 }),
  defineBlock("recovery-rollback", "roll back changes", "recovery", ["on_failure"], { bindings: [{ field: "on_failure", reference: "change.rollback", lossless: true }], weight: 86 }),
  defineBlock("recovery-retry-once", "retry once", "recovery", ["on_failure"], { bindings: [{ field: "on_failure", reference: "retry.max_1", lossless: true }], weight: 82 }),
  defineBlock("recovery-retry-two", "retry 2 times", "recovery", ["on_failure"], { bindings: [{ field: "on_failure", reference: "retry.max_2", lossless: true }], weight: 76 }),
  defineBlock("recovery-abort", "then abort", "recovery", ["on_failure"], { bindings: [{ field: "on_failure", reference: "task.abort", lossless: true }], weight: 80 }),
  defineBlock("recovery-diagnostics", "preserve diagnostics", "recovery", ["on_failure"], { bindings: [{ field: "on_failure", reference: "diagnostics.preserve", lossless: true }], weight: 78 }),
  defineBlock("recovery-restore", "restore previous state", "recovery", ["on_failure"], { weight: 72 }),
  defineBlock("recovery-log", "log the failure", "recovery", ["on_failure"], { weight: 68 }),
  defineBlock("recovery-ask", "ask for clarification", "recovery", ["on_failure"], { weight: 66 }),
  defineBlock("recovery-stop", "stop without partial changes", "recovery", ["on_failure"], { weight: 70 }),
  defineBlock("recovery-return-error", "return an error", "recovery", ["on_failure", "output"], { weight: 72 }),
  defineBlock("recovery-safe-fallback", "use a safe fallback", "recovery", ["on_failure"], { weight: 70 }),
  defineBlock("recovery-notify", "notify the caller", "recovery", ["on_failure", "output"], { weight: 66 }),
  defineBlock("recovery-unchanged", "leave state unchanged", "recovery", ["on_failure", "require"], { weight: 74 }),
  defineBlock("recovery-record-input", "record the failed input", "recovery", ["on_failure"], { weight: 64 }),
];

const technicalTermBlocks: PromptBlock[] = TECHNICAL_TERMS.map((term) => defineBlock(
  `tech-${term.id}`,
  term.label,
  term.blockKind,
  ["target", "input"],
  {
    bindings: [
      { field: "target", reference: `technology.${term.id}` },
      { field: "input", reference: term.contextReference, lossless: true },
    ],
    weight: term.family === "sil" || term.family === "ai_model" ? 58 : 46,
  },
));

export const PROMPT_BLOCKS: readonly PromptBlock[] = [
  ...structureBlocks,
  ...grammarBlocks,
  ...verbBlocks,
  ...nounBlocks,
  ...dataBlocks,
  ...constraintBlocks,
  ...logicBlocks,
  ...verificationBlocks,
  ...recoveryBlocks,
  ...technicalTermBlocks,
] as const;

interface PromptHighlightPhrase {
  normalized: string;
  kind: PromptBlockKind;
  colorCategory: PromptColorCategory;
  exactText?: string;
  blockId?: string;
  codebookId?: string;
}

const COLOR_CATEGORY_BY_BLOCK_KIND: Record<PromptBlockKind, PromptColorCategory> = {
  structure: PROMPT_COLOR_CATEGORY.structure,
  grammar: PROMPT_COLOR_CATEGORY.grammar,
  verb: PROMPT_COLOR_CATEGORY.verb,
  noun: PROMPT_COLOR_CATEGORY.noun,
  data: PROMPT_COLOR_CATEGORY.data,
  constraint: PROMPT_COLOR_CATEGORY.constraint,
  logic: PROMPT_COLOR_CATEGORY.logic,
  verification: PROMPT_COLOR_CATEGORY.verification,
  recovery: PROMPT_COLOR_CATEGORY.recovery,
};

const BLOCK_KIND_BY_COLOR_CATEGORY = new Map<PromptColorCategory, PromptBlockKind>(
  Object.entries(COLOR_CATEGORY_BY_BLOCK_KIND).map(([kind, category]) => [category, kind as PromptBlockKind]),
);

interface PromptHighlightCandidate extends PromptHighlightPhrase {
  priority: number;
  weight: number;
}

function addHighlightCandidate(
  candidates: Map<string, PromptHighlightCandidate[]>,
  rawText: string,
  candidate: Omit<PromptHighlightCandidate, "normalized">,
  normalizeReferenceSeparators = false,
): void {
  const text = normalizeReferenceSeparators
    ? rawText.trim().replaceAll(/[_.]+/gu, " ")
    : rawText.trim();
  if (!text || /[\r\n]/u.test(text)) return;
  const normalized = text.toLowerCase();
  const entries = candidates.get(normalized) ?? [];
  entries.push({ ...candidate, normalized });
  candidates.set(normalized, entries);
}

function requiresExactHighlightCase(text: string): boolean {
  return /^[A-Za-z]{1,3}$/u.test(text);
}

function buildHighlightPhrases(): PromptHighlightPhrase[] {
  const candidates = new Map<string, PromptHighlightCandidate[]>();

  for (const block of PROMPT_BLOCKS) {
    for (const rawText of new Set([block.label, block.insertText])) {
      const exactText = block.id.startsWith("tech-") && requiresExactHighlightCase(rawText.trim())
        ? rawText.trim()
        : undefined;
      addHighlightCandidate(candidates, rawText, {
        kind: block.kind,
        colorCategory: COLOR_CATEGORY_BY_BLOCK_KIND[block.kind],
        exactText,
        blockId: block.id,
        priority: 2,
        weight: block.weight,
      });
    }
  }

  for (const term of TECHNICAL_TERMS) {
    const kind = term.blockKind;
    for (const rawText of term.aliases) {
      addHighlightCandidate(candidates, rawText, {
        kind,
        colorCategory: COLOR_CATEGORY_BY_BLOCK_KIND[kind],
        exactText: requiresExactHighlightCase(rawText.trim()) ? rawText.trim() : undefined,
        blockId: `tech-${term.id}`,
        priority: 2,
        weight: 44,
      });
    }
  }

  for (const entry of coreCodebook.entries) {
    const kind = BLOCK_KIND_BY_COLOR_CATEGORY.get(entry.colorCategory);
    if (!kind) continue;
    for (const rawText of new Set([entry.description, entry.key, ...entry.aliases])) {
      addHighlightCandidate(candidates, rawText, {
        kind,
        colorCategory: entry.colorCategory,
        codebookId: entry.id,
        priority: 1,
        weight: 0,
      }, true);
    }
  }

  return [...candidates.entries()]
    .flatMap(([normalized, entries]) => {
      const kinds = new Set(entries.map((entry) => entry.kind));
      if (kinds.size !== 1) return [];
      const selected = entries.toSorted(
        (left, right) => right.priority - left.priority || right.weight - left.weight,
      )[0];
      if (!selected) return [];
      return [{
        normalized,
        kind: selected.kind,
        colorCategory: selected.colorCategory,
        exactText: selected.exactText,
        blockId: selected.blockId,
        codebookId: selected.codebookId,
      }];
    })
    .toSorted((left, right) => right.normalized.length - left.normalized.length);
}

interface PromptHighlightTrieNode {
  children: Map<string, PromptHighlightTrieNode>;
  phrase?: PromptHighlightPhrase;
}

const HIGHLIGHT_TRIE: PromptHighlightTrieNode = { children: new Map() };

for (const phrase of buildHighlightPhrases()) {
  let node = HIGHLIGHT_TRIE;
  for (const character of phrase.normalized) {
    const child = node.children.get(character) ?? { children: new Map() };
    node.children.set(character, child);
    node = child;
  }
  node.phrase = phrase;
}

function isPromptWordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[A-Za-z0-9_]/u.test(value));
}

function highlightPhraseAt(prompt: string, lowerPrompt: string, position: number): PromptHighlightPhrase | undefined {
  let node = HIGHLIGHT_TRIE;
  let cursor = position;
  let longest: PromptHighlightPhrase | undefined;

  while (cursor < lowerPrompt.length) {
    const child = node.children.get(lowerPrompt[cursor] ?? "");
    if (!child) break;
    node = child;
    cursor += 1;
    const phrase = node.phrase;
    if (!phrase) continue;
    if (isPromptWordCharacter(phrase.normalized[0]) && isPromptWordCharacter(prompt[position - 1])) continue;
    if (isPromptWordCharacter(phrase.normalized.at(-1)) && isPromptWordCharacter(prompt[cursor])) continue;
    if (phrase.exactText && prompt.slice(position, cursor) !== phrase.exactText) continue;
    longest = phrase;
  }
  return longest;
}

export function highlightPromptText(prompt: string): PromptHighlightToken[] {
  if (!prompt) return [];
  const lowerPrompt = prompt.toLowerCase();
  const tokens: PromptHighlightToken[] = [];
  let plainStart = 0;
  let position = 0;

  while (position < prompt.length) {
    const phrase = highlightPhraseAt(prompt, lowerPrompt, position);
    if (!phrase) {
      position += 1;
      continue;
    }

    if (plainStart < position) {
      tokens.push({
        text: prompt.slice(plainStart, position),
        kind: null,
        colorCategory: PROMPT_COLOR_CATEGORY.unclassified,
      });
    }
    const end = position + phrase.normalized.length;
    tokens.push({
      text: prompt.slice(position, end),
      kind: phrase.kind,
      colorCategory: phrase.colorCategory,
      blockId: phrase.blockId,
      codebookId: phrase.codebookId,
    });
    position = end;
    plainStart = end;
  }

  if (plainStart < prompt.length) {
    tokens.push({
      text: prompt.slice(plainStart),
      kind: null,
      colorCategory: PROMPT_COLOR_CATEGORY.unclassified,
    });
  }
  return tokens;
}

const SIL_SOURCE_FIELD_KINDS: Record<string, PromptBlockKind> = {
  version: "grammar",
  goal: "verb",
  target: "noun",
  action: "verb",
  input: "data",
  output: "data",
  require: "constraint",
  prefer: "constraint",
  forbid: "constraint",
  verify: "verification",
  on_failure: "recovery",
};

const SUI_SOURCE_FIELD_KINDS: Record<string, PromptBlockKind> = {
  version: "grammar",
  screen: "structure",
  layout: "structure",
  component: "noun",
  content: "data",
  style: "grammar",
  interaction: "verb",
  constraint: "constraint",
  state: "logic",
  verify: "verification",
  on_failure: "recovery",
};

const SOURCE_BLOCK_KINDS: Record<string, PromptBlockKind> = {
  parameter: "data",
  model: "data",
  field: "data",
  example: "data",
  token: "data",
  breakpoint: "constraint",
  a11y: "constraint",
  transition: "logic",
};

const SOURCE_PROPERTY_KINDS: Record<string, PromptBlockKind> = {
  type: "data",
  value: "data",
  unit: "data",
  min: "data",
  max: "data",
  format: "data",
  source: "data",
  code: "data",
  language: "grammar",
  operator: "logic",
  from: "logic",
  event: "logic",
  to: "logic",
  required: "constraint",
  role: "constraint",
  label: "constraint",
  applies_to: "noun",
};

function sourceToken(text: string, kind: PromptBlockKind | null): SourceHighlightToken {
  return {
    text,
    kind,
    colorCategory: kind ? COLOR_CATEGORY_BY_BLOCK_KIND[kind] : PROMPT_COLOR_CATEGORY.unclassified,
  };
}

function appendSourceToken(tokens: SourceHighlightToken[], text: string, kind: PromptBlockKind | null): void {
  if (!text) return;
  const previous = tokens.at(-1);
  if (previous && previous.kind === kind) {
    previous.text += text;
    return;
  }
  tokens.push(sourceToken(text, kind));
}

function highlightSourceLine(line: string, language: SourceHighlightLanguage, inCodeBlock: boolean): { tokens: SourceHighlightToken[]; inCodeBlock: boolean } {
  const tokens: SourceHighlightToken[] = [];
  const commentStart = line.indexOf("//");
  const code = commentStart === -1 ? line : line.slice(0, commentStart);
  const comment = commentStart === -1 ? "" : line.slice(commentStart);

  if (inCodeBlock) {
    appendSourceToken(tokens, code, code.trim() === '\"\"\"' ? "data" : null);
    appendSourceToken(tokens, comment, null);
    return { tokens, inCodeBlock: code.trim() !== '\"\"\"' };
  }

  const indent = /^\s*/u.exec(code)?.[0] ?? "";
  const content = code.slice(indent.length);
  appendSourceToken(tokens, indent, null);

  const declaration = /^(task|ui)(\s+)([^\s{]+)(.*)$/u.exec(content);
  if (declaration) {
    appendSourceToken(tokens, declaration[1], "structure");
    appendSourceToken(tokens, declaration[2], null);
    appendSourceToken(tokens, declaration[3], "noun");
    appendSourceToken(tokens, declaration[4], null);
    appendSourceToken(tokens, comment, null);
    return { tokens, inCodeBlock: false };
  }

  const block = /^(parameter|model|field|example|token|breakpoint|a11y|transition)(\s+)([^\s{]+)(.*)$/u.exec(content);
  if (block) {
    appendSourceToken(tokens, block[1], SOURCE_BLOCK_KINDS[block[1]] ?? null);
    appendSourceToken(tokens, block[2], null);
    appendSourceToken(tokens, block[3], "noun");
    appendSourceToken(tokens, block[4], null);
    appendSourceToken(tokens, comment, null);
    return { tokens, inCodeBlock: false };
  }

  const binding = /^bind(\s*:\s*)(\S+)(\s*->\s*)(\S+)(.*)$/u.exec(content);
  if (binding) {
    appendSourceToken(tokens, "bind", "logic");
    appendSourceToken(tokens, binding[1], "logic");
    appendSourceToken(tokens, binding[2], "data");
    appendSourceToken(tokens, binding[3], "logic");
    appendSourceToken(tokens, binding[4], "noun");
    appendSourceToken(tokens, binding[5], null);
    appendSourceToken(tokens, comment, null);
    return { tokens, inCodeBlock: false };
  }

  const property = /^([a-z_]+)(\s*:\s*)(.*)$/u.exec(content);
  if (property) {
    const fieldKind = SOURCE_PROPERTY_KINDS[property[1]]
      ?? (language === "sil" ? SIL_SOURCE_FIELD_KINDS[property[1]] : SUI_SOURCE_FIELD_KINDS[property[1]])
      ?? null;
    appendSourceToken(tokens, property[1], fieldKind);
    appendSourceToken(tokens, property[2], fieldKind);
    appendSourceToken(tokens, property[3], fieldKind);
    appendSourceToken(tokens, comment, null);
    return { tokens, inCodeBlock: property[1] === "code" && property[3].trim() === '\"\"\"' };
  }

  appendSourceToken(tokens, content, null);
  appendSourceToken(tokens, comment, null);
  return { tokens, inCodeBlock: false };
}

/**
 * Colorizes DSL source from its declared semantic role, rather than guessing
 * from natural-language phrases. It deliberately leaves unknown syntax and
 * embedded example code unclassified.
 */
export function highlightSourceText(source: string, language: SourceHighlightLanguage): SourceHighlightToken[] {
  if (!source) return [];
  const tokens: SourceHighlightToken[] = [];
  const lines = source.split("\n");
  let inCodeBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const highlighted = highlightSourceLine(lines[index] ?? "", language, inCodeBlock);
    tokens.push(...highlighted.tokens);
    inCodeBlock = highlighted.inCodeBlock;
    if (index < lines.length - 1) appendSourceToken(tokens, "\n", null);
  }

  return tokens;
}

export function prependPromptBlockText(prompt: string, block: PromptBlock): { value: string; caret: number } {
  const insertion = block.insertText;
  const separator = prompt && !/\s$/u.test(insertion) && !/^\s/u.test(prompt) ? " " : "";
  return {
    value: `${insertion}${separator}${prompt}`,
    caret: insertion.length,
  };
}

export function insertPromptBlockText(
  prompt: string,
  block: PromptBlock,
  position: number,
  selectionEnd = position,
): { value: string; caret: number } {
  const boundedPosition = Math.max(0, Math.min(prompt.length, Math.trunc(position)));
  const boundedSelectionEnd = Math.max(
    boundedPosition,
    Math.min(prompt.length, Math.trunc(selectionEnd)),
  );
  const before = prompt.slice(0, boundedPosition);
  const after = prompt.slice(boundedSelectionEnd);
  const prefix = before && !/\s$/u.test(before) && !/^[,.;:!?)}\]]/u.test(block.insertText) ? " " : "";
  const suffix = after && !/\s$/u.test(block.insertText) && !/^[\s,.;:!?)}\]]/u.test(after) ? " " : "";
  return {
    value: `${before}${prefix}${block.insertText}${suffix}${after}`,
    caret: boundedPosition + prefix.length + block.insertText.length,
  };
}

const REQUIRED_ROLE_ORDER: StatementKind[] = [
  "goal",
  "target",
  "action",
  "input",
  "output",
  "require",
  "forbid",
  "verify",
  "on_failure",
  "prefer",
];

function recentChunk(prompt: string): string {
  return (prompt.split(/[.!?;\n]/u).at(-1) ?? prompt).trim().toLowerCase();
}

function activeRole(prompt: string): StatementKind | undefined {
  const sections = parsePromptSections(prompt);
  return sections.at(-1)?.field;
}

function cueKind(chunk: string): PromptBlockKind | undefined {
  if (/\b(?:fail|fails|failed|rollback|roll\s+back|retry|abort|diagnostic)\b/iu.test(chunk)) return "recovery";
  if (/\b(?:verify|test|check|confirm|assert|acceptance)\b/iu.test(chunk)) return "verification";
  if (/\b(?:do\s+not|never|avoid|forbid|must|require|ensure|under|within|at\s+least|at\s+most)\b/iu.test(chunk)) return "constraint";
  if (/\b(?:accept|using|from|input|payload|query|filter)\b/iu.test(chunk)) return "data";
  if (/\b(?:return|output|produce|emit|deliver|result)\b/iu.test(chunk)) return "data";
  if (/\b(?:to|can|should|will)\s*$/iu.test(chunk)) return "verb";
  if (/\b(?:the|a|an|this|that|these|those)\s*$/iu.test(chunk)) return "noun";
  if (/\b(?:and|or|but|because|therefore|otherwise)\s*$/iu.test(chunk)) return "logic";
  if (/\b(?:implement|create|update|fix|migrate|analyze|validate|transform|publish|remove)\b/iu.test(chunk)) return "noun";
  return undefined;
}

function roleReason(role: StatementKind): string {
  const labels: Record<StatementKind, string> = {
    goal: "Goal",
    target: "Target",
    action: "Action",
    input: "Inputs",
    output: "Outputs",
    require: "Requirements",
    prefer: "Preferences",
    forbid: "Forbidden",
    verify: "Verification",
    on_failure: "On failure",
  };
  return labels[role];
}

export function suggestPromptBlocks(prompt: string, limit = 8): SuggestedPromptBlock[] {
  const inspection = inspectPromptForm(prompt);
  const missing = new Set(inspection.missing);
  const currentRole = activeRole(prompt);
  const chunk = recentChunk(prompt);
  const suggestedKind = cueKind(chunk);
  const nextMissing = REQUIRED_ROLE_ORDER.find((field) => missing.has(field));
  const lowerPrompt = prompt.toLowerCase();

  return PROMPT_BLOCKS.map((block, index) => {
    let score = block.weight;
    let reason = "Essential vocabulary";

    if (!prompt.trim() && block.id === "field-goal") {
      score += 300;
      reason = "Start the task";
    }
    if (nextMissing && block.kind === "structure" && block.roles.includes(nextMissing)) {
      score += 180;
      reason = `Missing ${roleReason(nextMissing)}`;
    }
    if (block.kind === "structure" && block.roles.some((role) => missing.has(role))) score += 70;
    if (currentRole && block.roles.includes(currentRole) && block.kind !== "structure") {
      score += 230;
      reason = `Fits ${roleReason(currentRole)}`;
    }
    if (suggestedKind && block.kind === suggestedKind) {
      score += 110;
      reason = "Fits the current phrase";
    }
    if (currentRole === "forbid" && block.id === "constraint-do-not") score += 100;
    if (currentRole === "verify" && block.kind === "verification") score += 80;
    if (currentRole === "on_failure" && block.kind === "recovery") score += 100;
    if (/\b(?:under|within|at\s+most)\s*$/iu.test(chunk) && block.id === "constraint-fast") {
      score += 160;
      reason = "Complete the numeric limit";
    }
    if (/\b(?:return|output|deliver)\s*$/iu.test(chunk) && block.roles.includes("output")) {
      score += 130;
      reason = "Complete the output";
    }

    const normalizedInsertion = block.insertText.trim().toLowerCase();
    if (normalizedInsertion.length > 2 && lowerPrompt.includes(normalizedInsertion)) score -= 170;

    return { block, reason, score, index };
  })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, Math.min(16, limit)))
    .map(({ block, reason, score }) => ({ block, reason, score }));
}
